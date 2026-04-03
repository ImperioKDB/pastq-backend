const fetch = require('node-fetch');
const { fromBuffer } = require('pdf2pic');

async function extractQuestionsFromPDF(pdfBuffer, courseCode, year) {
  const converter = fromBuffer(pdfBuffer, {
    density: 150,
    format: 'jpeg',
    width: 1200,
    height: 1600
  });

  let allQuestions = [];
  let page = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    try {
      console.log(`Processing page ${page}...`);
      const result = await converter(page, { responseType: 'buffer' });

      if (!result || !result.buffer) {
        console.log(`No more pages after page ${page - 1}`);
        hasMorePages = false;
        break;
      }

      const questions = await sendToQwen(result.buffer, courseCode, year, page);
      allQuestions = allQuestions.concat(questions);

      console.log(`Page ${page} done — ${questions.length} questions found`);
      page++;

      // Safety limit — max 20 pages
      if (page > 20) {
        console.log('Reached 20 page limit');
        hasMorePages = false;
      }

      // Small delay between pages to avoid HF rate limiting
      await sleep(2000);

    } catch (e) {
      console.log(`Stopped at page ${page}:`, e.message);
      hasMorePages = false;
    }
  }

  console.log(`Total questions extracted: ${allQuestions.length}`);
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

  // Handle HF model loading
  if (data.error && data.error.includes('loading')) {
    console.log('Model loading, waiting 20 seconds...');
    await sleep(20000);
    return sendToQwen(imageBuffer, courseCode, year, pageNum);
  }

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { extractQuestionsFromPDF };
