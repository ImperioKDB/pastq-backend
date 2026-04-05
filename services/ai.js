const fetch = require('node-fetch');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'nvidia/nemotron-nano-12b-v2-vl:free';

async function extractQuestionsFromFile(fileBuffer, mimeType, courseCode, year) {
  var prompt = 'You are an academic assistant analyzing a Nigerian university exam paper. '
    + 'Extract questions from this document. '
    + 'Return ONLY a JSON array with no explanation and no markdown. '
    + 'Each item must have: content, type ("mcq" or "theory"), options (array of exactly 4 strings A B C D or null), '
    + 'answer (string or null), topic (string), difficulty ("easy", "medium", or "hard"). '
    + 'IMPORTANT: MCQ options must be exactly 4 strings. Do not include more than 4 options. '
    + 'Extract a maximum of 30 questions only. '
    + 'Course: ' + courseCode + '. Year: ' + year + '. '
    + 'Return only the JSON array. No extra text.';

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

  var body = JSON.stringify({
    model: MODEL,
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

  console.log('Full API response: ' + JSON.stringify(data).slice(0, 500));

  var text = '';
  if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
    text = data.choices[0].message.content;
  }

  if (!text) {
    console.error('Model returned empty. Full response: ' + JSON.stringify(data));
    return [];
  }

  console.log('AI response preview: ' + text.slice(0, 300));

  try {
    var cleaned = text.replace(/```json|```/g, '').trim();
    var jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    console.error('No JSON array found in response');
    return [];
  } catch (e) {
    console.error('Failed to parse response:', e);
    console.log('Full response text:', text);
    return [];
  }
}

module.exports = { extractQuestionsFromFile: extractQuestionsFromFile };
