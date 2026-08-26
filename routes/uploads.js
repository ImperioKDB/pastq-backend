const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../db');
const { requireAuth } = require('../middleware/auth');
const { enqueueExtraction } = require('../services/ai');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
});

// Requires auth — extraction burns real API credits per call, this was
// previously callable by anyone with the URL.
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const { course_id, course_code, year } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    if (!course_id || !course_code || !year) {
      return res.status(400).json({ error: 'course_id, course_code, and year are required' });
    }

    const fileName = `uploads/${Date.now()}_${file.originalname}`;
    const { data: fileData, error: fileError } = await supabase.storage
      .from('past-questions')
      .upload(fileName, file.buffer, { contentType: file.mimetype });

    if (fileError) throw new Error('Storage upload failed: ' + fileError.message);
    const fileUrl = fileData?.path || fileName;

    const { data: uploadRecord, error: uploadError } = await supabase
      .from('uploads')
      .insert([{
        file_url: fileUrl,
        course_id,
        year: parseInt(year),
        status: 'queued',
        uploaded_by: req.user.id,
      }])
      .select()
      .single();

    if (uploadError) throw new Error('DB record creation failed: ' + uploadError.message);

    res.status(202).json({
      message: 'Upload received and queued for extraction.',
      upload_id: uploadRecord.id,
    });

    // Hand off to the bounded-concurrency worker instead of firing an
    // unbounded async call per request. See services/ai.js.
    enqueueExtraction({
      uploadId: uploadRecord.id,
      fileBuffer: file.buffer,
      mimeType: file.mimetype,
      courseId: course_id,
      courseCode: course_code,
      year: parseInt(year),
    });

  } catch (err) {
    console.error('[Upload Route] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
