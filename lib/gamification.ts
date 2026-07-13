import { readQuery, writeQuery } from './neo4j';

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned_at?: string;
}

export interface GamificationStats {
  xp: number;
  level: number;
  streak: number;
  last_active_date: string | null;
  badges: Badge[];
}

const BADGES = {
  STREAK_3: { id: 'streak_3', name: '3-Day Streak', description: 'Maintained a 3-day study streak', icon: 'flame' },
  STREAK_7: { id: 'streak_7', name: '7-Day Streak', description: 'Maintained a 7-day study streak', icon: 'flame' },
  LEVEL_5: { id: 'level_5', name: 'Rising Star', description: 'Reached Level 5', icon: 'star' },
  LEVEL_10: { id: 'level_10', name: 'Scholar', description: 'Reached Level 10', icon: 'trophy' },
  FIRST_QUIZ: { id: 'first_quiz', name: 'First Steps', description: 'Completed your first quiz', icon: 'school' },
};

// Level: 100 XP per level
export function getLevelFromXP(xp: number): number {
  return Math.floor(xp / 100) + 1;
}

export function getXPForNextLevel(level: number): number {
  return level * 100;
}

interface Neo4jInteger {
  low?: number;
  high?: number;
  toNumber?: () => number;
}

/** Safely unwrap Neo4j Integer objects */
function safeNum(val: number | Neo4jInteger | null | undefined, fallback = 0): number {
  if (val == null) return fallback;
  if (typeof val === 'number') return val;
  if (typeof val === 'object') {
    if (typeof val.toNumber === 'function') return val.toNumber();
    if (val.low != null) return val.low;
  }
  return Number(val) || fallback;
}

/**
 * Ensures student has default gamification fields set.
 */
async function initializeGamification(studentId: string) {
  await writeQuery(
    `MATCH (s:Student {id: $studentId})
     WHERE s.xp IS NULL OR s.level IS NULL
     SET s.xp = 0, s.level = 1`,
    { studentId }
  );
}

/**
 * Process a daily activity, updating streak and last_active_date.
 * Returns true if the streak was newly incremented today.
 */
export async function updateStreakAndActivity(studentId: string): Promise<boolean> {
  await initializeGamification(studentId);
  
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const res = await readQuery(
    `MATCH (s:Student {id: $studentId})
     RETURN s.last_active_date AS lastActive, s.streak AS streak`,
    { studentId }
  );

  if (res.length === 0) return false;

  const record = res[0];
  const lastActive = record && typeof record.get === 'function' ? record.get('lastActive') : (record as any)?.lastActive;
  const currentStreak = record && typeof record.get === 'function' ? record.get('streak') : (record as any)?.streak || 0;

  let newStreak = currentStreak;
  let streakIncremented = false;

  if (lastActive === todayStr) {
    // Already active today, no change
    return false;
  } else if (lastActive === yesterdayStr) {
    // Active yesterday, increment streak
    newStreak += 1;
    streakIncremented = true;
  } else {
    // Gap in activity, reset streak
    newStreak = 1;
    streakIncremented = true;
  }

  await writeQuery(
    `MATCH (s:Student {id: $studentId})
     SET s.streak = $newStreak, s.last_active_date = $todayStr`,
    { studentId, newStreak, todayStr }
  );

  if (streakIncremented) {
    // Add Daily XP for logging in / being active
    await addXP(studentId, 10, 'Daily Activity Bonus');
    
    // Check Streak Badges
    if (newStreak >= 3) await unlockBadge(studentId, BADGES.STREAK_3);
    if (newStreak >= 7) await unlockBadge(studentId, BADGES.STREAK_7);
  }

  return streakIncremented;
}

/**
 * Add XP to a student and calculate level ups.
 */
export async function addXP(studentId: string, amount: number, reason: string): Promise<void> {
  await initializeGamification(studentId);

  const res = await readQuery(
    `MATCH (s:Student {id: $studentId}) RETURN s.xp AS xp, s.level AS level`,
    { studentId }
  );
  if (res.length === 0) return;

  const record = res[0];
  const currentXp = record && typeof record.get === 'function' ? record.get('xp') : (record as any)?.xp || 0;
  const currentLevel = record && typeof record.get === 'function' ? record.get('level') : (record as any)?.level || 1;

  const newXp = currentXp + amount;
  const newLevel = getLevelFromXP(newXp);

  await writeQuery(
    `MATCH (s:Student {id: $studentId})
     SET s.xp = $newXp, s.level = $newLevel`,
    { studentId, newXp, newLevel }
  );

  // Check Level Badges
  if (newLevel >= 5 && currentLevel < 5) await unlockBadge(studentId, BADGES.LEVEL_5);
  if (newLevel >= 10 && currentLevel < 10) await unlockBadge(studentId, BADGES.LEVEL_10);
  
  console.log(`[Gamification] Added ${amount} XP to ${studentId} for ${reason}. Total: ${newXp}XP. Level: ${newLevel}`);
}

/**
 * Unlocks a badge for a student if they don't already have it.
 */
export async function unlockBadge(studentId: string, badge: typeof BADGES[keyof typeof BADGES]): Promise<void> {
  // Check if they already have it
  const check = await readQuery(
    `MATCH (s:Student {id: $studentId})-[:EARNED_BADGE]->(b:Badge {id: $badgeId})
     RETURN b`,
    { studentId, badgeId: badge.id }
  );

  if (check.length > 0) return; // Already earned

  await writeQuery(
    `MATCH (s:Student {id: $studentId})
     MERGE (b:Badge {id: $badgeId})
     ON CREATE SET b.name = $name, b.description = $desc, b.icon = $icon
     MERGE (s)-[rel:EARNED_BADGE]->(b)
     ON CREATE SET rel.earned_at = datetime()`,
    {
      studentId,
      badgeId: badge.id,
      name: badge.name,
      desc: badge.description,
      icon: badge.icon,
    }
  );
}

/**
 * Gets all gamification stats for a student.
 */
export async function getGamificationStats(studentId: string): Promise<GamificationStats | null> {
  const res = await readQuery(
    `MATCH (s:Student {id: $studentId})
     OPTIONAL MATCH (s)-[rel:EARNED_BADGE]->(b:Badge)
     RETURN s.xp AS xp, s.level AS level, s.streak AS streak, s.last_active_date AS lastActive,
            collect(b { .id, .name, .description, .icon, earned_at: toString(rel.earned_at) }) AS badges`,
    { studentId }
  );

  if (res.length === 0) return null;
  const row = res[0];

  const getBadges = row && typeof row.get === 'function' ? row.get('badges') : (row as any)?.badges;
  const badges = getBadges?.filter((b: any) => b.id) || []; // filter out nulls

  return {
    xp: safeNum(row && typeof row.get === 'function' ? row.get('xp') : (row as any)?.xp),
    level: safeNum(row && typeof row.get === 'function' ? row.get('level') : (row as any)?.level, 1),
    streak: safeNum(row && typeof row.get === 'function' ? row.get('streak') : (row as any)?.streak),
    last_active_date: row && typeof row.get === 'function' ? row.get('lastActive') : (row as any)?.lastActive || null,
    badges: badges,
  };
}

/**
 * Level up the student by exactly 1 level, regardless of current XP.
 * Awards the XP gap needed to reach the next level boundary.
 */
export async function levelUpByOne(studentId: string): Promise<void> {
  await initializeGamification(studentId);

  const res = await readQuery(
    `MATCH (s:Student {id: $studentId}) RETURN s.xp AS xp, s.level AS level`,
    { studentId }
  );
  if (res.length === 0) return;

  const record = res[0];
  const currentXp = safeNum(record && typeof record.get === 'function' ? record.get('xp') : (record as any)?.xp);
  const currentLevel = safeNum(record && typeof record.get === 'function' ? record.get('level') : (record as any)?.level, 1);

  // XP required to be exactly at the start of currentLevel+1
  const nextLevelXp = currentLevel * 100; // e.g. level 3 starts at 300 XP
  const xpNeeded = Math.max(1, nextLevelXp - currentXp);

  await addXP(studentId, xpNeeded, 'Focus Orb Bonus — collected all orbs!');
  console.log(`[Gamification] Orb level-up: ${studentId} +${xpNeeded} XP → Level ${currentLevel + 1}`);
}
