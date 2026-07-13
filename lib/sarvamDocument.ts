// Sarvam OCR/Vision client
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import pako from 'pako';
import { getSarvamKey, shouldUseAiProxy, getSarvamProxyPayload, getProxyBaseUrl } from './apiKeys';
import { getStoredLanguageCode } from './sarvam';

export type OcrProgressCallback = (status: string) => void;

async function postOcr(
  payload: Record<string, unknown>,
  timeoutMs = 20000,
  signal?: AbortSignal
): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
    if (signal.aborted) controller.abort();
  }

  try {
    const baseUrl = getProxyBaseUrl();
    const response = await fetch(`${baseUrl}/api/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const raw = await response.text();
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(response.ok ? 'Invalid OCR response' : 'OCR proxy unavailable. Deploy api/ocr.js on Vercel.');
    }
    if (!response.ok) {
      throw new Error(data.error || `OCR failed (${response.status})`);
    }
    return data;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OCR request timed out.');
    }
    throw error;
  }
}

/**
 * Drives the OCR job to completion by polling the proxy's short-lived 'status'
 * action from the client, instead of holding one serverless call open for the
 * whole job (which was silently getting killed by Vercel's function timeout
 * on longer/multi-page notes). Each individual request here is a few seconds.
 */
async function callOcrProxy(
  payload: Record<string, unknown>,
  onProgress?: OcrProgressCallback,
  signal?: AbortSignal
): Promise<{ text: string }> {
  const created = await postOcr({ ...payload, action: 'create' }, 20000, signal);
  const jobId = created.job_id;
  if (!jobId) throw new Error('OCR job could not be started');

  const MAX_POLLS = 90; // ~4.5 min ceiling, each poll ~3s apart
  for (let i = 0; i < MAX_POLLS; i++) {
    if (signal?.aborted) throw new Error('OCR cancelled.');
    await new Promise(r => setTimeout(r, 3000));
    onProgress?.(`Transcribing... (${Math.round((i + 1) * 3)}s)`);
    const status = await postOcr(
      { action: 'status', job_id: jobId, ...('sarvam_key' in payload ? { sarvam_key: (payload as any).sarvam_key } : {}) },
      20000,
      signal
    );
    if (status.done) {
      if (!status.text?.trim()) {
        throw new Error(status.warning || 'OCR returned empty text');
      }
      return { text: status.text };
    }
  }
  throw new Error('OCR timed out. Try fewer pages or clearer images.');
}

async function sarvamFetch(
  path: string,
  apiKey: string,
  init: RequestInit = {},
  signal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
    if (signal.aborted) controller.abort();
  }

  try {
    const response = await fetch(`https://api.sarvam.ai${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'api-subscription-key': apiKey,
        ...(init.headers as Record<string, string>),
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Minimal ZIP builder for JPG pages (Sarvam accepts ZIP of images). */
function buildImagesZip(images: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: { name: string; offset: number; size: number; crc: number }[] = [];
  let offset = 0;

  const crc32 = (data: Uint8Array): number => {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      c ^= data[i];
      for (let j = 0; j < 8; j++) {
        c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  };

  const push = (chunk: Uint8Array) => {
    parts.push(chunk);
    offset += chunk.length;
  };

  for (const img of images) {
    const nameBytes = new TextEncoder().encode(img.name);
    const crc = crc32(img.bytes);
    const local = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);   // version needed (2.0)
    view.setUint16(6, 0, true);   // flags
    view.setUint16(8, 0, true);   // compression: stored
    view.setUint16(10, 0, true);  // mod time
    view.setUint16(12, 0, true);  // mod date
    view.setUint32(14, crc, true);
    view.setUint32(18, img.bytes.length, true);
    view.setUint32(22, img.bytes.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);  // extra field length
    local.set(nameBytes, 30);
    const start = offset;
    push(local);
    push(img.bytes);
    central.push({ name: img.name, offset: start, size: img.bytes.length, crc });
  }

  const centralStart = offset;
  for (const entry of central) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const hdr = new Uint8Array(46 + nameBytes.length);
    const view = new DataView(hdr.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint32(16, entry.crc, true);
    view.setUint32(20, entry.size, true);
    view.setUint32(24, entry.size, true);
    view.setUint16(28, nameBytes.length, true);
    view.setUint32(42, entry.offset, true);
    hdr.set(nameBytes, 46);
    push(hdr);
  }

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, offset - centralStart, true);
  ev.setUint32(16, centralStart, true);
  push(end);

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:.*?;base64,/, '').replace(/\s/g, '');
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean.replace(/=+$/, '')) {
    const val = alphabet.indexOf(ch);
    if (val < 0) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof globalThis.btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return globalThis.btoa(binary);
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    result += alphabet[(triple >> 18) & 63];
    result += alphabet[(triple >> 12) & 63];
    result += i + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : '=';
    result += i + 2 < bytes.length ? alphabet[triple & 63] : '=';
  }
  return result;
}

function parseZipFile(bytes: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Find End of Central Directory record
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return files;

  const centralDirOffset = view.getUint32(eocdOffset + 16, true);
  const numEntries = view.getUint16(eocdOffset + 10, true);
  let cdPos = centralDirOffset;

  for (let i = 0; i < numEntries; i++) {
    if (view.getUint32(cdPos, true) !== 0x02014b50) break;
    const fileNameLen = view.getUint16(cdPos + 28, true);
    const extraLen = view.getUint16(cdPos + 30, true);
    const commentLen = view.getUint16(cdPos + 32, true);
    const localOffset = view.getUint32(cdPos + 42, true);
    const compSize = view.getUint32(cdPos + 20, true);
    const uncompSize = view.getUint32(cdPos + 24, true);
    const compMethod = view.getUint16(cdPos + 10, true);
    const fileName = new TextDecoder().decode(bytes.slice(cdPos + 46, cdPos + 46 + fileNameLen));

    // Read local file header to find where data starts
    const localHdr = new DataView(bytes.buffer, bytes.byteOffset + localOffset, 30);
    const localNameLen = localHdr.getUint16(26, true);
    const localExtraLen = localHdr.getUint16(28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const rawData = bytes.slice(dataStart, dataStart + compSize);

    // Method 0 = stored (no compression). Method 8 = DEFLATE — the default
    // for virtually every zip writer, including whatever generates Sarvam's
    // OCR result archive. Previously this only handled method 0 and silently
    // dropped every real-world (deflated) entry, so the OCR result always
    // came back empty on native — this is the actual "OCR not working" bug.
    if (compMethod === 0) {
      files.set(fileName, rawData.slice(0, uncompSize));
    } else if (compMethod === 8) {
      try {
        files.set(fileName, pako.inflateRaw(rawData));
      } catch (err) {
        console.warn(`Failed to inflate ${fileName}:`, err);
      }
    } else {
      console.warn(`Unsupported zip compression method ${compMethod} for ${fileName}, skipping`);
    }
    cdPos += 46 + fileNameLen + extraLen + commentLen;
  }
  return files;
}

async function extractTextFromZipBase64(zipB64: string): Promise<string> {
  const bytes = base64ToBytes(zipB64);
  const files = parseZipFile(bytes);

  // Collect text from all extracted files, preferring markdown
  const texts: string[] = [];
  const sortedNames = Array.from(files.keys()).sort();
  for (const name of sortedNames) {
    const content = new TextDecoder('utf-8', { fatal: false }).decode(files.get(name)!);
    if (content.trim()) texts.push(content.trim());
  }
  if (texts.length) return texts.join('\n\n');

  // Fallback: scan raw bytes for text if ZIP parsing returned nothing
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const chunks = raw.match(/[\x20-\x7E\u0900-\u097F\n\r\t]{40,}/g) || [];
  const clean = chunks.filter(c => /[a-zA-Z\u0900-\u097F]/.test(c)).join('\n\n');
  if (clean.trim()) return clean;
  throw new Error('OCR result contained no readable text');
}

async function digitizeDirect(
  imagesBase64: string[],
  language: string,
  onProgress?: OcrProgressCallback,
  signal?: AbortSignal
): Promise<string> {
  const apiKey = await getSarvamKey();
  if (!apiKey) throw new Error('Sarvam API key not configured');

  onProgress?.('Creating OCR job...');
  const createRes = await sarvamFetch('/doc-digitization/job/v1', apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job_parameters: { language, output_format: 'md' },
    }),
  }, signal);
  const createData = await createRes.json();
  if (!createRes.ok) {
    throw new Error(createData?.error?.message || 'Failed to create OCR job');
  }
  const jobId = createData.job_id as string;

  const zipBytes = buildImagesZip(
    imagesBase64.map((b64, i) => ({
      name: `page_${i + 1}.jpg`,
      bytes: base64ToBytes(b64),
    }))
  );

  onProgress?.('Uploading document...');
  const uploadMeta = await sarvamFetch('/doc-digitization/job/v1/upload-files', apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId, files: ['notes.zip'] }),
  });
  const uploadData = await uploadMeta.json();
  if (!uploadMeta.ok) {
    throw new Error(uploadData?.error?.message || 'Failed to get upload URL');
  }
  const uploadUrl = uploadData.upload_urls?.['notes.zip']?.file_url;
  if (!uploadUrl) throw new Error('Missing upload URL from Sarvam');

  if (Platform.OS === 'web') {
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/zip', 
        'x-ms-blob-type': 'BlockBlob' 
      },
      body: zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength) as ArrayBuffer,
    });
    if (!putRes.ok) {
      const text = await putRes.text();
      throw new Error(`Upload failed (${putRes.status}): ${text}`);
    }
  } else {
    // Native (Expo Go + dev/prod builds): fetch's PUT with a raw ArrayBuffer body is
    // unreliable over the RN JS bridge — the body can arrive truncated/mangled, which
    // S3-style presigned PUTs reject with 400 (content-length/signature mismatch).
    // Writing to a temp file and using FileSystem.uploadAsync routes the bytes through
    // the native upload task instead, which handles binary bodies correctly.
    const tempUri = FileSystem.cacheDirectory + `ocr_upload_${Date.now()}.zip`;
    try {
      await FileSystem.writeAsStringAsync(tempUri, bytesToBase64(zipBytes), {
        encoding: FileSystem.EncodingType.Base64,
      });
      const uploadResult = await FileSystem.uploadAsync(uploadUrl, tempUri, {
        httpMethod: 'PUT',
        headers: { 
          'Content-Type': 'application/zip', 
          'x-ms-blob-type': 'BlockBlob' 
        },
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      });
      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(`Upload failed (${uploadResult.status})`);
      }
    } finally {
      await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    }
  }

  onProgress?.('Processing handwriting...');
  await sarvamFetch(`/doc-digitization/job/v1/${jobId}/start`, apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  let state = 'Running';
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000));
    onProgress?.(`Transcribing... (${i + 1}s)`);
    const statusRes = await sarvamFetch(`/doc-digitization/job/v1/${jobId}/status`, apiKey);
    const statusData = await statusRes.json();
    state = statusData.job_state;
    if (state === 'Completed' || state === 'PartiallyCompleted') break;
    if (state === 'Failed') {
      throw new Error(statusData.error_message || 'OCR job failed');
    }
  }
  if (state !== 'Completed' && state !== 'PartiallyCompleted') {
    throw new Error('OCR timed out — please try again with fewer pages');
  }

  onProgress?.('Downloading transcription...');
  const dlRes = await sarvamFetch(`/doc-digitization/job/v1/${jobId}/download-files`, apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const dlData = await dlRes.json();
  
  // Try all possible paths to get the download URL
  let dlUrl = dlData.download_urls?.output?.file_url;
  if (!dlUrl) dlUrl = dlData.download_url;
  if (!dlUrl) dlUrl = dlData.download_urls?.notes?.file_url;
  if (!dlUrl) dlUrl = dlData.download_urls?.['notes.zip']?.file_url;
  if (!dlUrl) {
    const firstKey = Object.keys(dlData.download_urls || {})[0];
    if (firstKey) dlUrl = dlData.download_urls[firstKey]?.file_url;
  }
  if (!dlUrl) throw new Error(`Missing download URL from Sarvam. Data: ${JSON.stringify(dlData)}`);

  const zipRes = await fetch(dlUrl);
  const zipBuf = new Uint8Array(await zipRes.arrayBuffer());
  return extractTextFromZipBase64(bytesToBase64(zipBuf));
}

/** Transcribe one or more note images using Sarvam Document Intelligence. */
export async function transcribeNoteImages(
  imagesBase64: string[],
  onProgress?: OcrProgressCallback,
  signal?: AbortSignal
): Promise<string> {
  if (!imagesBase64.length) throw new Error('No images to transcribe');

  const lang = await getStoredLanguageCode();

  if (shouldUseAiProxy()) {
    onProgress?.('Sending to Sarvam OCR...');
    const keyPayload = await getSarvamProxyPayload();
    const { text } = await callOcrProxy(
      {
        ...keyPayload,
        images_base64: imagesBase64,
        language: lang,
      },
      onProgress,
      signal
    );
    return text;
  }

  return digitizeDirect(imagesBase64, lang, onProgress, signal);
}

/** Verify Sarvam OCR credentials (and proxy route on web production). */
export async function testOcrConnection(): Promise<{ ok: boolean; message: string }> {
  const key = await getSarvamKey();
  if (!key && !shouldUseAiProxy()) {
    return { ok: false, message: 'Sarvam API key not configured for OCR' };
  }

  if (shouldUseAiProxy()) {
    try {
      const keyPayload = await getSarvamProxyPayload();
      const baseUrl = getProxyBaseUrl();
      const response = await fetch(`${baseUrl}/api/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...keyPayload, action: 'create', images_base64: [] }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 400 && data.error?.includes('No images')) {
        return { ok: true, message: 'Sarvam OCR proxy reachable' };
      }
      if (response.status === 401) {
        return { ok: false, message: data.error || 'OCR proxy: API key not configured' };
      }
      if (response.ok) {
        return { ok: true, message: 'Sarvam OCR proxy connected' };
      }
      return { ok: false, message: data.error || `OCR proxy error (${response.status})` };
    } catch (error: unknown) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'OCR proxy unreachable',
      };
    }
  }

  return { ok: true, message: 'Sarvam OCR key configured' };
}
