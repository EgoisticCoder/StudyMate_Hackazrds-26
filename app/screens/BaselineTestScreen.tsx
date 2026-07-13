// Diagnostic baseline - subject selection, timed MCQs, pattern tracking
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
  Alert,
  Animated,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth, useLanguage } from '../../lib/context';
import { writeTransaction, readQuery } from '../../lib/neo4j';
import { v4 as uuidv4 } from 'uuid';
import { ScoreCircle } from '../../components/ScoreCircle';
import { callSarvam, parseSarvamJSON } from '../../lib/ai';
import { getStudentProfile } from '../../lib/adaptiveEngine';
import { getSubjectsForBoard } from '../../constants/subjects';
import { useTranslateSubject } from '../../lib/translations';
import { getChaptersForSubject } from '../../constants/chapters';
import { getExamProfile, getSubjectQuestionCounts, buildQuestionTypePrompt, ExamProfile } from '../../lib/examProfiles';
import { Fonts } from '../../constants/fonts';
import { Radii, Spacing } from '../../constants/colors';
import { Chip, PrimaryButton, AnimatedScreenWrapper, SectionLabel } from '../../components/ui/premium';

const PER_QUESTION_SEC = 75;
type QType = 'recall' | 'conceptual' | 'application';

interface DiagnosticQuestion {
  subject: string;
  chapter: string;
  question_type: QType;
  question: string;
  options: string[];
  correct: string;
  explanation: string;
}

type Phase = 'pick' | 'loading' | 'test' | 'feedback' | 'done';

interface AnswerRow {
  selected: string;
  correct: boolean;
  time_ms: number;
}

export default function BaselineTestScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const { language } = useLanguage();
  const translateSubject = useTranslateSubject();
  const params = useLocalSearchParams<{ 
    board?: string; classNum?: string; examId?: string;
    viewResults?: string 
  }>();

  const [phase, setPhase] = useState<Phase>(params.viewResults === 'true' ? 'loading' : 'pick');
  const [board, setBoard] = useState<'ICSE' | 'CBSE'>('ICSE');
  const [classNum, setClassNum] = useState(10);
  const [selectAll, setSelectAll] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [questions, setQuestions] = useState<DiagnosticQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [weakSubjects, setWeakSubjects] = useState<string[]>([]);
  const [weakChapters, setWeakChapters] = useState<string[]>([]);
  const [weakPatterns, setWeakPatterns] = useState<string[]>([]);
  const [patternStats, setPatternStats] = useState<Record<string, {c:number;t:number}>>({});
  const [examProfile, setExamProfile] = useState<ExamProfile | null>(null);
  const [feedbackData, setFeedbackData] = useState<{ selected: string; correct: string; isCorrect: boolean; explanation: string; subject: string; chapter: string } | null>(null);

  const [timerLeft, setTimerLeft] = useState(PER_QUESTION_SEC);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expireOnceRef = useRef(false);
  const questionStartMs = useRef(Date.now());
  const runStartedIso = useRef<string>(new Date().toISOString());
  const answersRef = useRef<AnswerRow[]>([]);
  const onPickRef = useRef<(opt: string) => void>(() => {});

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const p = await getStudentProfile(studentId);
      if (p) {
        setBoard(p.board as 'ICSE' | 'CBSE');
        setClassNum(p.class);
        const profile = getExamProfile(p.ambitions, p.board as 'ICSE' | 'CBSE');
        setExamProfile(profile);
        // Auto-select primary subjects from exam profile
        const autoSelect: Record<string, boolean> = {};
        for (const ps of profile.primarySubjects) {
          autoSelect[ps.subject] = true;
        }
        if (Object.keys(autoSelect).length > 0) setPicked(autoSelect);
      }

      // If viewResults mode, load last diagnostic results
      if (params.viewResults === 'true') {
        try {
          const recs = await readQuery(
            `MATCH (s:Student {id: $studentId})-[:TOOK_DIAGNOSTIC]->(r:DiagnosticRun)
             RETURN r.correct_total AS c, r.total_questions AS t,
                    r.ai_summary AS summary, r.weak_subjects_json AS ws,
                    r.weak_chapters_json AS wc, r.weak_patterns_json AS wp,
                    r.pattern_stats_json AS ps
             ORDER BY r.completed_at DESC LIMIT 1`,
            { studentId }
          );
          if (recs.length > 0) {
            const rec = recs[0];
            const c = Number(rec && typeof rec.get === 'function' ? rec.get('c') : (rec as any)?.c || 0);
            const t = Number(rec && typeof rec.get === 'function' ? rec.get('t') : (rec as any)?.t || 1);
            const summary = rec && typeof rec.get === 'function' ? rec.get('summary') : (rec as any)?.summary;
            const ws = rec && typeof rec.get === 'function' ? rec.get('ws') : (rec as any)?.ws;
            const wc = rec && typeof rec.get === 'function' ? rec.get('wc') : (rec as any)?.wc;
            const wp = rec && typeof rec.get === 'function' ? rec.get('wp') : (rec as any)?.wp;
            const ps = rec && typeof rec.get === 'function' ? rec.get('ps') : (rec as any)?.ps;
            setScore(c);
            setQuestions(Array.from({ length: t }, () => ({} as any)));
            setAiSummary(summary || 'Your diagnostic results are shown below.');
            try { 
              setWeakSubjects(JSON.parse(ws || '[]')); 
            } catch (e) {
              console.warn('[BaselineTest] Failed parsing weak subjects:', e);
            }
            try { 
              setWeakChapters(JSON.parse(wc || '[]')); 
            } catch (e) {
              console.warn('[BaselineTest] Failed parsing weak chapters:', e);
            }
            try { 
              setWeakPatterns(JSON.parse(wp || '[]')); 
            } catch (e) {
              console.warn('[BaselineTest] Failed parsing weak patterns:', e);
            }
            try { 
              setPatternStats(JSON.parse(ps || '{}')); 
            } catch (e) {
              console.warn('[BaselineTest] Failed parsing pattern stats:', e);
            }
            setPhase('done');
          } else {
            setPhase('pick'); // No results found, show test setup
          }
        } catch (err) {
          console.warn('[BaselineTest] Failed loading diagnostic details:', err);
          setPhase('pick');
        }
      }
    })();
  }, [studentId, params.viewResults]);

  const boardSubjects = getSubjectsForBoard(board);

  const toggleSubject = (name: string) => {
    setSelectAll(false);
    setPicked(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const toggleSelectAll = () => {
    setSelectAll(prev => !prev);
    setPicked({});
  };

  const selectedList: string[] = selectAll
    ? boardSubjects.map(s => s.name)
    : Object.keys(picked).filter(k => picked[k]);

  const buildSyllabusHint = useCallback(() => {
    return selectedList
      .map(sub => {
        const ch = getChaptersForSubject(sub, board, classNum);
        return `${sub}: ${ch.slice(0, 10).join('; ')}`;
      })
      .join('\n');
  }, [selectedList, board, classNum]);

  const generateQuestions = async () => {
    if (!studentId || selectedList.length === 0) {
      Alert.alert('Pick subjects', 'Choose one or more subjects, or select All.');
      return;
    }
    setPhase('loading');
    setLoading(true);
    runStartedIso.current = new Date().toISOString();
    try {
      const totalQs = Math.min(24, Math.max(12, selectedList.length * 3));
      const syllabus = buildSyllabusHint();

      // Build exam-aware subject distribution
      let subjectDistribution = `Subjects to cover (distribute evenly): ${selectedList.join(', ')}.`;
      if (examProfile && examProfile.primarySubjects.length > 0) {
        const counts = getSubjectQuestionCounts(examProfile, totalQs, selectedList);
        const distLines = Object.entries(counts).map(([s, c]) => `${s}: ${c} questions`).join(', ');
        subjectDistribution = `Subject distribution (follow exactly): ${distLines}.`;
      }

      // Build exam-specific question type and style hints
      const qTypeHint = examProfile ? buildQuestionTypePrompt(examProfile) : '';
      const styleHint = examProfile?.questionStylePrompt || '';

      const prompt = `You are an assessment designer for ${board} Class ${classNum}${examProfile ? ` preparing students for ${examProfile.examName}` : ''}.
Create exactly ${totalQs} multiple-choice questions. 
CRITICAL: The questions, options, and explanations MUST be written in ${language}.
${subjectDistribution}
Each question must use question_type one of: recall, conceptual, application — vary across the paper.

${qTypeHint ? qTypeHint + '\n' : ''}${styleHint ? 'EXAM STYLE GUIDANCE:\n' + styleHint + '\n' : ''}
Syllabus hints (use chapter names exactly from this list when possible):
${syllabus}

STRICT CLASS-SPECIFIC REQUIREMENTS:
- ALL questions MUST be STRICTLY for Class ${classNum} only
- NO questions from any other class (lower or higher) are allowed
- Questions MUST be fully aligned with the ${board} Class ${classNum} syllabus
- Only use topics, concepts, and difficulty levels appropriate for Class ${classNum}

CRITICAL: Inner double quotes inside any string fields (like question, options, explanation) MUST be escaped with a backslash (\") or replaced with single quotes to prevent JSON parsing errors.

Return ONLY valid JSON array (no markdown):
[{"subject":"Mathematics","chapter":"Quadratic Equations","question_type":"conceptual","question":"...","options":["","","",""],"correct":"must match one option exactly","explanation":"short"}]`;

      const raw = await callSarvam(
        [
          { role: 'system', content: 'Return only JSON array. Questions must be fair for school level.' },
          { role: 'user', content: prompt },
        ],
        'diagnostic_generator'
      );

      let parsed: DiagnosticQuestion[];
      try {
        parsed = parseSarvamJSON<DiagnosticQuestion[]>(raw);
      } catch {
        const retry = await callSarvam(
          [{ role: 'system', content: 'Output ONLY a JSON array.' }, { role: 'user', content: prompt }],
          'diagnostic_generator'
        );
        parsed = parseSarvamJSON<DiagnosticQuestion[]>(retry);
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('Could not generate questions');
      }

      const cleaned: DiagnosticQuestion[] = parsed.map((q, i) => ({
        ...q,
        subject: q.subject || selectedList[i % selectedList.length],
        chapter: q.chapter || 'Mixed',
        question_type: (['recall', 'conceptual', 'application'] as const).includes(q.question_type as QType)
          ? (q.question_type as QType)
          : 'conceptual',
        options: Array.isArray(q.options) && q.options.length >= 4 ? q.options.slice(0, 4) : ['A', 'B', 'C', 'D'],
        correct: q.correct || q.options?.[0] || 'A',
        explanation: q.explanation || '',
      }));

      setQuestions(cleaned);
      setIdx(0);
      setScore(0);
      answersRef.current = [];
      questionStartMs.current = Date.now();
      setTimerLeft(PER_QUESTION_SEC);
      setPhase('test');
    } catch (e: unknown) {
      console.error(e);
      Alert.alert('Generation failed', e instanceof Error ? e.message : 'Try again');
      setPhase('pick');
    } finally {
      setLoading(false);
    }
  };

  const persistResults = useCallback(
    async (
      finalQuestions: DiagnosticQuestion[],
      finalAnswers: AnswerRow[],
      subjectsUsed: string[],
      summaryText: string,
      weakSubj: string[],
      weakChap: string[],
      weakPat: string[],
      patStats: Record<string, {c:number;t:number}>
    ) => {
      if (!studentId) return;

      const runId = uuidv4();
      const correctTot = finalAnswers.filter(a => a.correct).length;
      const queries: Array<{ cypher: string; params: Record<string, unknown> }> = [];

      queries.push({
        cypher: `
          MATCH (s:Student {id: $studentId})
          CREATE (run:DiagnosticRun {
            id: $runId,
            started_at: datetime($started_at),
            completed_at: datetime(),
            subjects_json: $subjects_json,
            per_question_sec: $pq,
            total_questions: $total,
            correct_total: $correct_total,
            ai_summary: $summary,
            weak_subjects_json: $weak_subj,
            weak_chapters_json: $weak_chap,
            board: $board,
            student_class: $student_class,
            weak_patterns_json: $weak_pat,
            pattern_stats_json: $pattern_stats,
            exam_profile: $exam_profile
          })
          CREATE (s)-[:TOOK_DIAGNOSTIC]->(run)
        `,
        params: {
          studentId,
          runId,
          started_at: runStartedIso.current,
          subjects_json: JSON.stringify(subjectsUsed),
          pq: PER_QUESTION_SEC,
          total: finalQuestions.length,
          correct_total: correctTot,
          summary: summaryText,
          weak_subj: JSON.stringify(weakSubj),
          weak_chap: JSON.stringify(weakChap),
          board,
          student_class: classNum,
          weak_pat: JSON.stringify(weakPat),
          pattern_stats: JSON.stringify(patStats),
          exam_profile: examProfile?.examName || 'Board Exam',
        },
      });

      for (let i = 0; i < finalQuestions.length; i++) {
        const q = finalQuestions[i];
        const a = finalAnswers[i];
        const aid = uuidv4();
        queries.push({
          cypher: `
            MATCH (run:DiagnosticRun {id: $runId})
            CREATE (att:DiagnosticAttempt {
              id: $aid,
              subject: $subject,
              chapter: $chapter,
              question_type: $qtype,
              question_text: $qtext,
              options_json: $options_json,
              correct_answer: $correct_answer,
              selected_answer: $selected_answer,
              is_correct: $is_correct,
              time_ms: $time_ms,
              explanation: $explanation
            })
            CREATE (run)-[:HAS_ATTEMPT]->(att)
          `,
          params: {
            runId,
            aid,
            subject: q.subject,
            chapter: q.chapter,
            qtype: q.question_type,
            qtext: q.question,
            options_json: JSON.stringify(q.options),
            correct_answer: q.correct,
            selected_answer: a.selected,
            is_correct: a.correct,
            time_ms: a.time_ms,
            explanation: q.explanation || '',
          },
        });
      }

      const bySubject: Record<string, { c: number; t: number }> = {};
      for (let i = 0; i < finalQuestions.length; i++) {
        const sub = finalQuestions[i].subject;
        if (!bySubject[sub]) bySubject[sub] = { c: 0, t: 0 };
        bySubject[sub].t += 1;
        if (finalAnswers[i].correct) bySubject[sub].c += 1;
      }

      for (const [subject, { c, t }] of Object.entries(bySubject)) {
        const qid = uuidv4();
        queries.push({
          cypher: `
            MATCH (s:Student {id: $studentId})
            CREATE (qu:Quiz {
              id: $qid,
              subject: $subject,
              chapter: 'Diagnostic overview',
              score: $score,
              total: $total,
              date: datetime(),
              quiz_kind: 'diagnostic'
            })
            CREATE (s)-[:ATTEMPTED]->(qu)
          `,
          params: { studentId, qid, subject, score: c, total: t },
        });
      }

      await writeTransaction(queries);
    },
    [studentId, board, classNum, examProfile]
  );

  const finalize = useCallback(
    async (qList: DiagnosticQuestion[], ans: AnswerRow[]) => {
      const correctTot = ans.filter(a => a.correct).length;

      const chapterStats: Record<string, { c: number; t: number }> = {};
      for (let i = 0; i < qList.length; i++) {
        const key = `${qList[i].subject} — ${qList[i].chapter}`;
        if (!chapterStats[key]) chapterStats[key] = { c: 0, t: 0 };
        chapterStats[key].t += 1;
        if (ans[i].correct) chapterStats[key].c += 1;
      }
      const weakChapList = Object.entries(chapterStats)
        .filter(([, v]) => v.t >= 1 && v.c / v.t < 0.55)
        .map(([k]) => k);

      const subStats: Record<string, { c: number; t: number }> = {};
      for (let i = 0; i < qList.length; i++) {
        const s = qList[i].subject;
        if (!subStats[s]) subStats[s] = { c: 0, t: 0 };
        subStats[s].t += 1;
        if (ans[i].correct) subStats[s].c += 1;
      }
      const weakSubjList = Object.entries(subStats)
        .filter(([, v]) => v.c / v.t < 0.6)
        .map(([k]) => k);

      setWeakSubjects(weakSubjList);
      setWeakChapters(weakChapList);

      const pStats: Record<string, { c: number; t: number }> = {};
      for (let i = 0; i < qList.length; i++) {
        const qt = qList[i].question_type || 'conceptual';
        if (!pStats[qt]) pStats[qt] = { c: 0, t: 0 };
        pStats[qt].t += 1;
        if (ans[i].correct) pStats[qt].c += 1;
      }
      const weakPatList = Object.entries(pStats)
        .filter(([, v]) => v.t >= 1 && v.c / v.t < 0.55)
        .map(([k]) => k);
      setWeakPatterns(weakPatList);
      setPatternStats(pStats);

      let summary =
        'Diagnostic complete. Focus extra practice on highlighted weak chapters in your dashboard.';
      try {
        const brief = qList
          .map(
            (q, i) =>
              `${i + 1}. ${q.subject} / ${q.chapter} / ${q.question_type}: ${ans[i].correct ? '✓' : '✗'} (${Math.round(ans[i].time_ms / 1000)}s)`
          )
          .join('\n');

        const patternSummary = Object.entries(pStats)
          .map(([k, v]) => `${k}: ${v.c}/${v.t} (${Math.round((v.c / v.t) * 100)}%)`)
          .join(', ');

        summary = await callSarvam(
          [
            {
              role: 'system',
              content: `You are a coaching assistant. Using diagnostic MCQ results, name weak subjects/chapters AND weak question patterns (recall/conceptual/application) and tell the student how to rebalance study time. Max 120 words. Language: ${language}. Indian ${board} Class ${classNum}${examProfile ? ` (${examProfile.examName} prep)` : ''} context.`,
            },
            {
              role: 'user',
              content: `Score ${correctTot}/${qList.length}.\nWeak subjects: ${weakSubjList.join(', ')}\nWeak chapters: ${weakChapList.slice(0, 8).join('; ')}\nPattern accuracy: ${patternSummary}\nWeak patterns: ${weakPatList.join(', ') || 'none'}\nPer-question:\n${brief}`,
            },
          ],
          'baseline_analysis'
        );
      } catch (e) {
        console.warn('AI summary fallback', e);
      }

      setAiSummary(summary);
      await persistResults(qList, ans, selectedList, summary, weakSubjList, weakChapList, weakPatList, pStats);
      setPhase('done');
    },
    [persistResults, selectedList, board, classNum, examProfile, language]
  );

  const onPick = useCallback(
    (opt: string) => {
      const q = questions[idx];
      if (!q) return;

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const elapsed = Date.now() - questionStartMs.current;
      const checkCorrect = (option: string, correct: string) => {
        if (!option || !correct) return false;
        const clean = (s: string) => s.toLowerCase().replace(/^[a-d][\s).:-]+/, '').trim();
        return clean(option) === clean(correct) || option === correct;
      };

      const isCorrect = opt !== '' && checkCorrect(opt, q.correct);
      const row: AnswerRow = { selected: opt, correct: isCorrect, time_ms: elapsed };
      answersRef.current[idx] = row;

      if (isCorrect) setScore(s => s + 1);

      setFeedbackData({
        selected: opt || '(timed out)',
        correct: q.correct,
        isCorrect,
        explanation: q.explanation || 'No explanation available.',
        subject: q.subject,
        chapter: q.chapter,
      });
      setPhase('feedback');
    },
    [questions, idx]
  );

  const advanceFromFeedback = useCallback(() => {
    setFeedbackData(null);
    if (idx >= questions.length - 1) {
      const ansArr = questions.map((_, i) => answersRef.current[i] ?? { selected: '', correct: false, time_ms: 0 });
      void finalize(questions, ansArr);
      return;
    }
    setIdx(i => i + 1);
    setPhase('test');
  }, [idx, questions, finalize]);

  useEffect(() => { onPickRef.current = onPick; }, [onPick]);

  useEffect(() => {
    if (phase !== 'test' || questions.length === 0 || idx >= questions.length || !questions[idx]) return;

    expireOnceRef.current = false;
    questionStartMs.current = Date.now();
    setTimerLeft(PER_QUESTION_SEC);

    const id = setInterval(() => {
      setTimerLeft(prev => {
        if (prev <= 1) {
          clearInterval(id);
          timerRef.current = null;
          if (!expireOnceRef.current) {
            expireOnceRef.current = true;
            setTimeout(() => onPickRef.current(''), 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    timerRef.current = id;
    return () => {
      clearInterval(id);
      timerRef.current = null;
    };
  }, [phase, idx, questions]);

  if (phase === 'done') {
    return (
      <AnimatedScreenWrapper style={{ backgroundColor: colors.background }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
            paddingBottom: 40,
          }}
          showsVerticalScrollIndicator={false}
        >
          <ScoreCircle obtained={score} total={questions.length} size={120} />
          
          <Text style={[styles.title, { color: colors.textPrimary, fontFamily: Fonts.display, marginTop: 24 }]}>
            Diagnostic Results
          </Text>

          <View style={[styles.doneCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="sparkles" size={18} color={colors.accent} />
              <Text style={{ marginLeft: 8, fontSize: 15, fontWeight: '600', color: colors.textPrimary, fontFamily: Fonts.display }}>
                AI adaptation note
              </Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontFamily: Fonts.body, lineHeight: 22, fontSize: 14 }}>
              {aiSummary}
            </Text>
            {weakSubjects.length > 0 && (
              <Text style={{ color: colors.textPrimary, fontFamily: Fonts.bodyMedium, marginTop: 14, fontSize: 14 }}>
                Priority subjects: <Text style={{ color: colors.accentHover }}>{weakSubjects.join(', ')}</Text>
              </Text>
            )}
            {weakChapters.length > 0 && (
              <Text style={{ color: colors.textSecondary, fontFamily: Fonts.body, marginTop: 8, fontSize: 13 }}>
                Chapters to strengthen: {weakChapters.slice(0, 6).join(' • ')}
                {weakChapters.length > 6 ? '…' : ''}
              </Text>
            )}
          </View>

          {/* Pattern Breakdown Card */}
          {Object.keys(patternStats).length > 0 && (
            <View style={[styles.doneCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle, marginTop: 12 }]}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary, fontFamily: Fonts.display, marginBottom: 14 }}>
                Question Pattern Breakdown
              </Text>
              {Object.entries(patternStats).map(([type, { c, t }]) => {
                const pct = Math.round((c / t) * 100);
                const isWeak = pct < 55;
                const barColor = isWeak ? colors.danger : colors.success;
                return (
                  <View key={type} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 }}>
                    <Text style={{ width: 84, fontSize: 13, fontWeight: '600', color: colors.textSecondary, fontFamily: Fonts.bodyMedium, textTransform: 'capitalize' }}>
                      {type}
                    </Text>
                    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' }}>
                      <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: barColor }} />
                    </View>
                    <Text style={{ width: 44, textAlign: 'right', fontSize: 12, fontWeight: '600', color: barColor, fontFamily: Fonts.display }}>
                      {c}/{t}
                    </Text>
                    {isWeak && (
                      <View style={{ backgroundColor: colors.danger + '0c', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.danger + '18' }}>
                        <Text style={{ color: colors.danger, fontSize: 10, fontWeight: '600', fontFamily: Fonts.bodyMedium }}>Weak</Text>
                      </View>
                    )}
                  </View>
                );
              })}
              {weakPatterns.length > 0 && (
                <Text style={{ color: colors.textTertiary, fontFamily: Fonts.body, marginTop: 8, fontSize: 12, fontStyle: 'italic' }}>
                  Tip: Use Quiz → "Weak Patterns Only" to practice {weakPatterns.join(' & ')} questions.
                </Text>
              )}
            </View>
          )}

          <View style={{ width: '100%', marginTop: 24 }}>
            <PrimaryButton
              label="Done"
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace('/');
                }
              }}
            />
          </View>
        </ScrollView>
      </AnimatedScreenWrapper>
    );
  }

  if (phase === 'pick' || phase === 'loading') {
    return (
      <AnimatedScreenWrapper style={{ backgroundColor: colors.background }}>
        <ScrollView style={styles.container} contentContainerStyle={styles.pickContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity 
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace('/');
                }
              }}
              style={[styles.backBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
            >
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium }}>Diagnostic Setup</Text>
            <View style={{ width: 36 }} />
          </View>

          <Text style={[styles.headline, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Choose subjects</Text>

          {examProfile && examProfile.primarySubjects.length > 0 && (
            <View style={[styles.optimizedBadge, { backgroundColor: colors.accentMuted, borderColor: colors.accentBorder }]}>
              <Ionicons name="school-outline" size={14} color={colors.accent} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.accentHover, fontFamily: Fonts.bodyMedium }}>
                Optimized for {examProfile.examName}
              </Text>
            </View>
          )}

          <Text style={[styles.help, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
            {examProfile && examProfile.primarySubjects.length > 0
              ? `Primary subjects for ${examProfile.examName} are pre-selected. You can still customize.`
              : 'The test includes only these subjects. Pick several, or All for every subject on your board.'}
          </Text>

          <TouchableOpacity
            style={[
              styles.allBtn,
              {
                backgroundColor: selectAll ? colors.accentMuted : colors.surface1,
                borderColor: selectAll ? colors.accentBorder : colors.borderSubtle,
              },
            ]}
            onPress={toggleSelectAll}
          >
            <Text style={{ color: selectAll ? colors.accentHover : colors.textPrimary, fontFamily: Fonts.displayMedium }}>
              All subjects ({board})
            </Text>
          </TouchableOpacity>

          <View style={styles.grid}>
            {boardSubjects.map(s => {
              const on = !selectAll && !!picked[s.name];
              return (
                <Chip
                  key={s.name}
                  label={s.name}
                  selected={on}
                  onPress={() => toggleSubject(s.name)}
                />
              );
            })}
          </View>

          <Text style={[styles.timerNote, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
            {PER_QUESTION_SEC}s per question • Questions mix recall, conceptual, and application types
          </Text>

          <PrimaryButton
            label={loading ? 'Generating diagnostic...' : 'Generate & Start Test'}
            disabled={!selectedList.length || loading}
            icon={
              loading ? (
                <ActivityIndicator size="small" color={colors.textTertiary} />
              ) : (
                <Ionicons name="play" size={16} color={selectedList.length ? colors.textInverse : colors.textTertiary} />
              )
            }
            onPress={() => void generateQuestions()}
          />
        </ScrollView>
      </AnimatedScreenWrapper>
    );
  }

  if (phase === 'feedback' && feedbackData) {
    return (
      <AnimatedScreenWrapper style={{ backgroundColor: colors.background }}>
        <View style={[styles.progressBarBg, { backgroundColor: colors.surface2 }]}>
          <View style={[styles.progressBarFill, { backgroundColor: colors.accent, width: `${((idx + 1) / Math.max(questions.length, 1)) * 100}%` }]} />
        </View>
        <View style={styles.header}>
          <View style={{ width: 24 }} />
          <Text style={{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium }}>Q{idx + 1} Result</Text>
          <Text style={{ color: colors.textSecondary, fontFamily: Fonts.displayMedium }}>{score}/{idx + 1}</Text>
        </View>
        
        <ScrollView contentContainerStyle={[styles.content, { alignItems: 'center' }]} showsVerticalScrollIndicator={false}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: feedbackData.isCorrect ? colors.success + '0c' : colors.danger + '0c', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: feedbackData.isCorrect ? colors.success + '20' : colors.danger + '20' }}>
            <Ionicons name={feedbackData.isCorrect ? 'checkmark-circle' : 'close-circle'} size={40} color={feedbackData.isCorrect ? colors.success : colors.danger} />
          </View>
          
          <Text style={{ fontSize: 20, fontWeight: '700', color: feedbackData.isCorrect ? colors.success : colors.danger, fontFamily: Fonts.display, marginBottom: 8 }}>
            {feedbackData.isCorrect ? 'Correct!' : 'Incorrect'}
          </Text>
          <Text style={{ fontSize: 13, color: colors.textTertiary, fontFamily: Fonts.body, marginBottom: 24 }}>
            {translateSubject(feedbackData.subject)} • {feedbackData.chapter}
          </Text>
          
          {!feedbackData.isCorrect && (
            <View style={[styles.feedbackSubCard, { backgroundColor: colors.surface1, borderColor: colors.danger + '20' }]}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.danger, fontFamily: Fonts.display, marginBottom: 4 }}>YOUR ANSWER</Text>
              <Text style={{ fontSize: 15, color: colors.textPrimary, fontFamily: Fonts.body }}>{feedbackData.selected}</Text>
            </View>
          )}
          
          <View style={[styles.feedbackSubCard, { backgroundColor: colors.surface1, borderColor: colors.success + '20' }]}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.success, fontFamily: Fonts.display, marginBottom: 4 }}>CORRECT ANSWER</Text>
            <Text style={{ fontSize: 15, color: colors.textPrimary, fontFamily: Fonts.body }}>{feedbackData.correct}</Text>
          </View>
          
          <View style={[styles.feedbackSubCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.accentHover, fontFamily: Fonts.display, marginBottom: 6, letterSpacing: 0.5 }}>EXPLANATION</Text>
            <Text style={{ fontSize: 14, lineHeight: 22, color: colors.textSecondary, fontFamily: Fonts.body }}>{feedbackData.explanation}</Text>
          </View>
          
          <View style={{ width: '100%', marginTop: 24 }}>
            <PrimaryButton
              label={idx >= questions.length - 1 ? 'See Results' : 'Next Question'}
              icon={<Ionicons name="arrow-forward" size={16} color={colors.textInverse} />}
              onPress={advanceFromFeedback}
            />
          </View>
        </ScrollView>
      </AnimatedScreenWrapper>
    );
  }

  const q = questions[idx];
  if (!q || questions.length === 0) return null;

  return (
    <AnimatedScreenWrapper style={{ backgroundColor: colors.background }}>
      <View style={[styles.progressBarBg, { backgroundColor: colors.surface2 }]}>
        <View
          style={[
            styles.progressBarFill,
            {
              backgroundColor: colors.accent,
              width: `${(idx / Math.max(questions.length, 1)) * 100}%`,
            },
          ]}
        />
      </View>

      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/');
            }
          }}
          style={[styles.backBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
        >
          <Ionicons name="close" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium }}>Diagnostic</Text>
        <Text style={{ color: timerLeft <= 10 ? colors.danger : colors.accent, fontFamily: Fonts.display, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
          {timerLeft}s
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.meta, { color: colors.accent, fontFamily: Fonts.display }]}>
          {translateSubject(q.subject).toUpperCase()} • {q.chapter.toUpperCase()} • {q.question_type.toUpperCase()}
        </Text>
        <Text style={[styles.question, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>
          Q{idx + 1}/{questions.length}: {q.question}
        </Text>

        {q.options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.optionBtn, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}
            onPress={() => onPick(opt)}
            activeOpacity={0.8}
          >
            <Text style={{ color: colors.textPrimary, fontFamily: Fonts.body, fontSize: 15 }}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </AnimatedScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pickContent: { padding: 20, paddingBottom: 48, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    paddingVertical: 12,
    alignItems: 'center' 
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: { fontSize: 24, marginBottom: 8, marginTop: 12 },
  help: { fontSize: 14, lineHeight: 22, marginBottom: 20 },
  optimizedBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8, 
    marginBottom: 12, 
    paddingHorizontal: 14, 
    paddingVertical: 8, 
    borderRadius: Radii.chip, 
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start' 
  },
  allBtn: {
    padding: 16,
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    marginBottom: 20,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  timerNote: { fontSize: 12, marginBottom: 24, textAlign: 'center' },
  progressBarBg: { height: 3, width: '100%' },
  progressBarFill: { height: 3 },
  content: { padding: 20, paddingBottom: 40 },
  meta: { fontSize: 11, letterSpacing: 0.8, marginBottom: 12 },
  question: { fontSize: 18, marginBottom: 28, lineHeight: 26 },
  optionBtn: { 
    padding: 16, 
    borderRadius: Radii.card, 
    borderWidth: StyleSheet.hairlineWidth, 
    marginBottom: 12 
  },
  title: { fontSize: 24 },
  doneCard: {
    width: '100%',
    padding: 20,
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
  },
  feedbackSubCard: {
    width: '100%',
    borderRadius: Radii.card,
    padding: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
