const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

const allowedOrigins = [
  'https://pastq.vercel.app',
  'http://localhost:3000',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Render health checks)
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
  res.json({ status: 'PastQ backend is running ✅' });
});

// Routes
app.use('/api/schools', require('./routes/schools'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/questions', require('./routes/questions'));
app.use('/api/uploads', require('./routes/uploads'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
