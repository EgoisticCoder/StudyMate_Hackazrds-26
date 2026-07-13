import { readQuery, writeQuery } from './neo4j';
import { GamificationStats } from './gamification';
import { v4 as uuidv4 } from 'uuid';

export interface FriendProfile {
  id: string;
  name: string;
  email: string;
  xp: number;
  level: number;
  status?: 'pending' | 'accepted' | 'requested'; // requested means I sent them a request
}

/**
 * Send a friend request by email.
 */
export async function sendFriendRequest(fromId: string, toEmail: string): Promise<{ success: boolean; message: string; createdNewUser?: boolean }> {
  // 1. Find the target user
  const userRes = await readQuery(
    `MATCH (t:Student {email: $toEmail}) RETURN t`,
    { toEmail: toEmail.toLowerCase().trim() }
  );

  let toId: string;
  let createdNewUser = false;

  if (userRes.length === 0) {
    // Create a placeholder user so the request shows in the outbox
    toId = uuidv4();
    await writeQuery(
      `CREATE (t:Student {id: $toId, email: $toEmail, name: 'Pending User', level: 1, xp: 0})`,
      { toId, toEmail: toEmail.toLowerCase().trim() }
    );
    createdNewUser = true;
  } else {
    const record = userRes[0];
    const tNode = record && typeof record.get === 'function' ? record.get('t') : (record as any)?.t;
    toId = tNode?.properties?.id || (tNode as any)?.id;
  }

  if (fromId === toId) {
    return { success: false, message: 'You cannot add yourself' };
  }

  // 2. Check existing relationship (both directions)
  const checkRes = await readQuery(
    `MATCH (from:Student {id: $fromId})-[r:FRIENDS_WITH]-(to:Student {id: $toId})
     RETURN r.status AS status`,
    { fromId, toId }
  );

  if (checkRes.length > 0) {
    const record = checkRes[0];
    const status = record && typeof record.get === 'function' ? record.get('status') : (record as any)?.status;
    if (status === 'accepted') return { success: false, message: 'Already friends' };
    if (status === 'pending') return { success: false, message: 'Request already exists' };
  }

  // 3. Create pending request (directional: from -> to)
  await writeQuery(
    `MATCH (from:Student {id: $fromId}), (to:Student {id: $toId})
     MERGE (from)-[r:FRIENDS_WITH]->(to)
     ON CREATE SET r.status = 'pending', r.createdAt = datetime()
     ON MATCH SET r.status = 'pending'`,
    { fromId, toId }
  );

  return { success: true, message: 'Friend request sent', createdNewUser };
}

/**
 * Accept a friend request.
 */
export async function acceptFriendRequest(studentId: string, fromId: string): Promise<void> {
  // Update directional relationship to 'accepted'
  await writeQuery(
    `MATCH (from:Student {id: $fromId})-[r:FRIENDS_WITH]->(to:Student {id: $studentId})
     SET r.status = 'accepted'`,
    { studentId, fromId }
  );
}

/**
 * Reject or remove a friend.
 */
export async function removeFriend(studentId: string, otherId: string): Promise<void> {
  await writeQuery(
    `MATCH (s1:Student {id: $studentId})-[r:FRIENDS_WITH]-(s2:Student {id: $otherId})
     DELETE r`,
    { studentId, otherId }
  );
}

/**
 * Get the friends list including pending requests.
 */
export async function getFriendsList(studentId: string): Promise<{ accepted: FriendProfile[], pendingIn: FriendProfile[], pendingOut: FriendProfile[] }> {
  // Accepted (undirected check since any side could have accepted)
  const acceptedRes = await readQuery(
    `MATCH (s:Student {id: $studentId})-[r:FRIENDS_WITH]-(f:Student)
     WHERE r.status = 'accepted'
     RETURN DISTINCT f`,
    { studentId }
  );

  // Pending Incoming (others sent to me)
  const pendingInRes = await readQuery(
    `MATCH (f:Student)-[r:FRIENDS_WITH]->(s:Student {id: $studentId})
     WHERE r.status = 'pending'
     RETURN f`,
    { studentId }
  );

  // Pending Outgoing (I sent to others)
  const pendingOutRes = await readQuery(
    `MATCH (s:Student {id: $studentId})-[r:FRIENDS_WITH]->(f:Student)
     WHERE r.status = 'pending'
     RETURN f`,
    { studentId }
  );

  const mapToProfile = (row: any): FriendProfile => {
    const fNode = row && typeof row.get === 'function' ? row.get('f') : (row as any)?.f;
    const p = fNode?.properties || fNode;
    return {
      id: p.id,
      name: p.name || 'Unknown',
      email: p.email || '',
      xp: typeof p.xp === 'object' ? (p.xp?.low ?? p.xp?.toNumber?.() ?? 0) : (p.xp || 0),
      level: typeof p.level === 'object' ? (p.level?.low ?? p.level?.toNumber?.() ?? 1) : (p.level || 1),
    };
  };

  // Deduplicate accepted by id
  const seenIds = new Set<string>();
  const accepted = acceptedRes
    .map(mapToProfile)
    .filter(p => { if (seenIds.has(p.id)) return false; seenIds.add(p.id); return true; });

  return {
    accepted,
    pendingIn: pendingInRes.map(mapToProfile),
    pendingOut: pendingOutRes.map(mapToProfile),
  };
}

/**
 * Get Leaderboard: Self + Accepted Friends, sorted by XP descending.
 * Properly deduplicates to prevent double entries.
 */
export async function getLeaderboard(studentId: string): Promise<FriendProfile[]> {
  // Fetch self
  const selfRes = await readQuery(
    `MATCH (u:Student {id: $studentId}) RETURN u`,
    { studentId }
  );

  // Fetch accepted friends
  const friendsRes = await readQuery(
    `MATCH (s:Student {id: $studentId})-[r:FRIENDS_WITH]-(u:Student)
     WHERE r.status = 'accepted'
     RETURN DISTINCT u`,
    { studentId }
  );

  const profileMap = new Map<string, FriendProfile>();

  const mapRow = (row: any): FriendProfile => {
    const uNode = row && typeof row.get === 'function' ? row.get('u') : (row as any)?.u;
    const p = uNode?.properties || uNode;
    return {
      id: p.id,
      name: p.name || 'Unknown',
      email: p.email || '',
      xp: typeof p.xp === 'object' ? (p.xp?.low ?? p.xp?.toNumber?.() ?? 0) : (p.xp || 0),
      level: typeof p.level === 'object' ? (p.level?.low ?? p.level?.toNumber?.() ?? 1) : (p.level || 1),
    };
  };

  // Add self first (always include requester even if profile query returns empty)
  if (selfRes.length === 0) {
    const fallback = await readQuery(
      `MATCH (u:Student {id: $studentId}) RETURN u.id AS id, u.name AS name, u.email AS email, u.xp AS xp, u.level AS level`,
      { studentId }
    );
    if (fallback.length > 0) {
      const row = fallback[0];
      const getName = row && typeof row.get === 'function' ? row.get('name') : (row as any)?.name;
      const getEmail = row && typeof row.get === 'function' ? row.get('email') : (row as any)?.email;
      const getXp = row && typeof row.get === 'function' ? row.get('xp') : (row as any)?.xp;
      const getLevel = row && typeof row.get === 'function' ? row.get('level') : (row as any)?.level;
      profileMap.set(studentId, {
        id: studentId,
        name: getName || 'You',
        email: getEmail || '',
        xp: typeof getXp === 'object' ? (getXp?.low ?? 0) : (getXp || 0),
        level: typeof getLevel === 'object' ? (getLevel?.low ?? 1) : (getLevel || 1),
      });
    }
  } else {
    for (const row of selfRes) {
      const profile = mapRow(row);
      profileMap.set(profile.id, profile);
    }
  }

  // Add friends (dedup via Map)
  for (const row of friendsRes) {
    const profile = mapRow(row);
    if (!profileMap.has(profile.id)) {
      profileMap.set(profile.id, profile);
    }
  }

  // Sort by XP descending
  return Array.from(profileMap.values()).sort((a, b) => b.xp - a.xp);
}
