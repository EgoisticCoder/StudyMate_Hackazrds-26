// MOCK EXAM GENERATOR — Generates full exam paper in ICSE/CBSE format, student photographs answers for grading
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator, Image, Animated, Easing,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme, useAuth } from '../../lib/context';
import { buildStudentContext, getStudentProfile } from '../../lib/adaptiveEngine';
import { callSarvam, callSarvamVision, parseSarvamJSON } from '../../lib/ai';
import { writeQuery } from '../../lib/neo4j';
import { SUBJECTS } from '../../constants/subjects';
import { ScoreCircle } from '../../components/ScoreCircle';
import { v4 as uuidv4 } from 'uuid';
import { Chip, SectionLabel } from '../../components/ui/premium';
import { Fonts } from '../../constants/fonts';

type ExamType = 'Mid-Term' | 'Final' | 'Board Pattern';

export default function MockExamScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [step, setStep] = useState<'config' | 'paper' | 'upload' | 'result'>('config');
  const [subject, setSubject] = useState('');
  const [examType, setExamType] = useState<ExamType>('Board Pattern');
  const [paper, setPaper] = useState('');
  const [loading, setLoading] = useState(false);
  const [board, setBoard] = useState('ICSE');
  const [classNum, setClassNum] = useState(10);
  const [images, setImages] = useState<string[]>([]);
  const [imagesBase64, setImagesBase64] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const profile = await getStudentProfile(studentId);
      if (profile) { setBoard(profile.board); setClassNum(profile.class); }
    })();
  }, [studentId]);

  const generatePaper = async () => {
    if (!subject || !studentId) return;
    setLoading(true);
    try {
      const context = await buildStudentContext(studentId);
      const result = await callSarvam(
        [
          { role: 'system', content: `You are a ${board} exam paper setter for Class ${classNum}. ${context}` },
          {
            role: 'user',
            content: `Generate a complete ${examType} exam paper for ${subject}, ${board} Class ${classNum}.

Format exactly as a real ${board} exam paper:

${subject.toUpperCase()} — ${examType.toUpperCase()} EXAMINATION
Class ${classNum} | ${board} | Time: 2 Hours | Maximum Marks: 80

SECTION A — Objective (20 marks)
(10 MCQ/fill-in-the-blank/true-false questions, 2 marks each)

SECTION B — Short Answer (20 marks)
(5 questions, 4 marks each — answer in 3-4 sentences)

SECTION C — Long Answer (24 marks)
(3 questions, 8 marks each — answer in paragraphs with diagrams if needed)

SECTION D — Application (16 marks)
(2 real-world application questions, 8 marks each)

Bias questions toward this student's WEAK areas. Make it realistic and exam-appropriate.

STRICT CLASS-SPECIFIC REQUIREMENTS:
- ALL questions MUST be STRICTLY for Class ${classNum} only
- NO questions from any other class (lower or higher) are allowed
- Questions MUST be fully aligned with the ${board} Class ${classNum} syllabus
- Only use topics, concepts, and difficulty levels appropriate for Class ${classNum}`,
          },
        ],
        'quiz_generator'
      );
      setPaper(result);
      setStep('paper');
    } catch (err: any) {
      setPaper(err.message || 'Failed to generate paper');
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (!res.canceled && res.assets[0]) {
      setImages(prev => [...prev, res.assets[0].uri]);
      setImagesBase64(prev => [...prev, res.assets[0].base64 || '']);
    }
  };

  const handleGradePaper = async () => {
    if (imagesBase64.length === 0 || !studentId) return;
    setLoading(true);
    try {
      const context = await buildStudentContext(studentId);
      // Grade using first image (primary answer sheet)
      const gradeResult = await callSarvamVision(
        `You are a strict ${board} examiner. ${context}`,
        imagesBase64[0],
        `This student's answer sheet for a ${subject} ${examType} exam (${board} Class ${classNum}).
Grade the complete paper. Return ONLY valid JSON:
{
  "section_a": {"obtained": number, "max": 20},
  "section_b": {"obtained": number, "max": 20},
  "section_c": {"obtained": number, "max": 24},
  "section_d": {"obtained": number, "max": 16},
  "total_obtained": number,
  "total_max": 80,
  "predicted_board_grade": "string",
  "strengths": ["string"],
  "weaknesses": ["string"],
  "improvement_plan": ["string"],
  "examiner_note": "string"
}`,
        'answer_grader'
      );

      const parsed = parseSarvamJSON<any>(gradeResult);
      setResult(parsed);
      setStep('result');

      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (a:AnswerSubmission {
           id: $id, subject: $subject, chapter: 'Mock Exam',
           question: $examType, marks_obtained: $obtained,
           marks_max: $max, feedback: $weaknesses, date: datetime()
         })
         CREATE (s)-[:SUBMITTED]->(a)`,
        {
          studentId, id: uuidv4(), subject, examType,
          obtained: parsed.total_obtained, max: parsed.total_max,
          weaknesses: parsed.weaknesses,
        }
      );
    } catch (err: any) {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  // Animations
  const screenFade = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(screenFade, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.ScrollView
      style={[styles.container, { backgroundColor: colors.background, opacity: screenFade }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          try {
            router.back();
          } catch {
            router.replace('/');
          }
        }} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Mock Exam</Text>
        <View style={{ width: 32 }} />
      </View>

      {step === 'config' && (
        <>
          <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
            Generate a complete exam paper, write your answers on paper, photograph them for AI grading
          </Text>

          <SectionLabel text="SELECT SUBJECT" style={{ marginBottom: 12 }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {SUBJECTS.map(s => (
              <Chip
                key={s.name}
                label={s.name}
                selected={subject === s.name}
                onPress={() => setSubject(s.name)}
              />
            ))}
          </ScrollView>

          <SectionLabel text="EXAM TYPE" style={{ marginBottom: 12 }} />
          <View style={styles.typeRow}>
            {(['Mid-Term', 'Final', 'Board Pattern'] as ExamType[]).map(t => (
              <View key={t} style={{ flex: 1 }}>
                <Chip
                  label={t}
                  selected={examType === t}
                  onPress={() => setExamType(t)}
                />
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[
              styles.generateBtn, 
              { backgroundColor: subject ? colors.accent : colors.surface3 }
            ]}
            onPress={generatePaper} disabled={!subject || loading}
          >
            {loading ? <ActivityIndicator color={colors.textInverse} /> : (
              <>
                <Ionicons name="document-text-outline" size={18} color={subject ? colors.textInverse : colors.textTertiary} />
                <Text style={{ color: subject ? colors.textInverse : colors.textTertiary, fontSize: 15, fontWeight: '600', fontFamily: Fonts.display }}>
                  Generate Exam Paper
                </Text>
              </>
            )}
          </TouchableOpacity>
        </>
      )}

      {step === 'paper' && (
        <>
          <View style={[styles.paperCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
            <View style={styles.paperHeader}>
              <Ionicons name="document-text-outline" size={18} color={colors.accent} />
              <Text style={[styles.paperTitle, { color: colors.accent, fontFamily: Fonts.display }]}>{subject} — {examType}</Text>
            </View>
            <Text style={[styles.paperText, { color: colors.textPrimary, fontFamily: Fonts.body }]}>{paper}</Text>
          </View>

          <TouchableOpacity style={[styles.generateBtn, { backgroundColor: colors.accent }]}
            onPress={() => setStep('upload')}>
            <Ionicons name="camera-outline" size={18} color={colors.textInverse} />
            <Text style={{ color: colors.textInverse, fontSize: 15, fontWeight: '600', fontFamily: Fonts.display }}>I've written my answers — Upload</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'upload' && (
        <>
          <SectionLabel text="PHOTOGRAPH YOUR ANSWER SHEETS" style={{ marginBottom: 16 }} />
          <View style={styles.imageGrid}>
            {images.map((img, i) => (
              <View key={i} style={styles.imgThumb}>
                <Image source={{ uri: img }} style={styles.thumbImg} />
                <TouchableOpacity style={[styles.removeImg, { backgroundColor: colors.danger }]}
                  onPress={() => { setImages(prev => prev.filter((_, j) => j !== i)); setImagesBase64(prev => prev.filter((_, j) => j !== i)); }}>
                  <Ionicons name="close" size={12} color="#FFF" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={[styles.addImgBtn, { borderColor: colors.borderSubtle }]} onPress={handlePickImage}>
              <Ionicons name="add" size={24} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {images.length > 0 && (
            <TouchableOpacity style={[styles.generateBtn, { backgroundColor: colors.accent }]}
              onPress={handleGradePaper} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.textInverse} /> : (
                <Text style={{ color: colors.textInverse, fontSize: 15, fontWeight: '600', fontFamily: Fonts.display }}>Grade My Paper</Text>
              )}
            </TouchableOpacity>
          )}
        </>
      )}

      {step === 'result' && result && (
        <>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <ScoreCircle obtained={result.total_obtained} total={result.total_max}
              label={result.predicted_board_grade || 'Grade'} />
          </View>

          <Text style={[styles.predGrade, { color: colors.accent, fontFamily: Fonts.display }]}>
            Predicted Board Grade: {result.predicted_board_grade}
          </Text>

          {[
            { label: 'Section A (Objective)', ...result.section_a, color: colors.info },
            { label: 'Section B (Short)', ...result.section_b, color: colors.success },
            { label: 'Section C (Long)', ...result.section_c, color: colors.accent },
            { label: 'Section D (Application)', ...result.section_d, color: colors.warning },
          ].map(s => (
            <View key={s.label} style={styles.sectionScore}>
              <Text style={[styles.sectionLabel, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>{s.label}</Text>
              <View style={[styles.sectionBar, { backgroundColor: colors.borderSubtle }]}>
                <View style={[styles.sectionFill, { width: `${(s.obtained / s.max) * 100}%`, backgroundColor: s.color }]} />
              </View>
              <Text style={[styles.sectionVal, { color: colors.textSecondary, fontFamily: Fonts.display }]}>{s.obtained}/{s.max}</Text>
            </View>
          ))}

          {result.examiner_note && (
            <View style={[styles.noteBox, { backgroundColor: colors.surface2, borderColor: colors.borderSubtle, borderWidth: StyleSheet.hairlineWidth }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} style={{ marginRight: 2 }} />
              <Text style={[{ color: colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 20, fontFamily: Fonts.body }]}>
                {result.examiner_note}
              </Text>
            </View>
          )}

          <TouchableOpacity style={[styles.generateBtn, { backgroundColor: colors.accent, marginTop: 20 }]}
            onPress={() => { setStep('config'); setResult(null); setPaper(''); setImages([]); setImagesBase64([]); }}>
            <Text style={{ color: colors.textInverse, fontSize: 15, fontWeight: '600', fontFamily: Fonts.display }}>New Exam</Text>
          </TouchableOpacity>
        </>
      )}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontWeight: '600', letterSpacing: -0.4 },
  subtitle: { fontSize: 14, lineHeight: 22, marginBottom: 24 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16, borderRadius: 12, marginTop: 28,
  },
  paperCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 20, marginBottom: 16 },
  paperHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  paperTitle: { fontSize: 14, fontWeight: '600' },
  paperText: { fontSize: 14, lineHeight: 24 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  imgThumb: { width: 100, height: 100, borderRadius: 12, overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%' },
  removeImg: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addImgBtn: { width: 100, height: 100, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  predGrade: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 20 },
  sectionScore: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionLabel: { width: 140, fontSize: 13, fontWeight: '500' },
  sectionBar: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  sectionFill: { height: 8, borderRadius: 4 },
  sectionVal: { width: 40, textAlign: 'right', fontSize: 13, fontWeight: '600' },
  noteBox: { flexDirection: 'row', gap: 8, padding: 16, borderRadius: 14, marginTop: 16, alignItems: 'flex-start' },
});
