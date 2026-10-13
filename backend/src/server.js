require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const { pool } = require('./config/db');
const { authenticate } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errors');

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/api/health', async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT fn_count_available_samples(NULL) AS available_samples');
    res.json({ status: 'ok', database: 'connected', ...row });
  } catch (e) {
    res.status(503).json({ status: 'error', database: e.message });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api', authenticate);            // everything below needs a valid token
app.use('/api/meta', require('./routes/meta'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/hospitals', require('./routes/hospitals'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/users', require('./routes/users'));
app.use('/api/storage', require('./routes/storage'));
app.use('/api/donors', require('./routes/donors'));
app.use('/api/consents', require('./routes/consents'));
app.use('/api/patients', require('./routes/patients'));
app.use('/api/samples', require('./routes/samples'));
app.use('/api/tests', require('./routes/tests'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/transplants', require('./routes/transplants'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/portal', require('./routes/portal'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api', (req, res) => res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}` }));

// serve the built React app when it exists (single-server deployment)
const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);

const port = Number(process.env.PORT || 5000);
app.listen(port, () => console.log(`StemVault API listening on http://localhost:${port}`));
