const express = require('express');
const cors = require('cors');
const { Anthropic } = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS: restrict to known frontend origins in production
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080'];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // In development, allow all origins
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '16kb' }));

// Simple in-memory rate limiter
const requestCounts = new Map();
const RATE_LIMIT = 30; // max requests per minute per IP
const RATE_WINDOW = 60000; // 1 minute

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const record = requestCounts.get(ip);
  if (!record || now - record.start > RATE_WINDOW) {
    requestCounts.set(ip, { start: now, count: 1 });
    return next();
  }
  record.count++;
  if (record.count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
  }
  next();
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of requestCounts) {
    if (now - record.start > RATE_WINDOW * 2) requestCounts.delete(ip);
  }
}, RATE_WINDOW * 2);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.post('/api/analyze', rateLimiter, async (req, res) => {
  try {
    const { systemPrompt, userPrompt } = req.body;

    if (!userPrompt || typeof userPrompt !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid engineering data payload.' });
    }

    // Limit prompt size
    if (userPrompt.length > 8000) {
      return res.status(400).json({ error: 'Prompt too long. Maximum 8000 characters.' });
    }

    const safeSystem = (typeof systemPrompt === 'string' && systemPrompt.length > 0)
      ? systemPrompt.slice(0, 2000)
      : 'You are an expert structural engineer analyzing finite element data.';

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: safeSystem,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Safely extract response text
    const text = response.content && response.content[0] && response.content[0].text
      ? response.content[0].text
      : 'No analysis generated.';

    res.json({ text });
  } catch (error) {
    // Handle rate limit from Anthropic
    if (error.status === 429) {
      return res.status(429).json({ error: 'AI service rate limited. Please retry shortly.' });
    }
    // Don't log full error object (may contain API key in headers)
    console.error('Anthropic API Error:', error.message || error.status || 'unknown');
    res.status(500).json({ error: 'Failed to process AI engineering analysis.' });
  }
});

app.listen(PORT, () => {
  console.log(`Nexus FEA backend running on http://localhost:${PORT}`);
});
