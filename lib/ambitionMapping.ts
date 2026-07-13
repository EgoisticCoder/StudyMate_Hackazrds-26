// Ambition to priority subject mapping
// Used by the adaptive engine to weight subject urgency

// Re-export exam profile system
export { getExamProfile, getExamNameForAmbitions, getSubjectQuestionCounts, buildQuestionTypePrompt } from './examProfiles';
export type { ExamProfile, ExamQuestionType, ExamSubjectWeight } from './examProfiles';

export interface AmbitionMapping {
  keywords: string[];
  prioritySubjects: string[];
}

export const AMBITION_SUBJECT_MAP: AmbitionMapping[] = [
  {
    keywords: ['Doctor', 'NEET', 'Medical'],
    prioritySubjects: ['Biology', 'Chemistry'],
  },
  {
    keywords: ['Engineer', 'JEE', 'IIT'],
    prioritySubjects: ['Mathematics', 'Physics'],
  },
  {
    keywords: ['CA', 'Finance', 'Chartered Accountant'],
    prioritySubjects: ['Mathematics'],
  },
  {
    keywords: ['Civil Services', 'IAS', 'IPS', 'UPSC'],
    prioritySubjects: ['History & Civics', 'Geography'],
  },
  {
    keywords: ['Scientist', 'Researcher', 'Research'],
    prioritySubjects: ['Physics', 'Chemistry', 'Biology'],
  },
  {
    keywords: ['Software', 'Developer', 'Programming', 'IT'],
    prioritySubjects: ['Computer Applications', 'Mathematics'],
  },
  {
    keywords: ['Creative', 'Design', 'Art'],
    prioritySubjects: ['English'],
  },
  {
    keywords: ['Lawyer', 'Law', 'Legal'],
    prioritySubjects: ['English', 'History & Civics'],
  },
  {
    keywords: ['Defence', 'NDA', 'Military', 'Army', 'Navy', 'Air Force'],
    prioritySubjects: ['Mathematics', 'Physics'],
  },
  {
    keywords: ['Entrepreneur', 'Business', 'Startup'],
    prioritySubjects: ['Mathematics', 'English'],
  },
];

/**
 * Given a student's ambitions array, determine priority subjects.
 * Returns a unique list of subjects that are high-priority for their career goals.
 */
export function getPrioritySubjects(ambitions: string[]): string[] {
  const prioritySet = new Set<string>();

  for (const ambition of ambitions) {
    const lower = ambition.toLowerCase();
    for (const mapping of AMBITION_SUBJECT_MAP) {
      for (const keyword of mapping.keywords) {
        if (lower.includes(keyword.toLowerCase())) {
          for (const subject of mapping.prioritySubjects) {
            prioritySet.add(subject);
          }
        }
      }
    }
  }

  return Array.from(prioritySet);
}

/**
 * Get the motive-based tone instructions for the AI
 */
export function getMotiveTone(motives: string[]): string {
  const tones: string[] = [];

  for (const motive of motives) {
    const lower = motive.toLowerCase();
    if (lower.includes('catch up') || lower.includes('behind')) {
      tones.push('Be structured and urgent. Create daily plans.');
    }
    if (lower.includes('family') || lower.includes('pressure') || lower.includes('expects')) {
      tones.push('Be empathetic and stress-aware. Acknowledge family pressure.');
    }
    if (lower.includes('consistency') || lower.includes('motivation')) {
      tones.push('Be streak-focused. Provide daily nudges and celebrate consistency.');
    }
    if (lower.includes('love learning') || lower.includes('genuinely')) {
      tones.push('Offer depth and beyond-syllabus insights. Feed their curiosity.');
    }
    if (lower.includes('jee') || lower.includes('neet') || lower.includes('competitive')) {
      tones.push('Focus on exam patterns and time pressure. Be competition-aware.');
    }
    if (lower.includes('exploratory') || lower.includes('explore')) {
      tones.push('Be gentle with no pressure. Let them discover at their own pace.');
    }
  }

  return tones.length > 0 ? tones.join(' ') : 'Be encouraging and supportive.';
}
