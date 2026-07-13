/**
 * Vercel serverless proxy for Sarvam Document Intelligence (OCR).
 * Accepts { images_base64: string[], language?: string, sarvam_key?: string }
 * Returns { text: string }
 */

const zlib = require('zlib');

const SARVAM_BASE = 'https://api.sarvam.ai';

function getApiKey(body) {
  return (body.sarvam_key || '').trim() ||
    (process.env.SARVAM_API_KEY || '').trim() ||
    (process.env.EXPO_PUBLIC_SARVAM_API_KEY || '').trim();
}

function buildImagesZip(images) {
  const parts = [];
  const central = [];
  let offset = 0;

  const crc32 = (data) => {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      c ^= data[i];
      for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (c ^ 0xffffffff) >>> 0;
  };

  const push = (chunk) => {
    parts.push(chunk);
    offset += chunk.length;
  };

  for (let i = 0; i < images.length; i++) {
    const raw = Buffer.from(images[i], 'base64');
    const name = 'page_' + (i + 1) + '.jpg';
    const nameBuf = Buffer.from(name);
    const crc = crc32(raw);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);   // version needed
    local.writeUInt16LE(0, 6);    // flags
    local.writeUInt16LE(0, 8);    // compression: stored
    local.writeUInt16LE(0, 10);   // mod time
    local.writeUInt16LE(0, 12);   // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(raw.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);   // extra field length
    nameBuf.copy(local, 30);
    const start = offset;
    push(local);
    push(raw);
    central.push({ name, offset: start, size: raw.length, crc });
  }

  const centralStart = offset;
  for (const entry of central) {
    const nameBuf = Buffer.from(entry.name);
    const hdr = Buffer.alloc(46 + nameBuf.length);
    hdr.writeUInt32LE(0x02014b50, 0);
    hdr.writeUInt16LE(20, 4);    // version made by
    hdr.writeUInt16LE(20, 6);    // version needed
    hdr.writeUInt16LE(0, 8);     // flags
    hdr.writeUInt16LE(0, 10);    // compression: stored
    hdr.writeUInt16LE(0, 12);    // mod time
    hdr.writeUInt16LE(0, 14);    // mod date
    hdr.writeUInt32LE(entry.crc, 16);
    hdr.writeUInt32LE(entry.size, 20);
    hdr.writeUInt32LE(entry.size, 24);
    hdr.writeUInt16LE(nameBuf.length, 28);
    hdr.writeUInt16LE(0, 30);    // extra field length
    hdr.writeUInt16LE(0, 32);    // file comment length
    hdr.writeUInt16LE(0, 34);    // disk number start
    hdr.writeUInt16LE(0, 36);    // internal file attrs
    hdr.writeUInt32LE(0, 38);    // external file attrs
    hdr.writeUInt32LE(entry.offset, 42);
    nameBuf.copy(hdr, 46);
    push(hdr);
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);       // disk number
  end.writeUInt16LE(0, 6);       // disk with central dir
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(offset - centralStart, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);      // comment length
  push(end);

  return Buffer.concat(parts);
}

function parseZipBuffer(buf) {
  const files = new Map();
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return files;
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);
  const numEntries = buf.readUInt16LE(eocdOffset + 10);
  let cdPos = centralDirOffset;
  for (let i = 0; i < numEntries; i++) {
    if (buf.readUInt32LE(cdPos) !== 0x02014b50) break;
    const fileNameLen = buf.readUInt16LE(cdPos + 28);
    const extraLen = buf.readUInt16LE(cdPos + 30);
    const commentLen = buf.readUInt16LE(cdPos + 32);
    const localOffset = buf.readUInt32LE(cdPos + 42);
    const compSize = buf.readUInt32LE(cdPos + 20);
    const uncompSize = buf.readUInt32LE(cdPos + 24);
    const compMethod = buf.readUInt16LE(cdPos + 10);
    const fileName = buf.toString('utf8', cdPos + 46, cdPos + 46 + fileNameLen);
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const rawData = buf.subarray(dataStart, dataStart + compSize);
    if (compMethod === 0) {
      files.set(fileName, rawData.subarray(0, uncompSize));
    } else if (compMethod === 8) {
      try {
        files.set(fileName, zlib.inflateRawSync(rawData));
      } catch (err) {
        console.warn('Failed to inflate ' + fileName + ':', err.message);
      }
    } else {
      console.warn('Unsupported zip compression method ' + compMethod + ' for ' + fileName + ', skipping');
    }
    cdPos += 46 + fileNameLen + extraLen + commentLen;
  }
  return files;
}

function extractTextFromZipBuffer(buf) {
  const files = parseZipBuffer(buf);
  const texts = [];
  const sortedNames = Array.from(files.keys()).sort();
  for (const name of sortedNames) {
    const content = files.get(name).toString('utf8');
    if (content.trim()) texts.push(content.trim());
  }
  if (texts.length) return texts.join('\n\n');
  const raw = buf.toString('utf8');
  const chunks = raw.match(/[\x20-\x7E\u0900-\u097F\n\r\t]{40,}/g) || [];
  const clean = chunks.filter(c => /[a-zA-Z\u0900-\u097F]/.test(c)).join('\n\n');
  if (clean.trim()) return clean;
  throw new Error('OCR result contained no readable text');
}

async function sarvamFetch(path, apiKey, init = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  try {
    return await fetch(SARVAM_BASE + path, {
      ...init,
      signal: controller.signal,
      headers: {
        'api-subscription-key': apiKey,
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function fetchWithTimeout(url, options, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function createOcrJob(apiKey, imagesBase64, language) {
  const createRes = await sarvamFetch('/doc-digitization/job/v1', apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_parameters: { language: language || 'en-IN', output_format: 'md' } }),
  });
  const createData = await createRes.json();
  if (!createRes.ok) throw new Error(createData?.error?.message || 'Create OCR job failed');
  const jobId = createData.job_id;

  const zip = buildImagesZip(imagesBase64);
  const uploadRes = await sarvamFetch('/doc-digitization/job/v1/upload-files', apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId, files: ['notes.zip'] }),
  });
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok) throw new Error(uploadData?.error?.message || 'Upload URL failed');
  const uploadUrl = uploadData.upload_urls?.['notes.zip']?.file_url;
  if (!uploadUrl) throw new Error('Missing upload URL');

  const putRes = await fetchWithTimeout(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/zip',
      'x-ms-blob-type': 'BlockBlob'
    },
    body: zip
  });

  if (!putRes.ok) {
    const errorText = await putRes.text();
    throw new Error('Upload failed (' + putRes.status + '): ' + errorText);
  }

  await sarvamFetch('/doc-digitization/job/v1/' + jobId + '/start', apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  return jobId;
}

async function checkOcrStatus(apiKey, jobId) {
  const statusRes = await sarvamFetch('/doc-digitization/job/v1/' + jobId + '/status', apiKey);
  const statusData = await statusRes.json();
  console.log('OCR status data:', statusData);
  const state = statusData.job_state;

  if (state === 'Failed') {
    throw new Error(statusData.error_message || 'OCR job failed');
  }
  if (state !== 'Completed' && state !== 'PartiallyCompleted') {
    return { done: false, state: state || 'Running' };
  }

  const dlRes = await sarvamFetch('/doc-digitization/job/v1/' + jobId + '/download-files', apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const dlData = await dlRes.json();
  console.log('Download files data:', dlData);

  let dlUrl = null;
  if (dlData.download_urls && dlData.download_urls.output && dlData.download_urls.output.file_url) {
    dlUrl = dlData.download_urls.output.file_url;
  } else if (dlData.download_url) {
    dlUrl = dlData.download_url;
  } else if (dlData.download_urls && dlData.download_urls.notes && dlData.download_urls.notes.file_url) {
    dlUrl = dlData.download_urls.notes.file_url;
  } else if (dlData.download_urls && dlData.download_urls['notes.zip'] && dlData.download_urls['notes.zip'].file_url) {
    dlUrl = dlData.download_urls['notes.zip'].file_url;
  } else if (dlData.download_urls) {
    const keys = Object.keys(dlData.download_urls);
    if (keys.length > 0 && dlData.download_urls[keys[0]] && dlData.download_urls[keys[0]].file_url) {
      dlUrl = dlData.download_urls[keys[0]].file_url;
    }
  }
  if (!dlUrl) {
    throw new Error('Missing download URL');
  }

  const zipRes = await fetchWithTimeout(dlUrl);
  const zipBuf = Buffer.from(await zipRes.arrayBuffer());
  const text = extractTextFromZipBuffer(zipBuf);
  return { done: true, text };
}

function validateImages(images) {
  if (!Array.isArray(images) || !images.length) {
    throw Object.assign(new Error('No images provided for OCR'), { status: 400 });
  }
  if (images.length > 10) {
    throw Object.assign(new Error('Maximum 10 pages per OCR request'), { status: 400 });
  }
  for (let i = 0; i < images.length; i++) {
    const sizeBytes = Math.ceil((images[i].length * 3) / 4);
    const sizeMB = sizeBytes / (1024 * 1024);
    if (sizeBytes === 0) throw Object.assign(new Error('Image ' + (i + 1) + ' is empty'), { status: 400 });
    if (sizeMB > 20) throw Object.assign(new Error('Image ' + (i + 1) + ' is ' + sizeMB.toFixed(1) + 'MB — must be under 20MB'), { status: 400 });
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const apiKey = getApiKey(body);
    if (!apiKey) return res.status(401).json({ error: 'Sarvam API key not configured for OCR. Add SARVAM_API_KEY in Settings.' });

    const action = body.action || 'create';

    if (action === 'status') {
      if (!body.job_id) return res.status(400).json({ error: 'Missing job_id' });
      const result = await checkOcrStatus(apiKey, body.job_id);
      if (result.done && (!result.text || !result.text.trim())) {
        return res.status(200).json({ done: true, text: '', warning: 'OCR returned no text. Try clearer images.' });
      }
      return res.status(200).json(result);
    }

    const images = body.images_base64;
    validateImages(images);
    const jobId = await createOcrJob(apiKey, images, body.language);
    return res.status(200).json({ job_id: jobId });
  } catch (err) {
    console.error('OCR proxy error:', err);
    if (err.status) return res.status(err.status).json({ error: err.message });
    const message = err.message || 'OCR failed';
    if (message.includes('timed out')) {
      return res.status(504).json({ error: 'OCR timed out. Try fewer pages or clearer images.' });
    }
    if (message.includes('403') || message.includes('unauthorized') || message.includes('key')) {
      return res.status(403).json({ error: 'OCR failed: Invalid API key or insufficient permissions.' });
    }
    return res.status(500).json({ error: 'OCR failed: ' + message });
  }
};
