// Ask AI - Doubt solver with voice I/O
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
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


import { useTheme, useAuth } from '../../lib/context';
import { buildStudentContext, getStudentProfile } from '../../lib/adaptiveEngine';
import { callSarvam, callSarvamVision } from '../../lib/ai';
import { writeQuery } from '../../lib/neo4j';
import { SUBJECTS } from '../../constants/subjects';
import { getChaptersForSubject } from '../../constants/chapters';
import { v4 as uuidv4 } from 'uuid';
import { searchStudyReferences, formatSnippetsForPrompt } from '../../lib/webSearch';
import { MarkdownView } from '../../components/MarkdownView';
import { Chip } from '../../components/ui/premium';
import { Fonts } from '../../constants/fonts';
import {
  transcribeAudio, synthesizeSpeech, playAudioBase64,
  stopCurrentAudio, getStoredLanguageCode, showVoiceError,
} from '../../lib/sarvam';
import { TranscriptionOverlay } from '../../components/TranscriptionOverlay';

type Tab = 'type' | 'photograph' | 'resources';

export default function AskAIScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [tab, setTab] = useState<Tab>('type');
  const [subject, setSubject] = useState('');
  const [chapter, setChapter] = useState('');
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [board, setBoard] = useState('ICSE');
  const [classNum, setClassNum] = useState(10);
  const [chapters, setChapters] = useState<string[]>([]);
  const [followUp, setFollowUp] = useState('');
  /** 0 = hints only, 1 = full explanation allowed */
  const [helpTier, setHelpTier] = useState<0 | 1>(0);
  const [uploadLabel, setUploadLabel] = useState<string | null>(null);
  const [uploadExcerpt, setUploadExcerpt] = useState('');
  const [searchNotes, setSearchNotes] = useState('');
  /** ELI5 — simpler wording + analogies */
  const [eli5, setEli5] = useState(false);
  const [displayedResponse, setDisplayedResponse] = useState('');

  // Voice state (Sarvam AI)
  const [isRecording, setIsRecording] = useState(false);
  const [sttLoading, setSttLoading] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [detectedLang, setDetectedLang] = useState('en-IN');
  const audioRecorder = useAudioRecorder(SARVAM_RECORDING_OPTIONS);
  const micPulse = useRef(new Animated.Value(1)).current;
  
  // Web-specific recording refs
  const webMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webAudioChunksRef = useRef<Blob[]>([]);
  const webAudioStreamRef = useRef<MediaStream | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const getAbortSignal = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    return abortControllerRef.current.signal;
  };

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const profile = await getStudentProfile(studentId);
      if (profile) {
        setBoard(profile.board);
        setClassNum(profile.class);
      }
    })();
  }, [studentId]);

  useEffect(() => {
    if (subject) {
      setChapters(getChaptersForSubject(subject, board, classNum));
      setChapter('');
    }
  }, [subject, board, classNum]);

  const resetTurn = () => {
    setResponse('');
    setHelpTier(0);
    setFollowUp('');
  };

  const persistDoubt = async (payload: {
    hint_text?: string;
    explain_text?: string;
    sources_json?: string;
    uploaded_excerpt?: string;
    vision?: boolean;
  }) => {
    if (!studentId) return;
    try {
      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (ds:DoubtSession {
           id: $id,
           subject: $subject,
           chapter: $chapter,
           board: $board,
           class: $class,
           question_preview: $preview,
           hint_text: $hint_text,
           explain_text: $explain_text,
           sources_json: $sources_json,
           uploaded_excerpt: $uploaded_excerpt,
           used_vision: $used_vision,
           date: datetime()
         })
         CREATE (s)-[:LOGGED_DOUBT]->(ds)`,
        {
          studentId,
          id: uuidv4(),
          subject: subject || 'General',
          chapter: chapter || '',
          board,
          class: classNum,
          preview: question.slice(0, 280),
          hint_text: payload.hint_text || '',
          explain_text: payload.explain_text || '',
          sources_json: payload.sources_json || '',
          uploaded_excerpt: (payload.uploaded_excerpt || uploadExcerpt).slice(0, 4000),
          used_vision: !!payload.vision,
        }
      );
    } catch (e) {
      console.warn('Doubt log failed', e);
    }
  };

  const gatherSources = async (): Promise<string> => {
    const q = `${board} Class ${classNum} ${subject} ${chapter} ${question} ICSE CBSE textbook`;
    try {
      const snippets = await searchStudyReferences(q);
      const formatted = formatSnippetsForPrompt(snippets);
      setSearchNotes(formatted);
      return formatted;
    } catch {
      setSearchNotes('');
      return '';
    }
  };

  const handleSubmitText = async () => {
    if (!question.trim() || !studentId) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    resetTurn();
    try {
      const context = await buildStudentContext(studentId);
      const sources = await gatherSources();
      const resourceBlock =
        uploadExcerpt.trim().length > 0
          ? `\n\nSTUDENT UPLOAD EXCERPT (their material — stay consistent with it):\n${uploadExcerpt.slice(0, 6000)}`
          : '';

      const hintPrompt = `${context}

REFERENCE RESULTS (titles/snippets from web search — use for syllabus alignment, do not copy verbatim):
${sources || '(none)'}

BOARD: ${board}, CLASS: ${classNum}. Subject: ${subject || 'General'}, Chapter: ${chapter || 'any'}.
${resourceBlock}

TASK — HINT LEVEL ONLY:
- Do NOT give the final numeric answer or fully worked solution.
- Offer guiding questions, strategy, and at most a partial setup.
- If multiple choice, do NOT reveal which option is correct; teach how to eliminate wrong options.
- Mention textbook lineage when helpful (e.g. Concise Physics, ML Aggarwal for ICSE maths) without dumping copyrighted text.
${eli5 ? '\n\nELI5 MODE: Use very simple words, short sentences, and one relatable analogy — still no direct final answers.' : ''}`;

      const result = await callSarvam(
        [
          { role: 'system', content: hintPrompt },
          { role: 'user', content: question.trim() },
        ],
        'doubt_solver',
        undefined,
        undefined,
        getAbortSignal()
      );
      setResponse(result);
      setHelpTier(0);

      await persistDoubt({
        hint_text: result,
        sources_json: JSON.stringify({ web: sources.slice(0, 2000), upload: !!uploadExcerpt }),
      });

      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (ss:StudySession {
           id: $sessionId, subject: $subject, chapter: $chapter,
           duration_mins: 8, session_type: 'doubt_hint', date: datetime()
         })
         CREATE (s)-[:STUDIED]->(ss)`,
        { studentId, sessionId: uuidv4(), subject: subject || 'General', chapter: chapter || '' }
      );
    } catch (err: unknown) {
      setResponse(err instanceof Error ? err.message : 'Could not reach AI');
    } finally {
      setLoading(false);
    }
  };

  const handleExplainFurther = async () => {
    if (!studentId || !question.trim()) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const context = await buildStudentContext(studentId);
      const sources = searchNotes || (await gatherSources());
      const explainPrompt = `${context}

SOURCES (for grounding tone only):
${sources || ''}

BOARD: ${board}, CLASS: ${classNum}.
${uploadExcerpt ? `Student notes excerpt:\n${uploadExcerpt.slice(0, 4000)}` : ''}

TASK — FULL HELP:
The learner is still stuck after hints. Now give a clear, step-by-step explanation in simple language.
Use at least one real-life analogy or everyday example.
Still avoid blindly giving competitive-exam shortcuts — focus on understanding.
${eli5 ? '\n\nELI5 MODE: Assume age ~12 reading level; define jargon when needed.' : ''}`;

      const result = await callSarvam(
        [
          { role: 'system', content: explainPrompt },
          {
            role: 'user',
            content: `Original doubt:\n${question}\n\nPrevious hint response:\n${response}\n\nExplain further with examples.`,
          },
        ],
        'doubt_solver',
        undefined,
        undefined,
        getAbortSignal()
      );
      setResponse(prev => `${prev}\n\n———\nDETAILED EXPLANATION\n———\n\n${result}`);
      setHelpTier(1);

      await persistDoubt({
        explain_text: result,
        hint_text: response,
        sources_json: JSON.stringify({ stage: 'explain' }),
      });

      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (ss:StudySession {
           id: $sessionId, subject: $subject, chapter: $chapter,
           duration_mins: 12, session_type: 'doubt_explain', date: datetime()
         })
         CREATE (s)-[:STUDIED]->(ss)`,
        { studentId, sessionId: uuidv4(), subject: subject || 'General', chapter: chapter || '' }
      );
    } catch (err: unknown) {
      setResponse(prev => `${prev}\n\n(Error: ${err instanceof Error ? err.message : 'failed'})`);
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setLoading(true);
      try {
        const manipResult = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
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

  const handleSubmitPhoto = async () => {
    if (!imageBase64 || !studentId) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    resetTurn();
    try {
      const context = await buildStudentContext(studentId);
      const sources = await gatherSources();

      const hintVision = `${context}

SOURCES:\n${sources || ''}

PHOTO MODE — HINT LEVEL:
Describe what you see briefly, then give hints and method only — no full solution or final matched answer.
${eli5 ? '\nELI5: simpler wording throughout.' : ''}`;

      const result = await callSarvamVision(
        hintVision,
        imageBase64,
        `Subject hint: ${subject || 'unknown'}, chapter: ${chapter || 'unknown'}, board ${board} class ${classNum}.`,
        'vision_question',
        getAbortSignal()
      );
      setResponse(result);
      setHelpTier(0);

      await persistDoubt({
        hint_text: result,
        sources_json: JSON.stringify({ photo: true }),
        vision: true,
      });

      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (ss:StudySession {
           id: $sessionId, subject: $subject, chapter: $chapter,
           duration_mins: 8, session_type: 'photo_doubt_hint', date: datetime()
         })
         CREATE (s)-[:STUDIED]->(ss)`,
        { studentId, sessionId: uuidv4(), subject: subject || 'General', chapter: chapter || '' }
      );
    } catch (err: unknown) {
      setResponse(err instanceof Error ? err.message : 'Vision AI failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoExplain = async () => {
    if (!imageBase64 || !studentId) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const context = await buildStudentContext(studentId);
      const explainVision = `${context}

PHOTO MODE — EXPLAIN NOW:
Give full worked reasoning with a simple analogy. Student already saw hints above.
${eli5 ? '\nELI5 mode on — keep language friendly and concrete.' : ''}`;

      const result = await callSarvamVision(
        explainVision,
        imageBase64,
        `Explain the problem completely with a real-life analogy. Prior response:\n${response}`,
        'vision_question',
        getAbortSignal()
      );
      setResponse(prev => `${prev}\n\n———\nDETAILED EXPLANATION\n———\n\n${result}`);
      setHelpTier(1);

      await persistDoubt({
        explain_text: result,
        vision: true,
      });
    } catch (err: unknown) {
      setResponse(prev => `${prev}\n\n(Error)`);
    } finally {
      setLoading(false);
    }
  };

  const handlePickDocument = async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: ['text/plain', 'text/markdown', 'application/json'],
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setUploadLabel(asset.name);
      const uri = asset.uri;
      const text = await FileSystem.readAsStringAsync(uri);
      setUploadExcerpt(text.slice(0, 12000));
      Alert.alert('Attached', `${asset.name} loaded (${text.length} chars, truncated for AI).`);
    } catch (e) {
      Alert.alert('Could not read file', 'Try a .txt or .md file.');
    }
  };

  const handleFollowUp = async () => {
    if (!followUp.trim() || !studentId) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const context = await buildStudentContext(studentId);
      const mode =
        helpTier === 0
          ? `Stay at hint level — still no direct final answers.${eli5 ? ' ELI5 wording.' : ''}`
          : `You may clarify with full explanations if needed.${eli5 ? ' ELI5 wording.' : ''}`;
      const result = await callSarvam(
        [
          { role: 'system', content: `Expert ${board} tutor. ${context}\n${mode}` },
          { role: 'assistant', content: response },
          { role: 'user', content: followUp },
        ],
        'doubt_solver',
        undefined,
        undefined,
        getAbortSignal()
      );
      setResponse(prev => `${prev}\n\n---\n\n${result}`);
      setFollowUp('');
    } catch (err: unknown) {
      setResponse(prev => `${prev}\n\n${err instanceof Error ? err.message : 'error'}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Voice handlers (Sarvam) ──────────────────────
  const handleStartRecording = async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        showVoiceError('Microphone permission required for voice input.');
        return;
      }

      if (Platform.OS === 'web') {
        // Web-specific recording using MediaRecorder
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        webAudioStreamRef.current = stream;
        const mediaRecorder = new MediaRecorder(stream);
        webMediaRecorderRef.current = mediaRecorder;
        webAudioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            webAudioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.start(100); // Capture data every 100ms
        setIsRecording(true);
      } else {
        // Native recording using expo-audio
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false, shouldRouteThroughEarpiece: false });
        if (audioRecorder.isRecording) { await audioRecorder.stop(); }
        setIsRecording(true);
        await audioRecorder.prepareToRecordAsync(); 
        audioRecorder.record();
      }
    } catch (err) {
      setIsRecording(false);
      showVoiceError('Could not start recording.');
    }
  };

  const handleStopRecording = async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsRecording(false);
    setSttLoading(true);
    try {
      let uri: string | null = null;
      
      if (Platform.OS === 'web') {
        // Web-specific stop and convert to blob URI
        const mediaRecorder = webMediaRecorderRef.current;
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          // Wait for the stop event to get the complete blob
          uri = await new Promise<string>((resolve) => {
            mediaRecorder.onstop = () => {
              const audioBlob = new Blob(webAudioChunksRef.current, { type: 'audio/webm' });
              const blobUrl = URL.createObjectURL(audioBlob);
              resolve(blobUrl);
            };
            mediaRecorder.stop();
          });
        }

        // Stop the audio stream
        if (webAudioStreamRef.current) {
          webAudioStreamRef.current.getTracks().forEach(track => track.stop());
        }
      } else {
        // Native stop using expo-audio
        if (!audioRecorder) return;
        await audioRecorder.stop();
        uri = audioRecorder.uri;
      }

      if (!uri) throw new Error('No recording URI');
      const result = await transcribeAudio(uri);
      if (result.text.trim()) {
        setQuestion(prev => prev ? prev + ' ' + result.text : result.text);
        setDetectedLang(result.language);
      } else {
        showVoiceError("Couldn't hear anything. Please try again.");
      }
    } catch (err: any) {
      showVoiceError(err.message || "Couldn't transcribe audio, please type your question.");
    } finally {
      setSttLoading(false);
    }
  };

  const handlePlayResponse = async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (ttsPlaying) {
      await stopCurrentAudio();
      setTtsPlaying(false);
      return;
    }
    if (!response.trim()) return;
    setTtsLoading(true);
    try {
      const langCode = detectedLang || await getStoredLanguageCode();
      const audioBase64 = await synthesizeSpeech(response.slice(0, 2400), langCode);
      if (audioBase64) {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false, shouldRouteThroughEarpiece: false });
        setTtsPlaying(true);
        const sound = await playAudioBase64(audioBase64);
        sound.setOnPlaybackStatusUpdate((status: any) => {
          if ('didJustFinish' in status && status.didJustFinish) {
            setTtsPlaying(false);
          }
        });
      }
    } catch {
      showVoiceError('Voice playback unavailable — text response is still visible.');
    } finally {
      setTtsLoading(false);
    }
  };

  // Mic pulse animation
  useEffect(() => {
    if (isRecording) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(micPulse, { toValue: 1.2, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(micPulse, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      micPulse.setValue(1);
    }
  }, [isRecording]);

  // Animations
  const screenFade = useRef(new Animated.Value(0)).current;
  const responseFade = useRef(new Animated.Value(0)).current;
  const responseSlide = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.timing(screenFade, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (response) {
      responseFade.setValue(0);
      responseSlide.setValue(20);
      Animated.parallel([
        Animated.timing(responseFade, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(responseSlide, { toValue: 0, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }
  }, [response]);

  // Streaming text reveal effect
  useEffect(() => {
    if (!response) { setDisplayedResponse(''); return; }
    setDisplayedResponse('');
    let idx = 0;
    const interval = setInterval(() => {
      idx += 3; // ~3 chars per tick at 80ms interval ≈ ~37 chars/sec
      if (idx >= response.length) {
        setDisplayedResponse(response);
        clearInterval(interval);
      } else {
        setDisplayedResponse(response.slice(0, idx));
      }
    }, 80);
    return () => clearInterval(interval);
  }, [response]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.ScrollView
        style={[styles.container, { backgroundColor: colors.background, opacity: screenFade }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Back navigation header */}
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
          <Text style={[styles.title, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Doubt Solver</Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Custom Tab selectors */}
        <View style={[styles.tabs, { backgroundColor: colors.surface2, borderColor: colors.borderSubtle }]}>
          {(
            [
              ['type', 'chatbubble-outline', 'Type'],
              ['photograph', 'camera-outline', 'Photo'],
              ['resources', 'folder-outline', 'Upload'],
            ] as const
          ).map(([key, icon, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.tab, tab === key && { backgroundColor: colors.surface1 }]}
              onPress={() => setTab(key)}
            >
              <Ionicons
                name={icon as keyof typeof Ionicons.glyphMap}
                size={16}
                color={tab === key ? colors.accent : colors.textTertiary}
              />
              <Text style={[styles.tabText, { color: tab === key ? colors.accent : colors.textTertiary, fontFamily: Fonts.bodyMedium }]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ELI5 option */}
        <TouchableOpacity
          style={[styles.eli5Row, { borderColor: colors.borderSubtle, backgroundColor: colors.surface2 }]}
          onPress={() => setEli5(v => !v)}
          activeOpacity={0.8}
        >
          <Ionicons name={eli5 ? 'checkbox' : 'square-outline'} size={22} color={eli5 ? colors.accent : colors.textTertiary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 14, fontFamily: Fonts.bodyMedium }}>
              Explain like I&apos;m 12 (ELI5)
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2, fontFamily: Fonts.body }}>
              Shorter words, analogies, less jargon in hints and explanations
            </Text>
          </View>
        </TouchableOpacity>

        {/* Subjects Selector */}
        <View style={[styles.subjectRow, { borderColor: colors.borderSubtle }]}>
          <Ionicons name="school-outline" size={18} color={colors.textTertiary} style={{ marginRight: 4 }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {SUBJECTS.map(s => (
              <Chip
                key={s.name}
                label={s.name}
                selected={subject === s.name}
                onPress={() => setSubject(s.name)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Chapters Selector */}
        {subject && chapters.length > 0 ? (
          <ScrollView horizontal style={{ marginBottom: 12 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {chapters.slice(0, 40).map(ch => (
              <Chip
                key={ch}
                label={ch}
                selected={chapter === ch}
                onPress={() => setChapter(ch)}
              />
            ))}
          </ScrollView>
        ) : null}

        {/* File upload tab details */}
        {tab === 'resources' && (
          <View style={[styles.box, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}>
            <Text style={{ color: colors.textSecondary, marginBottom: 10, fontSize: 13, fontFamily: Fonts.body }}>
              Attach plain-text study notes (.txt / .md). Content is saved with your profile for this session.
            </Text>
            <TouchableOpacity
              style={[styles.pickBtn, { borderColor: colors.borderSubtle }]}
              onPress={() => void handlePickDocument()}
            >
              <Ionicons name="document-attach-outline" size={22} color={colors.accent} />
              <Text style={{ color: colors.accent, fontWeight: '600', fontFamily: Fonts.bodyMedium }}>
                {uploadLabel || 'Choose text file'}
              </Text>
            </TouchableOpacity>
            {uploadExcerpt ? (
              <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 10, fontFamily: Fonts.body }}>
                Loaded {uploadExcerpt.length} characters
              </Text>
            ) : null}
          </View>
        )}

        {/* Text Input area */}
        {tab === 'type' && (
          <View style={[styles.inputArea, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
            <TextInput
              style={[styles.questionInput, { color: colors.textPrimary, fontFamily: Fonts.body }]}
              placeholder="Describe your doubt..."
              placeholderTextColor={colors.textTertiary}
              value={question}
              onChangeText={setQuestion}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.inputActions}>
              {/* Mic button */}
              <Animated.View style={{ transform: [{ scale: micPulse }] }}>
                <TouchableOpacity
                  style={[styles.micBtnSmall, {
                    backgroundColor: isRecording ? colors.danger : colors.surface3,
                    borderColor: isRecording ? colors.danger : colors.borderSubtle,
                  }]}
                  onPress={isRecording ? handleStopRecording : handleStartRecording}
                  disabled={sttLoading || loading}
                >
                  {sttLoading ? (
                    <ActivityIndicator size={14} color={colors.accent} />
                  ) : (
                    <Ionicons
                      name={isRecording ? 'stop' : 'mic'}
                      size={18}
                      color={isRecording ? colors.textInverse : colors.accent}
                    />
                  )}
                </TouchableOpacity>
              </Animated.View>
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: colors.accent }]}
                onPress={() => void handleSubmitText()}
                disabled={loading || !question.trim()}
              >
                {loading ? (
                  <ActivityIndicator color={colors.textInverse} size="small" />
                ) : (
                  <Text style={[styles.sendText, { color: colors.textInverse, fontFamily: Fonts.display }]}>Get hints</Text>
                )}
              </TouchableOpacity>
            </View>
            {isRecording && (
              <Text style={{ color: colors.danger, fontSize: 11, fontFamily: Fonts.bodyMedium, marginTop: 4 }}>
                ● Recording... tap mic to stop
              </Text>
            )}
          </View>
        )}

        {/* Photo Upload area */}
        {tab === 'photograph' && (
          <View>
            {image ? (
              <View style={styles.imagePreview}>
                <Image source={{ uri: image }} style={styles.previewImage} />
                <TouchableOpacity
                  style={[styles.removeImage, { backgroundColor: colors.danger }]}
                  onPress={() => {
                    setImage(null);
                    setImageBase64(null);
                  }}
                >
                  <Ionicons name="close" size={16} color="#FFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.pickBtn, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}
                onPress={() => void handlePickImage()}
              >
                <Ionicons name="image-outline" size={40} color={colors.textTertiary} />
                <Text style={[styles.pickText, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>Pick a photo</Text>
              </TouchableOpacity>
            )}
            {image ? (
              <View style={{ gap: 10, marginTop: 10 }}>
                <TouchableOpacity
                  style={[styles.sendBtn, { backgroundColor: colors.accent }]}
                  onPress={() => void handleSubmitPhoto()}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.textInverse} size="small" />
                  ) : (
                    <Text style={[styles.sendText, { color: colors.textInverse, fontFamily: Fonts.display }]}>Get hints from photo</Text>
                  )}
                </TouchableOpacity>
                {response ? (
                  <TouchableOpacity
                    style={[styles.sendBtn, { backgroundColor: colors.accentMuted }]}
                    onPress={() => void handlePhotoExplain()}
                    disabled={loading}
                  >
                    <Text style={[styles.sendText, { color: colors.accentHover, fontFamily: Fonts.display }]}>
                      Still stuck — full explanation
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
        )}

        {/* Doubt Response area */}
        {response ? (
          <Animated.View style={[styles.responseCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle, opacity: responseFade, transform: [{ translateY: responseSlide }] }]}>
            {/* Speaker icon for TTS */}
            <View style={styles.responseHeader}>
              <TouchableOpacity
                style={[styles.speakerBtn, { backgroundColor: colors.surface3 }]}
                onPress={handlePlayResponse}
                disabled={ttsLoading}
              >
                {ttsLoading ? (
                  <ActivityIndicator size={14} color={colors.accent} />
                ) : (
                  <Ionicons
                    name={ttsPlaying ? 'stop-circle' : 'volume-medium'}
                    size={18}
                    color={ttsPlaying ? colors.danger : colors.accent}
                  />
                )}
              </TouchableOpacity>
              <Text style={{ color: colors.textTertiary, fontSize: 11, fontFamily: Fonts.body, marginLeft: 6 }}>
                {ttsPlaying ? 'Playing...' : 'Listen'}
              </Text>
            </View>
            <ScrollView style={{ maxHeight: 400 }} nestedScrollEnabled>
              <MarkdownView content={displayedResponse} />
              {displayedResponse.length < response.length && (
                <Text style={{ color: colors.accent, fontSize: 16 }}>▍</Text>
              )}
            </ScrollView>

            {tab === 'type' && helpTier === 0 ? (
              <TouchableOpacity
                style={[styles.explainBtn, { backgroundColor: colors.accentMuted }]}
                onPress={() => void handleExplainFurther()}
                disabled={loading}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Ionicons name="bulb-outline" size={18} color={colors.accentHover} />
                  <Text style={{ color: colors.accentHover, fontWeight: '700', fontSize: 14, fontFamily: Fonts.display }}>
                    Still stuck — explain with examples
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {/* Follow up row */}
            <View style={[styles.followUpRow, { borderTopColor: colors.borderSubtle }]}>
              <TextInput
                style={[styles.followUpInput, { color: colors.textPrimary, fontFamily: Fonts.body }]}
                placeholder="Follow-up..."
                placeholderTextColor={colors.textTertiary}
                value={followUp}
                onChangeText={setFollowUp}
              />
              <TouchableOpacity onPress={() => void handleFollowUp()} disabled={loading || !followUp.trim()}>
                <Ionicons name="arrow-up-circle" size={32} color={followUp.trim() ? colors.accent : colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : null}
      </Animated.ScrollView>
      <TranscriptionOverlay visible={sttLoading} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 56 : 36, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontWeight: '600', letterSpacing: -0.4 },
  tabs: { flexDirection: 'row', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 3, marginBottom: 16 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12 },
  tabText: { fontSize: 13, fontWeight: '600' },
  subjectRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  inputArea: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 16, marginBottom: 16 },
  questionInput: { minHeight: 120, fontSize: 15, lineHeight: 22 },
  inputActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 8, alignItems: 'center' },
  sendBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, justifyContent: 'center' },
  sendText: { fontSize: 14, fontWeight: '700' },
  micBtnSmall: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  speakerBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  responseHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  pickBtn: { borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', borderRadius: 14, padding: 28, alignItems: 'center', gap: 12 },
  pickText: { fontSize: 14 },
  imagePreview: { borderRadius: 14, overflow: 'hidden', marginBottom: 8 },
  previewImage: { width: '100%', height: 200, borderRadius: 14 },
  removeImage: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  responseCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 20, marginTop: 16 },
  explainBtn: { marginTop: 16, padding: 14, borderRadius: 12 },
  followUpRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  followUpInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  box: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 16 },
  eli5Row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
