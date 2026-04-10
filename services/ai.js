const { callWithRetry, sleep } = require('./aiHelper');

async function extractQuestionsFromFile(fileBuffer, mimeType, courseCode, year) {
  var base64Data = fileBuffer.toString('base64');
  var fileContent = mimeType === 'application/pdf'
    ? { type: 'file', file: { filename: 'exam.pdf', file_data: 'data:application/pdf;base64,' + base64Data } }
    : { type: 'image_url', image_url: { url: 'data:' + mimeType + ';base64,' + base64Data } };

  var allQuestions = [];
  var batchSize = 30;

  for (var batch = 0; batch < 4; batch++) {
    var startFrom = batch * batchSize + 1;
    var endAt = startFrom + batchSize - 1;
    console.log('Extracting questions ' + startFrom + ' to ' + endAt + '...');

    var prompt = 'You are an academic assistant analyzing a Nigerian university exam paper.\n'
      + 'Extract exam questions numbered ' + startFrom + ' to ' + endAt + ' from this document.\n'
      + 'ONLY extract questions in that numbered range. If fewer than ' + startFrom + ' questions exist, return []\n'
      + 'Return ONLY a raw JSON array. No explanation, no markdown, no code fences.\n'
      + 'CRITICAL RULES:\n'
      + '1. "content" must contain ONLY the question text. Do NOT put options inside content.\n'
      + '2. "options" must contain the FULL TEXT of each choice, not just the letters A B C D.\n'
      + '3. "answer" must be the FULL TEXT of the correct option, not just the letter.\n'
      + 'CORRECT: {"content":"What is force?","type":"mcq","options":["Newton","Joule","Watt","Pascal"],"answer":"Newton","topic":"Mechanics","difficulty":"easy"}\n'
      + 'WRONG: {"content":"What is force? (A) Newton (B) Joule","options":["A","B","C","D"],"answer":"A"}\n'
      + 'Fields: content, type ("mcq"/"theory"), options (4-5 full strings or null), answer (full text or null), topic, difficulty.\n'
      + 'Course: ' + courseCode + '. Year: ' + year + '. Return only the JSON array.';

    var batchResult = await callWithRetry(fileContent, prompt);
    console.log('Batch ' + (batch + 1) + ': ' + batchResult.length + ' questions');

    if (batchResult.length === 0) break;
    allQuestions = allQuestions.concat(batchResult);
    if (batchResult.length < batchSize - 2) break;
    await sleep(3000);
  }

  console.log('Total extracted: ' + allQuestions.length);
  return allQuestions;
}

module.exports = { extractQuestionsFromFile: extractQuestionsFromFile };
