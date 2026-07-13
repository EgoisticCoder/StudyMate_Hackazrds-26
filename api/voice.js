/**
 * Vercel serverless proxy for Sarvam AI Voice APIs (STT + TTS).
 * Handles speech-to-text (Saaras v3) and text-to-speech (Bulbul v3).
 *
 * Environment variables:
 *   SARVAM_API_KEY  (runtime, Vercel)
 *   EXPO_PUBLIC_SARVAM_API_KEY  (build-time fallback)
 */

const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text';
const SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech';

// In-memory rate limiter: { ip -> { count, resetTime } }
const rateLimits = new Map();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function getRateLimitKey(req) {
  const headers = req.headers || {};
  return headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown';
}

function checkRateLimit(req) {
  const key = getRateLimitKey(req);
  const now = Date.now();
  const entry = rateLimits.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimits.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

function getSarvamApiKey(clientKey) {
  return (clientKey || '').trim() ||
    (process.env.SARVAM_API_KEY || '').trim() ||
    (process.env.EXPO_PUBLIC_SARVAM_API_KEY || '').trim();
}

async function fetchWithTimeout(url, options, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url, options, retries = 1, timeoutMs = 30000) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetchWithTimeout(url, options, timeoutMs);
      if (resp.ok || i === retries) return resp;
      lastError = new Error(`API responded with ${resp.status}`);
    } catch (err) {
      lastError = err;
      if (i < retries) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }
  throw lastError;
}

/**
 * STT: Accepts { audio_base64, language_code? }
 * Calls Sarvam Saaras v3 STT API
 * Returns { text, language_code }
 */
async function handleSTT(body, apiKey, res) {
  console.log('handleSTT called, body keys:', Object.keys(body));
  const audioBase64 = body.audio_base64;
  console.log('audio_base64 length:', audioBase64 ? audioBase64.length : 0);
  if (!audioBase64) {
    return res.status(400).json({ error: 'Missing audio_base64 field' });
  }

  // Convert base64 to a buffer, then build FormData
  const audioBuffer = Buffer.from(audioBase64, 'base64');

  // Sarvam STT expects multipart/form-data with 'file' field
  const boundary = '----SarvamBoundary' + Date.now();
  const fileName = body.file_name || 'recording.wav';

  // Build multipart body manually (Node.js serverless env)
  const parts = [];

  // File field
  parts.push(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: audio/wav\r\n\r\n`
  );
  parts.push(audioBuffer);
  parts.push('\r\n');

  // Model field
  parts.push(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\n` +
    `saaras:v3\r\n`
  );

  // Mode field
  parts.push(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="mode"\r\n\r\n` +
    `transcribe\r\n`
  );

  // Language code (optional)
  if (body.language_code) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="language_code"\r\n\r\n` +
      `${body.language_code}\r\n`
    );
  }

  parts.push(`--${boundary}--\r\n`);

  // Combine into a single buffer
  const bodyParts = parts.map(p => typeof p === 'string' ? Buffer.from(p) : p);
  const fullBody = Buffer.concat(bodyParts);

  const response = await fetchWithRetry(SARVAM_STT_URL, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: fullBody,
  }, 0, 50000);

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return res.status(response.status).json({
      error: `STT API error: ${text.slice(0, 200)}`,
    });
  }

  if (!response.ok) {
    return res.status(response.status).json({
      error: data.error || data.message || `STT failed (${response.status})`,
    });
  }

  return res.status(200).json({
    text: data.transcript || data.text || '',
    language_code: data.language_code || body.language_code || 'en-IN',
  });
}

/**
 * TTS: Accepts { text, language_code, speaker? }
 * Calls Sarvam Bulbul v3 TTS API
 * Returns { audio_base64 }
 */
async function handleTTS(body, apiKey, res) {
  const text = body.text;
  if (!text) {
    return res.status(400).json({ error: 'Missing text field' });
  }

  // Language code mapping
  const langCode = body.language_code || 'en-IN';
  const speaker = body.speaker || (langCode.startsWith('hi') ? 'shubh' : 'aditya');

  const response = await fetchWithRetry(SARVAM_TTS_URL, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text.slice(0, 2400), // Bulbul v3 supports up to 2500 chars
      target_language_code: langCode,
      speaker,
      model: 'bulbul:v3',
      output_audio_codec: 'wav',
      speech_sample_rate: 22050,
    }),
  });

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    return res.status(response.status).json({
      error: `TTS API error: ${responseText.slice(0, 200)}`,
    });
  }

  if (!response.ok) {
    return res.status(response.status).json({
      error: data.error || data.message || `TTS failed (${response.status})`,
    });
  }

  return res.status(200).json({
    audio_base64: data.audios?.[0] || data.audio_base64 || data.audio || '',
  });
}

/**
 * Translate: Accepts { text, source_language, target_language }
 * Returns { translated_text }
 */
async function handleTranslate(body, apiKey, res) {
  const { text, source_language, target_language } = body;
  if (!text || !target_language) {
    return res.status(400).json({ error: 'Missing text or target_language' });
  }

  const response = await fetchWithRetry('https://api.sarvam.ai/translate', {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text.slice(0, 5000),
      source_language_code: source_language || 'en-IN',
      target_language_code: target_language,
      model: 'mayura:v1',
    }),
  });

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    return res.status(response.status).json({
      error: `Translate API error: ${responseText.slice(0, 200)}`,
    });
  }

  if (!response.ok) {
    return res.status(response.status).json({
      error: data.error || data.message || `Translation failed (${response.status})`,
    });
  }

  return res.status(200).json({
    translated_text: data.translated_text || '',
  });
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit
  if (!checkRateLimit(req)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
  }

  try {
    const body =
      typeof req.body === 'string' && req.body
        ? JSON.parse(req.body)
        : req.body || {};

    const apiKey = getSarvamApiKey(body.sarvam_key);
    if (!apiKey) {
      return res.status(401).json({
        error: 'Sarvam API key not configured. Set SARVAM_API_KEY on Vercel or add key in Settings.',
      });
    }

    const action = body.action;

    switch (action) {
      case 'stt':
        return await handleSTT(body, apiKey, res);
      case 'tts':
        return await handleTTS(body, apiKey, res);
      case 'translate':
        return await handleTranslate(body, apiKey, res);
      default:
        return res.status(400).json({ error: `Unknown action: ${action}. Use stt, tts, or translate.` });
    }
  } catch (err) {
    console.error('Voice API error:', err);
    const message = err.name === 'AbortError'
      ? 'Request timed out — Sarvam API is slow or unreachable.'
      : err.message || 'Voice API error';
    return res.status(500).json({ error: message });
  }
};
