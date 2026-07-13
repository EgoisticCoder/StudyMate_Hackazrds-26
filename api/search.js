/**
 * Vercel serverless proxy for the keyless DuckDuckGo Instant Answer API.
 * Browsers block direct calls to api.duckduckgo.com from web clients via CORS,
 * so this proxy performs the request server-side and forwards the raw JSON back.
 *
 * This only backs the no-API-key fallback path in lib/webSearch.ts — the primary
 * Tavily path already accepts CORS from the browser and is untouched.
 */

const DUCKDUCKGO_URL = 'https://api.duckduckgo.com/';

async function handleSearch(body, res) {
  const query = (body.query || '').toString().trim().slice(0, 400);

  if (!query) {
    return res.status(400).json({ error: 'Missing query' });
  }

  const url = `${DUCKDUCKGO_URL}?q=${encodeURIComponent(query)}&format=json&no_html=1&t=studymate`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const upstream = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    return res.end(text);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'DuckDuckGo search took too long to respond.' });
    }
    throw err;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body =
      typeof req.body === 'string' && req.body
        ? JSON.parse(req.body)
        : req.body || {};
    return handleSearch(body, res);
  } catch (err) {
    console.error('Search proxy error:', err);
    return res.status(500).json({ error: err.message || 'Search proxy error' });
  }
};
