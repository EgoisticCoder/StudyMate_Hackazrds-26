// ANSWER GRADER SCREEN — Step-by-step flow with vision grading
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Platform, ActivityIndicator, Image, Animated, Easing,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useTheme, useAuth } from '../../lib/context';
import { buildStudentContext, getStudentProfile } from '../../lib/adaptiveEngine';
import { callSarvamVision, parseSarvamJSON } from '../../lib/ai';
import { writeQuery } from '../../lib/neo4j';
import { SUBJECTS } from '../../constants/subjects';
import { getChaptersForSubject } from '../../constants/chapters';
import { ScoreCircle } from '../../components/ScoreCircle';
import { Fonts } from '../../constants/fonts';
import { Radii, Spacing } from '../../constants/colors';
import { Chip, PrimaryButton, AnimatedScreenWrapper, SectionLabel } from '../../components/ui/premium';
import { v4 as uuidv4 } from 'uuid';

interface GradeResult {
  content_marks: number;
  content_max: number;
  language_marks: number;
  language_max: number;
  presentation_marks: number;
  presentation_max: number;
  total_obtained: number;
  total_max: number;
  strengths: string[];
  missed_points: string[];
  improvements: string[];
  model_answer_outline: string[];
  examiner_note: string;
}

export default function AnswerGraderScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [step, setStep] = useState(1);
  const [subject, setSubject] = useState('');
  const [chapter, setChapter] = useState('');
  const [question, setQuestion] = useState('');
  const [maxMarks, setMaxMarks] = useState(10);
  const [image, setImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [board, setBoard] = useState('ICSE');
  const [classNum, setClassNum] = useState(10);
  const [chapters, setChapters] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const profile = await getStudentProfile(studentId);
      if (profile) { setBoard(profile.board); setClassNum(profile.class); }
    })();
  }, [studentId]);

  useEffect(() => {
    if (subject) setChapters(getChaptersForSubject(subject, board, classNum));
  }, [subject, board, classNum]);

  const handlePickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    
    if (!res.canceled && res.assets[0]) {
      setLoading(true);
      try {
        // IMAGE OPTIMIZATION: Resize to max 1024px width and compress
        const manipResult = await ImageManipulator.manipulateAsync(
          res.assets[0].uri,
          [{ resize: { width: 900 } }],
          { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        setImage(manipResult.uri);
        setImageBase64(manipResult.base64 || null);
      } catch (e) {
        console.error('Image optimization failed', e);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleGrade = async () => {
    if (!imageBase64 || !studentId) return;
    setLoading(true);
    try {
      const context = await buildStudentContext(studentId);
      const prompt = `${context}
You are a strict ${board} examiner.
Question: ${question}
Maximum marks: ${maxMarks}
Subject: ${subject}, Chapter: ${chapter}
Class: ${classNum} ${board}

Evaluate the handwritten answer in the image.
Be honest. Do not inflate marks.
Consider: Content accuracy per ${board} syllabus, Completeness of answer, Language and terminology, Structure and presentation.

Return ONLY this exact JSON, no other text:
{
  "content_marks": number,
  "content_max": ${Math.round(maxMarks * 0.6)},
  "language_marks": number,
  "language_max": ${Math.round(maxMarks * 0.2)},
  "presentation_marks": number,
  "presentation_max": ${Math.round(maxMarks * 0.2)},
  "total_obtained": number,
  "total_max": ${maxMarks},
  "strengths": ["string", "string"],
  "missed_points": ["string", "string", "string"],
  "improvements": ["string", "string", "string"],
  "model_answer_outline": ["string", "string", "string"],
  "examiner_note": "string"
}`;

      let response: string;
      try {
        response = await callSarvamVision('You are a strict exam grader.', imageBase64, prompt, 'answer_grader');
      } catch {
        response = await callSarvamVision('You are a strict exam grader. Return only valid JSON.', imageBase64, prompt, 'answer_grader');
      }

      const parsed = parseSarvamJSON<GradeResult>(response);
      setResult(parsed);
      setStep(5);

      // Save to Neo4j
      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (a:AnswerSubmission {
           id: $id, subject: $subject, chapter: $chapter,
           question: $question, marks_obtained: $obtained,
           marks_max: $max, feedback: $improvements,
           missed_points: $missed, date: datetime()
         })
         CREATE (s)-[:SUBMITTED]->(a)`,
        {
          studentId,
          id: uuidv4(),
          subject, chapter, question,
          obtained: parsed.total_obtained,
          max: parsed.total_max,
          improvements: parsed.improvements,
          missed: parsed.missed_points,
        }
      );
    } catch (err: any) {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View style={{ flex: 1 }}>
            <SectionLabel text="STEP 1 — Subject & Chapter" style={{ marginBottom: 12 }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, maxHeight: 44 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 4 }}>
                {SUBJECTS.map(s => (
                  <Chip
                    key={s.name}
                    label={s.name}
                    selected={subject === s.name}
                    onPress={() => {
                      setSubject(s.name);
                      setChapter('');
                    }}
                  />
                ))}
              </View>
            </ScrollView>
            {subject && (
              <View style={[styles.chapterList, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                  {chapters.map((ch, chIdx) => (
                    <TouchableOpacity 
                      key={ch} 
                      onPress={() => { setChapter(ch); setStep(2); }}
                      style={[
                        styles.chapterRow, 
                        { 
                          borderBottomColor: colors.borderSubtle,
                          borderBottomWidth: chIdx === chapters.length - 1 ? 0 : StyleSheet.hairlineWidth,
                          backgroundColor: chapter === ch ? colors.accentMuted : 'transparent',
                        }
                      ]}
                    >
                      <Text style={{ 
                        color: chapter === ch ? colors.accentHover : colors.textPrimary, 
                        fontSize: 14,
                        fontFamily: chapter === ch ? Fonts.bodyMedium : Fonts.body,
                      }}>
                        {ch}
                      </Text>
                      <Ionicons 
                        name={chapter === ch ? 'checkmark-circle' : 'chevron-forward'} 
                        size={16} 
                        color={chapter === ch ? colors.accent : colors.textTertiary} 
                      />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        );
      case 2:
        return (
          <View style={{ flex: 1 }}>
            <SectionLabel text="STEP 2 — Question text" style={{ marginBottom: 12 }} />
            <TextInput
              style={[
                styles.textArea, 
                { 
                  color: colors.textPrimary, 
                  borderColor: colors.borderSubtle, 
                  backgroundColor: colors.surface1,
                  fontFamily: Fonts.body,
                }
              ]}
              placeholder="Type or speak the exam question text here..."
              placeholderTextColor={colors.textTertiary}
              value={question}
              onChangeText={setQuestion}
              multiline
            />
            <PrimaryButton
              label="Next"
              disabled={!question.trim()}
              icon={<Ionicons name="arrow-forward" size={16} color={question.trim() ? colors.textInverse : colors.textTertiary} />}
              onPress={() => question.trim() && setStep(3)}
            />
          </View>
        );
      case 3:
        return (
          <View style={{ flex: 1, alignItems: 'center' }}>
            <SectionLabel text="STEP 3 — Maximum Marks" style={{ marginBottom: 24 }} />
            <View style={[styles.marksRow, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
              <TouchableOpacity 
                onPress={() => setMaxMarks(Math.max(1, maxMarks - 1))}
                style={[styles.markBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface2 }]}
              >
                <Ionicons name="remove" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={[styles.marksValue, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
                {maxMarks}
              </Text>
              <TouchableOpacity 
                onPress={() => setMaxMarks(maxMarks + 1)}
                style={[styles.markBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface2 }]}
              >
                <Ionicons name="add" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={{ width: '100%', marginTop: 12 }}>
              <PrimaryButton
                label="Next"
                icon={<Ionicons name="arrow-forward" size={16} color={colors.textInverse} />}
                onPress={() => setStep(4)}
              />
            </View>
          </View>
        );
      case 4:
        return (
          <View style={{ flex: 1 }}>
            <SectionLabel text="STEP 4 — Photo of Answer" style={{ marginBottom: 12 }} />
            {image ? (
              <View style={[styles.imageContainer, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}>
                <Image source={{ uri: image }} style={styles.answerImage} resizeMode="contain" />
                <TouchableOpacity 
                  onPress={() => { setImage(null); setImageBase64(null); }}
                  style={[styles.removeImg, { backgroundColor: colors.danger }]}
                >
                  <Ionicons name="close" size={14} color="#FFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity 
                style={[styles.pickArea, { borderColor: colors.borderMedium, backgroundColor: colors.surface1 }]} 
                onPress={handlePickImage}
              >
                <Ionicons name="camera-outline" size={40} color={colors.textSecondary} />
                <Text style={[{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium, marginTop: 12 }]}>
                  Upload or Take Photo
                </Text>
                <Text style={[{ color: colors.textTertiary, fontFamily: Fonts.body, fontSize: 12, marginTop: 4, textAlign: 'center' }]}>
                  Ensure high legibility under good lighting
                </Text>
              </TouchableOpacity>
            )}
            
            <View style={{ marginTop: 12 }}>
              <PrimaryButton
                label={loading ? 'Processing Answer...' : 'Grade My Answer'}
                disabled={!image || loading}
                icon={
                  loading ? (
                    <ActivityIndicator size="small" color={colors.textTertiary} />
                  ) : (
                    <Ionicons name="sparkles" size={16} color={image ? colors.textInverse : colors.textTertiary} />
                  )
                }
                onPress={handleGrade}
              />
            </View>
          </View>
        );
      case 5:
        if (!result) return null;
        return (
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            <SectionLabel text="EVALUATION REPORT" style={{ marginBottom: 16 }} />
            
            <View style={[styles.reportHeaderCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
              <ScoreCircle obtained={result.total_obtained} total={result.total_max} />
              
              <View style={{ width: '100%', marginTop: 24, gap: 12 }}>
                {[
                  { label: 'Content Match', val: result.content_marks, max: result.content_max, color: colors.success },
                  { label: 'Language & Terminology', val: result.language_marks, max: result.language_max, color: colors.info },
                  { label: 'Presentation Details', val: result.presentation_marks, max: result.presentation_max, color: '#8B5CF6' },
                ].map(bar => (
                  <View key={bar.label} style={styles.scoreBar}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={[styles.barLabel, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>
                        {bar.label}
                      </Text>
                      <Text style={[styles.barValue, { color: colors.textPrimary, fontFamily: Fonts.displayMedium }]}>
                        {bar.val}/{bar.max}
                      </Text>
                    </View>
                    <View style={[styles.barTrack, { backgroundColor: colors.surface2 }]}>
                      <View style={[styles.barFill, { width: `${(bar.val / bar.max) * 100}%`, backgroundColor: bar.color }]} />
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Strengths card (left border nested view wrapper pattern to fix RN border radius clipping bug) */}
            <View style={[styles.sectionOuter, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}>
              <View style={[styles.sectionInner, { borderLeftColor: colors.success }]}>
                <Text style={[styles.sectionTitle, { color: colors.success, fontFamily: Fonts.display }]}>
                  ✓ Strengths Identified
                </Text>
                {result.strengths.map((s, i) => (
                  <Text key={i} style={[styles.bulletText, { color: colors.textPrimary, fontFamily: Fonts.body }]}>
                    • {s}
                  </Text>
                ))}
              </View>
            </View>

            {/* Improvements card */}
            <View style={[styles.sectionOuter, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}>
              <View style={[styles.sectionInner, { borderLeftColor: colors.warning }]}>
                <Text style={[styles.sectionTitle, { color: colors.warning, fontFamily: Fonts.display }]}>
                  ⚡ Areas for Improvement
                </Text>
                {result.missed_points.map((s, i) => (
                  <Text key={i} style={[styles.bulletText, { color: colors.textPrimary, fontFamily: Fonts.body }]}>
                    • {s}
                  </Text>
                ))}
              </View>
            </View>

            {/* Model answer outline */}
            <View style={[styles.sectionOuter, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}>
              <View style={[styles.sectionInner, { borderLeftColor: colors.accent }]}>
                <Text style={[styles.sectionTitle, { color: colors.accentHover, fontFamily: Fonts.display }]}>
                  📋 Model Answer Reference
                </Text>
                {result.model_answer_outline.map((s, i) => (
                  <Text key={i} style={[styles.bulletText, { color: colors.textPrimary, fontFamily: Fonts.body }]}>
                    {i + 1}. {s}
                  </Text>
                ))}
              </View>
            </View>

            {/* Examiner note */}
            <View style={[styles.examinerNote, { backgroundColor: colors.surface2, borderColor: colors.borderSubtle }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.accent} style={{ marginTop: 2 }} />
              <Text style={[styles.examinerText, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
                <Text style={{ fontFamily: Fonts.displayMedium, color: colors.textPrimary }}>EXAMINER NOTE: </Text>
                {result.examiner_note}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.secondaryActionBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
              onPress={() => { setStep(1); setResult(null); setImage(null); setQuestion(''); }}
            >
              <Text style={[{ color: colors.textPrimary, fontFamily: Fonts.display, fontSize: 14 }]}>
                Grade Another Answer
              </Text>
            </TouchableOpacity>
          </ScrollView>
        );
      default: return null;
    }
  };

  // Animations
  const stepFade = React.useRef(new Animated.Value(1)).current;
  const stepSlide = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    stepFade.setValue(0);
    stepSlide.setValue(12);
    Animated.parallel([
      Animated.timing(stepFade, { toValue: 1, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(stepSlide, { toValue: 0, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [step]);

  return (
    <AnimatedScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerArea}>
        <TouchableOpacity 
          onPress={() => {
            try {
              router.back();
            } catch {
              router.replace('/');
            }
          }} 
          style={[styles.backBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Answer Grader</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        {step < 5 && (
          <View style={styles.stepRow}>
            {[1, 2, 3, 4].map(s => (
              <View 
                key={s} 
                style={[
                  styles.stepDot, 
                  {
                    backgroundColor: s <= step ? colors.accent : colors.borderSubtle,
                    flex: s === step ? 2.5 : 1,
                  }
                ]} 
              />
            ))}
          </View>
        )}
        <Animated.View style={{ opacity: stepFade, transform: [{ translateY: stepSlide }], flex: 1 }}>
          {renderStep()}
        </Animated.View>
      </View>
    </AnimatedScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  headerArea: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    marginBottom: 20 
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, letterSpacing: -0.4 },
  content: { flex: 1, paddingHorizontal: 20, paddingBottom: 40 },
  stepRow: { flexDirection: 'row', gap: 6, marginBottom: 24 },
  stepDot: { height: 3, borderRadius: 1.5 },
  chapterList: { 
    borderWidth: StyleSheet.hairlineWidth, 
    borderRadius: Radii.card, 
    overflow: 'hidden' 
  },
  chapterRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 14, 
    borderBottomWidth: StyleSheet.hairlineWidth 
  },
  textArea: { 
    borderWidth: StyleSheet.hairlineWidth, 
    borderRadius: Radii.card, 
    padding: 16, 
    minHeight: 120, 
    fontSize: 15, 
    marginBottom: 16,
    textAlignVertical: 'top',
  },
  marksRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 24, 
    paddingVertical: 24,
    paddingHorizontal: 40,
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 20,
  },
  markBtn: { 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    borderWidth: StyleSheet.hairlineWidth, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  marksValue: { fontSize: 44, fontWeight: '700' },
  pickArea: { 
    borderWidth: 1, 
    borderStyle: 'dashed', 
    borderRadius: Radii.card, 
    padding: 40, 
    alignItems: 'center' 
  },
  imageContainer: { 
    borderRadius: Radii.card, 
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden', 
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerImage: { width: '100%', height: 260 },
  removeImg: { 
    position: 'absolute', 
    top: 10, 
    right: 10, 
    width: 28, 
    height: 28, 
    borderRadius: 14, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  reportHeaderCard: {
    padding: 20,
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    marginBottom: 20,
  },
  scoreBar: { marginBottom: 12 },
  barLabel: { fontSize: 13 },
  barTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  barFill: { height: 4, borderRadius: 2 },
  barValue: { fontSize: 13 },
  sectionOuter: {
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 16,
  },
  sectionInner: {
    borderLeftWidth: 4,
    padding: 16,
  },
  sectionTitle: { fontSize: 14, marginBottom: 8 },
  bulletText: { fontSize: 14, lineHeight: 22, marginBottom: 4 },
  examinerNote: { 
    flexDirection: 'row', 
    gap: 10, 
    padding: 16, 
    borderRadius: Radii.card, 
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 8, 
    alignItems: 'flex-start' 
  },
  examinerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  secondaryActionBtn: { 
    paddingVertical: 14, 
    borderRadius: Radii.button, 
    borderWidth: StyleSheet.hairlineWidth, 
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
});
