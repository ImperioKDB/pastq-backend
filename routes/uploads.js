const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../db');
const { extractQuestionsFromImage } = require('../services/gemini');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { course_id, course_code, year } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    console.log('File received:', file.originalname, file.mimetype);

    // Step 1: Upload raw file to Supabase Storage
    const fileName = `uploads/${Date.now()}_${file.originalname}`;
    const { data: fileData, error: fileError } = await supabase.storage
      .from('past-questions')
      .upload(fileName, file.buffer, { contentType: file.mimetype });

    if (fileError) console.error('Storage error:', fileError.message);
    const fileUrl = fileData?.path || fileName;

    // Step 2: Save upload record
    const { data: uploadRecord } = await supabase
      .from('uploads')
      .insert([{ file_url: fileUrl, course_id, year, status: 'processing' }])
      .select()
      .single();

    // Step 3: Send directly to Gemini as image
    console.log('Sending to Gemini...');
    const questions = await extractQuestionsFromImage(
      file.buffer,
      course_code,
      year
    );

    console.log(`Gemini extracted ${questions.length} questions`);

    if (questions.length === 0) {
      await supabase
        .from('uploads')
        .update({ status: 'failed' })
        .eq('id', uploadRecord.id);
      return res.status(422).json({ error: 'No questions could be extracted' });
    }

    // Step 4: Save questions to database
    const questionsToInsert = questions.map(q => ({
      course_id,
      year: parseInt(year),
      content: q.content,
      type: q.type,
      options: q.options,
      answer: q.answer,
      topic: q.topic,
      difficulty: q.difficulty,
      verified: false,
    }));

    const { data: savedQuestions, error: qError } = await supabase
      .from('questions')
      .insert(questionsToInsert)
      .select();

    if (qError) throw new Error(qError.message);

    // Step 5: Mark upload as done
    await supabase
      .from('uploads')
      .update({ status: 'done' })
      .eq('id', uploadRecord.id);

    res.status(201).json({
      message: `✅ ${savedQuestions.length} questions extracted and saved`,
      questions: savedQuestions,
    });

  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
