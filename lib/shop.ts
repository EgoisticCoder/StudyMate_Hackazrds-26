// XP Shop — Students can spend earned XP on rewards
// Items are designed to be motivating but require substantial effort to earn

import { readQuery, writeQuery } from './neo4j';
import { v4 as uuidv4 } from 'uuid';

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'cheatsheet' | 'break' | 'bonus' | 'cosmetic' | 'premium';
  price: number;       // XP cost
  tier: 'common' | 'rare' | 'epic' | 'legendary';
  subject?: string;    // for subject-specific items
  stock?: number;      // -1 = unlimited
  unlockLevel?: number; // minimum level required
}

export interface PurchaseRecord {
  id: string;
  itemId: string;
  itemName: string;
  price: number;
  date: string;
  redeemed: boolean;
}

// ── Shop Catalog ──────────────────────────────────

export const SHOP_ITEMS: ShopItem[] = [
  // ─── COMMON (100-300 XP) ─── Quick rewards for daily motivation
  {
    id: 'break_15min',
    name: '15-Min Break Pass',
    description: 'Take a guilt-free 15-minute break. You earned it!',
    icon: 'cafe-outline',
    category: 'break',
    price: 100,
    tier: 'common',
  },
  {
    id: 'emoji_pack_1',
    name: 'Study Emoji Pack',
    description: 'Unlock special study emojis for your profile.',
    icon: 'happy-outline',
    category: 'cosmetic',
    price: 150,
    tier: 'common',
  },
  {
    id: 'extra_worksheet_math',
    name: 'Extra Maths Worksheet',
    description: 'AI-generated practice worksheet for your weak chapters.',
    icon: 'document-text-outline',
    category: 'bonus',
    price: 200,
    tier: 'common',
    subject: 'Mathematics',
  },
  {
    id: 'extra_worksheet_science',
    name: 'Extra Science Worksheet',
    description: 'AI-generated practice worksheet for Physics/Chemistry/Bio.',
    icon: 'flask-outline',
    category: 'bonus',
    price: 200,
    tier: 'common',
    subject: 'Physics',
  },
  {
    id: 'profile_badge_early',
    name: 'Early Bird Badge',
    description: 'Show off your dedication with an exclusive profile badge.',
    icon: 'ribbon-outline',
    category: 'cosmetic',
    price: 250,
    tier: 'common',
  },

  // ─── RARE (400-800 XP) ─── 1-2 weeks of consistent work
  {
    id: 'cheatsheet_math_ch1',
    name: 'Maths Formula Cheatsheet',
    description: 'Complete formula reference card for your syllabus. Print-ready.',
    icon: 'calculator-outline',
    category: 'cheatsheet',
    price: 400,
    tier: 'rare',
    subject: 'Mathematics',
  },
  {
    id: 'cheatsheet_physics',
    name: 'Physics Cheatsheet',
    description: 'All important formulas, constants & diagrams in one page.',
    icon: 'magnet-outline',
    category: 'cheatsheet',
    price: 400,
    tier: 'rare',
    subject: 'Physics',
  },
  {
    id: 'cheatsheet_chemistry',
    name: 'Chemistry Quick Ref',
    description: 'Periodic table tricks, reaction equations & key concepts.',
    icon: 'beaker-outline',
    category: 'cheatsheet',
    price: 400,
    tier: 'rare',
    subject: 'Chemistry',
  },
  {
    id: 'rest_30min',
    name: '30-Min Rest Token',
    description: 'Redeem for 30 minutes of scheduled rest, no guilt.',
    icon: 'bed-outline',
    category: 'break',
    price: 500,
    tier: 'rare',
  },
  {
    id: 'bonus_hints',
    name: 'Unlimited Hints (1 Day)',
    description: 'Skip the hint tier — get full explanations for 24 hours.',
    icon: 'bulb-outline',
    category: 'bonus',
    price: 600,
    tier: 'rare',
  },
  {
    id: 'dark_theme_custom',
    name: 'Custom Theme Colors',
    description: 'Unlock custom accent color options for your app theme.',
    icon: 'color-palette-outline',
    category: 'cosmetic',
    price: 700,
    tier: 'rare',
  },

  // ─── EPIC (1000-2000 XP) ─── ~3-4 weeks of dedicated study
  {
    id: 'holiday_pass',
    name: '1-Day Study Holiday',
    description: 'Take a full day off from study schedule. AI won\'t nudge you!',
    icon: 'sunny-outline',
    category: 'break',
    price: 1200,
    tier: 'epic',
  },
  {
    id: 'cheatsheet_all',
    name: 'Complete Cheatsheet Bundle',
    description: 'All subject cheatsheets in one purchase. Best value!',
    icon: 'library-outline',
    category: 'cheatsheet',
    price: 1500,
    tier: 'epic',
  },
  {
    id: 'mock_exam_premium',
    name: 'Premium Mock Exam',
    description: 'Full-length board-pattern mock exam with detailed AI analysis.',
    icon: 'school-outline',
    category: 'premium',
    price: 1800,
    tier: 'epic',
    unlockLevel: 5,
  },
  {
    id: 'voice_personality',
    name: 'AI Voice Personality',
    description: 'Change your AI tutor\'s speaking style to friendly/formal/fun.',
    icon: 'mic-outline',
    category: 'cosmetic',
    price: 2000,
    tier: 'epic',
    unlockLevel: 3,
  },

  // ─── LEGENDARY (3000-5000 XP) ─── ~1-2 months of serious study
  {
    id: 'holiday_week',
    name: '3-Day Study Break',
    description: 'Three consecutive days off. For serious achievers only.',
    icon: 'airplane-outline',
    category: 'break',
    price: 3000,
    tier: 'legendary',
    unlockLevel: 8,
  },
  {
    id: 'personal_tutor_session',
    name: 'AI Deep Dive Session',
    description: 'Extended 30-minute personalized AI tutoring on any topic.',
    icon: 'people-outline',
    category: 'premium',
    price: 3500,
    tier: 'legendary',
    unlockLevel: 5,
  },
  {
    id: 'leaderboard_crown',
    name: 'Leaderboard Crown',
    description: 'Show a golden crown next to your name on the leaderboard.',
    icon: 'diamond-outline',
    category: 'cosmetic',
    price: 4000,
    tier: 'legendary',
    unlockLevel: 10,
  },
  {
    id: 'ultimate_revision_kit',
    name: 'Ultimate Revision Kit',
    description: 'Complete revision package: all cheatsheets + flashcards + mindmaps for every subject.',
    icon: 'rocket-outline',
    category: 'premium',
    price: 5000,
    tier: 'legendary',
    unlockLevel: 10,
  },
];

// ── Tier styling ──────────────────────────────────

export const TIER_COLORS = {
  common: '#9896A8',
  rare: '#3B8EF3',
  epic: '#B06FFF',
  legendary: '#F5A623',
} as const;

export const TIER_LABELS = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
} as const;

// ── Purchase logic ────────────────────────────────

/**
 * Purchase an item. Deducts XP and records the purchase.
 */
export async function purchaseItem(
  studentId: string,
  item: ShopItem
): Promise<{ success: boolean; message: string; newXp?: number }> {
  // Get current XP
  const res = await readQuery(
    `MATCH (s:Student {id: $studentId}) RETURN s.xp AS xp, s.level AS level`,
    { studentId }
  );

  if (res.length === 0) return { success: false, message: 'Student not found.' };

  const record = res[0];
  const xpRaw = record && typeof record.get === 'function' ? record.get('xp') : (record as any)?.xp;
  const levelRaw = record && typeof record.get === 'function' ? record.get('level') : (record as any)?.level;
  const currentXp = typeof xpRaw === 'object' ? (xpRaw?.low ?? 0) : (xpRaw || 0);
  const currentLevel = typeof levelRaw === 'object' ? (levelRaw?.low ?? 1) : (levelRaw || 1);

  // Check level requirement
  if (item.unlockLevel && currentLevel < item.unlockLevel) {
    return { success: false, message: `Requires Level ${item.unlockLevel}. You're Level ${currentLevel}.` };
  }

  // Check XP
  if (currentXp < item.price) {
    return { success: false, message: `Not enough XP. You need ${item.price - currentXp} more XP.` };
  }

  // Check if already purchased (for one-time items)
  if (item.category === 'cosmetic' || item.category === 'cheatsheet') {
    const existing = await readQuery(
      `MATCH (s:Student {id: $studentId})-[:PURCHASED]->(p:Purchase {itemId: $itemId})
       RETURN p`,
      { studentId, itemId: item.id }
    );
    if (existing.length > 0) {
      return { success: false, message: 'You already own this item!' };
    }
  }

  // Deduct XP and record purchase
  const newXp = currentXp - item.price;
  const purchaseId = uuidv4();

  await writeQuery(
    `MATCH (s:Student {id: $studentId})
     SET s.xp = $newXp
     CREATE (p:Purchase {
       id: $purchaseId,
       itemId: $itemId,
       itemName: $itemName,
       price: $price,
       date: datetime(),
       redeemed: false
     })
     CREATE (s)-[:PURCHASED]->(p)`,
    {
      studentId,
      newXp,
      purchaseId,
      itemId: item.id,
      itemName: item.name,
      price: item.price,
    }
  );

  return { success: true, message: `Purchased "${item.name}"!`, newXp };
}

/**
 * Get purchase history for a student.
 */
export async function getPurchaseHistory(studentId: string): Promise<PurchaseRecord[]> {
  const res = await readQuery(
    `MATCH (s:Student {id: $studentId})-[:PURCHASED]->(p:Purchase)
     RETURN p ORDER BY p.date DESC`,
    { studentId }
  );

  return res.map(r => {
    const pNode = r && typeof r.get === 'function' ? r.get('p') : (r as any)?.p;
    const p = pNode?.properties || pNode;
    return {
      id: p.id,
      itemId: p.itemId,
      itemName: p.itemName,
      price: typeof p.price === 'object' ? (p.price?.low ?? 0) : (p.price || 0),
      date: p.date?.toString() || '',
      redeemed: p.redeemed || false,
    };
  });
}

/**
 * Check if student owns a specific item.
 */
export async function ownsItem(studentId: string, itemId: string): Promise<boolean> {
  const res = await readQuery(
    `MATCH (s:Student {id: $studentId})-[:PURCHASED]->(p:Purchase {itemId: $itemId})
     RETURN p LIMIT 1`,
    { studentId, itemId }
  );
  return res.length > 0;
}
