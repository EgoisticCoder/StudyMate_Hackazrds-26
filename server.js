/**
 * Local Express server for API proxy during development
 * Serves the same endpoints as Vercel serverless functions
 */

const express = require('express');
const cors = require('cors');
const neo4jHandler = require('./api/neo4j');
const aiHandler = require('./api/ai');
const ocrHandler = require('./api/ocr');
const voiceHandler = require('./api/voice');
const searchHandler = require('./api/search');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Load environment variables
require('dotenv').config();

// Helper to create Vercel-like request and response objects
function createVercelReq(req) {
  return {
    method: req.method,
    body: req.body,
    headers: req.headers,
    socket: req.socket,
  };
}

function createVercelRes(res) {
  const vercelRes = {
    status: (code) => {
      res.status(code);
      return vercelRes;
    },
    json: (data) => {
      res.json(data);
      return vercelRes;
    },
    end: (data) => {
      if (data !== undefined) res.end(data);
      else res.end();
      return vercelRes;
    },
    setHeader: (name, value) => {
      res.setHeader(name, value);
      return vercelRes;
    },
  };
  return vercelRes;
}

// API Routes
app.post('/api/neo4j', async (req, res) => {
  try {
    const vercelReq = createVercelReq(req);
    const vercelRes = createVercelRes(res);
    await neo4jHandler(vercelReq, vercelRes);
  } catch (err) {
    console.error('Neo4j route error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai', async (req, res) => {
  try {
    const vercelReq = createVercelReq(req);
    const vercelRes = createVercelRes(res);
    await aiHandler(vercelReq, vercelRes);
  } catch (err) {
    console.error('AI route error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ocr', async (req, res) => {
  try {
    const vercelReq = createVercelReq(req);
    const vercelRes = createVercelRes(res);
    await ocrHandler(vercelReq, vercelRes);
  } catch (err) {
    console.error('OCR route error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/voice', async (req, res) => {
  try {
    const vercelReq = createVercelReq(req);
    const vercelRes = createVercelRes(res);
    await voiceHandler(vercelReq, vercelRes);
  } catch (err) {
    console.error('Voice route error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/search', async (req, res) => {
  try {
    const vercelReq = createVercelReq(req);
    const vercelRes = createVercelRes(res);
    await searchHandler(vercelReq, vercelRes);
  } catch (err) {
    console.error('Search route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// OPTIONS handler for CORS
app.options('/api/*', (req, res) => {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(204).end();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Local API server running on http://localhost:${PORT}`);
  console.log(`📡 Neo4j proxy: http://localhost:${PORT}/api/neo4j`);
  console.log(`🤖 AI proxy: http://localhost:${PORT}/api/ai`);
  console.log(`📄 OCR proxy: http://localhost:${PORT}/api/ocr`);
  console.log(`🎤 Voice proxy: http://localhost:${PORT}/api/voice`);
  console.log(`🔎 Search proxy: http://localhost:${PORT}/api/search`);
});
