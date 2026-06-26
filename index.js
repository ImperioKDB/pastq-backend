const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const app = express();

// Both Vercel deployment URLs are whitelisted.
// pastq.vercel.app          — canonical short URL
// pastq-frontend.vercel.app — the URL used in services/ai.js HTTP-Referer
// Add any custom domain here when it goes live (e.g. pastq.ng).
const allowedOrigins = [
  'https://pastq.vercel.app',
  'https://pastq-frontend.vercel.app',
  'http://localhost:3000',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Render health checks, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'PastQ backend is running' });
});

// Routes
app.use('/api/schools',   require('./routes/schools'));
app.use('/api/courses',   require('./routes/courses'));
app.use('/api/questions', require('./routes/questions'));
app.use('/api/uploads',   require('./routes/uploads'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
