// Quiz Play - MCQ with timer, explanations
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { buildStudentContext } from '../../lib/adaptiveEngine';
import { callSarvam, parseSarvamJSON } from '../../lib/ai';
import { writeQuery } from '../../lib/neo4j';
import { searchStudyReferences, formatSnippetsForPrompt } from '../../lib/webSearch';
import { ScoreCircle } from '../../components/ScoreCircle';
import { v4 as uuidv4 } from 'uuid';
import { progressMission } from '../../lib/missions';
import { Fonts } from '../../constants/fonts';

interface QuizQuestion {
  question: string;
  options: string[];
  correct: string;
  explanation: string;
}

export default function QuizPlayScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const params = useLocalSearchParams<{
    subject: string; difficulty: string;
    count: string; board: string; classNum: string;
    patternFilter?: string;
  }>();

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [timer, setTimer] = useState(30);
  const [totalTime, setTotalTime] = useState(0);
  const [finished, setFinished] = useState(false);
  const [wrongAnswers, setWrongAnswers] = useState<Array<{ q: QuizQuestion; selected: string }>>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Generate quiz
  useEffect(() => {
    generateQuiz();
  }, []);

  // Timer
  useEffect(() => {
    if (!loading && !finished && !answered) {
      timerRef.current = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            handleSelect(''); // Time's up
            return 30;
          }
          return prev - 1;
        });
        setTotalTime(prev => prev + 1);
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading, finished, answered, current]);

  const generateQuiz = async () => {
    setLoading(true);
    setError('');
    try {
      const context = studentId ? await buildStudentContext(studentId) : '';
      let refBlock = '';
      try {
        const snippets = await searchStudyReferences(
          `${params.board} class ${params.classNum} ${params.subject} textbook ICSE CBSE ML Aggarwal Concise Selina`
        );
        refBlock = formatSnippetsForPrompt(snippets).slice(0, 3500);
      } catch {
        refBlock = '';
      }
      // Build pattern constraint if set
      let patternHint = '';
      if (params.patternFilter) {
        const patterns = params.patternFilter.split(',').filter(Boolean);
        if (patterns.length === 1) {
          patternHint = `\nQuestion type focus: Generate ONLY ${patterns[0]} type questions (${patterns[0] === 'recall' ? 'testing direct factual memory' : patterns[0] === 'conceptual' ? 'testing understanding of concepts and why things work' : 'testing ability to apply concepts to new situations'}).`;
        } else if (patterns.length > 1) {
          patternHint = `\nQuestion type focus: Generate 70% ${patterns.join(' and ')} type questions and 30% other types. The student is weak in these patterns.`;
        }
      }

      const prompt = `${context}

SYLLABUS / BOOK REFERENCES (titles only — align questions; do not copy long excerpts):
${refBlock || '(none)'}

Generate ${params.count || 5} MCQ questions for ${params.board} Class ${params.classNum} in ${params.subject}.
Difficulty: ${params.difficulty || 'Medium'}.${patternHint}

STRICT CLASS-SPECIFIC REQUIREMENTS:
- ALL questions MUST be STRICTLY for Class ${params.classNum} only
- NO questions from any other class (lower or higher) are allowed
- Questions MUST be fully aligned with the ${params.board} Class ${params.classNum} syllabus
- Only use topics, concepts, and difficulty levels appropriate for Class ${params.classNum}

Return ONLY a valid JSON array. No markdown. No extra text. Just the array. 
The 'correct' field MUST match one of the strings in the 'options' array EXACTLY.
[{"question":"string","options":["Choice 1","Choice 2","Choice 3","Choice 4"],"correct":"Choice 1","explanation":"string"}]`;

      const response = await callSarvam(
        [{ role: 'system', content: 'You are a quiz generator. Return only valid JSON.' }, { role: 'user', content: prompt }],
        'quiz_generator'
      );

      let parsed: QuizQuestion[];
      try {
        parsed = parseSarvamJSON<QuizQuestion[]>(response);
      } catch {
        // Retry with cleaner prompt
        const retry = await callSarvam(
          [{ role: 'system', content: 'Return ONLY a JSON array of quiz questions. No other text.' }, { role: 'user', content: prompt }],
          'quiz_generator'
        );
        parsed = parseSarvamJSON<QuizQuestion[]>(retry);
      }

      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Invalid quiz data');
      setQuestions(parsed);
    } catch (err: any) {
      setError(err.message || 'Failed to generate quiz');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (option: string) => {
    if (answered) return;
    setSelected(option);
    setAnswered(true);
    if (timerRef.current) clearInterval(timerRef.current);

    const isCorrect = (opt: string, correct: string) => {
      if (!opt || !correct) return false;
      const clean = (s: string) => s.toLowerCase().replace(/^[a-d][\s).:-]+/, '').trim();
      return clean(opt) === clean(correct) || opt === correct;
    };

    const isRight = isCorrect(option, questions[current]?.correct);
    if (isRight) setScore(prev => prev + 1);
    else if (option) {
      setWrongAnswers(prev => [...prev, { q: questions[current], selected: option }]);
    }
  };

  const handleNext = () => {
    if (current >= questions.length - 1) {
      finishQuiz();
      return;
    }
    setCurrent(prev => prev + 1);
    setSelected(null);
    setAnswered(false);
    setTimer(30);
  };

  const finishQuiz = async () => {
    setFinished(true);
    if (!studentId) return;
    try {
      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (q:Quiz {
           id: $quizId, subject: $subject,
           score: $score, total: $total, difficulty: $difficulty,
           time_taken: $timeTaken, date: datetime()
         })
         CREATE (s)-[:ATTEMPTED]->(q)`,
        {
          studentId,
          quizId: uuidv4(),
          subject: params.subject,
          score,
          total: questions.length,
          difficulty: params.difficulty,
          timeTaken: totalTime,
        }
      );
      
      // Hook gamification
      progressMission(studentId, 'quiz_completed', 1, params.subject).catch(err => console.error('Gamification mission update failed:', err));
      
    } catch (err) {
      console.error('Failed to save quiz:', err);
    }
  };

  const getGrade = () => {
    const pct = (score / questions.length) * 100;
    if (pct >= 90) return 'A+';
    if (pct >= 75) return 'A';
    if (pct >= 60) return 'B';
    if (pct >= 40) return 'C';
    return 'F';
  };

  // Loading state
  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>Generating quiz...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={[styles.errorText, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Failed to generate quiz</Text>
        <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.accent }]} onPress={generateQuiz}>
          <Text style={[{ color: colors.textInverse, fontWeight: '600', fontFamily: Fonts.displayMedium }]}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => {
  try {
    router.back();
  } catch {
    router.replace('/');
  }
}} style={{ marginTop: 16 }}>
          <Text style={[{ color: colors.textSecondary, fontFamily: Fonts.body }]}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Results
  if (finished) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.resultTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Quiz Complete!</Text>
        <ScoreCircle obtained={score} total={questions.length} label={getGrade()} />
        <View style={styles.resultStats}>
          <View style={[styles.resultStat, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
            <Text style={[styles.resultStatValue, { color: colors.textPrimary, fontFamily: Fonts.display }]}>{getGrade()}</Text>
            <Text style={[styles.resultStatLabel, { color: colors.textTertiary, fontFamily: Fonts.bodyMedium }]}>Grade</Text>
          </View>
          <View style={[styles.resultStat, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
            <Text style={[styles.resultStatValue, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
              {Math.floor(totalTime / 60)}:{String(totalTime % 60).padStart(2, '0')}
            </Text>
            <Text style={[styles.resultStatLabel, { color: colors.textTertiary, fontFamily: Fonts.bodyMedium }]}>Time</Text>
          </View>
        </View>

        {wrongAnswers.length > 0 && (
          <View style={[styles.wrongSection, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
            <Text style={[styles.wrongTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Questions You Got Wrong</Text>
            {wrongAnswers.map((w, i) => (
              <View key={i} style={[styles.wrongItem, { borderBottomColor: colors.borderSubtle }]}>
                <Text style={[styles.wrongQ, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>{w.q.question}</Text>
                <Text style={[styles.wrongYour, { color: colors.danger, fontFamily: Fonts.body }]}>Your answer: {w.selected}</Text>
                <Text style={[styles.wrongCorrect, { color: colors.success, fontFamily: Fonts.bodyMedium }]}>Correct: {w.q.correct}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity style={[styles.doneBtn, { backgroundColor: colors.accent }]} onPress={() => {
  try {
    router.back();
  } catch {
    router.replace('/');
  }
}}>
          <Text style={[{ color: colors.textInverse, fontSize: 15, fontWeight: '600', fontFamily: Fonts.display }]}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Quiz play
  const q = questions[current];
  const timerColor = timer <= 5 ? colors.danger : timer <= 10 ? colors.warning : colors.textPrimary;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Progress bar */}
      <View style={[styles.progressBarBg, { backgroundColor: colors.borderSubtle }]}>
        <View style={[styles.progressBarFill, {
          backgroundColor: colors.accent,
          width: `${((current + 1) / questions.length) * 100}%`,
        }]} />
      </View>

      {/* Header */}
      <View style={styles.quizHeader}>
        <TouchableOpacity onPress={() => {
  try {
    router.back();
  } catch {
    router.replace('/');
  }
}} style={{ padding: 4 }}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={[styles.questionNum, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>Q{current + 1} OF {questions.length}</Text>
        <View style={[
          styles.timerBadge, 
          { 
            backgroundColor: timer <= 5 
              ? colors.danger + '1A' 
              : timer <= 10 
                ? colors.warning + '1A' 
                : colors.surface2 
          }
        ]}>
          <Ionicons name="time-outline" size={14} color={timerColor} />
          <Text style={[styles.timerText, { color: timerColor, fontFamily: Fonts.displayMedium }]}>{timer}:00</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.quizContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.questionText, { color: colors.textPrimary, fontFamily: Fonts.display }]}>{q.question}</Text>

        {q.options.map((opt, i) => {
          const LETTERS = ['A', 'B', 'C', 'D'];
          const letter = LETTERS[i] || '';
          const isCorrect = (option: string, correct: string) => {
            if (!option || !correct) return false;
            const clean = (s: string) => s.toLowerCase().replace(/^[a-d][\s).:-]+/, '').trim();
            return clean(option) === clean(correct) || option === correct;
          };
          const isOptCorrect = isCorrect(opt, q.correct);
          const isSelected = opt === selected;
          let optBg = colors.surface1;
          let optBorder = colors.borderSubtle;
          let optTextColor = colors.textPrimary;
          let letterBg = colors.surface3;
          let letterColor = colors.textSecondary;

          if (answered) {
            if (isOptCorrect) {
              optBg = colors.success + '1A'; optBorder = colors.success; optTextColor = colors.textPrimary;
              letterBg = colors.success; letterColor = colors.textInverse;
            }
            else if (isSelected) {
              optBg = colors.danger + '1A'; optBorder = colors.danger; optTextColor = colors.textPrimary;
              letterBg = colors.danger; letterColor = colors.textInverse;
            }
          } else if (isSelected) {
            optBg = colors.accentMuted; optBorder = colors.accentBorder;
            letterBg = colors.accent; letterColor = colors.textInverse;
          }

          return (
            <TouchableOpacity
              key={i}
              style={[styles.optionBtn, { backgroundColor: optBg, borderColor: optBorder }]}
              onPress={() => handleSelect(opt)}
              disabled={answered}
            >
              <View style={[styles.letterBadge, { backgroundColor: letterBg }]}>
                <Text style={[styles.letterText, { color: letterColor, fontFamily: Fonts.display }]}>{letter}</Text>
              </View>
              <Text style={[styles.optionText, { color: optTextColor, fontFamily: Fonts.body }]}>{opt}</Text>
              {answered && isOptCorrect && <Ionicons name="checkmark-circle" size={20} color={colors.success} />}
              {answered && isSelected && !isOptCorrect && <Ionicons name="close-circle" size={20} color={colors.danger} />}
            </TouchableOpacity>
          );
        })}

        {/* Explanation sheet */}
        {answered && (
          <View style={[styles.explanationSheet, { backgroundColor: colors.surface3, borderColor: colors.borderSubtle, borderWidth: StyleSheet.hairlineWidth }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.borderSubtle }]} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="bulb" size={18} color={colors.warning} />
              <Text style={[styles.expSheetTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Why this is correct</Text>
            </View>
            <Text style={[styles.expSheetText, { color: colors.textSecondary, fontFamily: Fonts.body }]}>{q.explanation}</Text>
          </View>
        )}
      </ScrollView>

      {/* Next button */}
      {answered && (
        <TouchableOpacity style={[styles.nextQuizBtn, { backgroundColor: colors.accent }]} onPress={handleNext}>
          <Text style={[{ color: colors.textInverse, fontSize: 15, fontWeight: '600', fontFamily: Fonts.display }]}>
            {current >= questions.length - 1 ? 'See Results' : 'Next Question'}
          </Text>
          <Ionicons name="arrow-forward" size={18} color={colors.textInverse} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 16, fontSize: 15, fontWeight: '500' },
  errorText: { marginTop: 12, fontSize: 16, fontWeight: '600' },
  retryBtn: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  progressBarBg: { height: 5, width: '100%' },
  progressBarFill: { height: 5, borderRadius: 3 },
  quizHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
  },
  questionNum: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  timerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
  },
  timerText: { fontSize: 13, fontWeight: '800' },
  quizContent: { padding: 20, paddingBottom: 100 },
  questionText: { fontSize: 20, fontWeight: '600', lineHeight: 30, marginBottom: 28 },
  optionBtn: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, marginBottom: 10, gap: 12,
  },
  letterBadge: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  letterText: {
    fontSize: 14, fontWeight: '700',
  },
  optionText: { fontSize: 15, flex: 1, lineHeight: 22 },
  explanationSheet: {
    borderRadius: 20, padding: 24, marginTop: 16,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 16,
  },
  expSheetTitle: {
    fontSize: 16, fontWeight: '700',
  },
  expSheetText: {
    fontSize: 14, lineHeight: 22,
  },
  nextQuizBtn: {
    position: 'absolute', bottom: 24, left: 20, right: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 12,
  },
  resultContent: { padding: 24, alignItems: 'center', paddingBottom: 40 },
  resultTitle: { fontSize: 28, fontWeight: '800', marginBottom: 24, letterSpacing: -0.5 },
  resultStats: { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 24 },
  resultStat: {
    flex: 1, padding: 18, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center',
  },
  resultStatValue: { fontSize: 24, fontWeight: '800' },
  resultStatLabel: { fontSize: 11, marginTop: 6, fontWeight: '600', letterSpacing: 0.5 },
  wrongSection: {
    width: '100%', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 18, marginBottom: 20,
  },
  wrongTitle: { fontSize: 16, fontWeight: '700', marginBottom: 14 },
  wrongItem: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  wrongQ: { fontSize: 14, fontWeight: '500', marginBottom: 6, lineHeight: 20 },
  wrongYour: { fontSize: 13, marginBottom: 3 },
  wrongCorrect: { fontSize: 13, fontWeight: '700' },
  doneBtn: {
    width: '100%', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8,
  },
});
