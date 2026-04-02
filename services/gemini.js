const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function extractQuestionsFromImage(imageBuffer, courseCode, year) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `You are an academic assistant analyzing a Nigerian university exam paper.
Extract ALL questions from this image.
Return ONLY a JSON array with no explanation or markdown.

Each question must have:
- content: the full question text
- type: "mcq" if it has options, "theory" if it doesn't
- options: array of 4 option strings if MCQ, null if theory
- answer: correct answer if identifiable, null if not
- topic: the subject topic (e.g. "Calculus", "Cell Biology")
- difficulty: "easy", "medium", or "hard"

Course: ${courseCode}
Year: ${year}`;

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType: 'image/jpeg'
    }
  };

  const result = await model.generateContent([prompt, imagePart]);
  const response = await result.response;
  const text = response.text();

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return [];
  } catch (e) {
    console.error('Failed to parse Gemini response:', e);
    console.log('Raw response:', text);
    return [];
  }
}

module.exports = { extractQuestionsFromImage };
