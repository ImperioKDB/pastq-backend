const fetch = require('node-fetch');
const supabase = require('../db');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODELS = [
  'openai/gpt-4o-mini',
  'google/gemini-flash-1.5',
  'meta-llama/llama-3.2-90b-vision-instruct:free',
];

// This is NOT a real queue. It's an honest, cheap fix for the previous
// "fire and forget, unbounded" pattern: it caps how many extractions run
// at once so a burst of uploads can't starve the process or hammer
// OpenRouter's rate limits. Past a few dozen uploads/hour, replace this
// with BullMQ + Redis (or a Supabase Edge Function queue) — this module
// is a stepping stone, not the end state.
const MAX_CONCURRENT = 2;
let active = 0;
const pending = [];

function enqueueExtraction(job) {
  pending.push(job);
  drainQueue();
}

function drainQueue() {
  while (active < MAX_CONCURRENT && pending.length > 0) {
    const job = pending.shift();
    active++;
    processExtraction(job)
      .catch(err => console.error(`[Worker] Fatal error for upload ${job.uploadId}:`, err))
      .finally(() => {
        active--;
        drainQueue();
      });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processExtraction({ uploadId, fileBuffer, mimeType, courseId, courseCode, year }) {
  try {
    console.log(`[Worker] Starting extraction for upload ${uploadId}`);
    await supabase.from('uploads').update({ status: 'processing' }).eq('id', uploadId);

    const base64Data = fileBuffer.toString('base64');
    const fileContent = mimeType === 'application/pdf'
      ? { type: 'file', file: { filename: 'exam.pdf', file_data: 'data:application/pdf;base64,' + base64Data } }
      : { type: 'image_url', image_url: { url: 'data:' + mimeType + ';base64,' + base64Data } };

    const prompt = buildPrompt(courseCode, year);
    const questions = await callWithFallback(fileContent, prompt);

    if (!questions || questions.length === 0) {
      await supabase.from('uploads').update({
        status: 'failed',
        error_message: 'No questions could be extracted from this file.',
      }).eq('id', uploadId);
      return;
    }

    // Dedup now happens at the database layer via the unique index on
    // (course_id, content_hash) added in sql/001_pastq_restructure.sql,
    // instead of pulling every existing question for the course into
    // Node memory on every single upload. We upsert and just count how
    // many rows actually landed vs were silently skipped as duplicates.
    const rows = questions
      .filter(q => q.content)
      .map(q => ({
        course_id: courseId,
        year,
        content: q.content,
        type: q.type || 'mcq',
        options: q.options || null,
        answer: q.answer || null,
        topic: q.topic || null,
        difficulty: q.difficulty || 'medium',
        verified: false,
      }));

    if (rows.length === 0) {
      await supabase.from('uploads').update({ status: 'done', questions_extracted: 0 }).eq('id', uploadId);
      return;
    }

    const { data: inserted, error: qError } = await supabase
      .from('questions')
      .upsert(rows, { onConflict: 'course_id,content_hash', ignoreDuplicates: true })
      .select('id');

    if (qError) throw new Error('DB insert failed: ' + qError.message);

    const savedCount = inserted?.length ?? 0;
    await supabase.from('uploads').update({
      status: 'done',
      questions_extracted: savedCount,
    }).eq('id', uploadId);

    console.log(`[Worker] Upload ${uploadId}: saved ${savedCount}, skipped ${rows.length - savedCount} duplicates.`);

  } catch (err) {
    console.error(`[Worker] Fatal error for upload ${uploadId}:`, err);
    await supabase.from('uploads').update({
      status: 'failed',
      error_message: err.message,
    }).eq('id', uploadId).catch(() => {});
  }
}

async function callWithFallback(fileContent, prompt) {
  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i];
    try {
      console.log(`[AI] Trying model: ${model}`);
      return await callOpenRouter(fileContent, prompt, model);
    } catch (e) {
      console.warn(`[AI] Model ${model} failed: ${e.message}`);
      if (i < MODELS.length - 1) await sleep(2000);
    }
  }
  return [];
}

async function callOpenRouter(fileContent, prompt, model) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://pastq-frontend.vercel.app',
      'X-Title': 'PastQ',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: [fileContent, { type: 'text', text: prompt }] }],
      max_tokens: 8000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error('OpenRouter ' + response.status + ': ' + errorText);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('Model returned empty content');

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

module.exports = { enqueueExtraction };
