const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../db');
const { extractQuestionsFromFile } = require('../services/ai');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post('/', upload.single('file'), async (req, res) => {
  let uploadRecordId = null;

  try {
    const { course_id, course_code, year } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    if (!course_id) return res.status(400).json({ error: 'course_id is required' });
    if (!course_code) return res.status(400).json({ error: 'course_code is required' });
    if (!year) return res.status(400).json({ error: 'year is required' });

    console.log(`File received: ${file.originalname} (${file.mimetype}, ${(file.size / 1024).toFixed(1)}KB)`);

    // Step 0: Auto-create course if it doesn't exist
    const { data: existingCourse } = await supabase
      .from('courses')
      .select('id')
      .eq('id', course_id)
      .single();

    if (!existingCourse) {
      console.log(`Course ${course_id} not found — auto-creating as "${course_code}"`);
      const { error: courseError } = await supabase
        .from('courses')
        .insert([{
          id: course_id,
          code: course_code,
          name: course_code,
          school_id: process.env.DEFAULT_SCHOOL_ID,
        }]);
      if (courseError) {
        console.error('Auto-create course failed:', courseError.message);
      } else {
        console.log(`Course "${course_code}" auto-created successfully`);
      }
    }

    // Step 1: Upload raw file to Supabase Storage
    const fileName = `uploads/${Date.now()}_${file.originalname}`;
    const { data: fileData, error: fileError } = await supabase.storage
      .from('past-questions')
      .upload(fileName, file.buffer, { contentType: file.mimetype });

    if (fileError) console.error('Storage upload error:', fileError.message);
    const fileUrl = fileData?.path || fileName;

    // Step 2: Create upload record
    const { data: uploadRecord, error: uploadError } = await supabase
      .from('uploads')
      .insert([{ file_url: fileUrl, course_id, year: parseInt(year), status: 'processing' }])
      .select()
      .single();

    if (uploadError) {
      console.error('Failed to create upload record:', uploadError.message);
    } else {
      uploadRecordId = uploadRecord.id;
    }

    // Step 3: Extract questions using AI
    console.log('Starting AI extraction...');
    const questions = await extractQuestionsFromFile(
      file.buffer,
      file.mimetype,
      course_code,
      year
    );

    console.log(`AI extracted ${questions.length} questions`);

    // Step 4: Handle empty extraction
    if (questions.length === 0) {
      if (uploadRecordId) {
        await supabase.from('uploads').update({ status: 'failed' }).eq('id', uploadRecordId);
      }
      return res.status(422).json({ error: 'No questions could be extracted from this file' });
    }

    // Step 5: Save questions to Supabase
    const questionsToInsert = questions.map(q => ({
      course_id,
      year: parseInt(year),
      content: q.content,
      type: q.type || 'mcq',
      options: q.options || null,
      answer: q.answer || null,
      topic: q.topic || null,
      difficulty: q.difficulty || 'medium',
      verified: false,
    }));

    const { data: savedQuestions, error: qError } = await supabase
      .from('questions')
      .insert(questionsToInsert)
      .select();

    if (qError) throw new Error(`Failed to save questions: ${qError.message}`);

    // Step 6: Mark upload as done
    if (uploadRecordId) {
      await supabase.from('uploads').update({ status: 'done' }).eq('id', uploadRecordId);
    }

    res.status(201).json({
      message: `✅ ${savedQuestions.length} questions extracted and saved`,
      questions: savedQuestions,
    });

  } catch (err) {
    console.error('Upload error:', err.message);
    if (uploadRecordId) {
      await supabase.from('uploads').update({ status: 'failed' }).eq('id', uploadRecordId);
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
