/**
 * Browser cache control utilities to prevent stale data issues
 * Especially critical when switching between localhost and production backends
 */

/**
 * Clears all browser caches safely (Service Workers, Cache API, LocalStorage metadata)
 */
export async function clearAllBrowserCaches(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    // Clear Cache API (used by service workers)
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log('[Cache] Cleared Cache API:', cacheNames.length, 'caches removed');
    }

    // Unregister service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg => reg.unregister()));
      console.log('[Cache] Unregistered service workers:', registrations.length);
    }

    // Clear storage metadata (but preserve user data like tokens)
    const cacheMetadataKeys = Object.keys(localStorage).filter(key => 
      key.startsWith('cache_') || key.startsWith('_cache')
    );
    cacheMetadataKeys.forEach(key => localStorage.removeItem(key));
    console.log('[Cache] Cleared localStorage cache metadata:', cacheMetadataKeys.length, 'keys');

  } catch (error) {
    console.warn('[Cache] Failed to clear some caches:', error);
  }
}

/**
 * Adds cache-busting query parameter to URL
 */
export function addCacheBuster(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_t=${Date.now()}`;
}

/**
 * Checks if backend URL has changed and clears cache if needed
 */
export async function checkAndClearCacheOnBackendChange(currentBackendUrl: string): Promise<void> {
  if (typeof window === 'undefined') return;

  const STORAGE_KEY = 'last_backend_url';
  const lastBackendUrl = localStorage.getItem(STORAGE_KEY);

  if (lastBackendUrl && lastBackendUrl !== currentBackendUrl) {
    console.log('[Cache] Backend URL changed:', lastBackendUrl, '→', currentBackendUrl);
    console.log('[Cache] Clearing all caches to prevent stale data...');
    await clearAllBrowserCaches();
    localStorage.setItem(STORAGE_KEY, currentBackendUrl);
    
    // Force page reload to ensure clean state
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  } else if (!lastBackendUrl) {
    // First run - save current backend
    localStorage.setItem(STORAGE_KEY, currentBackendUrl);
  }
}
