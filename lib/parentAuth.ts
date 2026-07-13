import { Platform } from 'react-native';
import { readQuery, getRecordField } from './neo4j';
import { verifyPassword } from './password';
import { normalizeEmail } from './studentAuth';

export type ParentAuthResult =
  | { success: true; studentId: string }
  | { success: false; reason: 'email_not_found' | 'pin_not_set' | 'wrong_pin' };

export async function verifyParentAccess(email: string, pin: string): Promise<ParentAuthResult> {
  const norm = normalizeEmail(email);
  try {
    const recs = await readQuery(`MATCH (s:Student {email: $email}) RETURN s`, { email: norm });
    if (!recs.length) return { success: false, reason: 'email_not_found' };

    const record = recs[0];
    const sNode = getRecordField(record, 's');
    const props = sNode?.properties as Record<string, unknown> || sNode as Record<string, unknown>;
    const id = props.id as string;
    const salt = props.parent_pin_salt as string | undefined;
    const hash = props.parent_pin_hash as string | undefined;
    if (!salt || !hash) return { success: false, reason: 'pin_not_set' };

    const ok = await verifyPassword(pin, salt, hash);
    if (!ok) return { success: false, reason: 'wrong_pin' };
    return { success: true, studentId: id };
  } catch (dbErr) {
    console.warn('verifyParentAccess: Neo4j read failed, checking offline cache fallback...', dbErr);
    try {
      let activeStudentId: string | null = null;
      if (Platform.OS === 'web') {
        activeStudentId = localStorage.getItem('student_id');
      } else {
        const SecureStore = require('expo-secure-store');
        activeStudentId = await SecureStore.getItemAsync('student_id');
      }

      if (activeStudentId) {
        let cachedProfileStr: string | null = null;
        if (Platform.OS === 'web') {
          cachedProfileStr = localStorage.getItem(`profile_cache_${activeStudentId}`);
        } else {
          const SecureStore = require('expo-secure-store');
          cachedProfileStr = await SecureStore.getItemAsync(`profile_cache_${activeStudentId}`);
        }

        if (cachedProfileStr) {
          const profile = JSON.parse(cachedProfileStr);
          if (profile.email && normalizeEmail(profile.email) === norm) {
            if (!profile.parent_pin_salt || !profile.parent_pin_hash) {
              return { success: false, reason: 'pin_not_set' };
            }
            const ok = await verifyPassword(pin, profile.parent_pin_salt, profile.parent_pin_hash);
            if (!ok) return { success: false, reason: 'wrong_pin' };
            return { success: true, studentId: profile.id };
          }
        }
      }

      if (Platform.OS === 'web') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('profile_cache_')) {
            const cached = localStorage.getItem(key);
            if (cached) {
              const profile = JSON.parse(cached);
              if (profile.email && normalizeEmail(profile.email) === norm) {
                if (!profile.parent_pin_salt || !profile.parent_pin_hash) {
                  return { success: false, reason: 'pin_not_set' };
                }
                const ok = await verifyPassword(pin, profile.parent_pin_salt, profile.parent_pin_hash);
                if (!ok) return { success: false, reason: 'wrong_pin' };
                return { success: true, studentId: profile.id };
              }
            }
          }
        }
      }
    } catch (cacheErr) {
      console.warn('Failed to perform offline PIN verification fallback:', cacheErr);
    }
    return { success: false, reason: 'email_not_found' };
  }
}

/**
 * Read parent notes for a student. Returns null if no notes exist.
 */
export async function getParentNotes(studentId: string): Promise<{
  studyNotes: string;
  weaknessNotes: string;
  updatedAt: string | null;
} | null> {
  try {
    const recs = await readQuery(
      `MATCH (s:Student {id: $studentId})
       RETURN s.parent_study_notes AS studyNotes,
              s.parent_weakness_notes AS weaknessNotes,
              s.parent_notes_updated_at AS updatedAt`,
      { studentId }
    );
    if (!recs.length) return null;
    const record = recs[0];
    const studyNotes = getRecordField<string>(record, 'studyNotes');
    const weaknessNotes = getRecordField<string>(record, 'weaknessNotes');
    const updatedAt = getRecordField<any>(record, 'updatedAt')?.toString();
    if (!studyNotes && !weaknessNotes) return null;
    return { studyNotes, weaknessNotes, updatedAt };
  } catch {
    return null;
  }
}
