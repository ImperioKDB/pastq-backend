const fetch = require('node-fetch');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODELS = [
  'openai/gpt-oss-100b:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'qwen/qwen2.5-vl-72b-instruct:free',
];

async function extractQuestionsFromFile(fileBuffer, mimeType, courseCode, year) {
  var base64Data = fileBuffer.toString('base64');

  var fileContent;
  if (mimeType === 'application/pdf') {
    fileContent = {
      type: 'file',
      file: {
        filename: 'exam.pdf',
        file_data: 'data:application/pdf;base64,' + base64Data
      }
    };
  } else {
    fileContent = {
      type: 'image_url',
      image_url: {
        url: 'data:' + mimeType + ';base64,' + base64Data
      }
    };
  }

  var allQuestions = [];
  var batchSize = 30;
  var maxBatches = 4;

  for (var batch = 0; batch < maxBatches; batch++) {
    var startFrom = batch * batchSize + 1;
    var endAt = startFrom + batchSize - 1;

    console.log('Extracting questions ' + startFrom + ' to ' + endAt + '...');

    var prompt = 'You are an academic assistant analyzing a Nigerian university exam paper.\n'
      + 'Extract exam questions numbered ' + startFrom + ' to ' + endAt + ' from this document.\n'
      + 'ONLY extract questions in that numbered range. Skip all others.\n'
      + 'If there are fewer than ' + startFrom + ' questions in the document, return an empty array: []\n'
      + 'Return ONLY a raw JSON array. No explanation, no markdown, no code fences.\n\n'
      + 'CRITICAL RULES:\n'
      + '1. "content" must contain ONLY the question text. Do NOT put options inside content.\n'
      + '2. "options" must contain the FULL TEXT of each choice, not just the letters A B C D.\n'
      + '3. "answer" must be the FULL TEXT of the correct option (matching one of the options strings exactly), not just the letter.\n\n'
      + 'CORRECT example:\n'
      + '{"content":"What is the unit of force?","type":"mcq","options":["Newton","Joule","Watt","Pascal"],"answer":"Newton","topic":"Mechanics","difficulty":"easy"}\n\n'
      + 'WRONG example (never do this):\n'
      + '{"content":"What is the unit of force? (A) Newton (B) Joule (C) Watt (D) Pascal","type":"mcq","options":["A","B","C","D"],"answer":"A","topic":"Mechanics","difficulty":"easy"}\n\n'
      + 'Each question must have:\n'
      + '- content: question text only, no options\n'
      + '- type: "mcq" if multiple choice, "theory" if open ended\n'
      + '- options: array of full-text strings for MCQ (can be 4 or 5), null for theory\n'
      + '- answer: full text of correct answer for MCQ (must match one of the options exactly), null if not shown\n'
      + '- topic: subject topic (e.g. "Kinematics", "Algebra", "Vectors")\n'
      + '- difficulty: "easy", "medium", or "hard"\n\n'
      + 'Course: ' + courseCode + '. Year: ' + year + '.\n'
      + 'Return only the JSON array. Nothing else.';

    var batchResult = await callWithRetry(fileContent, prompt);

    console.log('Batch ' + (batch + 1) + ' returned ' + batchResult.length + ' questions');

    if (batchResult.length === 0) {
      console.log('No more questions found, stopping at batch ' + (batch + 1));
      break;
    }

    allQuestions = allQuestions.concat(batchResult);

    if (batch < maxBatches - 1 && batchResult.length >= batchSize - 2) {
      console.log('Waiting 3s before next batch...');
      await sleep(3000);
    } else {
      break;
    }
  }

  console.log('Total questions extracted: ' + allQuestions.length);
  return allQuestions;
}

async function callWithRetry(fileContent, prompt) {
  for (var attempt = 0; attempt < MODELS.length; attempt++) {
    var model = MODELS[attempt];
    try {
      console.log('Trying model: ' + model);
      var result = await callOpenRouter(fileContent, prompt, model);
      return result;
    } catch (e) {
      console.warn('Model ' + model + ' failed: ' + e.message);
      if (attempt < MODELS.length - 1) {
        console.log('Trying next model...');
        await sleep(2000);
      } else {
        console.error('All models failed');
        return [];
      }
    }
  }
  return [];
}

async function callOpenRouter(fileContent, prompt, model) {
  var body = JSON.stringify({
    model: model,
    messages: [
      {
        role: 'user',
        content: [
          fileContent,
          { type: 'text', text: prompt }
        ]
      }
    ],
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

  if (!text) {
    throw new Error('Model returned empty content');
  }

  try {
    var cleaned = text.replace(/```json|```/g, '').trim();
    var jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      var questions = JSON.parse(jsonMatch[0]);
      var valid = questions.filter(function(q) {
        if (q.type === 'mcq' && Array.isArray(q.options)) {
          var allLetters = q.options.every(function(o) {
            return /^[A-Ea-e]$/.test(String(o).trim());
          });
          if (allLetters) {
            console.warn('Skipping letter-only options:', q.content.slice(0, 60));
            return false;
          }
        }
        return true;
      });
      return valid;
    }
    return [];
  } catch (e) {
    console.error('Failed to parse response:', e);
    return [];
  }
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

module.exports = { extractQuestionsFromFile
