const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const supabase = require('../db');
const { extractQuestions } = require('../services/huggingface');

// Store file in memory temporarily
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { course_id, course_code, year } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Step 1: Extract text from PDF
    let rawText = '';
    if (file.mimetype === 'application/pdf') {
      const parsed = await pdfParse(file.buffer);
      rawText = parsed.text;
    } else {
      return res.status(400).json({ error: 'Only PDF files supported for now' });
    }

    if (!rawText || rawText.trim().length < 50) {
      return res.status(400).json({ error: 'Could not extract text from PDF' });
    }

    // Step 2: Upload raw file to Supabase Storage
    const fileName = `uploads/${Date.now()}_${file.originalname}`;
    const { data: fileData, error: fileError } = await supabase.storage
      .from('past-questions')
      .upload(fileName, file.buffer, { contentType: file.mimetype });

    if (fileError) console.error('Storage error:', fileError.message);

    const fileUrl = fileData?.path || fileName;

    // Step 3: Save upload record
    const { data: uploadRecord } = await supabase
      .from('uploads')
      .insert([{ file_url: fileUrl, course_id, year, status: 'processing' }])
      .select()
      .single();

    // Step 4: Send text to Hugging Face for extraction
    const questions = await extractQuestions(rawText, course_code, year);

    if (questions.length === 0) {
      await supabase
        .from('uploads')
        .update({ status: 'failed' })
        .eq('id', uploadRecord.id);
      return res.status(422).json({ error: 'No questions could be extracted' });
    }

    // Step 5: Save each question to database
    const questionsToInsert = questions.map((q) => ({
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

    // Step 6: Mark upload as done
    await supabase
      .from('uploads')
      .update({ status: 'done' })
      .eq('id', uploadRecord.id);

    res.status(201).json({
      message: `✅ ${savedQuestions.length} questions extracted and saved`,
      questions: savedQuestions,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
