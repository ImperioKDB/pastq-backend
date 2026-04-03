const fetch = require('node-fetch');
const { fromBuffer } = require('pdf2pic');

async function extractQuestionsFromPDF(pdfBuffer, courseCode, year) {
  // Step 1: Convert PDF pages to images
  const converter = fromBuffer(pdfBuffer, {
    density: 150,
    format: 'jpeg',
    width: 1200,
    height: 1600
  });

  let allQuestions = [];

  // Convert first 3 pages max (free tier limit)
  const pageCount = 3;

  for (let page = 1; page <= pageCount; page++) {
    try {
      console.log(`Processing page ${page}...`);
      const result = await converter(page, { responseType: 'buffer' });

      if (!result || !result.buffer) {
        console.log(`Page ${page} not found, stopping`);
        break;
      }

      // Step 2: Send image to Qwen2-VL
      const questions = await sendToQwen(result.buffer, courseCode, year, page);
      allQuestions = allQuestions.concat(questions);

    } catch (e) {
      console.log(`Page ${page} error:`, e.message);
      break;
    }
  }

  return allQuestions;
}

async function sendToQwen(imageBuffer, courseCode, year, pageNum) {
  const base64Image = imageBuffer.toString('base64');

  const prompt = `You are analyzing page ${pageNum} of a Nigerian university exam paper.
Extract ALL questions visible on this page.
Return ONLY a JSON array, no explanation, no markdown.

Each question must have:
- content: full question text
- type: "mcq" if it has options A B C D, "theory" if open ended
- options: array of 4 strings if MCQ, null if theory
- answer: correct answer if shown, null if not
- topic: subject topic (e.g. "Mechanics", "Algebra")
- difficulty: "easy", "medium", or "hard"

Course: ${courseCode}
Year: ${year}

If no questions are visible, return an empty array: []`;

  const response = await fetch(
    'https://api-inference.huggingface.co/models/Qwen/Qwen2-VL-7B-Instruct/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'Qwen/Qwen2-VL-7B-Instruct',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.1
      })
    }
  );

  const data = await response.json();
  console.log(`Page ${pageNum} Qwen response:`, JSON.stringify(data).slice(0, 200));

  const text = data.choices?.[0]?.message?.content || '';

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return [];
  } catch (e) {
    console.error(`Page ${pageNum} parse error:`, e.message);
    return [];
  }
}

module.exports = { extractQuestionsFromPDF };
