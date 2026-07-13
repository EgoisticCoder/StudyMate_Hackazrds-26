// Adaptive Engine - Core StudyMate AI logic
// Rules: live-computed weakness, recency weighting (7d=3.0, 8-30d=1.5, older=0.5), 4 behavioral states, ambition-weighted priority, motive-based AI tone
// buildStudentContext() called before every Sarvam AI call

import { Platform } from 'react-native';
import { readQuery } from './neo4j';
import { getPrioritySubjects, getMotiveTone } from './ambitionMapping';
import { getExamProfile, getExamNameForAmbitions } from './examProfiles';
import { computeStressVerdict, getStressInstruction, StressVerdict } from './stressDetection';

export type BehavioralState =
  | 'EMPIRICALLY_WEAK'
  | 'AVOIDED_AND_WEAK'
  | 'AVOIDED_BUT_STRONG'
  | 'ACTIVE_AND_STRONG'
  | 'INSUFFICIENT_DATA';

export type StudentSignal =
  | 'BORING_AND_WEAK'
  | 'BORING_BUT_FINE'
  | 'LOVES_BUT_STRUGGLES'
  | 'NORMAL'
  | 'UNKNOWN';

export interface SubjectState {
  subject: string;
  state: BehavioralState;
  weighted_avg: number;
  attempts: number;
  interest_level: number;
  confidence_level: number;
  student_signal: StudentSignal;
}

export interface StudentProfile {
  id: string;
  email?: string;
  name: string;
  school: string;
  class: number;
  board: string;
  ambitions: string[];
  motives: string[];
  daily_study_mins: number;
  peak_study_time: string;
  has_textbooks: boolean;
  commitment_level: string;
  streak: number;
  // Parent notes — hidden from student, used only by AI
  parent_study_notes?: string;
  parent_weakness_notes?: string;
  parent_notes_updated_at?: string;
}

// ── Behavioral State Classification ────────────────────

function classifyBehavioralState(
  attempts: number,
  weighted_avg: number
): BehavioralState {
  // RULE 3: Four behavioral states

  if (attempts >= 2 && weighted_avg < 0.60) {
    // Student tries but genuinely struggles
    return 'EMPIRICALLY_WEAK';
  }

  if (attempts < 2 && weighted_avg < 0.60) {
    // Avoids it AND weak when attempted — MOST DANGEROUS
    return 'AVOIDED_AND_WEAK';
  }

  if (attempts < 2 && weighted_avg >= 0.75) {
    // Avoids it but actually fine — just boring
    return 'AVOIDED_BUT_STRONG';
  }

  if (attempts >= 2 && weighted_avg >= 0.75) {
    // Engaging and performing well
    return 'ACTIVE_AND_STRONG';
  }

  // Middle ground (0.60 - 0.75)
  if (attempts >= 2) {
    return 'EMPIRICALLY_WEAK'; // Lean toward weak for safety
  }
  return 'AVOIDED_AND_WEAK';
}

// ── Student Signal (Boring vs Weak) ────────────────────

function classifyStudentSignal(
  interest_level: number,
  state: BehavioralState
): StudentSignal {
  // RULE 4: Cross-reference interest with behavioral state

  if (interest_level <= 2 && state === 'AVOIDED_AND_WEAK') {
    // Student dislikes it AND is actually weak
    return 'BORING_AND_WEAK';
  }

  if (interest_level <= 2 && state === 'AVOIDED_BUT_STRONG') {
    // Just dislikes it, performing okay
    return 'BORING_BUT_FINE';
  }

  if (interest_level >= 4 && state === 'EMPIRICALLY_WEAK') {
    // Likes it but still weak — needs technique help
    return 'LOVES_BUT_STRUGGLES';
  }

  return 'NORMAL';
}

// ── Build Student Context ──────────────────────────────

export async function buildStudentContext(studentId: string): Promise<string> {
  // Run all Neo4j queries in parallel with safety fallbacks for offline performance
  const safeReadQuery = async (query: string, params: any) => {
    try {
      return await readQuery(query, params);
    } catch (err) {
      console.warn('Neo4j read query failed inside buildStudentContext:', err);
      return [];
    }
  };

  const [
    studentRecords,
    quizRecords,
    activityRecords,
    moodRecords,
    sessionRecords,
    answerRecords,
    subjectRelRecords,
    diagnosticChapterRecords,
  ] = await Promise.all([
    // Query 1: Student base profile
    safeReadQuery(
      `MATCH (s:Student {id: $studentId}) RETURN s`,
      { studentId }
    ),

    // Query 2: Live weakness computation (recency weighted, last 60 days)
    safeReadQuery(
      `MATCH (s:Student {id: $studentId})-[:ATTEMPTED]->(q:Quiz)
       WHERE q.date > datetime() - duration('P60D')
       WITH q.subject AS subject,
            q.chapter AS chapter,
            q.date AS date,
            q.score AS score,
            q.total AS total,
            CASE
              WHEN q.date > datetime() - duration('P7D') THEN 3.0
              WHEN q.date > datetime() - duration('P30D') THEN 1.5
              ELSE 0.5
            END AS weight
       WITH subject,
            sum((toFloat(score)/total) * weight) / sum(weight) AS weighted_avg,
            count(*) AS attempts
       RETURN subject, weighted_avg, attempts
       ORDER BY weighted_avg ASC`,
      { studentId }
    ),

    // Query 3: Subject activity last 14 days
    safeReadQuery(
      `MATCH (s:Student {id: $studentId})-[:ATTEMPTED]->(q:Quiz)
       WHERE q.date > datetime() - duration('P14D')
       RETURN q.subject AS subject, count(q) AS recent_attempts`,
      { studentId }
    ),

    // Query 4: Mood last 7 days
    safeReadQuery(
      `MATCH (s:Student {id: $studentId})-[:LOGGED_MOOD]->(m:MoodLog)
       WHERE m.date > datetime() - duration('P7D')
       RETURN m.stress_level AS stress_level, m.source AS source, m.date AS date
       ORDER BY m.date DESC`,
      { studentId }
    ),

    // Query 5: Study sessions last 7 days
    safeReadQuery(
      `MATCH (s:Student {id: $studentId})-[:STUDIED]->(ss:StudySession)
       WHERE ss.date > datetime() - duration('P7D')
       RETURN ss.subject AS subject, ss.date AS date, ss.duration_mins AS duration_mins`,
      { studentId }
    ),

    // Query 6: Answer submission performance last 30 days
    safeReadQuery(
      `MATCH (s:Student {id: $studentId})-[:SUBMITTED]->(a:AnswerSubmission)
       WHERE a.date > datetime() - duration('P30D')
       RETURN a.subject AS subject, 
              avg(toFloat(a.marks_obtained)/a.marks_max) AS avg_marks`,
      { studentId }
    ),

    // Query 7: Subject relationship (interest baseline)
    safeReadQuery(
      `MATCH (s:Student {id: $studentId})-[:HAS_RELATIONSHIP]->(sr:SubjectRelationship)
       RETURN sr.subject AS subject, sr.interest_level AS interest_level, 
              sr.confidence_level AS confidence_level`,
      { studentId }
    ),

    safeReadQuery(
      `MATCH (s:Student {id: $studentId})-[:TOOK_DIAGNOSTIC]->(run:DiagnosticRun)-[:HAS_ATTEMPT]->(a:DiagnosticAttempt)
       WHERE run.completed_at > datetime() - duration('P400D')
       WITH a.subject AS subject, a.chapter AS chapter,
            avg(CASE WHEN a.is_correct THEN 1.0 ELSE 0.0 END) AS acc,
            count(*) AS n
       RETURN subject, chapter, acc, n
       ORDER BY acc ASC`,
      { studentId }
    ),
  ]);

  // ── Parse Student Profile ──────────────────────────
  let student: StudentProfile;
  if (studentRecords.length === 0) {
    const cached = await getStudentProfile(studentId);
    if (!cached) {
      return 'ERROR: Student not found in database and offline cache is empty.';
    }
    student = cached;
  } else {
    const record = studentRecords[0];
    const sNode = record && typeof record.get === 'function' ? record.get('s') : (record as any)?.s;
    const sProps = sNode?.properties || sNode;
    student = {
      id: sProps.id,
      email: typeof sProps.email === 'string' ? sProps.email : undefined,
      name: sProps.name || 'Student',
      school: sProps.school || 'Unknown',
      class: typeof sProps.class === 'number' ? sProps.class : parseInt(sProps.class) || 10,
      board: sProps.board || 'ICSE',
      ambitions: Array.isArray(sProps.ambitions) ? sProps.ambitions : [],
      motives: Array.isArray(sProps.motives) ? sProps.motives : [],
      daily_study_mins: sProps.daily_study_mins || 60,
      peak_study_time: sProps.peak_study_time || 'Evening',
      has_textbooks: sProps.has_textbooks ?? true,
      commitment_level: sProps.commitment_level || 'committed',
      streak: sProps.streak || 0,
      parent_study_notes: typeof sProps.parent_study_notes === 'string' ? sProps.parent_study_notes : undefined,
      parent_weakness_notes: typeof sProps.parent_weakness_notes === 'string' ? sProps.parent_weakness_notes : undefined,
      parent_notes_updated_at: sProps.parent_notes_updated_at?.toString() || undefined,
    };
  }

  // ── Exam Profile Detection ─────────────────────────
  const examProfile = getExamProfile(student.ambitions, student.board as 'ICSE' | 'CBSE');
  const examName = examProfile.examName;

  // ── Build Subject Interest Map ─────────────────────
  const interestMap: Record<string, { interest: number; confidence: number }> = {};
  for (const rec of subjectRelRecords) {
    const subject = rec && typeof rec.get === 'function' ? rec.get('subject') : (rec as any)?.subject;
    const interest = rec && typeof rec.get === 'function' ? rec.get('interest_level') : (rec as any)?.interest_level;
    const confidence = rec && typeof rec.get === 'function' ? rec.get('confidence_level') : (rec as any)?.confidence_level;
    interestMap[subject] = {
      interest: interest || 3,
      confidence: confidence || 3,
    };
  }

  // ── Build Recent Activity Map ──────────────────────
  const recentActivityMap: Record<string, number> = {};
  for (const rec of activityRecords) {
    const subject = rec && typeof rec.get === 'function' ? rec.get('subject') : (rec as any)?.subject;
    const attempts = rec && typeof rec.get === 'function' ? rec.get('recent_attempts') : (rec as any)?.recent_attempts;
    recentActivityMap[subject] = attempts || 0;
  }

  // ── Build Subject States (RULES 3 + 4) ────────────
  const subject_states: SubjectState[] = [];
  const processedSubjects = new Set<string>();

  // Process subjects with quiz data
  for (const rec of quizRecords) {
    const subject = rec && typeof rec.get === 'function' ? rec.get('subject') : (rec as any)?.subject;
    const weighted_avg = rec && typeof rec.get === 'function' ? rec.get('weighted_avg') : (rec as any)?.weighted_avg || 0;
    const attempts14d = recentActivityMap[subject] || 0;

    const interest = interestMap[subject]?.interest ?? 3;
    const confidence = interestMap[subject]?.confidence ?? 3;

    const state = classifyBehavioralState(attempts14d, weighted_avg);
    const signal = classifyStudentSignal(interest, state);

    subject_states.push({
      subject,
      state,
      weighted_avg: Math.round(weighted_avg * 100),
      attempts: attempts14d,
      interest_level: interest,
      confidence_level: confidence,
      student_signal: signal,
    });

    processedSubjects.add(subject);
  }

  // Add subjects with relationship data but no quizzes
  for (const rec of subjectRelRecords) {
    const subject = rec && typeof rec.get === 'function' ? rec.get('subject') : (rec as any)?.subject;
    if (!processedSubjects.has(subject)) {
      const interest = rec && typeof rec.get === 'function' ? rec.get('interest_level') : (rec as any)?.interest_level || 3;
      const confidence = rec && typeof rec.get === 'function' ? rec.get('confidence_level') : (rec as any)?.confidence_level || 3;

      // No quiz data = treated as avoided
      const state: BehavioralState = confidence <= 2 ? 'AVOIDED_AND_WEAK' : 'INSUFFICIENT_DATA';
      const signal = classifyStudentSignal(interest, state);

      subject_states.push({
        subject,
        state,
        weighted_avg: 0,
        attempts: 0,
        interest_level: interest,
        confidence_level: confidence,
        student_signal: signal,
      });
    }
  }

  // Sort by weighted_avg ascending (worst first)
  subject_states.sort((a, b) => a.weighted_avg - b.weighted_avg);

  // ── Compute Priority Subjects (RULE 5) ─────────────
  const priority_subjects = getPrioritySubjects(student.ambitions);

  // ── Critical Subjects ──────────────────────────────
  const critical_subjects = subject_states
    .filter(
      s =>
        (s.state === 'AVOIDED_AND_WEAK' || s.state === 'EMPIRICALLY_WEAK') &&
        priority_subjects.includes(s.subject)
    )
    .map(s => s.subject);

  // ── Mood & Stress Analysis (RULE 7) ────────────────
  const recentMoods = moodRecords.map(r => {
    const stress = r && typeof r.get === 'function' ? r.get('stress_level') : (r as any)?.stress_level;
    const date = r && typeof r.get === 'function' ? r.get('date') : (r as any)?.date;
    const source = r && typeof r.get === 'function' ? r.get('source') : (r as any)?.source;
    return {
      stress_level: stress || 0,
      date: date?.toString() || new Date().toISOString(),
      source: source || '',
    };
  });

  const sessionCount = sessionRecords.length;
  const totalStudyMins = sessionRecords.reduce(
    (sum, r) => {
      const duration = r && typeof r.get === 'function' ? r.get('duration_mins') : (r as any)?.duration_mins;
      return sum + (duration || 0);
    },
    0
  );
  const quizzesThisWeek = activityRecords.reduce(
    (sum, r) => {
      const attempts = r && typeof r.get === 'function' ? r.get('recent_attempts') : (r as any)?.recent_attempts;
      return sum + (attempts || 0);
    },
    0
  );

  const stress_verdict: StressVerdict = computeStressVerdict({
    recentMoods,
    activeSessions7Days: sessionCount,
    quizzesAttempted7Days: quizzesThisWeek,
    avgQuizScoreStable: true, // Simplified — would need historical comparison
  });

  const moodSummary = recentMoods.length > 0
    ? `${recentMoods.length} entries, avg stress: ${(
        recentMoods.reduce((s, m) => s + m.stress_level, 0) / recentMoods.length
      ).toFixed(1)}/5`
    : 'No mood data this week';

  // ── Answer Grading Performance ─────────────────────
  const answerPerfLines: string[] = [];
  for (const rec of answerRecords) {
    const subject = rec && typeof rec.get === 'function' ? rec.get('subject') : (rec as any)?.subject;
    const avg = rec && typeof rec.get === 'function' ? rec.get('avg_marks') : (rec as any)?.avg_marks;
    if (subject && avg !== null) {
      answerPerfLines.push(`${subject}: ${(avg * 100).toFixed(0)}% avg marks`);
    }
  }
  const answerPerfSummary =
    answerPerfLines.length > 0 ? answerPerfLines.join('\n  ') : 'No graded answers yet';

  // ── Motive Tone (RULE 6) ───────────────────────────
  const motiveTone = getMotiveTone(student.motives);

  const diagnosticLines: string[] = [];
  for (const rec of diagnosticChapterRecords) {
    const sub = rec && typeof rec.get === 'function' ? rec.get('subject') : (rec as any)?.subject;
    const ch = rec && typeof rec.get === 'function' ? rec.get('chapter') : (rec as any)?.chapter;
    const acc = rec && typeof rec.get === 'function' ? rec.get('acc') : (rec as any)?.acc;
    const n = rec && typeof rec.get === 'function' ? rec.get('n') : (rec as any)?.n;
    const pct =
      typeof acc === 'number'
        ? Math.round(acc * 100)
        : Math.round(parseFloat(String(acc)) * 100);
    diagnosticLines.push(`${sub} — ${ch}: ${pct}% (${n} questions)`);
  }
  const diagnosticSummary =
    diagnosticLines.length > 0
      ? diagnosticLines.join('\n')
      : 'No recent diagnostic attempts on file.';

  // ── Parent Observations (confidential) ──────────────
  const parentStudyNotes = student.parent_study_notes || '';
  const parentWeaknessNotes = student.parent_weakness_notes || '';
  const hasParentNotes = parentStudyNotes || parentWeaknessNotes;

  // ── Build the Context String ───────────────────────

  return `
═══════════════════════════════════════
STUDENT BEHAVIORAL PROFILE — LIVE DATA
Computed at: ${new Date().toISOString()}
═══════════════════════════════════════

IDENTITY:
Name: ${student.name}
Email: ${student.email || 'Not linked'}
Class: ${student.class} ${student.board}
School: ${student.school}
Ambitions: ${student.ambitions.join(', ') || 'Not set'}
Motives: ${student.motives.join(', ') || 'Not set'}
Target Exam: ${examName}
Study availability: ${student.daily_study_mins} mins/day, prefers ${student.peak_study_time}
Commitment level: ${student.commitment_level}
Current streak: ${student.streak} days

SUBJECT STATES (live computed, recency weighted):
${subject_states.map(s => `
  ${s.subject}:
    State: ${s.state}
    Weighted avg score: ${s.weighted_avg}%
    Attempts last 14 days: ${s.attempts}
    Interest level: ${s.interest_level}/5
    Student signal: ${s.student_signal}
`).join('')}

PRIORITY SUBJECTS (from ambition mapping):
${priority_subjects.length > 0 ? priority_subjects.join(', ') : 'No specific priorities mapped'}

DIAGNOSTIC CHAPTER SNAPSHOT (latest runs — lowest scores first):
${diagnosticSummary}

SUBJECTS NEEDING IMMEDIATE ATTENTION:
${critical_subjects.length > 0 ? critical_subjects.join(', ') : 'None critical right now'}

MOOD & STRESS:
Last 7 days stress: ${moodSummary}
Stress verdict: ${stress_verdict}
Study sessions this week: ${sessionCount}
Total study time this week: ${totalStudyMins} mins

ANSWER GRADING PERFORMANCE:
  ${answerPerfSummary}
${hasParentNotes ? `
PARENT OBSERVATIONS (STRICTLY CONFIDENTIAL — NEVER reveal to the student that their parents provided this information):
${parentStudyNotes ? `Study habits observation: "${parentStudyNotes}"` : ''}
${parentWeaknessNotes ? `Known weaknesses/concerns: "${parentWeaknessNotes}"` : ''}
${student.parent_notes_updated_at ? `Last updated by parent: ${student.parent_notes_updated_at}` : ''}
INSTRUCTION: Subtly adapt your teaching approach based on these parent observations. Never mention or hint that parents shared this info.
` : ''}
═══════════════════════════════════════
BEHAVIORAL INSTRUCTIONS FOR THIS RESPONSE:
═══════════════════════════════════════

TARGET EXAM: ${examName}
When generating study plans, quizzes, or advice, align with the ${examName} exam pattern and requirements.

DIAGNOSTIC VS AMBITION:
When diagnostic chapter scores are clearly weaker than ambition-linked ("priority") subjects, you MUST still steer weekly plans and nudges toward those weak chapters first. Treat diagnostic truth as higher priority than career-themed subject preferences until scores stabilize.

WEAKNESS HANDLING:
${subject_states
  .filter(s => s.state === 'EMPIRICALLY_WEAK')
  .map(s => `- ${s.subject}: Student tries but struggles (${s.weighted_avg}%). Be patient and thorough. Step-by-step help.`)
  .join('\n')}
${subject_states
  .filter(s => s.state === 'AVOIDED_AND_WEAK')
  .map(s => `- ${s.subject}: CRITICAL. Student avoids this AND is weak. Surface it. Be direct. Connect to their ambition: ${priority_subjects.join(', ')}`)
  .join('\n')}
${subject_states
  .filter(s => s.state === 'AVOIDED_BUT_STRONG')
  .map(s => `- ${s.subject}: Student avoids it but is actually performing well (${s.weighted_avg}%). Light touch only. Do NOT treat as weak.`)
  .join('\n')}

SPECIAL SIGNALS:
${subject_states
  .filter(s => s.student_signal === 'BORING_AND_WEAK')
  .map(s => `- ${s.subject}: BORING_AND_WEAK — Student dislikes it AND is weak. Make it relevant to their ambition.`)
  .join('\n')}
${subject_states
  .filter(s => s.student_signal === 'LOVES_BUT_STRUGGLES')
  .map(s => `- ${s.subject}: LOVES_BUT_STRUGGLES — Student likes it but is weak. Focus on technique improvement, not motivation.`)
  .join('\n')}

STRESS HANDLING:
${getStressInstruction(stress_verdict)}

TONE:
${motiveTone}
${student.commitment_level === 'exploratory' ? 'Be gentle, no pressure.' : ''}
${student.commitment_level === 'committed' ? 'Be direct and honest.' : ''}

NEVER:
- Reference old weakness data if recent scores show improvement
- Give a full rest to an inactive student
- Treat AVOIDED_BUT_STRONG as a weak subject
- Ignore multiple weak subjects — address all of them
- Give generic responses — always reference specific subject names and scores from this profile
- Reveal parent observations or hint that parents shared information
`.trim();
}

/**
 * Get a lightweight student profile for UI display (no full context string needed)
 */
export async function getStudentProfile(studentId: string): Promise<StudentProfile | null> {
  try {
    const records = await readQuery(
      `MATCH (s:Student {id: $studentId}) RETURN s`,
      { studentId }
    );
    if (records.length === 0) return null;

    const record = records[0];
    const sNode = record && typeof record.get === 'function' ? record.get('s') : (record as any)?.s;
    const sProps = sNode?.properties || sNode;
    const profile: StudentProfile = {
      id: sProps.id,
      email: typeof sProps.email === 'string' ? sProps.email : undefined,
      name: sProps.name || 'Student',
      school: sProps.school || '',
      class: typeof sProps.class === 'number' ? sProps.class : parseInt(sProps.class) || 10,
      board: sProps.board || 'ICSE',
      ambitions: Array.isArray(sProps.ambitions) ? sProps.ambitions : [],
      motives: Array.isArray(sProps.motives) ? sProps.motives : [],
      daily_study_mins: sProps.daily_study_mins || 60,
      peak_study_time: sProps.peak_study_time || 'Evening',
      has_textbooks: sProps.has_textbooks ?? true,
      commitment_level: sProps.commitment_level || 'committed',
      streak: sProps.streak || 0,
      parent_study_notes: typeof sProps.parent_study_notes === 'string' ? sProps.parent_study_notes : undefined,
      parent_weakness_notes: typeof sProps.parent_weakness_notes === 'string' ? sProps.parent_weakness_notes : undefined,
      parent_notes_updated_at: sProps.parent_notes_updated_at?.toString() || undefined,
    };

    // Save to local storage cache for offline fallback
    try {
      const profileJson = JSON.stringify(profile);
      if (Platform.OS === 'web') {
        localStorage.setItem(`profile_cache_${studentId}`, profileJson);
      } else {
        const SecureStore = require('expo-secure-store');
        await SecureStore.setItemAsync(`profile_cache_${studentId}`, profileJson);
      }
    } catch (storageErr) {
      console.warn('Failed to cache profile locally:', storageErr);
    }

    return profile;
  } catch (err) {
    console.warn('Neo4j read profile failed, trying local cache fallback...', err);
    try {
      let cached: string | null = null;
      if (Platform.OS === 'web') {
        cached = localStorage.getItem(`profile_cache_${studentId}`);
      } else {
        const SecureStore = require('expo-secure-store');
        cached = await SecureStore.getItemAsync(`profile_cache_${studentId}`);
      }
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (cacheErr) {
      console.warn('Failed to load profile from cache:', cacheErr);
    }
    return null;
  }
}

/**
 * Get subject states for UI display (computed live)
 */
export async function getSubjectStates(studentId: string): Promise<SubjectState[]> {
  try {
    const context = await buildStudentContext(studentId);
    // Parse the subject states from context string
    // This is a simplified version — the full data is available in the context
    const [quizRecords, activityRecords, subjectRelRecords] = await Promise.all([
      readQuery(
        `MATCH (s:Student {id: $studentId})-[:ATTEMPTED]->(q:Quiz)
         WHERE q.date > datetime() - duration('P60D')
         WITH q.subject AS subject,
              q.date AS date,
              q.score AS score,
              q.total AS total,
              CASE
                WHEN q.date > datetime() - duration('P7D') THEN 3.0
                WHEN q.date > datetime() - duration('P30D') THEN 1.5
                ELSE 0.5
              END AS weight
         WITH subject,
              sum((toFloat(score)/total) * weight) / sum(weight) AS weighted_avg,
              count(*) AS attempts
         RETURN subject, weighted_avg, attempts
         ORDER BY weighted_avg ASC`,
        { studentId }
      ),
      readQuery(
        `MATCH (s:Student {id: $studentId})-[:ATTEMPTED]->(q:Quiz)
         WHERE q.date > datetime() - duration('P14D')
         RETURN q.subject AS subject, count(q) AS recent_attempts`,
        { studentId }
      ),
      readQuery(
        `MATCH (s:Student {id: $studentId})-[:HAS_RELATIONSHIP]->(sr:SubjectRelationship)
         RETURN sr.subject AS subject, sr.interest_level AS interest_level, 
                sr.confidence_level AS confidence_level`,
        { studentId }
      ),
    ]);

    const recentActivityMap: Record<string, number> = {};
    for (const rec of activityRecords) {
      const subject = rec && typeof rec.get === 'function' ? rec.get('subject') : (rec as any)?.subject;
      const attempts = rec && typeof rec.get === 'function' ? rec.get('recent_attempts') : (rec as any)?.recent_attempts;
      recentActivityMap[subject] = attempts || 0;
    }

    const interestMap: Record<string, { interest: number; confidence: number }> = {};
    for (const rec of subjectRelRecords) {
      const subject = rec && typeof rec.get === 'function' ? rec.get('subject') : (rec as any)?.subject;
      const interest = rec && typeof rec.get === 'function' ? rec.get('interest_level') : (rec as any)?.interest_level;
      const confidence = rec && typeof rec.get === 'function' ? rec.get('confidence_level') : (rec as any)?.confidence_level;
      interestMap[subject] = {
        interest: interest || 3,
        confidence: confidence || 3,
      };
    }

    const states: SubjectState[] = [];
    const processed = new Set<string>();

    for (const rec of quizRecords) {
      const subject = rec && typeof rec.get === 'function' ? rec.get('subject') : (rec as any)?.subject;
      const weighted_avg = rec && typeof rec.get === 'function' ? rec.get('weighted_avg') : (rec as any)?.weighted_avg || 0;
      const attempts14d = recentActivityMap[subject] || 0;
      const interest = interestMap[subject]?.interest ?? 3;
      const confidence = interestMap[subject]?.confidence ?? 3;
      const state = classifyBehavioralState(attempts14d, weighted_avg);
      const signal = classifyStudentSignal(interest, state);

      states.push({
        subject, state,
        weighted_avg: Math.round(weighted_avg * 100),
        attempts: attempts14d,
        interest_level: interest,
        confidence_level: confidence,
        student_signal: signal,
      });
      processed.add(subject);
    }

    for (const rec of subjectRelRecords) {
      const subject = rec && typeof rec.get === 'function' ? rec.get('subject') : (rec as any)?.subject;
      if (!processed.has(subject)) {
        const interest = rec && typeof rec.get === 'function' ? rec.get('interest_level') : (rec as any)?.interest_level || 3;
        const confidence = rec && typeof rec.get === 'function' ? rec.get('confidence_level') : (rec as any)?.confidence_level || 3;
        const state: BehavioralState = confidence <= 2 ? 'AVOIDED_AND_WEAK' : 'INSUFFICIENT_DATA';
        const signal = classifyStudentSignal(interest, state);
        states.push({
          subject, state,
          weighted_avg: 0, attempts: 0,
          interest_level: interest,
          confidence_level: confidence,
          student_signal: signal,
        });
      }
    }

    states.sort((a, b) => a.weighted_avg - b.weighted_avg);
    return states;
  } catch (err) {
    console.warn('getSubjectStates failed:', err);
    return [];
  }
}
