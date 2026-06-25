const fetch = require('node-fetch');
const supabase = require('../db');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODELS = [
  'openai/gpt-4o-mini', // Upgraded to a more reliable, fast vision model
  'google/gemini-flash-1.5',
  'meta-llama/llama-3.2-90b-vision-instruct:free'
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main background worker function
async function processExtractionInBackground(uploadId, fileBuffer, mimeType, courseId, courseCode, year) {
  try {
    console.log(`[Worker] Starting extraction for upload ${uploadId}`);
    
    const base64Data = fileBuffer.toString('base64');
    const fileContent = mimeType === 'application/pdf'
      ? { type: 'file', file: { filename: 'exam.pdf', file_data: 'data:application/pdf;base64,' + base64Data } }
      : { type: 'image_url', image_url: { url: 'data:' + mimeType + ';base64,' + base64Data } };

    const prompt = buildPrompt(courseCode, year);
    const questions = await callWithFallback(fileContent, prompt);

    if (!questions || questions.length === 0) {
      await supabase.from('uploads').update({ status: 'failed' }).eq('id', uploadId);
      console.log(`[Worker] No questions extracted for upload ${uploadId}`);
      return;
    }

    // Deduplication logic
    const { data: existingQuestions } = await supabase
      .from('questions')
      .select('content')
      .eq('course_id', courseId);

    const existingSnippets = new Set(
      (existingQuestions || []).map(q => q.content.trim().slice(0, 100).toLowerCase())
    );

    const questionsToInsert = [];
    let skipped = 0;

    for (const q of questions) {
      if (!q.content) continue;
      const snippet = q.content.trim().slice(0, 100).toLowerCase();
      if (existingSnippets.has(snippet)) { skipped++; continue; }      
      existingSnippets.add(snippet);
      questionsToInsert.push({
        course_id: courseId,
        year: year,
        content: q.content,
        type: q.type || 'mcq',
        options: q.options || null,
        answer: q.answer || null,
        topic: q.topic || null,
        difficulty: q.difficulty || 'medium',
        verified: false,
      });
    }

    if (questionsToInsert.length === 0) {
      await supabase.from('uploads').update({ status: 'done' }).eq('id', uploadId);
      console.log(`[Worker] All ${skipped} questions were duplicates. Upload ${uploadId} marked done.`);
      return;
    }

    // Batch insert
    const { error: qError } = await supabase.from('questions').insert(questionsToInsert);
    if (qError) throw new Error('DB insert failed: ' + qError.message);

    await supabase.from('uploads').update({ status: 'done' }).eq('id', uploadId);
    console.log(`[Worker] Success! Saved ${questionsToInsert.length} questions, skipped ${skipped} duplicates.`);

  } catch (err) {
    console.error(`[Worker] Fatal error for upload ${uploadId}:`, err);
    await supabase.from('uploads').update({ status: 'failed' }).eq('id', uploadId).catch(() => {});
  }
}

// AI Fallback Chain
async function callWithFallback(fileContent, prompt) {
  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i];
    try {
      console.log(`[AI] Trying model: ${model}`);
      return await callOpenRouter(fileContent, prompt, model);
    } catch (e) {
      console.warn(`[AI] Model ${model} failed: ${e.message}`);
      if (i < MODELS.length - 1) await sleep(2000); // Brief pause before fallback
    }
  }
  return [];
}

async function callOpenRouter(fileContent, prompt, model) {  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://pastq-frontend.vercel.app',
      'X-Title': 'PastQ'
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: [fileContent, { type: 'text', text: prompt }] }],
      max_tokens: 8000
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error('OpenRouter ' + response.status + ': ' + errorText);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('Model returned empty content');

  // Robust JSON extraction
  const cleaned = text.replace(/```json|```/g, '').trim();
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON array found in response');
  
  return JSON.parse(jsonMatch[0]).filter(q => {
    if (q.type === 'mcq' && Array.isArray(q.options)) {
      return !q.options.every(o => /^[A-Ea-e]$/.test(String(o).trim()));
    }
    return true;
  });
}

function buildPrompt(courseCode, year) {
  return 'You are an academic assistant analyzing a Nigerian university exam paper.\n' +
    'Extract up to 30 exam questions from this document.\n' +
    'Return ONLY a raw JSON array. No explanation, no markdown, no code fences.\n' +
    'CRITICAL RULES:\n' +
    '1. "content" must contain ONLY the question text. Do NOT put options inside content.\n' +
    '2. "options" must contain the FULL TEXT of each choice, not just the letters A B C D.\n' +
    '3. "answer" must be the FULL TEXT of the correct option, not just the letter.\n' +
    'Fields: content, type ("mcq"/"theory"), options (4-5 full strings or null), answer (full text or null), topic, difficulty.\n' +
    'Course: ' + courseCode + '. Year: ' + year + '. Return only the JSON array.';
}

module.exports = { processExtractionInBackground };