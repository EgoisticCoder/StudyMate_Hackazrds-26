// CONCEPT EXPLAINER — Student types any concept, AI explains with structure
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Platform, ActivityIndicator, Animated, Easing, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { buildStudentContext, getStudentProfile } from '../../lib/adaptiveEngine';
import { callSarvam } from '../../lib/ai';
import { writeQuery } from '../../lib/neo4j';
import { SUBJECTS } from '../../constants/subjects';
import { v4 as uuidv4 } from 'uuid';
import { MarkdownView } from '../../components/MarkdownView';
import { Chip, SectionLabel } from '../../components/ui/premium';
import { Fonts } from '../../constants/fonts';
import { useAudioRecorder, requestRecordingPermissionsAsync, setAudioModeAsync, AudioModule } from 'expo-audio';
import * as Haptics from 'expo-haptics';


const SARVAM_RECORDING_OPTIONS = {
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  android: {
    extension: '.wav',
    outputFormat: 'default',
    audioEncoder: 'default',
    sampleRate: 16000,
  },
  ios: {
    extension: '.wav',
    outputFormat: 'lpcm',
    audioQuality: 32, // LOW
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/wav',
    bitsPerSecond: 256000,
  },
} as any;


import { 
  transcribeAudio, synthesizeSpeech, playAudioBase64, 
  stopCurrentAudio, getStoredLanguageCode 
} from '../../lib/sarvam';

export default function ConceptExplainerScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [subject, setSubject] = useState('');
  const [concept, setConcept] = useState('');
  const [explanation, setExplanation] = useState('');
  const [practiceQuestions, setPracticeQuestions] = useState('');
  const [loading, setLoading] = useState(false);
  const [board, setBoard] = useState('ICSE');
  const [classNum, setClassNum] = useState(10);

  // STT / Recording states
  const [isRecording, setIsRecording] = useState(false);
  const audioRecorder = useAudioRecorder(SARVAM_RECORDING_OPTIONS);
  const [transcribing, setTranscribing] = useState(false);

  // TTS / Playback states
  const [isPlaying, setIsPlaying] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);

  // Mic pulse animation
  const micPulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const profile = await getStudentProfile(studentId);
      if (profile) { setBoard(profile.board); setClassNum(profile.class); }
    })();
  }, [studentId]);

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(micPulseAnim, {
            toValue: 1.2,
            duration: 500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(micPulseAnim, {
            toValue: 1,
            duration: 500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      micPulseAnim.stopAnimation(() => {
        micPulseAnim.setValue(1);
      });
    }
  }, [isRecording]);

  useEffect(() => {
    return () => {
      stopCurrentAudio().catch(() => {});
    };
  }, []);

  const handleExplain = async () => {
    if (!concept.trim() || !studentId) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setExplanation('');
    setPracticeQuestions('');
    // Stop any playing TTS
    await stopCurrentAudio();
    setIsPlaying(false);
    
    try {
      const context = await buildStudentContext(studentId);
      const result = await callSarvam(
        [
          { role: 'system', content: `You are an expert ${board} tutor for Class ${classNum}. ${context}` },
          {
            role: 'user',
            content: `Explain the concept "${concept}" for ${subject || 'General'}, ${board} Class ${classNum}.
 
Format exactly as:
WHAT IS IT:
(Simple, age-appropriate definition in 2-3 sentences)
 
HOW IT WORKS:
(Step-by-step mechanism or process, numbered)
 
REAL-LIFE EXAMPLE (INDIA):
(One relatable Indian context example)
 
KEY FORMULA / RULE:
(The core formula or rule to memorize, if applicable)
 
COMMON EXAM MISTAKES:
(2-3 mistakes students make in board exams)
 
---
PRACTICE QUESTIONS:
1. (Application-based question)
2. (Conceptual question)
3. (Tricky board-style question)

STRICT CLASS-SPECIFIC REQUIREMENTS:
- ALL practice questions MUST be STRICTLY for Class ${classNum} only
- NO practice questions from any other class (lower or higher) are allowed
- Practice questions MUST be fully aligned with the ${board} Class ${classNum} syllabus
- Only use topics, concepts, and difficulty levels appropriate for Class ${classNum}
 
Be concise. Reference the student's weak areas if this concept connects to them.`,
          },
        ],
        'concept_explainer'
      );

      const parts = result.split('PRACTICE QUESTIONS:');
      setExplanation(parts[0]?.trim() || result);
      setPracticeQuestions(parts[1]?.trim() || '');

      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (ss:StudySession {
           id: $id, subject: $subject, chapter: $concept,
           duration_mins: 5, session_type: 'concept_explainer', date: datetime()
         })
         CREATE (s)-[:STUDIED]->(ss)`,
        { studentId, id: uuidv4(), subject: subject || 'General', concept }
      );
    } catch (err: any) {
      setExplanation(err.message || 'Failed to explain concept');
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Microphone access is required to use voice input.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false, shouldRouteThroughEarpiece: false });
      if (audioRecorder.isRecording) { await audioRecorder.stop(); }
      setIsRecording(true);
      await audioRecorder.prepareToRecordAsync(); audioRecorder.record();
    } catch (err) {
      console.error('Failed to start recording', err);
      setIsRecording(false);
      Alert.alert('Error', 'Could not start recording. Check microphone permissions.');
    }
  };

  const stopRecording = async () => {
    if (!audioRecorder) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsRecording(false);
    setTranscribing(true);
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) {
        Alert.alert('Error', "Could not retrieve voice recording URI.");
        return;
      }
      const result = await transcribeAudio(uri);
      if (result.text.trim()) {
        setConcept(prev => (prev ? prev + ' ' : '') + result.text);
      }
    } catch (err: any) {
      console.error('STT failed:', err);
      Alert.alert('Error', err.message || "Couldn't transcribe audio.");
    } finally {
      setTranscribing(false);
    }
  };

  const handlePlayTTS = async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isPlaying) {
      await stopCurrentAudio();
      setIsPlaying(false);
      return;
    }
    if (!explanation) return;
    setTtsLoading(true);
    try {
      const cleanText = explanation.replace(/[#*`_]/g, '');
      const langCode = await getStoredLanguageCode();
      const audioBase64 = await synthesizeSpeech(cleanText, langCode);
      if (audioBase64) {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false, shouldRouteThroughEarpiece: false });
        setIsPlaying(true);
        const sound = await playAudioBase64(audioBase64);
        sound.setOnPlaybackStatusUpdate((status: any) => {
          if ('didJustFinish' in status && status.didJustFinish) {
            setIsPlaying(false);
          }
        });
      }
    } catch (err) {
      console.warn('TTS playback failed:', err);
      Alert.alert('Error', 'Voice synthesis is currently unavailable.');
    } finally {
      setTtsLoading(false);
    }
  };

  // Animations
  const screenFade = React.useRef(new Animated.Value(0)).current;
  const resultFade = React.useRef(new Animated.Value(0)).current;
  const resultSlide = React.useRef(new Animated.Value(24)).current;

  React.useEffect(() => {
    Animated.timing(screenFade, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  React.useEffect(() => {
    if (explanation) {
      resultFade.setValue(0);
      resultSlide.setValue(24);
      Animated.parallel([
        Animated.timing(resultFade, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(resultSlide, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }
  }, [explanation]);

  return (
    <Animated.ScrollView
      style={[styles.container, { backgroundColor: colors.background, opacity: screenFade }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header back button */}
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
        <Text style={[styles.title, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Concept Explainer</Text>
        <View style={{ width: 32 }} />
      </View>

      <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
        Type or speak any concept and get a structured explanation with practice questions
      </Text>

      {/* Subject selector */}
      <SectionLabel text="Subject (Optional)" style={{ marginBottom: 12 }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
        {SUBJECTS.map(s => (
          <Chip
            key={s.name}
            label={s.name}
            selected={subject === s.name}
            onPress={() => setSubject(subject === s.name ? '' : s.name)}
          />
        ))}
      </ScrollView>

      {/* Concept input area */}
      <View style={[styles.inputArea, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <TextInput
            style={[styles.conceptInput, { color: colors.textPrimary, fontFamily: Fonts.body, flex: 1 }]}
            placeholder='e.g. "Photosynthesis", "Quadratic Equations", "Mughal Architecture"'
            placeholderTextColor={colors.textTertiary}
            value={concept}
            onChangeText={setConcept}
            multiline
          />
          <Animated.View
            style={{
              transform: [{ scale: micPulseAnim }],
            }}
          >
            <TouchableOpacity
              onPress={isRecording ? stopRecording : startRecording}
              disabled={loading || transcribing}
              style={[styles.micBtn, { backgroundColor: isRecording ? '#EF4444' : colors.primary }]}
            >
              {transcribing ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name={isRecording ? "stop" : "mic"} size={18} color="#FFF" />
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>
        
        <TouchableOpacity
          style={[
            styles.explainBtn, 
            { backgroundColor: concept.trim() ? colors.accent : colors.surface3 }
          ]}
          onPress={handleExplain}
          disabled={loading || !concept.trim()}
        >
          {loading ? (
            <ActivityIndicator color={colors.textInverse} size="small" />
          ) : (
            <>
              <Ionicons name="sparkles" size={16} color={concept.trim() ? colors.textInverse : colors.textTertiary} />
              <Text style={[styles.explainText, { color: concept.trim() ? colors.textInverse : colors.textTertiary, fontFamily: Fonts.display }]}>
                Explain
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Explanation Result Card */}
      {explanation ? (
        <Animated.View style={[styles.resultCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle, opacity: resultFade, transform: [{ translateY: resultSlide }] }]}>
          <View style={styles.resultHeader}>
            <Ionicons name="bulb-outline" size={18} color={colors.accent} />
            <Text style={[styles.resultTitle, { color: colors.accent, fontFamily: Fonts.display }]}>Explanation</Text>
            <TouchableOpacity
              onPress={handlePlayTTS}
              disabled={ttsLoading}
              style={[styles.speakerBtn, { backgroundColor: colors.surface3 }]}
            >
              {ttsLoading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons
                  name={isPlaying ? 'stop' : 'volume-medium'}
                  size={16}
                  color={isPlaying ? '#EF4444' : colors.accent}
                />
              )}
            </TouchableOpacity>
          </View>
          <MarkdownView content={explanation} />
        </Animated.View>
      ) : null}

      {/* Practice Questions Result Card — left border accent styling */}
      {practiceQuestions ? (
        <Animated.View style={[styles.practiceWrapper, { borderColor: colors.borderSubtle, opacity: resultFade, transform: [{ translateY: resultSlide }] }]}>
          <View style={[styles.practiceInner, { borderLeftColor: colors.accent, backgroundColor: colors.surface1 }]}>
            <View style={styles.resultHeader}>
              <Ionicons name="help-circle-outline" size={18} color={colors.accent} />
              <Text style={[styles.resultTitle, { color: colors.accent, fontFamily: Fonts.display }]}>Practice Questions</Text>
            </View>
            <MarkdownView content={practiceQuestions} />
          </View>
        </Animated.View>
      ) : null}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontWeight: '600', letterSpacing: -0.4 },
  subtitle: { fontSize: 14, marginBottom: 24, lineHeight: 22 },
  inputArea: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 16, marginBottom: 20 },
  conceptInput: { minHeight: 60, fontSize: 15, lineHeight: 22 },
  explainBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 12,
  },
  explainText: { fontSize: 14, fontWeight: '600' },
  resultCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 20, marginBottom: 16 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  resultTitle: { fontSize: 14, fontWeight: '600' },
  practiceWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  practiceInner: {
    borderLeftWidth: 3,
    padding: 20,
  },
  micBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  speakerBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
});

