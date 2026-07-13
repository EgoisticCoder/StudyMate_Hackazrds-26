/**
 * Data Persistence Layer with Reactive State Management
 * Handles writes to Neo4j with proper state invalidation callbacks
 */

import { writeQuery, readQuery } from './neo4j';

export interface MutationCallbacks {
  onSuccess?: () => void | Promise<void>;
  onError?: (error: Error) => void;
  onFinally?: () => void;
}

/**
 * Persists an exam to Neo4j and triggers state invalidation
 */
export async function persistExam(
  studentId: string,
  examData: {
    subject: string;
    date: string;
    timeSlot?: string;
    syllabus?: string[];
  },
  callbacks?: MutationCallbacks
): Promise<string> {
  try {
    const examId = `exam_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await writeQuery(
      `MATCH (s:Student {id: $studentId})
       CREATE (e:Exam {
         id: $examId,
         subject: $subject,
         date: $date,
         time_slot: $timeSlot,
         syllabus: $syllabus,
         created_at: datetime()
       })
       CREATE (s)-[:HAS_EXAM]->(e)
       RETURN e.id as savedExamId`,
      {
        studentId,
        examId,
        subject: examData.subject,
        date: examData.date,
        timeSlot: examData.timeSlot || '',
        syllabus: examData.syllabus || [],
      }
    );

    console.log('[Persistence] Exam saved successfully:', examId);
    
    // Trigger state invalidation
    if (callbacks?.onSuccess) {
      await Promise.resolve(callbacks.onSuccess());
    }
    
    return examId;
  } catch (error: unknown) {
    console.error('[Persistence] Exam save failed:', error);
    if (callbacks?.onError) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
    throw error;
  } finally {
    if (callbacks?.onFinally) {
      callbacks.onFinally();
    }
  }
}

/**
 * Persists a calendar event and triggers state invalidation
 */
export async function persistCalendarEvent(
  studentId: string,
  eventData: {
    title: string;
    type: 'event' | 'reminder';
    date: string;
  },
  callbacks?: MutationCallbacks
): Promise<string> {
  try {
    const eventId = `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await writeQuery(
      `MATCH (s:Student {id: $studentId})
       CREATE (e:CalendarEvent {
         id: $eventId,
         title: $title,
         type: $type,
         date: $date,
         created_at: datetime()
       })
       CREATE (s)-[:HAS_EVENT]->(e)
       RETURN e.id as savedEventId`,
      {
        studentId,
        eventId,
        title: eventData.title,
        type: eventData.type,
        date: eventData.date,
      }
    );

    console.log('[Persistence] Calendar event saved successfully:', eventId);
    
    if (callbacks?.onSuccess) {
      await Promise.resolve(callbacks.onSuccess());
    }
    
    return eventId;
  } catch (error: unknown) {
    console.error('[Persistence] Calendar event save failed:', error);
    if (callbacks?.onError) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
    throw error;
  } finally {
    if (callbacks?.onFinally) {
      callbacks.onFinally();
    }
  }
}

/**
 * Persists a timetable slot and triggers state invalidation
 */
export async function persistTimetableSlot(
  studentId: string,
  slotData: {
    date: string;
    timeSlot: string;
    subject: string;
    title: string;
  },
  callbacks?: MutationCallbacks
): Promise<string> {
  try {
    const slotId = `slot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await writeQuery(
      `MATCH (s:Student {id: $studentId})
       CREATE (t:TimetableSlot {
         id: $slotId,
         date: $date,
         time_slot: $timeSlot,
         subject: $subject,
         title: $title,
         created_at: datetime()
       })
       CREATE (s)-[:HAS_TIMETABLE_SLOT]->(t)
       RETURN t.id as savedSlotId`,
      {
        studentId,
        slotId,
        date: slotData.date,
        timeSlot: slotData.timeSlot,
        subject: slotData.subject,
        title: slotData.title,
      }
    );

    console.log('[Persistence] Timetable slot saved successfully:', slotId);
    
    if (callbacks?.onSuccess) {
      await Promise.resolve(callbacks.onSuccess());
    }
    
    return slotId;
  } catch (error: unknown) {
    console.error('[Persistence] Timetable slot save failed:', error);
    if (callbacks?.onError) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
    throw error;
  } finally {
    if (callbacks?.onFinally) {
      callbacks.onFinally();
    }
  }
}

/**
 * Invalidates and refreshes data after mutations
 * Use this as onSuccess callback to force UI refresh
 */
export function createRefreshCallback(refreshFn: () => void | Promise<void>): () => Promise<void> {
  return async () => {
    try {
      await Promise.resolve(refreshFn());
    } catch (err) {
      console.warn('[Persistence] Refresh callback failed:', err);
    }
  };
}
