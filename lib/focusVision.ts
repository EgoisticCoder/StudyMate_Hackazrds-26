import { callSarvamVision } from './ai';

export type FocusStatus = 'focused' | 'distracted' | 'unknown';

const FOCUS_SYSTEM = `You are a focus monitor for a student study session.
Reply with EXACTLY one word: FOCUSED or DISTRACTED.
FOCUSED = person visible and engaged with study (book, screen, notes, writing).
DISTRACTED = phone in hand, looking away, eyes closed, left desk, talking to someone, or no person visible.`;

const FOCUS_USER = `Look at this camera frame from a study session. Is the student focused on studying right now?`;

export function parseFocusStatus(response: string): FocusStatus {
  const upper = response.trim().toUpperCase();
  if (/\bDISTRACTED\b/.test(upper)) return 'distracted';
  if (/\bFOCUSED\b/.test(upper)) return 'focused';
  return 'unknown';
}

export async function analyzeFocusFromBase64(imageBase64: string): Promise<FocusStatus> {
  const raw = await callSarvamVision(FOCUS_SYSTEM, imageBase64, FOCUS_USER, 'focus_check');
  return parseFocusStatus(raw);
}
