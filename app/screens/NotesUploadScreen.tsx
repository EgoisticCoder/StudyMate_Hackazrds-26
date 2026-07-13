import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Image, Alert, Platform, Animated, Easing, Modal
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
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
import { callSarvam, parseSarvamJSON } from '../../lib/ai';
import { transcribeNoteImages } from '../../lib/sarvamDocument';
import { transcribeAudio } from '../../lib/sarvam';
import { saveNote } from '../../lib/notesDB';
import { writeQuery } from '../../lib/neo4j';
import { getStudentProfile } from '../../lib/adaptiveEngine';
import { SUBJECTS } from '../../constants/subjects';
import { getChaptersForSubject } from '../../constants/chapters';
import { Fonts } from '../../constants/fonts';
import { Radii, Spacing } from '../../constants/colors';
import { Chip, PrimaryButton, AnimatedScreenWrapper, SectionLabel } from '../../components/ui/premium';
import { TranscriptionOverlay } from '../../components/TranscriptionOverlay';
import { v4 as uuidv4 } from 'uuid';

export default function NotesUploadScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  
  const [step, setStep] = useState(1);
  const [subject, setSubject] = useState('');
  const [chapter, setChapter] = useState('');
  const [chapters, setChapters] = useState<string[]>([]);
  
  // Multi-image support
  const [images, setImages] = useState<{ uri: string; base64: string }[]>([]);
  const [transcription, setTranscription] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const [detectedSubject, setDetectedSubject] = useState('');
  const [detectedChapter, setDetectedChapter] = useState('');
  const [subjectConfirmed, setSubjectConfirmed] = useState(false);
  const [userPickedSubject, setUserPickedSubject] = useState('');
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

  // Backward compat helpers
  const image = images.length > 0 ? images[0].uri : null;
  const imageBase64 = images.length > 0 ? images[0].base64 : null;

  // Voice recording states for voice-assisted edits
  const audioRecorder = useAudioRecorder(SARVAM_RECORDING_OPTIONS);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  
  // Animated value for mic pulse
  const micPulseAnim = useRef(new Animated.Value(1)).current;

  // Web-specific recording refs
  const webMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webAudioChunksRef = useRef<Blob[]>([]);
  const webAudioStreamRef = useRef<MediaStream | null>(null);

  const [board, setBoard] = useState('ICSE');
  const [classNum, setClassNum] = useState(10);

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

  // Pulsing mic animation when recording
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(micPulseAnim, {
            toValue: 1.15,
            duration: 600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(micPulseAnim, {
            toValue: 1,
            duration: 600,
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
    if (subject) {
      // Falls back to ICSE / class 10 only if the profile fetch above hasn't
      // resolved yet or failed — otherwise uses the student's real board/class.
      setChapters(getChaptersForSubject(subject, board, classNum));
    }
  }, [subject, board, classNum]);

  const handlePickImage = async (useCamera = false) => {
    // Haptic feedback
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      let result;
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Camera permission is required to take notes photos.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          allowsMultipleSelection: true,
        });
      }

      if (!result.canceled && result.assets.length > 0) {
        setLoading(true);
        setLoadingText('Compressing images...');
        const newImages: { uri: string; base64: string }[] = [];
        for (const asset of result.assets) {
          const manipResult = await ImageManipulator.manipulateAsync(
            asset.uri,
            [{ resize: { width: 900 } }],
            { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
          );
          if (manipResult.base64) {
            // On web, expo-image-manipulator returns a `blob:` URL for `uri`.
            // Blob URLs are only valid for the lifetime of the page/session that
            // created them — once persisted (notesDB/Neo4j) and reloaded later
            // (e.g. viewing the note in a new session), they 404 with
            // ERR_FILE_NOT_FOUND. Use a durable base64 data URI on web instead;
            // native keeps the manipulator's file:// uri, which notesDB already
            // copies to permanent storage.
            const persistentUri = Platform.OS === 'web'
              ? `data:image/jpeg;base64,${manipResult.base64}`
              : manipResult.uri;
            newImages.push({ uri: persistentUri, base64: manipResult.base64 });
          }
        }
        setImages(prev => [...prev, ...newImages]);
      }
    } catch (e) {
      console.error('Image picking failed', e);
      Alert.alert('Error', 'Failed to load image.');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  const handleRunOCR = async () => {
    if (images.length === 0) return;
    // Haptic feedback
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setOcrLoading(true);
    setOcrStatus('Preparing images for Sarvam OCR...');
    setSubjectConfirmed(false);
    try {
      const allBase64 = images.map(img => img.base64);
      setOcrStatus(`Transcribing ${images.length} page${images.length > 1 ? 's' : ''} with AI...`);
      const combinedText = await transcribeNoteImages(allBase64, (status: any) => {
        setOcrStatus(status);
      }, getAbortSignal());
      setTranscription(combinedText);

      setOcrStatus('Detecting subject & chapter...');
      try {
        const classifyPrompt = `You are a study notes subject/chapter classifier. Analyze the following transcribed text and determine its subject and chapter.
Subject must be one of: Physics, Chemistry, Mathematics, Biology, Computer Applications, History & Civics, English, Geography.
Chapter should be the most appropriate chapter name for the notes.

Notes text:
"""
${combinedText.substring(0, 2000)}
"""

Return ONLY a valid JSON object matching this format. Do not use markdown backticks:
{
  "subject": "Physics",
  "chapter": "Motion in One Dimension"
}`;
        const classRes = await callSarvam(
          [{ role: 'user', content: classifyPrompt }],
          'baseline_analysis'
        );
        const parsed = parseSarvamJSON<{ subject: string; chapter: string }>(classRes);
        if (parsed.subject && parsed.chapter) {
          const cleanSubject = parsed.subject.trim();
          const cleanChapter = parsed.chapter.trim();
          setDetectedSubject(cleanSubject);
          setDetectedChapter(cleanChapter);
          setSubject(cleanSubject);
          setChapter(cleanChapter);
          if (!userPickedSubject || userPickedSubject === cleanSubject) {
            setSubjectConfirmed(true);
          }
          // Show confirmation alert for subject detection
          if (userPickedSubject && userPickedSubject !== cleanSubject) {
            Alert.alert(
              'Subject Mismatch Detected',
              `You selected "${userPickedSubject}" but the AI detected "${cleanSubject}" from your notes.\n\nUsing the wrong subject may affect mind maps, flashcards, and quiz generation accuracy.`,
              [
                { text: `Use "${cleanSubject}"`, onPress: () => { setSubject(cleanSubject); setSubjectConfirmed(true); }, isPreferred: true },
                { text: `Keep "${userPickedSubject}"`, onPress: () => setSubjectConfirmed(true), style: 'destructive' },
              ]
            );
          }
        }
      } catch (classErr) {
        console.warn('Auto-classification failed', classErr);
      }

      setStep(3);
    } catch (err: any) {
      console.error('OCR failed', err);
      Alert.alert('OCR Failed', err.message || 'Could not transcribe image. Please edit manually.');
      setTranscription('');
      setStep(3);
    } finally {
      setOcrLoading(false);
      setOcrStatus('');
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  // Voice Command recording logic
  const startRecording = async () => {
    // Haptic feedback for start recording
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission Denied', 'Microphone permissions are required for voice editing.');
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
        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();
        setIsRecording(true);
      }
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    // Haptic feedback for stop recording
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setIsRecording(false);
    setVoiceProcessing(true);
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
        await audioRecorder.stop();
        uri = audioRecorder.uri;
      }

      if (uri) {
        // Transcribe voice command via Sarvam
        const stt = await transcribeAudio(uri);
        const command = stt.text;

        if (command && command.trim().length > 1) {
          Alert.alert('Voice Command Detected', `"${command}"\nApplying correction via AI...`);
          
          // Apply voice command to transcription using LLM
          const sysPrompt = 'You are a notes correction helper. You take original notes and apply a user\'s edit instruction/voice correction to them.';
          const prompt = `Apply the following voice correction command to the notes transcription.
Original Notes:
"""
${transcription}
"""

Voice Correction Command:
"${command}"

Return ONLY the corrected, revised notes transcription text. Do not output any chat wrapper, conversational text, explanations, or code blocks.`;

          const correctedNotes = await callSarvam(
            [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: prompt }
            ],
            'notes_generator'
          );

          if (correctedNotes && correctedNotes.trim().length > 0) {
            setTranscription(correctedNotes);
          }
        }
      }
    } catch (err: any) {
      console.error('Voice command correction failed', err);
      Alert.alert('Correction Failed', err.message || 'Could not process voice command.');
    } finally {
      setVoiceProcessing(false);
    }
  };

  const handleSaveNote = async () => {
    if ((!transcription.trim() && !image) || !studentId) {
      Alert.alert('Incomplete', 'Please provide either text notes or an image.');
      return;
    }
    // Haptic feedback
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    setLoading(true);
    
    let finalSubject = subject;
    let finalChapter = chapter;

    if (transcription.trim()) {
      try {
        setLoadingText('Checking note classification...');
        const classifyPrompt = `You are a study notes subject/chapter classifier. Analyze the following notes text and determine its subject and chapter.
Subject must be one of: Physics, Chemistry, Mathematics, Biology, Computer Applications, History & Civics, English, Geography.
Chapter should be the most appropriate chapter name for the notes.

Notes text:
"""
${transcription.trim()}
"""

Return ONLY a valid JSON object matching this format. Do not use markdown backticks:
{
  "subject": "Physics",
  "chapter": "Motion in One Dimension"
}`;
        const classRes = await callSarvam(
          [{ role: 'user', content: classifyPrompt }],
          'baseline_analysis'
        );
        const parsed = parseSarvamJSON<{ subject: string; chapter: string }>(classRes);
        if (parsed.subject && parsed.chapter) {
          finalSubject = parsed.subject.trim();
          finalChapter = parsed.chapter.trim();
        }
      } catch (err) {
        console.warn('Classification check failed', err);
      }
    }

    setLoadingText('Saving note...');
    const noteId = uuidv4();
    try {
      // 1. Save to Offline FileSystem JSON Database
      const saved = await saveNote({
        id: noteId,
        subject: finalSubject,
        chapter: finalChapter,
        image_uri: image || undefined,
        transcription: transcription.trim(),
      });

      // 2. Try to sync to Neo4j right now (online sync)
      try {
        await writeQuery(
          `MATCH (s:Student {id: $studentId})
           CREATE (n:StudyNote {
             id: $id, subject: $subject, chapter: $chapter,
             transcription: $transcription, image_uri: $imageUri,
             created_at: datetime(), updated_at: datetime()
           })
           CREATE (s)-[:OWNS_NOTE]->(n)`,
          {
            studentId,
            id: noteId,
            subject: finalSubject,
            chapter: finalChapter,
            transcription: transcription.trim(),
            imageUri: saved.image_uri || '',
          }
        );
        // Mark as synced in offline DB
        const notesDB = require('../../lib/notesDB');
        await notesDB.updateNote(noteId, { synced: true });
      } catch (neoErr) {
        console.warn('Could not sync to Neo4j. Note kept offline-only.', neoErr);
      }

      const classificationChanged = finalSubject !== subject || finalChapter !== chapter;
      if (classificationChanged) {
        Alert.alert('Note Saved', `Your study notes have been saved under the corrected classification:\nSubject: ${finalSubject}\nChapter: ${finalChapter}`);
      } else {
        Alert.alert('Note Saved', 'Your study notes have been saved successfully!');
      }
      try {
        router.back();
      } catch {
        router.replace('/');
      }
    } catch (e: any) {
      console.error('Failed to save note', e);
      Alert.alert('Error', 'Failed to save study notes locally.');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  // Step transitions
  const stepFade = useRef(new Animated.Value(1)).current;
  const stepSlide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    stepFade.setValue(0);
    stepSlide.setValue(12);
    Animated.parallel([
      Animated.timing(stepFade, { toValue: 1, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(stepSlide, { toValue: 0, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [step]);

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View style={{ flex: 1 }}>
            <SectionLabel text="SELECT SUBJECT & CHAPTER" style={{ marginBottom: 12 }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, maxHeight: 44 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 4 }}>
                {SUBJECTS.map(s => (
                  <Chip
                    key={s.name}
                    label={s.name}
                    selected={subject === s.name}
                    onPress={() => {
                      setSubject(s.name);
                      setUserPickedSubject(s.name);
                      setChapter('');
                    }}
                  />
                ))}
              </View>
            </ScrollView>
            {subject && chapters.length > 0 && (
              <View style={[styles.chapterList, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 250 }}>
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
            {subject && chapters.length === 0 && (
              <View style={[styles.chapterList, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1, padding: 14 }]}>
                <Text style={{ color: colors.textSecondary, fontFamily: Fonts.body, fontSize: 13, marginBottom: 10 }}>
                  We don't have a preset chapter list for {subject} at your class level yet. Type the chapter name to continue.
                </Text>
                <TextInput
                  style={[styles.chapterInput, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.surface2, fontFamily: Fonts.body, marginBottom: 10 }]}
                  placeholder="e.g. Motion in One Dimension"
                  placeholderTextColor={colors.textTertiary}
                  value={chapter}
                  onChangeText={setChapter}
                  returnKeyType="done"
                />
                <PrimaryButton
                  label="Continue"
                  disabled={!chapter.trim()}
                  onPress={() => setStep(2)}
                />
              </View>
            )}
          </View>
        );
      case 2:
        return (
          <View style={{ flex: 1 }}>
            <SectionLabel text="UPLOAD NOTES IMAGES" style={{ marginBottom: 12 }} />
            {images.length > 0 ? (
              <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 10 }}>
                {images.map((img, idx) => (
                  <View key={idx} style={[styles.imageContainer, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}>
                    <Image source={{ uri: img.uri }} style={styles.noteImage} resizeMode="contain" />
                    <TouchableOpacity 
                      onPress={() => removeImage(idx)}
                      style={[styles.removeImg, { backgroundColor: colors.danger }]}
                    >
                      <Ionicons name="close" size={14} color="#FFF" />
                    </TouchableOpacity>
                    <View style={[styles.pageBadge, { backgroundColor: colors.accent }]}>
                      <Text style={{ color: '#FFF', fontSize: 10, fontFamily: Fonts.bodyMedium }}>Page {idx + 1}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity 
                    style={[styles.pickArea, { flex: 1, borderColor: colors.borderMedium, backgroundColor: colors.surface1, padding: 24 }]} 
                    onPress={() => handlePickImage(false)}
                  >
                    <Ionicons name="images-outline" size={32} color={colors.textSecondary} />
                    <Text style={[{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium, marginTop: 12, textAlign: 'center' }]}>
                      Gallery
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.pickArea, { flex: 1, borderColor: colors.borderMedium, backgroundColor: colors.surface1, padding: 24 }]} 
                    onPress={() => handlePickImage(true)}
                  >
                    <Ionicons name="camera-outline" size={32} color={colors.textSecondary} />
                    <Text style={[{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium, marginTop: 12, textAlign: 'center' }]}>
                      Camera
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.divider, { backgroundColor: colors.borderSubtle, marginVertical: 16 }]} />

                <TouchableOpacity
                  style={[styles.pickArea, { borderColor: colors.accent + '50', backgroundColor: colors.accentMuted, padding: 28 }]}
                  onPress={() => {
                    setTranscription('');
                    setStep(3);
                  }}
                >
                  <Ionicons name="document-text-outline" size={36} color={colors.accent} />
                  <Text style={{ color: colors.accent, fontFamily: Fonts.bodyMedium, marginTop: 12, fontSize: 16 }}>
                    Type Notes Manually
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontFamily: Fonts.body, marginTop: 6, fontSize: 13, textAlign: 'center' }}>
                    Skip AI transcription and write your notes yourself
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            
            {images.length > 0 && (
              <View style={{ marginTop: 16, gap: 12 }}>
                {/* Add more images buttons */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.addMoreBtn, { flex: 1, borderColor: colors.borderMedium, backgroundColor: colors.surface1 }]}
                    onPress={() => handlePickImage(false)}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium, fontSize: 13 }}>
                      Add from Gallery
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.addMoreBtn, { flex: 1, borderColor: colors.borderMedium, backgroundColor: colors.surface1 }]}
                    onPress={() => handlePickImage(true)}
                  >
                    <Ionicons name="camera-outline" size={18} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium, fontSize: 13 }}>
                      Take Photo
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ color: colors.textTertiary, fontSize: 11, fontFamily: Fonts.body, textAlign: 'center' }}>
                  {images.length} page{images.length > 1 ? 's' : ''} selected — AI will transcribe all pages
                </Text>

                <PrimaryButton
                  label={ocrLoading ? 'Processing...' : `Run OCR Transcription (${images.length} page${images.length > 1 ? 's' : ''})`}
                  disabled={ocrLoading || loading}
                  icon={
                    ocrLoading ? (
                      <ActivityIndicator size="small" color={colors.textTertiary} />
                    ) : (
                      <Ionicons name="sparkles" size={16} color={colors.textInverse} />
                    )
                  }
                  onPress={handleRunOCR}
                />
                <TouchableOpacity
                  style={[styles.skipBtn, { borderColor: colors.accent, backgroundColor: colors.accent + '15', height: 52, borderRadius: Radii.button }]}
                  onPress={handleSaveNote}
                  disabled={loading || ocrLoading}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="save-outline" size={18} color={colors.accent} />
                    <Text style={{ color: colors.accent, fontFamily: Fonts.bodyMedium }}>
                      Save Image Only (No OCR)
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.skipBtn, { borderColor: colors.borderSubtle, height: 52, borderRadius: Radii.button }]}
                  onPress={() => {
                    setTranscription('');
                    setStep(3);
                  }}
                >
                  <Text style={{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium }}>
                    Skip OCR, Type Text Instead
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      case 3:
        return (
          <View style={{ flex: 1 }}>
            <SectionLabel text="VERIFY & EDIT TRANSCRIPTION" style={{ marginBottom: 12 }} />

            {(detectedSubject || subject) ? (
              <View style={[styles.classifyCard, { backgroundColor: colors.surface2, borderColor: colors.borderSubtle, marginBottom: 12 }]}>
                <Text style={{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium, fontSize: 12, marginBottom: 8 }}>
                  AI detected this note as:
                </Text>
                <Text style={{ color: colors.textPrimary, fontFamily: Fonts.display, fontSize: 16 }}>
                  {detectedSubject || subject} · {detectedChapter || chapter || 'General'}
                </Text>

                {userPickedSubject && detectedSubject && userPickedSubject !== detectedSubject && !subjectConfirmed && (
                  <View style={[styles.warningBox, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '40' }]}>
                    <Ionicons name="warning-outline" size={16} color={colors.warning} />
                    <Text style={{ color: colors.warning, fontFamily: Fonts.body, fontSize: 12, flex: 1, marginLeft: 8 }}>
                      You selected {userPickedSubject} but the note looks like {detectedSubject}. Mind maps & flashcards may not work well with the wrong subject.
                    </Text>
                  </View>
                )}

                <Text style={{ color: colors.textTertiary, fontFamily: Fonts.body, fontSize: 11, marginTop: 10, marginBottom: 6 }}>
                  Keep this classification or pick the correct subject:
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {SUBJECTS.map(s => (
                      <Chip
                        key={s.name}
                        label={s.name}
                        selected={subject === s.name}
                        onPress={() => {
                          setSubject(s.name);
                          setSubjectConfirmed(true);
                        }}
                      />
                    ))}
                  </View>
                </ScrollView>
                <TextInput
                  style={[styles.chapterInput, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.surface1, fontFamily: Fonts.body }]}
                  placeholder="Chapter name"
                  placeholderTextColor={colors.textTertiary}
                  value={chapter}
                  onChangeText={setChapter}
                />
                {!subjectConfirmed && (
                  <TouchableOpacity
                    style={[styles.confirmBtn, { backgroundColor: colors.accent }]}
                    onPress={() => setSubjectConfirmed(true)}
                  >
                    <Text style={{ color: colors.textInverse, fontFamily: Fonts.bodyMedium }}>Confirm Classification</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
            
            <View style={{ position: 'relative', marginBottom: 16 }}>
              <TextInput
                style={[
                  styles.transcriptionInput, 
                  { 
                    color: colors.textPrimary, 
                    borderColor: colors.borderSubtle, 
                    backgroundColor: colors.surface1,
                    fontFamily: Fonts.body,
                  }
                ]}
                placeholder="Transcribing notes text here..."
                placeholderTextColor={colors.textTertiary}
                value={transcription}
                onChangeText={setTranscription}
                multiline
              />
              
              {voiceProcessing && (
                <View style={[styles.inputOverlay, { backgroundColor: 'rgba(9,9,12,0.8)' }]}>
                  <ActivityIndicator size="large" color={colors.accent} />
                  <Text style={{ color: colors.textPrimary, fontFamily: Fonts.bodyMedium, marginTop: 8 }}>
                    Applying Voice Correction...
                  </Text>
                </View>
              )}
            </View>

            {/* Voice Command Button */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <Animated.View
                style={{
                  transform: [{ scale: micPulseAnim }],
                }}
              >
                <TouchableOpacity
                  onPressIn={startRecording}
                  onPressOut={stopRecording}
                  style={[
                    styles.voiceBtn,
                    {
                      backgroundColor: isRecording ? colors.danger : colors.accentMuted,
                      borderColor: isRecording ? colors.danger : colors.accentBorder,
                    }
                  ]}
                >
                  <Ionicons 
                    name={isRecording ? 'mic' : 'mic-outline'} 
                    size={24} 
                    color={isRecording ? '#FFF' : colors.accent} 
                  />
                </TouchableOpacity>
              </Animated.View>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: Fonts.body, marginTop: 6, textAlign: 'center' }}>
                {isRecording 
                  ? 'Release to Apply Voice Correction' 
                  : 'Hold & Speak to correct transcription (e.g. "Fix spelling of gravity")'}
              </Text>
            </View>

            <PrimaryButton
              label="Save Study Note"
              disabled={(!transcription.trim() && !image) || loading || (!!detectedSubject && !subjectConfirmed)}
              onPress={handleSaveNote}
            />
          </View>
        );
      default: return null;
    }
  };

  return (
    <AnimatedScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerArea}>
        <TouchableOpacity 
          onPress={() => {
            if (step > 1) setStep(step - 1);
            else {
              try {
                try {
        router.back();
      } catch {
        router.replace('/');
      }
              } catch {
                router.replace('/');
              }
            }
          }} 
          style={[styles.backBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
          Upload Notes
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[styles.loadingText, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>
              {loadingText}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.stepRow}>
              {[1, 2, 3].map(s => (
                <View 
                  key={s} 
                  style={[
                    styles.stepDot, 
                    {
                      backgroundColor: s <= step ? colors.accent : colors.borderSubtle,
                      flex: s === step ? 2 : 1,
                    }
                  ]} 
                />
              ))}
            </View>
            <Animated.View style={{ opacity: stepFade, transform: [{ translateY: stepSlide }], flex: 1 }}>
              {renderStep()}
            </Animated.View>
          </>
        )}
      </View>
      <TranscriptionOverlay visible={voiceProcessing} statusText="Applying voice correction..." />
      <Modal visible={ocrLoading} transparent animationType="fade">
        <View style={styles.ocrLoadingOverlay}>
          <View style={[styles.ocrLoadingBox, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[styles.ocrLoadingTitle, { color: colors.textPrimary, fontFamily: Fonts.displayMedium }]}>
              Analyzing Notes
            </Text>
            <Text style={[styles.ocrLoadingStatus, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
              {ocrStatus || 'Please wait while AI processes your document...'}
            </Text>
          </View>
        </View>
      </Modal>
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
  pickArea: { 
    borderWidth: 1, 
    borderStyle: 'dashed', 
    borderRadius: Radii.card, 
    padding: 32, 
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainer: { 
    borderRadius: Radii.card, 
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden', 
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteImage: { width: '100%', height: 300 },
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
  transcriptionInput: { 
    borderWidth: StyleSheet.hairlineWidth, 
    borderRadius: Radii.card, 
    padding: 16, 
    minHeight: 220, 
    fontSize: 15, 
    textAlignVertical: 'top',
  },
  inputOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radii.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  skipBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
    borderRadius: Radii.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
  },
  divider: { height: 1, marginHorizontal: 16 },
  pageBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  addMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  classifyCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.card,
    padding: 14,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
  },
  chapterInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  confirmBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  ocrLoadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ocrLoadingBox: {
    width: '80%',
    padding: 32,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
      web: {
        boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.3)',
      },
    }),
  },
  ocrLoadingTitle: {
    fontSize: 20,
    marginTop: 8,
  },
  ocrLoadingStatus: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
