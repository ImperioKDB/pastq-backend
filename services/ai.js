const { callWithRetry } = require('./aiHelper');

async function extractQuestionsFromFile(fileBuffer, mimeType, courseCode, year) {
  var base64Data = fileBuffer.toString('base64');
  var fileContent = mimeType === 'application/pdf'
    ? { type: 'file', file: { filename: 'exam.pdf', file_data: 'data:application/pdf;base64,' + base64Data } }
    : { type: 'image_url', image_url: { url: 'data:' + mimeType + ';base64,' + base64Data } };

  var prompt = 'You are an academic assistant analyzing a Nigerian university exam paper.\n'
    + 'Extract up to 30 exam questions from this document.\n'
    + 'Return ONLY a raw JSON array. No explanation, no markdown, no code fences.\n'
    + 'CRITICAL RULES:\n'
    + '1. "content" must contain ONLY the question text. Do NOT put options inside content.\n'
    + '2. "options" must contain the FULL TEXT of each choice, not just the letters A B C D.\n'
    + '3. "answer" must be the FULL TEXT of the correct option, not just the letter.\n'
    + 'CORRECT: {"content":"What is force?","type":"mcq","options":["Newton","Joule","Watt","Pascal"],"answer":"Newton","topic":"Mechanics","difficulty":"easy"}\n'
    + 'WRONG: {"content":"What is force? (A) Newton (B) Joule","options":["A","B","C","D"],"answer":"A"}\n'
    + 'Fields: content, type ("mcq"/"theory"), options (4-5 full strings or null), answer (full text or null), topic, difficulty.\n'
    + 'Course: ' + courseCode + '. Year: ' + year + '. Return only the JSON array.';

  var questions = await callWithRetry(fileContent, prompt);
  console.log('Total extracted: ' + questions.length);
  return questions;
}

module.exports = { extractQuestionsFromFile: extractQuestionsFromFile };
