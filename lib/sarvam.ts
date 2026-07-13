// Sarvam Voice: STT (Saaras v3) + TTS (Bulbul v3) + Translate (Mayura v1)
import { Platform, Alert } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { shouldUseAiProxy, getSarvamKey, getSarvamProxyPayload, getProxyBaseUrl } from './apiKeys';

const SARVAM_API_URL = 'https://api.sarvam.ai';

// Language code mapping
export const SARVAM_LANGUAGES: Record<string, string> = {
  'English': 'en-IN',
  'Hindi': 'hi-IN',
  'Bengali': 'bn-IN',
  'Tamil': 'ta-IN',
  'Telugu': 'te-IN',
  'Kannada': 'kn-IN',
  'Malayalam': 'ml-IN',
  'Marathi': 'mr-IN',
  'Gujarati': 'gu-IN',
  'Punjabi': 'pa-IN',
  'Odia': 'od-IN',
};

export const SARVAM_LANG_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(SARVAM_LANGUAGES).map(([k, v]) => [v, k])
);

// ── TTS Audio Cache ────────────────────────────────

const TTS_CACHE_SIZE = 3;
const ttsCache = new Map<string, string>(); // text hash -> base64 audio

function ttsCacheKey(text: string, lang: string): string {
  return `${lang}::${text.slice(0, 200)}`;
}

function addToCache(key: string, audio: string) {
  if (ttsCache.size >= TTS_CACHE_SIZE) {
    const firstKey = ttsCache.keys().next().value;
    if (firstKey !== undefined) ttsCache.delete(firstKey);
  }
  ttsCache.set(key, audio);
}

export interface PlaybackStatus {
  didJustFinish?: boolean;
  isPlaying?: boolean;
}

export interface SoundPlayer {
  play?: () => void;
  playAsync?: () => Promise<void>;
  pause?: () => void;
  pauseAsync?: () => Promise<void>;
  stopAsync?: () => Promise<void>;
  remove: () => void;
  setOnPlaybackStatusUpdate?: (callback: (status: PlaybackStatus) => void) => void;
  addListener: (event: string, callback: (status: PlaybackStatus) => void) => any;
}

// ── Current Sound reference for playback control ───

let currentSound: SoundPlayer | null = null;

class WebAudioSound implements SoundPlayer {
  private audio: HTMLAudioElement | null = null;
  private callback: ((status: PlaybackStatus) => void) | null = null;

  constructor(base64Audio: string) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      this.audio = new window.Audio('data:audio/wav;base64,' + base64Audio);
      this.audio.onended = () => {
        if (this.callback) {
          this.callback({ didJustFinish: true });
        }
        if (currentSound === this) {
          currentSound = null;
        }
      };
    }
  }

  async playAsync() {
    if (this.audio) {
      await this.audio.play();
    }
  }

  setOnPlaybackStatusUpdate(callback: (status: PlaybackStatus) => void) {
    this.callback = callback;
  }

  addListener(event: string, callback: (status: PlaybackStatus) => void) {
    if (event === 'playbackStatusUpdate') {
      this.setOnPlaybackStatusUpdate(callback);
    }
    return { remove: () => {} };
  }

  async stopAsync() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
  }

  pause() {
    if (this.audio) {
      this.audio.pause();
    }
  }

  remove() {
    this.unloadAsync();
  }

  async unloadAsync() {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
  }
}

// ── API Call Helpers ───────────────────────────────

async function callVoiceProxy(payload: Record<string, unknown>): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const baseUrl = getProxyBaseUrl();
    const response = await fetch(`${baseUrl}/api/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(response.ok ? 'Invalid response from voice API' : `Voice API error (${response.status})`);
    }
    if (!response.ok) {
      throw new Error(data.error || `Voice API error (${response.status})`);
    }
    return data;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Voice API timed out — please try again.');
    }
    throw error;
  }
}

async function callSarvamDirect(
  endpoint: string,
  body: Record<string, unknown>,
  isFormData = false
): Promise<any> {
  const apiKey = await getSarvamKey();
  if (!apiKey) throw new Error('Sarvam API key not configured');

  const headers: Record<string, string> = {
    'api-subscription-key': apiKey,
  };

  let fetchBody: FormData | string;
  if (isFormData) {
    const formData = new FormData();
    Object.entries(body).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        formData.append(k, v as any);
      }
    });
    fetchBody = formData;
  } else {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(`${SARVAM_API_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: fetchBody,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Sarvam API error: ${text.slice(0, 200)}`);
    }

    if (!response.ok) {
      throw new Error(data.error || data.message || `Sarvam API error (${response.status})`);
    }

    return data;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Sarvam AI request timed out. Try again.');
    }
    throw error;
  }
}

// ── STT (Speech-to-Text) ──────────────────────────

export interface STTResult {
  text: string;
  language: string;
  languageName: string;
}

/**
 * Transcribe audio file using Sarvam Saaras v3.
 * @param audioUri - Local URI of the recorded audio file
 * @returns Transcribed text and detected language
 */
export async function transcribeAudio(audioUri: string): Promise<STTResult> {
  let base64Audio = '';
  if (Platform.OS === 'web') {
    try {
      const response = await fetch(audioUri);
      const blob = await response.blob();
      base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error('Failed to read web audio blob:', err);
      throw new Error('Could not read recorded audio on web.');
    }
  } else {
    base64Audio = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  const useProxy = shouldUseAiProxy();

  if (useProxy) {
    const keyPayload = await getSarvamProxyPayload();
    const result = await callVoiceProxy({
      ...keyPayload,
      action: 'stt',
      audio_base64: base64Audio,
    });
    return {
      text: result.text || '',
      language: result.language_code || 'en-IN',
      languageName: SARVAM_LANG_TO_NAME[result.language_code] || 'English',
    };
  }

  // Direct API call (native apps)
  const apiKey = await getSarvamKey();
  if (!apiKey) throw new Error('Sarvam API key not configured');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const formData = new FormData();
    formData.append('file', {
      uri: audioUri,
      type: 'audio/wav',
      name: 'recording.wav',
    } as any);
    formData.append('model', 'saaras:v3');
    formData.append('mode', 'transcribe');

    const response = await fetch(`${SARVAM_API_URL}/speech-to-text`, {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`STT failed: ${responseText.slice(0, 200)}`);
    }

    if (!response.ok) {
      throw new Error(data.error || data.message || `STT failed (${response.status})`);
    }

    const langCode = data.language_code || 'en-IN';
    return {
      text: data.transcript || data.text || '',
      language: langCode,
      languageName: SARVAM_LANG_TO_NAME[langCode] || 'English',
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Transcription timed out — please try a shorter recording.');
    }
    throw error;
  }
}

// ── TTS (Text-to-Speech) ──────────────────────────

/**
 * Synthesize speech from text using Sarvam Bulbul v3.
 * Returns a base64 audio string. Cached for the last 3 calls.
 */
export async function synthesizeSpeech(
  text: string,
  languageCode: string = 'en-IN'
): Promise<string> {
  const cacheKey = ttsCacheKey(text, languageCode);
  const cached = ttsCache.get(cacheKey);
  if (cached) return cached;

  const useProxy = shouldUseAiProxy();
  let audioBase64: string;

  if (useProxy) {
    const keyPayload = await getSarvamProxyPayload();
    const result = await callVoiceProxy({
      ...keyPayload,
      action: 'tts',
      text,
      language_code: languageCode,
    });
    audioBase64 = result.audio_base64 || '';
  } else {
    const data = await callSarvamDirect('/text-to-speech', {
      text: text.slice(0, 2400),
      target_language_code: languageCode,
      speaker: languageCode.startsWith('hi') ? 'shubh' : 'aditya',
      model: 'bulbul:v3',
      output_audio_codec: 'wav',
      speech_sample_rate: 22050,
    });
    audioBase64 = data.audios?.[0] || data.audio_base64 || data.audio || '';
  }

  if (audioBase64) {
    addToCache(cacheKey, audioBase64);
  }

  return audioBase64;
}

// ── Audio Playback ─────────────────────────────────

/**
 * Play base64-encoded audio using expo-audio.
 * Returns the AudioPlayer for control (stop/unload).
 */
export async function playAudioBase64(base64Audio: string): Promise<any> {
  // Stop any currently playing audio
  await stopCurrentAudio();

  if (Platform.OS === 'web') {
    const sound = new WebAudioSound(base64Audio);
    currentSound = sound;
    await sound.playAsync();
    return sound as any;
  }

  // Write base64 to temp file and play
  const tempUri = FileSystem.cacheDirectory + `tts_${Date.now()}.wav`;
  await FileSystem.writeAsStringAsync(tempUri, base64Audio, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
  });

  const player = createAudioPlayer(tempUri) as unknown as SoundPlayer;
  
  // Add setOnPlaybackStatusUpdate method to native player for compatibility
  player.setOnPlaybackStatusUpdate = (callback: (status: PlaybackStatus) => void) => {
    (player as any).addListener('playbackStatusUpdate', callback);
  };
  
  if (player.play) player.play();
  
  currentSound = player;

  // Clean up when done
  player.addListener('playbackStatusUpdate', (status) => {
    if ('didJustFinish' in status && status.didJustFinish) {
      player.remove();
      if (currentSound === player) currentSound = null;
      FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    }
  });

  return player;
}

/**
 * Stop currently playing audio.
 */
export async function stopCurrentAudio(): Promise<void> {
  if (currentSound) {
    try {
      if (currentSound.pause) currentSound.pause();
      if (currentSound.remove) currentSound.remove();
    } catch {
      // Already unloaded
    }
    currentSound = null;
  }
}

/**
 * Check if audio is currently playing.
 */
export function isAudioPlaying(): boolean {
  return currentSound !== null;
}

// ── Translate ──────────────────────────────────────

export interface TranslateResult {
  translated_text: string;
}

/**
 * Translate text using Sarvam Mayura v1.
 */
export async function translateText(
  text: string,
  sourceLanguage: string = 'en-IN',
  targetLanguage: string = 'hi-IN'
): Promise<string> {
  const useProxy = shouldUseAiProxy();

  if (useProxy) {
    const keyPayload = await getSarvamProxyPayload();
    const result = await callVoiceProxy({
      ...keyPayload,
      action: 'translate',
      text,
      source_language: sourceLanguage,
      target_language: targetLanguage,
    });
    return result.translated_text || '';
  }

  const data = await callSarvamDirect('/translate', {
    input: text.slice(0, 5000),
    source_language_code: sourceLanguage,
    target_language_code: targetLanguage,
    model: 'mayura:v1',
  });

  return data.translated_text || '';
}

// ── Toast helper ───────────────────────────────────

export function showVoiceError(message: string) {
  if (Platform.OS === 'web') {
    // Use browser notification or console
    console.warn('[Voice]', message);
  } else {
    Alert.alert('Voice', message);
  }
}

// ── Get stored language preference ─────────────────

export async function getStoredLanguageCode(): Promise<string> {
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
  return SARVAM_LANGUAGES[lang] || 'en-IN';
}

/** Verify Sarvam TTS (Bulbul v3) with a minimal synthesis request. */
export async function testVoiceConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const audio = await synthesizeSpeech('OK', 'en-IN');
    if (audio && audio.length > 50) {
      return { ok: true, message: 'Sarvam voice (TTS) connected' };
    }
    return { ok: false, message: 'TTS returned empty audio' };
  } catch (error: unknown) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Voice connection failed',
    };
  }
}
