// Subject definitions for ICSE and CBSE boards

export interface SubjectDef {
  name: string;
  icon: string; // Ionicons name
  boards: ('ICSE' | 'CBSE')[];
}

export const SUBJECTS: SubjectDef[] = [
  { name: 'Physics', icon: 'flash-outline', boards: ['ICSE', 'CBSE'] },
  { name: 'Chemistry', icon: 'flask-outline', boards: ['ICSE', 'CBSE'] },
  { name: 'Mathematics', icon: 'calculator-outline', boards: ['ICSE', 'CBSE'] },
  { name: 'Biology', icon: 'leaf-outline', boards: ['ICSE', 'CBSE'] },
  { name: 'Computer Applications', icon: 'code-slash-outline', boards: ['ICSE', 'CBSE'] },
  { name: 'History & Civics', icon: 'book-outline', boards: ['ICSE', 'CBSE'] },
  { name: 'English', icon: 'document-text-outline', boards: ['ICSE', 'CBSE'] },
  { name: 'Geography', icon: 'globe-outline', boards: ['ICSE', 'CBSE'] },
];

export const getSubjectsForBoard = (board: 'ICSE' | 'CBSE'): SubjectDef[] => {
  return SUBJECTS.filter(s => s.boards.includes(board));
};

export const AMBITION_OPTIONS = [
  { label: 'Doctor', icon: 'medkit-outline' },
  { label: 'Engineer', icon: 'construct-outline' },
  { label: 'CA / Finance', icon: 'trending-up-outline' },
  { label: 'Civil Services (IAS/IPS)', icon: 'shield-outline' },
  { label: 'Scientist / Researcher', icon: 'telescope-outline' },
  { label: 'Software Developer', icon: 'laptop-outline' },
  { label: 'Creative / Design', icon: 'color-palette-outline' },
  { label: 'Lawyer', icon: 'briefcase-outline' },
  { label: 'Defence / NDA', icon: 'flag-outline' },
  { label: 'Entrepreneur', icon: 'rocket-outline' },
];

export const MOTIVE_OPTIONS = [
  'Perform better in exams',
  'Build a strong foundation',
  'Catch up — I am behind',
  'Crack JEE / NEET / competitive exam',
  'Family expects high marks',
  'I genuinely love learning',
  'Improve specific weak subjects',
  'Build consistency — I lose motivation',
];

export const CLASS_OPTIONS = [6, 7, 8, 9, 10, 11, 12];

export const BOARD_OPTIONS: ('ICSE' | 'CBSE')[] = ['ICSE', 'CBSE'];

export const STUDY_TIME_OPTIONS = [
  { label: '<30 min', value: 25 },
  { label: '30-60 min', value: 45 },
  { label: '1-2 hr', value: 90 },
  { label: '2-3 hr', value: 150 },
  { label: '3 hr+', value: 200 },
];

export const PEAK_TIME_OPTIONS = ['Morning', 'Afternoon', 'Evening', 'Late Night'];

export const STRESS_SOURCES = ['Exams', 'Parents', 'Peers', 'Self pressure', 'Other'];
