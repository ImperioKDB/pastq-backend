const fetch = require('node-fetch');

const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;
const LLM_MODEL = 'mistralai/Mistral-7B-Instruct-v0.3';
const EMBED_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';

// Extract and structure questions from raw text
async function extractQuestions(rawText, courseCode, year) {
  const prompt = `[INST] You are an academic assistant. 
Extract all exam questions from the text below.
Return a JSON array only — no explanation, no markdown.

Each question must have:
- content: the question text
- type: "mcq" or "theory"
- options: array of 4 strings if MCQ, null if theory
- answer: correct answer if MCQ, null if theory
- topic: the subject topic (e.g. "Integration", "Cell Biology")
- difficulty: "easy", "medium", or "hard"

Course: ${courseCode}
Year: ${year}

Text:
${rawText.slice(0, 3000)}
[/INST]`;

  const response = await fetch(
    `https://api-inference.huggingface.co/models/${LLM_MODEL}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 2000,
          temperature: 0.2,
          return_full_text: false,
        },
      }),
    }
  );

  const data = await response.json();

  // Extract the generated text
  const generated = data[0]?.generated_text || '';

  // Parse JSON from response
  try {
    const jsonMatch = generated.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return [];
  } catch (e) {
    console.error('Failed to parse HF response:', e);
    return [];
  }
}

// Generate embedding for a question (for dedup)
async function getEmbedding(text) {
  const response = await fetch(
    `https://api-inference.huggingface.co/models/${EMBED_MODEL}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: text }),
    }
  );

  const data = await response.json();
  return data;
}

module.exports = { extractQuestions, getEmbedding };
