const fetch = require('node-fetch');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'qwen/qwen2.5-vl-72b-instruct:free';

async function extractQuestionsFromFile(fileBuffer, mimeType, courseCode, year) {
  const prompt = 'You are an academic assistant analyzing a Nigerian university exam paper.\n'
    + 'Extract ALL questions from this document.\n'
    + 'Return ONLY a JSON array with no explanation and no markdown formatting.\n\n'
    + 'Each question object must have exactly these fields:\n'
    + '- content: the full question text (string)\n'
    + '- type: "mcq" if it has options A-D, "theory" if it does not\n'
    + '- options: array of 4 option strings if MCQ, null if theory\n'
    + '- answer: the correct option string if identifiable, null if not\n'
    + '- topic: the subject topic (e.g. "Calculus", "Cell Biology")\n'
    + '- difficulty: "easy", "medium", or "hard"\n\n'
    + 'Course: ' + courseCode + '\n'
    + 'Year: ' + year + '\n\n'
    + 'Return only the JSON array. No extra text.';

  // Convert buffer to base64
  const base64Data = fileBuffer.toString('base64');

  // Build the file content block
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

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://pastq-frontend.vercel.app',
      'X-Title': 'PastQ'
    },
    body: JSON.stringify({
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
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error('OpenRouter API error: ' + response.status + ' - ' + errorText);
  }

  const data = await response.json();
  const text = (data.choices && data.choices[0] && data.choices[0].message) ? data.choices[0].message.content : '';

  console.log('Raw AI response preview: ' + text.slice(0, 300));

  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  } catch (e) {
    console.error('Failed to parse AI response:', e);
    console.log('Full raw response:', text);
    return [];
  }
}

module.exports = { extractQuestionsFromFile: extractQuestionsFromFile };    base64Images = [fileBuffer.toString('base64')];
    console.log('Single image upload, using directly');
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  if (base64Images.length === 0) {
    throw new Error('No pages could be extracted from the file');
  }

  const BATCH_SIZE = 10;
  const allQuestions = [];

  for (let i = 0; i < base64Images.length; i += BATCH_SIZE) {
    const batch = base64Images.slice(i, i + BATCH_SIZE);
    console.log(`Processing pages ${i + 1}–${Math.min(i + BATCH_SIZE, base64Images.length)}...`);
    const questions = await extractQuestionsFromImages(batch, courseCode, year);
    allQuestions.push(...questions);
  }

  return allQuestions;
}

module.exports = { extractQuestionsFromFile };    return [];
  } catch (e) {
    console.error('Failed to parse AI response:', e);
    console.log('Full raw response:', text);
    return [];
  }
}

/**
 * Main export — handles both PDFs and direct image uploads
 */
async function extractQuestionsFromFile(fileBuffer, mimeType, courseCode, year) {
  let base64Images = [];

  if (mimeType === 'application/pdf') {
    console.log('Converting PDF pages to images with MuPDF...');
    base64Images = await pdfBufferToImages(fileBuffer);
    console.log(`Converted ${base64Images.length} pages`);
  } else if (mimeType.startsWith('image/')) {
    // Direct image upload — use as-is
    base64Images = [fileBuffer.toString('base64')];
    console.log('Single image upload, using directly');
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  if (base64Images.length === 0) {
    throw new Error('No pages could be extracted from the file');
  }

  // Process in batches of 10 pages to avoid timeouts
  const BATCH_SIZE = 10;
  const allQuestions = [];

  for (let i = 0; i < base64Images.length; i += BATCH_SIZE) {
    const batch = base64Images.slice(i, i + BATCH_SIZE);
    console.log(`Processing pages ${i + 1}–${Math.min(i + BATCH_SIZE, base64Images.length)}...`);
    const questions = await extractQuestionsFromImages(batch, courseCode, year);
    allQuestions.push(...questions);
  }

  return allQuestions;
}

module.exports = { extractQuestionsFromFile };
