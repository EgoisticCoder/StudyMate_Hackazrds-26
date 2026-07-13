import { Platform } from 'react-native';

/** Returns YYYY-MM-DD in local timezone */
export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return localDateKey(a) === localDateKey(b);
}

// SecureStore keys must match /^[\w.-]+$/ — sanitize studentId defensively so an
// unexpected character in the id can't make the write throw and get swallowed.
const sanitizeId = (id: string) => id.replace(/[^\w.-]/g, '_');
const CHECKED_KEY = (studentId: string) => `mood_checked_date_${sanitizeId(studentId)}`;
const LOGS_CACHE_KEY = (studentId: string) => `local_mood_logs_${studentId}`;

async function readStored(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  const SecureStore = require('expo-secure-store');
  return SecureStore.getItemAsync(key);
}

async function writeStored(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  const SecureStore = require('expo-secure-store');
  await SecureStore.setItemAsync(key, value);
}

/**
 * Marks today as checked-in. Writes and then reads back to confirm the write
 * actually landed — if it silently failed (storage error swallowed elsewhere),
 * we retry once instead of leaving the flag unset, which is what previously
 * caused the check-in card to reappear even though a mood had been logged.
 */
export async function markMoodCheckedToday(studentId: string): Promise<void> {
  const key = CHECKED_KEY(studentId);
  const value = localDateKey();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeStored(key, value);
      const confirm = await readStored(key);
      if (confirm === value) return;
    } catch (err) {
      console.warn(`Failed to mark mood checked (attempt ${attempt + 1}):`, err);
    }
  }
  // Even if the flag write never sticks, hasMoodCheckedToday() below has a
  // second, independent source of truth (the cached log list) to fall back on.
}

/**
 * A student counts as "checked in" if EITHER:
 *  - the dedicated checked-date flag matches today, OR
 *  - today's date already appears in the locally cached mood log list.
 * Two independent signals means one flaky storage write can't cause the
 * check-in prompt to wrongly reappear.
 */
export async function hasMoodCheckedToday(studentId: string): Promise<boolean> {
  const today = localDateKey();

  try {
    const stored = await readStored(CHECKED_KEY(studentId));
    if (stored === today) return true;
  } catch (err) {
    console.warn('Failed to read mood-checked flag:', err);
  }

  try {
    const cached = await readStored(LOGS_CACHE_KEY(studentId));
    if (cached) {
      const logs: Array<{ date: string }> = JSON.parse(cached);
      const loggedToday = logs.some(l => l?.date && localDateKey(new Date(l.date)) === today);
      if (loggedToday) {
        // Self-heal the flag so subsequent checks are fast and consistent.
        writeStored(CHECKED_KEY(studentId), today).catch(() => {});
        return true;
      }
    }
  } catch (err) {
    console.warn('Failed to read cached mood logs:', err);
  }

  return false;
}
