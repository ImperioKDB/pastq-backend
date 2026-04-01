const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'PastQ backend is running ✅' });
});

// Routes
app.use('/api/schools', require('./routes/schools'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/questions', require('./routes/questions'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
