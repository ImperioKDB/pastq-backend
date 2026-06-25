const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../db');
const { processExtractionInBackground } = require('../services/ai');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { course_id, course_code, year } = req.body;
    const file = req.file;

    // 1. Validate request
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    if (!course_id || !course_code || !year) {
      return res.status(400).json({ error: 'course_id, course_code, and year are required' });
    }

    // 2. Upload raw file to Supabase Storage
    const fileName = `uploads/${Date.now()}_${file.originalname}`;
    const { data: fileData, error: fileError } = await supabase.storage
      .from('past-questions')
      .upload(fileName, file.buffer, { contentType: file.mimetype });

    if (fileError) throw new Error('Storage upload failed: ' + fileError.message);
    const fileUrl = fileData?.path || fileName;

    // 3. Create upload record in DB
    const { data: uploadRecord, error: uploadError } = await supabase
      .from('uploads')
      .insert([{ 
        file_url: fileUrl, 
        course_id, 
        year: parseInt(year), 
        status: 'processing' 
      }])
      .select()
      .single();

    if (uploadError) throw new Error('DB record creation failed: ' + uploadError.message);

    // 4. Return 202 Accepted IMMEDIATELY to prevent frontend timeouts
    res.status(202).json({ 
      message: 'Upload received. AI extraction started in background.', 
      upload_id: uploadRecord.id 
    });

    // 5. Fire and forget: Process AI in the background
    // Note: For true production scale at high volume, move this to a message queue (BullMQ) 
    // or Supabase Edge Functions. For now, this prevents the HTTP thread from blocking.
    processExtractionInBackground(
      uploadRecord.id, 
      file.buffer, 
      file.mimetype, 
      course_id, 
      course_code, 
      parseInt(year)
    ).catch(err => {
      console.error(`[Background Worker] Extraction failed for upload ${uploadRecord.id}:`, err.message);
    });

  } catch (err) {
    console.error('[Upload Route] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;