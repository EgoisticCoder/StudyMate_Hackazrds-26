import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { readQuery, writeQuery, writeTransaction } from './neo4j';
import { callSarvam, parseSarvamJSON } from './ai';
import { v4 as uuidv4 } from 'uuid';
import { weekKeyFromDate } from './weekUtils';
import { progressMission } from './missions';

export interface TimetableSlotRow {
  id: string;
  week_start: string;
  day_index: number;
  day_name: string;
  slot_order: number;
  title: string;
  minutes_estimate: number;
  done: boolean;
  time_slot: string;    // e.g. "07:00-08:00"
  subject: string;      // e.g. "Mathematics"
  sticky_note: string;  // user-editable chapter note
}

const DAY_TO_INDEX: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

const INDEX_TO_NAME = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface ExtractedSlot {
  day: string;
  title: string;
  minutes?: number;
  order?: number;
  time_slot?: string;
  subject?: string;
}

const LOCAL_SLOTS_FILE = FileSystem.documentDirectory + 'studymate_slots.json';

async function saveSlotsLocally(studentId: string, weekStartKey: string, slots: TimetableSlotRow[]): Promise<void> {
  try {
    const cacheKey = `local_slots_${studentId}_${weekStartKey}`;
    if (Platform.OS === 'web') {
      localStorage.setItem(cacheKey, JSON.stringify(slots));
    } else {
      let allSlots: Record<string, TimetableSlotRow[]> = {};
      try {
        const info = await FileSystem.getInfoAsync(LOCAL_SLOTS_FILE);
        if (info.exists) {
          const content = await FileSystem.readAsStringAsync(LOCAL_SLOTS_FILE);
          allSlots = JSON.parse(content);
        }
      } catch (err) {
        console.warn('Failed to read local slots file, starting fresh:', err);
      }
      allSlots[cacheKey] = slots;
      await FileSystem.writeAsStringAsync(LOCAL_SLOTS_FILE, JSON.stringify(allSlots));
    }
  } catch (err) {
    console.warn('saveSlotsLocally failed:', err);
  }
}

async function loadSlotsLocally(studentId: string, weekStartKey: string): Promise<TimetableSlotRow[]> {
  try {
    const cacheKey = `local_slots_${studentId}_${weekStartKey}`;
    if (Platform.OS === 'web') {
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : [];
    } else {
      const info = await FileSystem.getInfoAsync(LOCAL_SLOTS_FILE);
      if (info.exists) {
        const content = await FileSystem.readAsStringAsync(LOCAL_SLOTS_FILE);
        const allSlots = JSON.parse(content);
        return allSlots[cacheKey] || [];
      }
    }
  } catch (err) {
    console.warn('loadSlotsLocally failed:', err);
  }
  return [];
}

async function updateLocalSlotField(
  studentId: string,
  slotId: string,
  updater: (slot: TimetableSlotRow) => TimetableSlotRow
): Promise<void> {
  const currentWeek = weekKeyFromDate();
  let slots = await loadSlotsLocally(studentId, currentWeek);
  if (slots.some(s => s.id === slotId)) {
    const updated = slots.map(s => s.id === slotId ? updater(s) : s);
    await saveSlotsLocally(studentId, currentWeek, updated);
    return;
  }
  
  if (Platform.OS === 'web') {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`local_slots_${studentId}_`)) {
        const weekKey = key.split('_').pop() || '';
        let list = await loadSlotsLocally(studentId, weekKey);
        if (list.some(s => s.id === slotId)) {
          const updated = list.map(s => s.id === slotId ? updater(s) : s);
          await saveSlotsLocally(studentId, weekKey, updated);
          return;
        }
      }
    }
  } else {
    try {
      const info = await FileSystem.getInfoAsync(LOCAL_SLOTS_FILE);
      if (info.exists) {
        const content = await FileSystem.readAsStringAsync(LOCAL_SLOTS_FILE);
        const allSlots = JSON.parse(content);
        for (const cacheKey in allSlots) {
          if (cacheKey.startsWith(`local_slots_${studentId}_`)) {
            const list = allSlots[cacheKey] || [];
            if (list.some((s: any) => s.id === slotId)) {
              allSlots[cacheKey] = list.map((s: any) => s.id === slotId ? updater(s) : s);
              await FileSystem.writeAsStringAsync(LOCAL_SLOTS_FILE, JSON.stringify(allSlots));
              return;
            }
          }
        }
      }
    } catch (err) {
      console.warn('updateLocalSlotField failed on native:', err);
    }
  }
}

export async function extractSlotsFromPlanMarkdown(markdown: string): Promise<ExtractedSlot[]> {
  const raw = await callSarvam(
    [
      {
        role: 'system',
        content:
          'Extract study tasks from the schedule text. Output ONLY valid JSON array. Each item: {"day":"Monday","title":"short task label","minutes":40,"order":1,"time_slot":"16:00-17:00","subject":"Mathematics"}. Days: Monday-Sunday. Max 28 tasks. No markdown. time_slot should be in HH:MM-HH:MM format. subject should be the school subject name.',
      },
      {
        role: 'user',
        content: `Schedule text:\n\n${markdown.slice(0, 12000)}`,
      },
    ],
    'slot_extractor'
  );

  let parsed: ExtractedSlot[];
  try {
    parsed = parseSarvamJSON<ExtractedSlot[]>(raw);
  } catch {
    const retry = await callSarvam(
      [
        { role: 'system', content: 'Return ONLY a JSON array of {day,title,minutes?,order?}.' },
        { role: 'user', content: markdown.slice(0, 12000) },
      ],
      'slot_extractor'
    );
    parsed = parseSarvamJSON<ExtractedSlot[]>(retry);
  }

  if (!Array.isArray(parsed)) return [];
  return parsed.filter(s => s.title && s.day);
}

function normalizeDay(dayRaw: string): { index: number; name: string } | null {
  const key = dayRaw.trim().toLowerCase().replace(/[^a-z]/g, '');
  const map: Record<string, number> = {
    monday: 0,
    mon: 0,
    tuesday: 1,
    tue: 1,
    wednesday: 2,
    wed: 2,
    thursday: 3,
    thu: 3,
    friday: 4,
    fri: 4,
    saturday: 5,
    sat: 5,
    sunday: 6,
    sun: 6,
  };
  const idx = map[key];
  if (idx === undefined) return null;
  return { index: idx, name: INDEX_TO_NAME[idx] };
}

/**
 * Replace all slots for this student + week with new rows.
 */
export async function replaceSlotsForWeek(
  studentId: string,
  weekStartKey: string,
  extracted: ExtractedSlot[]
): Promise<void> {
  const normSlots: TimetableSlotRow[] = extracted.map((item, i) => {
    const norm = normalizeDay(item.day || 'Monday');
    const id = uuidv4();
    const order = typeof item.order === 'number' ? item.order : i + 1;
    const mins = typeof item.minutes === 'number' ? item.minutes : 30;
    return {
      id,
      week_start: weekStartKey,
      day_index: norm ? norm.index : 0,
      day_name: norm ? norm.name : 'Monday',
      slot_order: order,
      title: String(item.title).slice(0, 500),
      minutes_estimate: mins,
      done: false,
      time_slot: item.time_slot || '',
      subject: item.subject || '',
      sticky_note: ''
    };
  });

  await saveSlotsLocally(studentId, weekStartKey, normSlots);

  try {
    await writeQuery(
      `MATCH (s:Student {id: $studentId})-[:HAS_TIMETABLE_SLOT]->(slot:TimetableSlot)
       WHERE slot.week_start = $week_start
       DETACH DELETE slot`,
      { studentId, week_start: weekStartKey }
    );

    const queries = normSlots.map(slot => ({
      cypher: `
        MATCH (s:Student {id: $studentId})
        CREATE (slot:TimetableSlot {
          id: $id,
          week_start: $week_start,
          day_index: $day_index,
          day_name: $day_name,
          slot_order: $slot_order,
          title: $title,
          minutes_estimate: $minutes_estimate,
          done: $done,
          created_at: datetime(),
          time_slot: $time_slot,
          subject: $subject,
          sticky_note: $sticky_note
        })
        CREATE (s)-[:HAS_TIMETABLE_SLOT]->(slot)
      `,
      params: {
        studentId,
        id: slot.id,
        week_start: weekStartKey,
        day_index: slot.day_index,
        day_name: slot.day_name,
        slot_order: slot.slot_order,
        title: slot.title,
        minutes_estimate: slot.minutes_estimate,
        done: slot.done,
        time_slot: slot.time_slot,
        subject: slot.subject,
        sticky_note: slot.sticky_note,
      },
    }));

    if (queries.length) await writeTransaction(queries);
  } catch (err) {
    console.warn('Failed to sync replaced slots to Neo4j, saved offline:', err);
  }
}

export async function loadSlotsForWeek(
  studentId: string,
  weekStartKey: string
): Promise<TimetableSlotRow[]> {
  try {
    const recs = await readQuery(
      `MATCH (s:Student {id: $studentId})-[:HAS_TIMETABLE_SLOT]->(slot:TimetableSlot)
       WHERE slot.week_start = $week_start
       RETURN slot
       ORDER BY slot.day_index ASC, slot.slot_order ASC`,
      { studentId, week_start: weekStartKey }
    );

    const dbSlots = recs.map(r => {
      const slotNode = r && typeof r.get === 'function' ? r.get('slot') : (r as any)?.slot;
      const p = slotNode?.properties as Record<string, unknown> || slotNode as Record<string, unknown>;
      return {
        id: String(p.id),
        week_start: String(p.week_start),
        day_index: Number(p.day_index ?? 0),
        day_name: String(p.day_name ?? ''),
        slot_order: Number(p.slot_order ?? 0),
        title: String(p.title ?? ''),
        minutes_estimate: Number(p.minutes_estimate ?? 0),
        done: Boolean(p.done),
        time_slot: String(p.time_slot ?? ''),
        subject: String(p.subject ?? ''),
        sticky_note: String(p.sticky_note ?? ''),
      };
    });

    await saveSlotsLocally(studentId, weekStartKey, dbSlots);
    return dbSlots;
  } catch (dbErr) {
    console.warn('loadSlotsForWeek Neo4j read failed, trying local cache:', dbErr);
    return await loadSlotsLocally(studentId, weekStartKey);
  }
}

export async function setSlotDone(
  studentId: string,
  slotId: string,
  done: boolean
): Promise<void> {
  await updateLocalSlotField(studentId, slotId, s => ({ ...s, done }));
  try {
    await writeQuery(
      `MATCH (s:Student {id: $studentId})-[:HAS_TIMETABLE_SLOT]->(slot:TimetableSlot {id: $slotId})
       SET slot.done = $done,
           slot.completed_at = CASE WHEN $done THEN datetime() ELSE NULL END`,
      { studentId, slotId, done }
    );
    if (done) {
      progressMission(studentId, 'study_slot', 1).catch(err => console.error('Gamification hook failed:', err));
    }
  } catch (err) {
    console.warn('Failed to update slot done in Neo4j, saved locally:', err);
  }
}

export async function updateSlotNote(
  studentId: string,
  slotId: string,
  note: string
): Promise<void> {
  await updateLocalSlotField(studentId, slotId, s => ({ ...s, sticky_note: note }));
  try {
    await writeQuery(
      `MATCH (s:Student {id: $studentId})-[:HAS_TIMETABLE_SLOT]->(slot:TimetableSlot {id: $slotId})
       SET slot.sticky_note = $note`,
      { studentId, slotId, note }
    );
  } catch (err) {
    console.warn('Failed to update slot note in Neo4j, saved locally:', err);
  }
}

export async function updateSlot(
  studentId: string,
  slotId: string,
  updates: { title?: string; subject?: string; time_slot?: string; minutes_estimate?: number }
): Promise<void> {
  await updateLocalSlotField(studentId, slotId, s => ({
    ...s,
    title: updates.title !== undefined ? updates.title : s.title,
    subject: updates.subject !== undefined ? updates.subject : s.subject,
    time_slot: updates.time_slot !== undefined ? updates.time_slot : s.time_slot,
    minutes_estimate: updates.minutes_estimate !== undefined ? updates.minutes_estimate : s.minutes_estimate,
  }));

  const setClauses: string[] = [];
  const params: Record<string, unknown> = { studentId, slotId };

  if (updates.title !== undefined) { setClauses.push('slot.title = $title'); params.title = updates.title; }
  if (updates.subject !== undefined) { setClauses.push('slot.subject = $subject'); params.subject = updates.subject; }
  if (updates.time_slot !== undefined) { setClauses.push('slot.time_slot = $time_slot'); params.time_slot = updates.time_slot; }
  if (updates.minutes_estimate !== undefined) { setClauses.push('slot.minutes_estimate = $mins'); params.mins = updates.minutes_estimate; }

  if (setClauses.length === 0) return;

  try {
    await writeQuery(
      `MATCH (s:Student {id: $studentId})-[:HAS_TIMETABLE_SLOT]->(slot:TimetableSlot {id: $slotId})
       SET ${setClauses.join(', ')}`,
      params
    );
  } catch (err) {
    console.warn('Failed to update slot in Neo4j, saved locally:', err);
  }
}

export async function getLatestStudyPlanBody(studentId: string): Promise<string | null> {
  try {
    const recs = await readQuery(
      `MATCH (s:Student {id: $studentId})-[:HAS_STUDY_PLAN]->(sp:StudyPlan)
       RETURN sp.body AS body
       ORDER BY sp.created_at DESC LIMIT 1`,
      { studentId }
    );
    if (!recs.length) return null;
    const record = recs[0];
    const body = record && typeof record.get === 'function' ? record.get('body') : (record as any)?.body;
    return typeof body === 'string' ? body : null;
  } catch (err) {
    console.warn('getLatestStudyPlanBody Neo4j read failed:', err);
    return null;
  }
}

/**
 * If no slots exist for the current ISO week but a saved StudyPlan exists, extract and create slots (weekly refresh).
 */
export async function ensureSlotsForCurrentWeek(studentId: string): Promise<boolean> {
  try {
    const weekKey = weekKeyFromDate();
    const existing = await readQuery(
      `MATCH (s:Student {id: $studentId})-[:HAS_TIMETABLE_SLOT]->(slot:TimetableSlot {week_start: $wk})
       RETURN count(slot) AS c`,
      { studentId, wk: weekKey }
    );
    const record = existing[0];
    const c = record && typeof record.get === 'function' ? record.get('c') : (record as any)?.c;
    const n = typeof c === 'number' ? c : Number(c);
    if (n > 0) return false;

    const body = await getLatestStudyPlanBody(studentId);
    if (!body?.trim()) return false;

    const extracted = await extractSlotsFromPlanMarkdown(body);
    if (!extracted.length) return false;

    await replaceSlotsForWeek(studentId, weekKey, extracted);
    return true;
  } catch (err) {
    console.warn('ensureSlotsForCurrentWeek failed:', err);
    return false;
  }
}

export async function createSlot(
  studentId: string,
  weekStartKey: string,
  slot: Omit<TimetableSlotRow, 'sticky_note'> & { sticky_note?: string }
): Promise<void> {
  const fullSlot: TimetableSlotRow = {
    ...slot,
    sticky_note: slot.sticky_note || ''
  };

  try {
    const list = await loadSlotsLocally(studentId, weekStartKey);
    list.push(fullSlot);
    await saveSlotsLocally(studentId, weekStartKey, list);
  } catch (cacheErr) {
    console.warn('Failed to cache new slot locally:', cacheErr);
  }

  try {
    await writeQuery(
      `MATCH (s:Student {id: $studentId})
       CREATE (slot:TimetableSlot {
         id: $id, week_start: $wk, day_index: $di, day_name: $dn,
         slot_order: $order, title: $title, minutes_estimate: $mins,
         done: $done, created_at: datetime(), time_slot: $ts,
         subject: $subject, sticky_note: $note
       })
       CREATE (s)-[:HAS_TIMETABLE_SLOT]->(slot)`,
      {
        studentId,
        id: fullSlot.id,
        wk: fullSlot.week_start,
        di: fullSlot.day_index,
        dn: fullSlot.day_name,
        order: fullSlot.slot_order,
        title: fullSlot.title,
        mins: fullSlot.minutes_estimate,
        done: fullSlot.done,
        ts: fullSlot.time_slot,
        subject: fullSlot.subject,
        note: fullSlot.sticky_note
      }
    );
  } catch (dbErr) {
    console.warn('Failed to write new slot to Neo4j, saved locally:', dbErr);
  }
}

export async function deleteSlot(
  studentId: string,
  weekStartKey: string,
  slotId: string
): Promise<void> {
  try {
    const list = await loadSlotsLocally(studentId, weekStartKey);
    const filtered = list.filter(s => s.id !== slotId);
    await saveSlotsLocally(studentId, weekStartKey, filtered);
  } catch (cacheErr) {
    console.warn('Failed to delete slot from local cache:', cacheErr);
  }

  try {
    await writeQuery(`MATCH (slot:TimetableSlot {id: $id}) DETACH DELETE slot`, { id: slotId });
  } catch (dbErr) {
    console.warn('Failed to delete slot from Neo4j, updated locally:', dbErr);
  }
}
