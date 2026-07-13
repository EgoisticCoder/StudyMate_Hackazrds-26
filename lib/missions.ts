import { readQuery, writeQuery, getRecordField } from './neo4j';
import { addXP, updateStreakAndActivity } from './gamification';
import { getSubjectStates } from './adaptiveEngine';
import { weekKeyFromDate } from './weekUtils';

export interface Mission {
  id: string;
  type: 'daily' | 'weekly';
  title: string;
  description: string;
  target: number;
  progress: number;
  rewardXP: number;
  status: 'active' | 'completed';
  actionType: string;
  subject?: string;
  /** YYYY-MM-DD, only set for type: 'daily' */
  date?: string;
  /** YYYY-MM-DD of the Monday this weekly mission belongs to, only set for type: 'weekly' */
  weekStart?: string;
}

export async function generateMissions(studentId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const weekStart = weekKeyFromDate(); // Monday of the current week (YYYY-MM-DD)

  // 1. Mark expired daily missions as expired
  await writeQuery(
    `MATCH (s:Student {id: $studentId})-[:HAS_MISSION]->(m:Mission {type: 'daily'})
     WHERE m.date < $today AND m.status = 'active'
     SET m.status = 'expired'`,
    { studentId, today }
  );

  // 1b. Mark expired weekly missions (carried over from a previous week) as expired
  await writeQuery(
    `MATCH (s:Student {id: $studentId})-[:HAS_MISSION]->(m:Mission {type: 'weekly'})
     WHERE m.weekStart < $weekStart AND m.status = 'active'
     SET m.status = 'expired'`,
    { studentId, weekStart }
  );

  // 2. Check if we need new daily missions
  const dailyRes = await readQuery(
    `MATCH (s:Student {id: $studentId})-[:HAS_MISSION]->(m:Mission {type: 'daily', date: $today})
     RETURN count(m) AS activeCount`,
    { studentId, today }
  );
  
  if (dailyRes.length > 0) {
    const record = dailyRes[0];
    const activeCount = getRecordField<number | null>(record, 'activeCount');
    if (activeCount === 0) {
      // Generate new Daily Missions
      
      // Mission 1: Fixed Study Goal (e.g. complete 2 slots)
      await createMission(studentId, {
        id: `m_daily_study_${Date.now()}`,
        type: 'daily',
        title: 'Daily Scholar',
        description: 'Complete 2 study slots today',
        target: 2,
        rewardXP: 50,
        actionType: 'study_slot',
        date: today
      });

      // Mission 2: Dynamic (based on weakness)
      try {
        const states = await getSubjectStates(studentId);
        const weakSubjects = states.filter(s => s.state === 'EMPIRICALLY_WEAK' || s.state === 'AVOIDED_AND_WEAK');
        if (weakSubjects.length > 0) {
          const targetSubject = weakSubjects[0].subject;
          await createMission(studentId, {
            id: `m_daily_quiz_${Date.now()}`,
            type: 'daily',
            title: `Focus: ${targetSubject}`,
            description: `Take a quiz in ${targetSubject}`,
            target: 1,
            rewardXP: 75,
            actionType: 'quiz_completed',
            subject: targetSubject,
            date: today
          });
        } else {
          // Fallback dynamic mission
          await createMission(studentId, {
            id: `m_daily_quiz_${Date.now()}`,
            type: 'daily',
            title: `Quiz Master`,
            description: `Complete 1 quiz today`,
            target: 1,
            rewardXP: 50,
            actionType: 'quiz_completed',
            date: today
          });
        }
      } catch (err) {
        console.error('Failed to generate dynamic mission:', err);
      }
    }
  }

  // 3. Check if we need new weekly missions for the current Monday-based week
  const weeklyRes = await readQuery(
    `MATCH (s:Student {id: $studentId})-[:HAS_MISSION]->(m:Mission {type: 'weekly', weekStart: $weekStart})
     RETURN count(m) AS activeCount`,
    { studentId, weekStart }
  );

  if (weeklyRes.length > 0) {
    const record = weeklyRes[0];
    const activeCount = getRecordField<number | null>(record, 'activeCount');
    if (activeCount === 0) {
      // Generate new Weekly Missions

      // Mission 1: Fixed Study Goal for the week (e.g. complete 10 study slots)
      await createMission(studentId, {
        id: `m_weekly_study_${Date.now()}`,
        type: 'weekly',
        title: 'Weekly Grind',
        description: 'Complete 10 study slots this week',
        target: 10,
        rewardXP: 200,
        actionType: 'study_slot',
        weekStart
      });

      // Mission 2: Dynamic weekly mission (based on weakness)
      try {
        const states = await getSubjectStates(studentId);
        const weakSubjects = states.filter(s => s.state === 'EMPIRICALLY_WEAK' || s.state === 'AVOIDED_AND_WEAK');
        if (weakSubjects.length > 0) {
          const targetSubject = weakSubjects[0].subject;
          await createMission(studentId, {
            id: `m_weekly_quiz_${Date.now()}`,
            type: 'weekly',
            title: `Weekly Focus: ${targetSubject}`,
            description: `Take 3 quizzes in ${targetSubject} this week`,
            target: 3,
            rewardXP: 150,
            actionType: 'quiz_completed',
            subject: targetSubject,
            weekStart
          });
        } else {
          // Fallback dynamic weekly mission
          await createMission(studentId, {
            id: `m_weekly_quiz_${Date.now()}`,
            type: 'weekly',
            title: `Weekly Quiz Champion`,
            description: `Complete 3 quizzes this week`,
            target: 3,
            rewardXP: 150,
            actionType: 'quiz_completed',
            weekStart
          });
        }
      } catch (err) {
        console.error('Failed to generate dynamic weekly mission:', err);
      }
    }
  }
}

export interface CreateMissionPayload {
  id: string;
  type: 'daily' | 'weekly';
  title: string;
  description: string;
  target: number;
  rewardXP: number;
  actionType: string;
  subject?: string | null;
  date?: string | null;
  weekStart?: string | null;
}

async function createMission(studentId: string, data: CreateMissionPayload) {
  // Neo4j driver params reject `undefined` (only `null` is valid), so normalize
  // the optional fields here — daily missions carry `date`, weekly missions carry
  // `weekStart`, and either may omit `subject`.
  const payload = {
    ...data,
    subject: data.subject ?? null,
    date: data.date ?? null,
    weekStart: data.weekStart ?? null,
  };
  await writeQuery(
    `MATCH (s:Student {id: $studentId})
     CREATE (m:Mission {
       id: $data.id,
       type: $data.type,
       title: $data.title,
       description: $data.description,
       target: $data.target,
       progress: 0,
       rewardXP: $data.rewardXP,
       status: 'active',
       actionType: $data.actionType,
       subject: $data.subject,
       date: $data.date,
       weekStart: $data.weekStart
     })
     CREATE (s)-[:HAS_MISSION]->(m)`,
    { studentId, data: payload }
  );
}

/**
 * Retrieve active missions for the student.
 */
export async function getActiveMissions(studentId: string): Promise<Mission[]> {
  // Auto-generate if missing
  await generateMissions(studentId);

  const today = new Date().toISOString().split('T')[0];
  const res = await readQuery(
    `MATCH (s:Student {id: $studentId})-[:HAS_MISSION]->(m:Mission)
     WHERE m.status = 'active' AND (m.type = 'weekly' OR m.date = $today)
     RETURN m
     ORDER BY m.type ASC`, // daily first
    { studentId, today }
  );

  return res.map(r => {
    const mNode = r && typeof r.get === 'function' ? r.get('m') : (r as any)?.m;
    return mNode?.properties as Mission || mNode as Mission;
  });
}

/**
 * Progresses a specific action type for a student.
 */
export async function progressMission(studentId: string, actionType: string, amount: number = 1, subject?: string) {
  const today = new Date().toISOString().split('T')[0];
  
  // First update streak/activity globally since they did an action
  await updateStreakAndActivity(studentId);

  // Find active missions matching actionType
  const res = await readQuery(
    `MATCH (s:Student {id: $studentId})-[:HAS_MISSION]->(m:Mission {status: 'active'})
     WHERE m.actionType = $actionType AND (m.type = 'weekly' OR m.date = $today)
     RETURN m`,
    { studentId, actionType, today }
  );

  for (const row of res) {
    const mNode = row && typeof row.get === 'function' ? row.get('m') : (row as any)?.m;
    const m = mNode?.properties || mNode;
    
    // If the mission requires a specific subject, check it
    if (m.subject && subject && m.subject !== subject) {
      continue;
    }

    const newProgress = Math.min(m.progress + amount, m.target);
    const completed = newProgress >= m.target;

    await writeQuery(
      `MATCH (m:Mission {id: $missionId})
       SET m.progress = $newProgress,
           m.status = CASE WHEN $completed THEN 'completed' ELSE m.status END`,
      { missionId: m.id, newProgress, completed }
    );

    if (completed && m.progress < m.target) { // Prevent double-rewarding
      await addXP(studentId, m.rewardXP, `Completed Mission: ${m.title}`);
    }
  }
}
