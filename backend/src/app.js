const express = require('express');
const cors = require('cors');

// Initialize Firebase Admin (must happen before routes use it)
require('./config/firebase');

const routes = require('./routes');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Global middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple liveliness check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// API routes
app.use('/api', routes);

// Fallbacks
app.use(notFound);
app.use(errorHandler);

module.exports = app;
