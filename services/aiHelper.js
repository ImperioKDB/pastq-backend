const fetch = require('node-fetch');
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODELS = [
  'openai/gpt-oss-120b:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
];
function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function callOpenRouter(fileContent, prompt, model) {
  var body = JSON.stringify({
    model: model,
    messages: [{ role: 'user', content: [fileContent, { type: 'text', text: prompt }] }],
    max_tokens: 8000
  });
  var response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://pastq-frontend.vercel.app',
      'X-Title': 'PastQ'
    },
    body: body
  });
  if (!response.ok) {
    var errorText = await response.text();
    throw new Error('OpenRouter error: ' + response.status + ' - ' + errorText);
  }
  var data = await response.json();
  console.log('API response preview: ' + JSON.stringify(data).slice(0, 300));
  var text = '';
  if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
    text = data.choices[0].message.content;
  }
  if (!text) throw new Error('Model returned empty content');
  var cleaned = text.replace(/```json|```/g, '').trim();
  var jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  var questions = JSON.parse(jsonMatch[0]);
  return questions.filter(function(q) {
    if (q.type === 'mcq' && Array.isArray(q.options)) {
      return !q.options.every(function(o) { return /^[A-Ea-e]$/.test(String(o).trim()); });
    }
    return true;
  });
}

async function callWithRetry(fileContent, prompt) {
  for (var i = 0; i < MODELS.length; i++) {
    try {
      console.log('Trying model: ' + MODELS[i]);
      return await callOpenRouter(fileContent, prompt, MODELS[i]);
    } catch (e) {
      console.warn('Model ' + MODELS[i] + ' failed: ' + e.message);
      if (i < MODELS.length - 1) await sleep(2000);
    }
  }
  return [];
}

module.exports = { callWithRetry, sleep };
