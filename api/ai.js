/**
 * Vercel serverless proxy for Sarvam AI chat completions.
 * Browser clients cannot call api.sarvam.ai directly (CORS). Profile keys or server env vars are used here.
 *
 * Server env (runtime, recommended on Vercel):
 *   SARVAM_API_KEY
 * Build-time fallbacks (also accepted):
 *   EXPO_PUBLIC_SARVAM_API_KEY
 */

const SARVAM_CHAT_URL = 'https://api.sarvam.ai/v1/chat/completions';
const DEFAULT_SARVAM_MODEL = 'sarvam-105b';

function trim(value) {
  const t = (value || '').trim();
  return t || '';
}

function resolveKeys(clientKey) {
  return {
    sarvamKey:
      trim(clientKey) ||
      trim(process.env.SARVAM_API_KEY) ||
      trim(process.env.EXPO_PUBLIC_SARVAM_API_KEY),
  };
}

function resolveChatConfig(sarvamKey, modelOverride) {
  if (sarvamKey) {
    const model = trim(modelOverride) || DEFAULT_SARVAM_MODEL;
    return { key: sarvamKey, url: SARVAM_CHAT_URL, model };
  }
  return null;
}

function upstreamHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'API-Subscription-Key': apiKey,
  };
}

async function handleChat(body, res) {
  const { sarvamKey } = resolveKeys(body.keys?.sarvam);
  const config = resolveChatConfig(sarvamKey, body.model);

  if (!config) {
    return res.status(401).json({
      error: 'API key not configured. Set SARVAM_API_KEY on Vercel or in environment.',
    });
  }

  const controller = new AbortController();
  // IMPORTANT: vercel.json caps this function at 60s (maxDuration). If we wait
  // longer than that internally, Vercel kills the function mid-response and the
  // client gets a raw broken connection instead of a clean error — which is what
  // was happening before. 
  // For local dev, we use 120 seconds to avoid timeouts while testing.
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const upstream = await fetch(config.url, {
      method: 'POST',
      headers: upstreamHeaders(config.key),
      body: JSON.stringify({
        model: config.model,
        messages: body.messages,
        max_tokens: body.max_tokens,
        temperature: body.temperature,
        reasoning_effort: body.reasoning_effort !== undefined ? body.reasoning_effort : null,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    return res.end(text);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Sarvam AI took too long to respond. Please try again.' });
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
    return handleChat(body, res);
  } catch (err) {
    console.error('AI proxy error:', err);
    return res.status(500).json({ error: err.message || 'AI proxy error' });
  }
};

