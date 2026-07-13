// Stress detection - Rule 7: Anti-Fake-Stress
export type StressVerdict =
  | 'GENUINE_STRESS'
  | 'AVOIDANCE_MASKED_AS_STRESS'
  | 'CRISIS_RISK'
  | 'NORMAL'
  | 'LOW_DATA';

export const ICALL_HELPLINE = '9152987821';

export interface StressInput {
  recentMoods: Array<{ stress_level: number; date: string }>;
  activeSessions7Days: number;
  quizzesAttempted7Days: number;
  avgQuizScoreStable: boolean;
}

// CRISIS_RISK: stress==5 for 3+ days, GENUINE_STRESS: stress>=4 + studying, AVOIDANCE: stress>=4 + not studying
export function computeStressVerdict(input: StressInput): StressVerdict {
  const { recentMoods, activeSessions7Days, quizzesAttempted7Days } = input;

  if (recentMoods.length === 0) {
    return 'LOW_DATA';
  }

  // Sort by date descending
  const sorted = [...recentMoods].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Check CRISIS_RISK first — stress == 5 for 3+ consecutive days
  let consecutiveCrisis = 0;
  for (const mood of sorted) {
    if (mood.stress_level === 5) {
      consecutiveCrisis++;
      if (consecutiveCrisis >= 3) {
        return 'CRISIS_RISK';
      }
    } else {
      break; // Must be consecutive from most recent
    }
  }

  // Check last 3 days of moods
  const last3Days = sorted.slice(0, 3);
  const recentHighStress = last3Days.some(m => m.stress_level >= 4);

  if (!recentHighStress) {
    return 'NORMAL';
  }

  // High stress detected — check study activity
  // Last 3 days: check active sessions and quiz attempts
  if (activeSessions7Days >= 2 && quizzesAttempted7Days > 0) {
    // Student IS studying despite stress → genuine
    return 'GENUINE_STRESS';
  }

  if (activeSessions7Days === 0 && quizzesAttempted7Days === 0) {
    // Claiming stress but zero study activity
    return 'AVOIDANCE_MASKED_AS_STRESS';
  }

  // Edge case: some activity but low
  if (activeSessions7Days <= 1) {
    return 'AVOIDANCE_MASKED_AS_STRESS';
  }

  return 'GENUINE_STRESS';
}

/**
 * Get the AI instruction string for the stress verdict
 */
export function getStressInstruction(verdict: StressVerdict): string {
  switch (verdict) {
    case 'CRISIS_RISK':
      return `PRIORITY: Student stress is at crisis level for 3+ consecutive days.
Include iCall helpline: ${ICALL_HELPLINE} in response.
Pause all academic content. Focus on emotional support first.
"If you're feeling overwhelmed, please talk to someone you trust. You can also call iCall at ${ICALL_HELPLINE} — they're trained counselors who understand student stress."`;

    case 'GENUINE_STRESS':
      return `Student is genuinely stressed but has been actively studying.
Be empathetic and supportive. Suggest a real break — they've earned it.
"I can see you've been working hard despite feeling stressed. Take a proper break today. Your brain needs rest to consolidate what you've learned."`;

    case 'AVOIDANCE_MASKED_AS_STRESS':
      return `Student claims stress but has not been studying at all recently.
Acknowledge feelings but do NOT give full break permission.
Suggest minimum 15-minute micro-session.
"I hear you — stress is real. But avoiding your subjects won't reduce it. Let's start with just 15 minutes on one topic. Small steps reduce anxiety."`;

    case 'NORMAL':
      return 'Student stress levels are normal. Proceed with regular adaptive responses.';

    case 'LOW_DATA':
      return 'Not enough mood data to assess stress. Encourage daily mood check-ins.';
  }
}

/**
 * Check if burnout alert should be shown
 * Show if stress >= 4 for 3 consecutive MoodLog nodes
 */
export function shouldShowBurnoutAlert(
  recentMoods: Array<{ stress_level: number; date: string }>
): boolean {
  if (recentMoods.length < 3) return false;

  const sorted = [...recentMoods].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  let consecutive = 0;
  for (const mood of sorted) {
    if (mood.stress_level >= 4) {
      consecutive++;
      if (consecutive >= 3) return true;
    } else {
      break;
    }
  }

  return false;
}
