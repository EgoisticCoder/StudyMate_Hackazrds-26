import { Platform } from 'react-native';
import Constants from 'expo-constants';

function trimKey(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export type StoredApiKeys = {
  sarvamKey?: string;
  customModel?: string;
};

/** Load keys from Profile storage, then build-time EXPO_PUBLIC_* fallbacks. */
export async function loadApiKeys(): Promise<StoredApiKeys> {
  let sarvamKey: string | undefined;
  let customModel: string | undefined;

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      try {
        sarvamKey = trimKey(localStorage.getItem('sarvam_api_key'));
        customModel = trimKey(localStorage.getItem('custom_model'));
      } catch (e) {
        console.warn('Failed to load API keys from localStorage:', e);
      }
    }
  } else {
    try {
      const SecureStore = require('expo-secure-store');
      sarvamKey = trimKey(await SecureStore.getItemAsync('sarvam_api_key'));
      customModel = trimKey(await SecureStore.getItemAsync('custom_model'));
    } catch {
      // SecureStore unavailable
    }
  }

  if (!sarvamKey) sarvamKey = trimKey(process.env.EXPO_PUBLIC_SARVAM_API_KEY);

  return { sarvamKey, customModel };
}

export async function getSarvamKey(): Promise<string> {
  const { sarvamKey } = await loadApiKeys();
  return sarvamKey || '';
}

/** Client-side key payload for Vercel proxies (/api/ai, /api/ocr, /api/voice). */
export async function getSarvamProxyPayload(): Promise<{ sarvam_key?: string }> {
  const key = await getSarvamKey();
  return key ? { sarvam_key: key } : {};
}

/** Web production: CORS blocks browser requests — use same-origin Vercel proxy.
 *  Web localhost: use localhost:3001 proxy (server.js)
 */
export function shouldUseAiProxy(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  // Always true for web: on localhost this hits server.js on :3001 (see
  // getProxyBaseUrl), and in production it hits the same-origin Vercel
  // rewrite. Either way, CORS blocks calling api.sarvam.ai directly from
  // a browser, so web always needs the proxy.
  return true;
}

/** Get base URL for proxy endpoints
 *  - Explicit EXPO_PUBLIC_PROXY_BASE_URL (highest priority): use it for all platforms
 *  - Web localhost (no explicit URL): http://localhost:3001 (server.js)
 *  - Web production (no explicit URL): same origin (empty string, Vercel rewrites /api/*)
 *  - Native (Expo Go / dev client): the Metro packager's LAN host on port 3001,
 *    so a physical device/emulator can reach `npm run server` on the dev machine.
 */
export function getProxyBaseUrl(): string {
  // 1. Explicit URL always wins (for Render/Vercel deployment)
  const explicit = trimKey(process.env.EXPO_PUBLIC_PROXY_BASE_URL);
  if (explicit) return explicit.replace(/\/$/, '');

  // 2. Web-specific fallbacks
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return '';
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:3001';
    }
    return '';
  }

  // 3. Native: try to infer from Metro packager LAN host
  // hostUri looks like "192.168.1.5:8081" while running via `expo start` / Expo Go.
  const hostUri = Constants.expoConfig?.hostUri;
  const lanHost = hostUri?.split(':')?.[0];
  if (lanHost) return `http://${lanHost}:3001`;

  return '';
}


