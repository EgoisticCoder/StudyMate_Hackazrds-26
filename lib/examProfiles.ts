// ═══════════════════════════════════════════════════════
// EXAM PROFILES — Real Indian Competitive Exam Patterns
// ═══════════════════════════════════════════════════════
//
// Each profile defines the exact question structure, subject
// weights, and question types for a specific Indian exam.
// Used by the diagnostic test and quiz generator to adapt
// question patterns to the student's target exam.

export interface ExamQuestionType {
  type: string;
  percentage: number;
  description: string;
}

export interface ExamSubjectWeight {
  subject: string;
  weight: number; // 0-1 fraction
  questionCount: number; // For a 24-question diagnostic
}

export interface ExamProfile {
  examName: string;
  examBody: string;
  totalMarks: number;
  totalQuestions: number;
  duration: string;
  negativeMarking: string;
  primarySubjects: ExamSubjectWeight[];
  secondarySubjects: ExamSubjectWeight[];
  questionTypes: ExamQuestionType[];
  questionStylePrompt: string;
  difficultySkew: 'balanced' | 'application-heavy' | 'factual-heavy' | 'numerical-heavy' | 'comprehension-heavy';
}

// ── JEE Main (B.E./B.Tech Paper 1) ───────────────────

const JEE_MAIN: ExamProfile = {
  examName: 'JEE Main',
  examBody: 'NTA',
  totalMarks: 300,
  totalQuestions: 90, // 30 per subject, attempt 75
  duration: '3 hours',
  negativeMarking: '-1 mark per wrong MCQ, no negative for Numerical Value',
  primarySubjects: [
    { subject: 'Physics', weight: 0.33, questionCount: 8 },
    { subject: 'Mathematics', weight: 0.33, questionCount: 8 },
    { subject: 'Chemistry', weight: 0.34, questionCount: 8 },
  ],
  secondarySubjects: [],
  questionTypes: [
    { type: 'MCQ', percentage: 80, description: 'Multiple Choice Questions with 4 options, exactly one correct' },
    { type: 'Numerical Value', percentage: 20, description: 'Answer is an integer or decimal number, no options provided' },
  ],
  questionStylePrompt: `Generate questions in JEE Main style:
- Section A: MCQs with 4 options, exactly one correct. Include conceptual traps and multi-step reasoning.
- Section B: Numerical value questions where the answer is an integer or decimal. Student types the answer.
- Questions should test application of formulas in unfamiliar contexts, not direct recall.
- Include multi-concept problems that combine 2-3 topics.
- Distractors should be common calculation errors or conceptual misconceptions.
- Difficulty: Class 11-12 NCERT + advanced problem solving.
- Negative marking: -1 for wrong MCQ, so make distractors plausible but distinguishable through careful analysis.`,
  difficultySkew: 'application-heavy',
};

// ── NEET (Medical) ────────────────────────────────────

const NEET: ExamProfile = {
  examName: 'NEET',
  examBody: 'NTA',
  totalMarks: 720,
  totalQuestions: 180,
  duration: '3 hours',
  negativeMarking: '-1 mark per wrong answer',
  primarySubjects: [
    { subject: 'Biology', weight: 0.50, questionCount: 12 },
    { subject: 'Physics', weight: 0.25, questionCount: 6 },
    { subject: 'Chemistry', weight: 0.25, questionCount: 6 },
  ],
  secondarySubjects: [],
  questionTypes: [
    { type: 'MCQ', percentage: 70, description: 'Standard MCQs testing factual recall and conceptual understanding from NCERT' },
    { type: 'Assertion-Reasoning', percentage: 15, description: 'Two statements given — Assertion (A) and Reason (R). Student picks the correct relationship.' },
    { type: 'Diagram-Based', percentage: 15, description: 'Questions based on biological diagrams, chemical structures, or physics ray diagrams' },
  ],
  questionStylePrompt: `Generate questions in NEET style:
- Strictly based on NCERT textbook content (Class 11 and 12).
- Biology questions should test exact NCERT facts, definitions, and diagram labeling.
- Physics questions should be conceptual with moderate numerical — no multi-step JEE-level problems.
- Chemistry: balance between Physical (numerical), Inorganic (factual), and Organic (reaction mechanisms).
- Include Assertion-Reasoning type questions: "Assertion (A): ... Reason (R): ..."
  Options: (a) Both A and R are correct, R explains A (b) Both correct, R does not explain A (c) A correct, R incorrect (d) A incorrect, R correct.
- Questions should be answerable in 1 minute average.
- Negative marking: -1, so distractors should be close but clearly wrong with NCERT knowledge.`,
  difficultySkew: 'factual-heavy',
};

// ── UPSC Civil Services Prelims ───────────────────────

const UPSC_PRELIMS: ExamProfile = {
  examName: 'UPSC Prelims',
  examBody: 'UPSC',
  totalMarks: 200,
  totalQuestions: 100,
  duration: '2 hours',
  negativeMarking: '-1/3 of marks for each wrong answer (-0.66)',
  primarySubjects: [
    { subject: 'History & Civics', weight: 0.20, questionCount: 5 },
    { subject: 'Geography', weight: 0.15, questionCount: 4 },
  ],
  secondarySubjects: [
    { subject: 'English', weight: 0.10, questionCount: 3 },
    { subject: 'Biology', weight: 0.10, questionCount: 2 },
    { subject: 'Physics', weight: 0.08, questionCount: 2 },
    { subject: 'Chemistry', weight: 0.07, questionCount: 2 },
    { subject: 'Mathematics', weight: 0.10, questionCount: 2 },
    { subject: 'Computer Applications', weight: 0.05, questionCount: 1 },
  ],
  questionTypes: [
    { type: 'MCQ', percentage: 60, description: 'Standard factual and analytical MCQs' },
    { type: 'Statement-Based', percentage: 25, description: 'Multiple statements given, pick which are correct: (a) 1 only (b) 1 and 2 (c) 2 and 3 (d) All' },
    { type: 'Match-the-Following', percentage: 15, description: 'Match items in Column A with Column B and select the correct combination' },
  ],
  questionStylePrompt: `Generate questions in UPSC Prelims GS Paper I style:
- Focus on analytical and interdisciplinary thinking, not pure recall.
- History: connect events to their modern significance. Include ancient, medieval, and modern Indian history.
- Geography: focus on Indian and world geography, climate, resources, with map-based thinking.
- Polity: Indian Constitution, governance, rights, and amendments.
- Include "Consider the following statements" format: give 2-3 statements, ask which are correct.
- Include "Match the following" format where applicable.
- Questions should require elimination strategy — distractors should be partially correct.
- Strict negative marking (-1/3), so questions must be precise and unambiguous.
- Connect static subjects with current affairs angles where possible.`,
  difficultySkew: 'comprehension-heavy',
};

// ── NDA (National Defence Academy) ────────────────────

const NDA: ExamProfile = {
  examName: 'NDA',
  examBody: 'UPSC',
  totalMarks: 900,
  totalQuestions: 270,
  duration: '5 hours (2.5h per paper)',
  negativeMarking: '-0.83 per wrong answer (Math), -1.33 per wrong answer (GAT)',
  primarySubjects: [
    { subject: 'Mathematics', weight: 0.33, questionCount: 8 },
    { subject: 'Physics', weight: 0.15, questionCount: 4 },
    { subject: 'Chemistry', weight: 0.10, questionCount: 3 },
  ],
  secondarySubjects: [
    { subject: 'English', weight: 0.22, questionCount: 5 },
    { subject: 'History & Civics', weight: 0.10, questionCount: 2 },
    { subject: 'Geography', weight: 0.10, questionCount: 2 },
  ],
  questionTypes: [
    { type: 'MCQ', percentage: 100, description: 'All objective MCQs with 4 options' },
  ],
  questionStylePrompt: `Generate questions in NDA written exam style:
- Paper I (Mathematics): Algebra, Trigonometry, Calculus, Matrices, Statistics, Vectors, Analytical Geometry.
  Focus on speed and accuracy — questions should be solvable in 1-2 minutes.
- Paper II (GAT) — English section: Grammar, vocabulary, comprehension passages, fill-in-the-blanks.
- Paper II (GAT) — General Knowledge: Physics, Chemistry, General Science, History, Geography, Current Events.
- All questions are MCQs with 4 options.
- Strict negative marking, so distractors should be plausible but clearly incorrect on careful analysis.
- Questions should test breadth of knowledge across subjects.
- Difficulty: Class 10-12 NCERT level, moderate complexity.`,
  difficultySkew: 'balanced',
};

// ── CA Foundation ─────────────────────────────────────

const CA_FOUNDATION: ExamProfile = {
  examName: 'CA Foundation',
  examBody: 'ICAI',
  totalMarks: 400,
  totalQuestions: 200, // approximate
  duration: '2-3 hours per paper',
  negativeMarking: '-0.25 per wrong MCQ (Papers 3 & 4 only)',
  primarySubjects: [
    { subject: 'Mathematics', weight: 0.40, questionCount: 10 },
  ],
  secondarySubjects: [
    { subject: 'English', weight: 0.25, questionCount: 6 },
    { subject: 'History & Civics', weight: 0.15, questionCount: 4 },
    { subject: 'Computer Applications', weight: 0.10, questionCount: 2 },
    { subject: 'Geography', weight: 0.10, questionCount: 2 },
  ],
  questionTypes: [
    { type: 'MCQ', percentage: 50, description: 'Objective MCQs for Quantitative Aptitude and Business Economics' },
    { type: 'Conceptual Application', percentage: 30, description: 'Apply accounting concepts and business law principles to scenarios' },
    { type: 'Numerical Problem', percentage: 20, description: 'Step-by-step numerical problems in accounting and mathematics' },
  ],
  questionStylePrompt: `Generate questions in CA Foundation exam style:
- Mathematics/Quantitative Aptitude: Business Mathematics (ratios, percentages, equations), Statistics (mean, median, probability), Logical Reasoning.
- Focus on practical application of mathematical concepts to business scenarios.
- Include step-by-step numerical problems (accounting-style calculations).
- For non-math subjects: test conceptual understanding of business, law, and economics principles.
- MCQ questions should have plausible distractors based on common calculation errors.
- Passing criteria: 40% per paper, 50% aggregate — so questions should span easy to moderate difficulty.`,
  difficultySkew: 'numerical-heavy',
};

// ── CLAT (Law Entrance) ──────────────────────────────

const CLAT: ExamProfile = {
  examName: 'CLAT',
  examBody: 'Consortium of NLUs',
  totalMarks: 120,
  totalQuestions: 120,
  duration: '2 hours',
  negativeMarking: '-0.25 per wrong answer',
  primarySubjects: [
    { subject: 'English', weight: 0.20, questionCount: 5 },
    { subject: 'History & Civics', weight: 0.25, questionCount: 6 },
  ],
  secondarySubjects: [
    { subject: 'Mathematics', weight: 0.10, questionCount: 3 },
    { subject: 'Geography', weight: 0.15, questionCount: 4 },
    { subject: 'Computer Applications', weight: 0.10, questionCount: 2 },
    { subject: 'Biology', weight: 0.05, questionCount: 1 },
    { subject: 'Physics', weight: 0.05, questionCount: 1 },
    { subject: 'Chemistry', weight: 0.05, questionCount: 1 },
  ],
  questionTypes: [
    { type: 'Comprehension-Based MCQ', percentage: 70, description: 'Read a 300-450 word passage, answer 4-5 MCQs based on it' },
    { type: 'Analytical MCQ', percentage: 20, description: 'Identify arguments, draw conclusions, detect reasoning flaws' },
    { type: 'Data Interpretation', percentage: 10, description: 'Interpret graphs, charts, or data sets and answer quantitative questions' },
  ],
  questionStylePrompt: `Generate questions in CLAT exam style:
- ALL questions should be passage-based / comprehension-based.
- English: Fiction and non-fiction reading passages testing vocabulary, inference, and grammar in context.
- Current Affairs & GK: Passage about a current event, followed by analytical questions.
- Legal Reasoning: Present a legal principle/rule, then a factual scenario. Ask how the principle applies. No prior legal knowledge needed.
- Logical Reasoning: Passages containing arguments — identify assumptions, strengthen/weaken arguments, draw conclusions.
- Quantitative Techniques: Data interpretation from charts/graphs, basic arithmetic and algebra.
- Focus on analytical reading, not rote memorization.
- Negative marking: -0.25, so questions should be precision-oriented.`,
  difficultySkew: 'comprehension-heavy',
};

// ── Software Developer (Competitive Programming Focus) ──

const SOFTWARE_DEV: ExamProfile = {
  examName: 'Board Exam + Programming Focus',
  examBody: 'School Board',
  totalMarks: 100,
  totalQuestions: 24,
  duration: '30 minutes',
  negativeMarking: 'None',
  primarySubjects: [
    { subject: 'Mathematics', weight: 0.35, questionCount: 8 },
    { subject: 'Computer Applications', weight: 0.35, questionCount: 8 },
    { subject: 'Physics', weight: 0.20, questionCount: 5 },
  ],
  secondarySubjects: [
    { subject: 'English', weight: 0.10, questionCount: 3 },
  ],
  questionTypes: [
    { type: 'MCQ', percentage: 60, description: 'Standard MCQs testing concepts' },
    { type: 'Logical Reasoning', percentage: 25, description: 'Pattern recognition, algorithmic thinking, code output prediction' },
    { type: 'Application', percentage: 15, description: 'Apply concepts to real-world scenarios' },
  ],
  questionStylePrompt: `Generate questions focused on logical and computational thinking:
- Mathematics: Focus on logic, number theory, algebra, geometry, and combinatorics that build algorithmic thinking.
- Computer Applications: Programming concepts, data structures basics, output prediction, algorithm tracing.
- Physics: Focus on concepts that relate to computing (electricity, digital logic, measurements).
- Include pattern recognition and logical reasoning questions.
- Test ability to think step-by-step and trace through processes.
- Board exam level but with a computational/logical bias.`,
  difficultySkew: 'application-heavy',
};

// ── Scientist / Researcher ────────────────────────────

const SCIENTIST: ExamProfile = {
  examName: 'JEE + Research Focus',
  examBody: 'NTA',
  totalMarks: 300,
  totalQuestions: 24,
  duration: '30 minutes',
  negativeMarking: '-1 mark per wrong MCQ',
  primarySubjects: [
    { subject: 'Physics', weight: 0.35, questionCount: 8 },
    { subject: 'Chemistry', weight: 0.30, questionCount: 7 },
    { subject: 'Mathematics', weight: 0.20, questionCount: 5 },
  ],
  secondarySubjects: [
    { subject: 'Biology', weight: 0.15, questionCount: 4 },
  ],
  questionTypes: [
    { type: 'MCQ', percentage: 60, description: 'Conceptual MCQs testing deep understanding' },
    { type: 'Numerical Value', percentage: 20, description: 'Answer is a number — multi-step calculation' },
    { type: 'Application', percentage: 20, description: 'Apply concepts to novel, real-world scientific scenarios' },
  ],
  questionStylePrompt: `Generate questions for a student aspiring to become a scientist/researcher:
- Questions should test deep conceptual understanding, not just formula application.
- Include "why" and "what if" type reasoning — e.g., "If gravity were halved, what would happen to..."
- Physics: Mechanics, electromagnetism, modern physics — focus on first principles.
- Chemistry: Physical chemistry (thermodynamics, kinetics), atomic structure, chemical bonding.
- Include beyond-syllabus conceptual extensions that encourage scientific curiosity.
- Questions should reward students who think deeply, not just memorize.
- Difficulty: JEE Advanced level for primary subjects.`,
  difficultySkew: 'application-heavy',
};

// ── Entrepreneur / Business ───────────────────────────

const ENTREPRENEUR: ExamProfile = {
  examName: 'Board Exam + Business Focus',
  examBody: 'School Board',
  totalMarks: 100,
  totalQuestions: 24,
  duration: '30 minutes',
  negativeMarking: 'None',
  primarySubjects: [
    { subject: 'Mathematics', weight: 0.30, questionCount: 7 },
    { subject: 'English', weight: 0.30, questionCount: 7 },
  ],
  secondarySubjects: [
    { subject: 'History & Civics', weight: 0.15, questionCount: 4 },
    { subject: 'Computer Applications', weight: 0.10, questionCount: 3 },
    { subject: 'Geography', weight: 0.10, questionCount: 2 },
    { subject: 'Physics', weight: 0.05, questionCount: 1 },
  ],
  questionTypes: [
    { type: 'MCQ', percentage: 50, description: 'Standard MCQs' },
    { type: 'Case-Based', percentage: 30, description: 'Read a business/real-world scenario and answer questions about it' },
    { type: 'Application', percentage: 20, description: 'Apply mathematical or analytical concepts to practical problems' },
  ],
  questionStylePrompt: `Generate questions for a student interested in entrepreneurship and business:
- Mathematics: Focus on percentages, profit/loss, statistics, data interpretation, financial literacy concepts.
- English: Reading comprehension of business articles, persuasive writing analysis, communication skills.
- Include case-study style questions: present a business scenario and ask analytical questions.
- Geography/History: Focus on economics, trade, resources, and governance.
- Questions should develop practical thinking and decision-making skills.
- Board exam level with a practical/business twist.`,
  difficultySkew: 'balanced',
};

// ── Creative / Design ─────────────────────────────────

const CREATIVE: ExamProfile = {
  examName: 'Board Exam + Creative Focus',
  examBody: 'School Board',
  totalMarks: 100,
  totalQuestions: 24,
  duration: '30 minutes',
  negativeMarking: 'None',
  primarySubjects: [
    { subject: 'English', weight: 0.40, questionCount: 10 },
  ],
  secondarySubjects: [
    { subject: 'History & Civics', weight: 0.15, questionCount: 4 },
    { subject: 'Geography', weight: 0.10, questionCount: 2 },
    { subject: 'Mathematics', weight: 0.15, questionCount: 4 },
    { subject: 'Physics', weight: 0.10, questionCount: 2 },
    { subject: 'Chemistry', weight: 0.05, questionCount: 1 },
    { subject: 'Biology', weight: 0.05, questionCount: 1 },
  ],
  questionTypes: [
    { type: 'MCQ', percentage: 40, description: 'Standard MCQs' },
    { type: 'Comprehension', percentage: 40, description: 'Reading comprehension and analytical interpretation' },
    { type: 'Application', percentage: 20, description: 'Creative application and spatial reasoning' },
  ],
  questionStylePrompt: `Generate questions for a student interested in creative arts and design:
- English: Heavy focus on literature comprehension, creative interpretation, vocabulary, and expression.
- Include questions that test visual-spatial thinking and creative reasoning.
- History/Geography: Focus on cultural aspects, art history, architectural heritage.
- Mathematics: Geometry, patterns, symmetry, spatial visualization.
- Questions should encourage creative thinking and interpretation.
- Board exam level with emphasis on comprehension and expression.`,
  difficultySkew: 'comprehension-heavy',
};

// ── Board Exam Default (ICSE) ─────────────────────────

const BOARD_ICSE: ExamProfile = {
  examName: 'ICSE Board Exam',
  examBody: 'CISCE',
  totalMarks: 80,
  totalQuestions: 24,
  duration: '2 hours',
  negativeMarking: 'None',
  primarySubjects: [], // Even distribution
  secondarySubjects: [],
  questionTypes: [
    { type: 'MCQ', percentage: 25, description: 'Multiple choice questions with 4 options' },
    { type: 'Assertion-Reasoning', percentage: 15, description: 'Two statements — Assertion and Reason — determine the relationship' },
    { type: 'Short Answer', percentage: 35, description: 'Answer in 2-4 sentences testing conceptual clarity' },
    { type: 'Application', percentage: 25, description: 'Apply concepts to case-based or real-world scenarios (ICSE competency-based)' },
  ],
  questionStylePrompt: `Generate questions in ICSE board exam style:
- Follow ICSE question paper pattern: compulsory Section A (short/objective), choice-based Section B (structured/long).
- Include MCQs, assertion-reasoning, fill-in-the-blank, and structured answer questions.
- Questions should test conceptual understanding and application (ICSE emphasis on analytical thinking ~25%).
- No negative marking — all questions carry equal weight.
- Difficulty: Strictly within ICSE Class syllabus, aligned with Selina/Concise/ML Aggarwal textbooks.
- Include diagram-based questions for Science subjects.`,
  difficultySkew: 'balanced',
};

// ── Board Exam Default (CBSE) ─────────────────────────

const BOARD_CBSE: ExamProfile = {
  examName: 'CBSE Board Exam',
  examBody: 'CBSE',
  totalMarks: 80,
  totalQuestions: 24,
  duration: '2-3 hours',
  negativeMarking: 'None',
  primarySubjects: [], // Even distribution
  secondarySubjects: [],
  questionTypes: [
    { type: 'MCQ', percentage: 20, description: 'Objective multiple choice questions' },
    { type: 'Competency-Based', percentage: 30, description: 'Case-based, source-based, and integrated questions testing competency (NEP 2020 mandate)' },
    { type: 'Short Answer', percentage: 25, description: 'Answer in 3-4 sentences' },
    { type: 'Long Answer', percentage: 25, description: 'Detailed answer with diagrams/derivations as needed' },
  ],
  questionStylePrompt: `Generate questions in CBSE board exam style:
- Follow CBSE blueprint: 20% MCQs, 30% competency-based (case/source-based), 50% short+long answer.
- Competency-based questions: provide a real-world scenario, case study, or data and ask analytical questions.
- Strictly aligned with NCERT textbook content.
- Include questions from all Bloom's taxonomy levels: Remember, Understand, Apply, Analyze.
- No negative marking.
- Include value-based questions and interdisciplinary connections where appropriate.
- Difficulty: Standard CBSE board level — mix of easy (30%), moderate (50%), and challenging (20%).`,
  difficultySkew: 'balanced',
};

// ── Keyword → Profile Mapping ─────────────────────────

const AMBITION_TO_PROFILE: Array<{ keywords: string[]; profile: ExamProfile }> = [
  { keywords: ['engineer', 'jee', 'iit'], profile: JEE_MAIN },
  { keywords: ['doctor', 'neet', 'medical', 'mbbs'], profile: NEET },
  { keywords: ['civil services', 'ias', 'ips', 'upsc'], profile: UPSC_PRELIMS },
  { keywords: ['defence', 'nda', 'military', 'army', 'navy', 'air force'], profile: NDA },
  { keywords: ['ca', 'finance', 'chartered accountant'], profile: CA_FOUNDATION },
  { keywords: ['lawyer', 'law', 'legal', 'clat'], profile: CLAT },
  { keywords: ['software', 'developer', 'programming', 'it', 'coder'], profile: SOFTWARE_DEV },
  { keywords: ['scientist', 'researcher', 'research'], profile: SCIENTIST },
  { keywords: ['entrepreneur', 'business', 'startup'], profile: ENTREPRENEUR },
  { keywords: ['creative', 'design', 'art', 'artist'], profile: CREATIVE },
];

/**
 * Get the best matching exam profile based on student ambitions.
 * Falls back to board-specific default if no competitive exam match.
 */
export function getExamProfile(
  ambitions: string[],
  board: 'ICSE' | 'CBSE' = 'ICSE'
): ExamProfile {
  for (const ambition of ambitions) {
    const lower = ambition.toLowerCase();
    for (const mapping of AMBITION_TO_PROFILE) {
      for (const keyword of mapping.keywords) {
        if (lower.includes(keyword)) {
          return mapping.profile;
        }
      }
    }
  }

  // Default to board exam pattern
  return board === 'CBSE' ? BOARD_CBSE : BOARD_ICSE;
}

/**
 * Get the exam name for display in UI.
 */
export function getExamNameForAmbitions(
  ambitions: string[],
  board: 'ICSE' | 'CBSE' = 'ICSE'
): string {
  return getExamProfile(ambitions, board).examName;
}

/**
 * Calculate subject-wise question counts for a given total,
 * using the exam profile's weights.
 */
export function getSubjectQuestionCounts(
  profile: ExamProfile,
  totalQuestions: number,
  selectedSubjects: string[]
): Record<string, number> {
  const allWeighted = [...profile.primarySubjects, ...profile.secondarySubjects];
  const counts: Record<string, number> = {};

  if (allWeighted.length === 0) {
    // Board exam default: even distribution across selected subjects
    const perSubject = Math.max(1, Math.floor(totalQuestions / selectedSubjects.length));
    let remaining = totalQuestions;
    for (let i = 0; i < selectedSubjects.length; i++) {
      const count = i < selectedSubjects.length - 1 ? perSubject : remaining;
      counts[selectedSubjects[i]] = count;
      remaining -= perSubject;
    }
    return counts;
  }

  // Filter to only selected subjects that appear in the profile
  const relevantWeights = allWeighted.filter(w =>
    selectedSubjects.includes(w.subject)
  );

  // If none of the selected subjects match the profile, distribute evenly
  if (relevantWeights.length === 0) {
    const perSubject = Math.max(1, Math.floor(totalQuestions / selectedSubjects.length));
    let remaining = totalQuestions;
    for (let i = 0; i < selectedSubjects.length; i++) {
      const count = i < selectedSubjects.length - 1 ? perSubject : remaining;
      counts[selectedSubjects[i]] = count;
      remaining -= perSubject;
    }
    return counts;
  }

  // Normalize weights for selected subjects
  const totalWeight = relevantWeights.reduce((sum, w) => sum + w.weight, 0);
  let assigned = 0;

  for (let i = 0; i < relevantWeights.length; i++) {
    const w = relevantWeights[i];
    if (i === relevantWeights.length - 1) {
      counts[w.subject] = totalQuestions - assigned;
    } else {
      const count = Math.max(1, Math.round((w.weight / totalWeight) * totalQuestions));
      counts[w.subject] = count;
      assigned += count;
    }
  }

  // Add any selected subjects not in the profile with 1 question each
  const profileSubjects = new Set(allWeighted.map(w => w.subject));
  const extraSubjects = selectedSubjects.filter(s => !profileSubjects.has(s));
  for (const sub of extraSubjects) {
    counts[sub] = 1;
  }

  return counts;
}

/**
 * Build the question type distribution string for the AI prompt.
 */
export function buildQuestionTypePrompt(profile: ExamProfile): string {
  const lines = profile.questionTypes.map(
    qt => `- ${qt.percentage}% ${qt.type}: ${qt.description}`
  );
  return `Question type distribution:\n${lines.join('\n')}`;
}
