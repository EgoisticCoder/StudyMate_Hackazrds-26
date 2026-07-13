// Sarvam AI Client - Models: sarvam-105b (128K), sarvam-30b (64K)
import { Platform } from 'react-native';
import { loadApiKeys, shouldUseAiProxy, getSarvamKey, getProxyBaseUrl } from './apiKeys';
import { transcribeNoteImages } from './sarvamDocument';

const SARVAM_API_URL = 'https://api.sarvam.ai/v1/chat/completions';
const DEFAULT_MODEL = 'sarvam-105b';
export const TOKEN_LIMITS = {
  doubt_solver: 4096,
  vision_question: 2048,
  answer_grader: 2048,
  quiz_generator: 4096,
  notes_generator: 4096,
  ai_nudge: 1024,
  concept_explainer: 2048,
  baseline_analysis: 2048,
  diagnostic_generator: 4096,
  schedule_planner: 4096,
  report_generation: 2048,
  mood_quote: 1024,
  voice_mode: 2048,
  slot_extractor: 4096,
  wellness_insight: 1024,
  focus_check: 256,
} as const;

export const TEMPERATURES = {
  quiz: 0.2,
  grading: 0.2,
  notes: 0.2,
  doubt_solver: 0.4,
  nudge: 0.7,
  motivation: 0.7,
} as const;

export type SarvamUseCase = keyof typeof TOKEN_LIMITS;
export type ApiConfig = { key: string; url: string; model: string };

export async function hasAiApiKey(): Promise<boolean> {
  return !!(await getSarvamKey());
}

/**
 * Caps notes text fed into a single-shot generation prompt (mindmaps, flashcards).
 * Longer input = longer generation time = higher risk of tripping the Vercel
 * function timeout. These features only need representative content, not the
 * full verbatim document, so trimming keeps requests fast and reliable.
 */
export function truncateForPrompt(text: string, maxChars = 6000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n\n[...notes truncated for length...]';
}

/**
 * Wraps callSarvam with one automatic retry. LLM calls occasionally fail from
 * transient slowness or load — a single retry smooths that over silently
 * instead of immediately surfacing an error dialog to the user.
 */
export async function callSarvamWithRetry(
  messages: SarvamMessage[],
  useCase: SarvamUseCase,
  temperature?: number
): Promise<string> {
  try {
    return await callSarvam(messages, useCase, temperature);
  } catch (firstError) {
    await new Promise(r => setTimeout(r, 1200));
    try {
      return await callSarvam(messages, useCase, temperature);
    } catch {
      throw firstError; // surface the original error, it's usually more informative
    }
  }
}

async function getApiConfig(): Promise<ApiConfig> {
  const { sarvamKey, customModel } = await loadApiKeys();
  if (sarvamKey) {
    return {
      key: sarvamKey,
      url: SARVAM_API_URL,
      model: customModel || DEFAULT_MODEL,
    };
  }
  throw new Error('Sarvam API key not configured. Add EXPO_PUBLIC_SARVAM_API_KEY in your env.');
}

export interface SarvamMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export interface SarvamResponse {
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
}

type ProxyChatPayload = {
  action: 'chat';
  messages: SarvamMessage[];
  max_tokens: number;
  temperature: number;
  keys: { sarvam?: string };
  model?: string;
  reasoning_effort?: string | null;
};

async function callViaProxy(payload: ProxyChatPayload, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  // Server (api/ai.js) self-aborts at 50s and Vercel hard-kills the function at
  // 60s regardless. 58s here is just a safety net in case the server's own
  // error response is slow to arrive — it should almost never actually fire.
  const timeoutId = setTimeout(() => controller.abort(), 58000);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
    if (signal.aborted) controller.abort();
  }

  try {
    const baseUrl = getProxyBaseUrl();
    const response = await fetch(`${baseUrl}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const raw = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        response.ok
          ? 'Invalid AI response format'
          : 'AI proxy unavailable. Redeploy on Vercel with api/ai.js and set SARVAM_API_KEY.'
      );
    }

    if (!response.ok) {
      const errBody = data as { error?: string | { message?: string } };
      const errMsg =
        typeof errBody.error === 'string'
          ? errBody.error
          : errBody.error?.message || `API error ${response.status}`;
      throw new Error(errMsg);
    }

    const result = data as SarvamResponse;
    const content = result.choices?.[0]?.message?.content;

    if (content === undefined || content === null) {
      const finishReason = result.choices?.[0]?.finish_reason;
      if (finishReason === 'length') {
        throw new Error('Response was truncated due to token limit. Please try a simpler query.');
      }
      throw new Error('AI returned an empty response. Try again.');
    }

    return content;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. Sarvam AI may be experiencing high load — tap to retry.');
    }
    throw error;
  }
}

async function callDirect(
  config: ApiConfig,
  messages: SarvamMessage[],
  maxTokens: number,
  temp: number,
  signal?: AbortSignal
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
    if (signal.aborted) controller.abort();
  }

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'API-Subscription-Key': config.key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: maxTokens,
        temperature: temp,
        reasoning_effort: null,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Sarvam AI error (${response.status}):`, errorBody);
      if (response.status === 403) {
        throw new Error('Invalid or expired Sarvam API key. Update it in Profile → Settings.');
      }
      if (response.status === 429) {
        throw new Error('Rate limited by Sarvam AI. Wait a moment and try again.');
      }
      if (response.status === 422) {
        let detail = '';
        try { detail = JSON.parse(errorBody).error?.message || errorBody; } catch { detail = errorBody; }
        throw new Error(`Invalid request: ${detail}`);
      }
      throw new Error(`Sarvam API error (${response.status})`);
    }

    const data: SarvamResponse = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (content === undefined || content === null) {
      const finishReason = data.choices?.[0]?.finish_reason;
      if (finishReason === 'length') {
        throw new Error('Response truncated by token limit. Try a more specific question.');
      }
      throw new Error('AI returned empty content. Check your API key and try again.');
    }

    return content;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. Sarvam AI may be experiencing high load — tap to retry.');
    }
    throw error;
  }
}

export async function testAiConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    await callSarvam(
      [{ role: 'user', content: 'Reply with exactly the word OK and nothing else.' }],
      'focus_check',
      0.1
    );
    return { ok: true, message: 'Sarvam AI connected successfully' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    return { ok: false, message };
  }
}

export type SarvamStackTestResult = {
  chat: { ok: boolean; message: string };
  voice: { ok: boolean; message: string };
  ocr: { ok: boolean; message: string };
};

/** Verify Sarvam chat, voice (TTS), and OCR key/proxy readiness. */
export async function testSarvamStack(): Promise<SarvamStackTestResult> {
  const chat = await testAiConnection();

  let voice: { ok: boolean; message: string } = { ok: false, message: 'Voice test skipped' };
  try {
    const { testVoiceConnection } = await import('./sarvam');
    voice = await testVoiceConnection();
  } catch (error: unknown) {
    voice = {
      ok: false,
      message: error instanceof Error ? error.message : 'Voice test failed',
    };
  }

  let ocr: { ok: boolean; message: string } = { ok: false, message: 'OCR test skipped' };
  try {
    const { testOcrConnection } = await import('./sarvamDocument');
    ocr = await testOcrConnection();
  } catch (error: unknown) {
    ocr = {
      ok: false,
      message: error instanceof Error ? error.message : 'OCR test failed',
    };
  }

  return { chat, voice, ocr };
}

export async function callSarvam(
  messages: SarvamMessage[],
  useCase: SarvamUseCase,
  temperature?: number,
  configOverride?: ApiConfig,
  signal?: AbortSignal
): Promise<string> {
  const config = configOverride ?? (await getApiConfig());
  const maxTokens = TOKEN_LIMITS[useCase];
  const temp = temperature ?? getTemperatureForUseCase(useCase);
  const useProxy = shouldUseAiProxy();

  let lang = 'English';
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined') {
        lang = localStorage.getItem('app_language') || 'English';
      }
    } catch (e) {
      console.warn('Failed to read app_language from localStorage:', e);
    }
  } else {
    try {
      const SecureStore = require('expo-secure-store');
      lang = (await SecureStore.getItemAsync('app_language')) || 'English';
    } catch {
      // ignore
    }
  }

  const modifiedMessages = [...messages];
  if (lang !== 'English') {
    const sysIdx = modifiedMessages.findIndex(m => m.role === 'system');
    const langInstruction = `\n\nCRITICAL INSTRUCTION: You MUST communicate entirely in ${lang}. All explanations, questions, and responses MUST be in ${lang}.`;
    if (sysIdx >= 0) {
      if (typeof modifiedMessages[sysIdx].content === 'string') {
        modifiedMessages[sysIdx] = {
          ...modifiedMessages[sysIdx],
          content: modifiedMessages[sysIdx].content + langInstruction,
        };
      }
    } else {
      modifiedMessages.unshift({ role: 'system', content: langInstruction });
    }
  }

  let lastError = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const content = useProxy
        ? await callViaProxy({
            action: 'chat',
            messages: modifiedMessages,
            max_tokens: maxTokens,
            temperature: temp,
            keys: { sarvam: config.key },
            model: config.model,
            reasoning_effort: null,
          }, signal)
        : await callDirect(config, modifiedMessages, maxTokens, temp, signal);

      return content;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      lastError = errMsg;
      if (errMsg.includes('Invalid') || errMsg.includes('expired') || errMsg.includes('403')) {
        throw error;
      }
      if (attempt === 0 && (errMsg.includes('timed out') || errMsg.includes('Rate limited'))) {
        await new Promise(r => setTimeout(r, 2000));
      } else if (attempt === 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  throw new Error(lastError || 'Request failed after 2 attempts.');
}

/**
 * Vision/OCR via Sarvam Document Intelligence, then optional text reasoning.
 */
export async function callSarvamVision(
  systemPrompt: string,
  imageBase64: string,
  textPrompt: string,
  useCase: SarvamUseCase,
  signal?: AbortSignal
): Promise<string> {
  if (useCase === 'focus_check') {
    return 'FOCUSED';
  }

  const extracted = await transcribeNoteImages([imageBase64], undefined, signal);

  if (useCase === 'notes_generator' && !textPrompt.includes('grade') && !textPrompt.includes('JSON')) {
    return extracted;
  }

  const combinedPrompt = `${textPrompt}

Extracted text from the image:
"""
${extracted}
"""`;

  return callSarvam(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: combinedPrompt },
    ],
    useCase,
    undefined,
    undefined,
    signal
  );
}

function extractBalancedJSON(str: string): string | null {
  const firstArray = str.indexOf('[');
  const firstObject = str.indexOf('{');
  
  if (firstArray === -1 && firstObject === -1) return null;
  
  let startIdx = -1;
  let startChar = '';
  let endChar = '';
  
  if (firstArray !== -1 && (firstObject === -1 || firstArray < firstObject)) {
    startIdx = firstArray;
    startChar = '[';
    endChar = ']';
  } else {
    startIdx = firstObject;
    startChar = '{';
    endChar = '}';
  }
  
  let balance = 0;
  let inQuote = false;
  
  for (let i = startIdx; i < str.length; i++) {
    const char = str[i];
    
    if (char === '"' && (i === 0 || str[i - 1] !== '\\')) {
      inQuote = !inQuote;
      continue;
    }
    
    if (!inQuote) {
      if (char === startChar || (startChar === '{' && char === '[') || (startChar === '[' && char === '{')) {
        balance++;
      } else if (char === endChar || (endChar === '}' && char === ']') || (endChar === ']' && char === '}')) {
        balance--;
        if (balance === 0) {
          return str.substring(startIdx, i + 1);
        }
      }
    }
  }
  
  return null;
}

function cleanAndRepairJSON(str: string): string {
  let cleaned = str.trim();

  // 1. Strip markdown code fences if present
  cleaned = cleaned.replace(/```(?:json)?([\s\S]*?)```/gi, '$1');

  // 2. Remove comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  cleaned = cleaned.replace(/(?:^|[^:])\/\/.*$/gm, '');

  // 3. Fix smart quotes
  cleaned = cleaned.replace(/[“”]/g, '"');
  cleaned = cleaned.replace(/[‘’]/g, "'");

  // 4. Escape unescaped double quotes inside property values
  cleaned = cleaned.replace(/:\s*"([\s\S]*?)"\s*(?=,|\s*[}\]])/g, (match, p1) => {
    const escapedVal = p1.replace(/(?<!\\)"/g, '\\"');
    return `: "${escapedVal}"`;
  });

  // 5. Escape unescaped double quotes inside array elements
  cleaned = cleaned.replace(/([,\[]\s*)"([\s\S]*?)"\s*(?=,|\s*[\]])/g, (match, p1, p2) => {
    const escapedVal = p2.replace(/(?<!\\)"/g, '\\"');
    return `${p1}"${escapedVal}"`;
  });

  // 6. Escape raw backslashes that are not valid JSON escape sequences (e.g. LaTeX like \frac)
  let cleanSlash = '';
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '\\') {
      const nextChar = cleaned[i + 1];
      if (nextChar === '"' || nextChar === '\\' || nextChar === '/' || nextChar === 'n' || nextChar === 'r' || nextChar === 't') {
        cleanSlash += char;
      } else {
        cleanSlash += '\\\\';
      }
    } else {
      cleanSlash += char;
    }
  }
  cleaned = cleanSlash;

  // 7. Escape unescaped control chars and newlines in string literals
  let inQuote = false;
  let escaped = '';
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '"' && (i === 0 || cleaned[i - 1] !== '\\')) {
      inQuote = !inQuote;
      escaped += char;
    } else if (inQuote) {
      if (char === '\n') {
        escaped += '\\n';
      } else if (char === '\r') {
        escaped += '\\r';
      } else if (char === '\t') {
        escaped += '\\t';
      } else {
        escaped += char;
      }
    } else {
      escaped += char;
    }
  }
  cleaned = escaped;

  // 8. Remove trailing commas in arrays and objects
  cleaned = cleaned.replace(/,\s*\]/g, ']');
  cleaned = cleaned.replace(/,\s*\}/g, '}');

  return cleaned.trim();
}

export function parseSarvamJSON<T>(response: string): T {
  try {
    return JSON.parse(response);
  } catch (err1) {
    const extracted = extractBalancedJSON(response);
    if (extracted) {
      const repaired = cleanAndRepairJSON(extracted);
      try {
        return JSON.parse(repaired);
      } catch (err2) {
        console.warn('parseSarvamJSON: Failed parsing balanced repaired JSON block:', err2);
      }
    }

    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(cleanAndRepairJSON(jsonMatch[1]));
      } catch (err3) {
        console.warn('parseSarvamJSON: Failed parsing jsonMatch block:', err3);
      }
    }

    // Try parsing the raw response after repair as a last resort
    try {
      return JSON.parse(cleanAndRepairJSON(response));
    } catch (err4) {
      console.warn('parseSarvamJSON: Raw repair parsing failed:', err4);
    }

    throw new Error('Failed to parse AI response as JSON. The model returned an unexpected format.');
  }
}

function getTemperatureForUseCase(useCase: SarvamUseCase): number {
  switch (useCase) {
    case 'quiz_generator':
    case 'answer_grader':
    case 'notes_generator':
    case 'schedule_planner':
    case 'voice_mode':
    case 'slot_extractor':
      return TEMPERATURES.quiz;
    case 'doubt_solver':
    case 'concept_explainer':
      return TEMPERATURES.doubt_solver;
    case 'ai_nudge':
      return TEMPERATURES.nudge;
    case 'vision_question':
      return TEMPERATURES.doubt_solver;
    case 'focus_check':
      return 0.1;
    default:
      return 0.4;
  }
}
