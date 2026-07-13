import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Platform, KeyboardAvoidingView, Animated,
  Easing
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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


import Markdown from 'react-native-markdown-display';
import { useTheme } from '../../lib/context';
import { getNotes, Note } from '../../lib/notesDB';
import { callSarvam } from '../../lib/ai';
import { transcribeAudio, synthesizeSpeech, playAudioBase64, stopCurrentAudio, isAudioPlaying } from '../../lib/sarvam';
import { Fonts } from '../../constants/fonts';
import { Radii, Spacing } from '../../constants/colors';
import { AnimatedScreenWrapper, SurfaceCard } from '../../components/ui/premium';
import { TranscriptionOverlay } from '../../components/TranscriptionOverlay';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  isPlaying?: boolean;
}

export default function NotesRAGScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ noteId?: string; noteText?: string }>();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [allNotesCount, setAllNotesCount] = useState(0);
  
  // Animated values for UI polish
  const micPulseAnim = useRef(new Animated.Value(1)).current;
  const sendBtnOpacityAnim = useRef(new Animated.Value(1)).current;
  const ttsBtnScaleAnim = useRef(new Animated.Value(1)).current;

  // Audio Recording states for voice input
  const audioRecorder = useAudioRecorder(SARVAM_RECORDING_OPTIONS);
  const [isRecording, setIsRecording] = useState(false);
  const [sttLoading, setSttLoading] = useState(false);
  const [isProcessingRecording, setIsProcessingRecording] = useState(false);

  // Web-specific recording refs
  const webMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webAudioChunksRef = useRef<Blob[]>([]);
  const webAudioStreamRef = useRef<MediaStream | null>(null);
  
  // TTS loading state
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);

  // Handle pulsing mic animation when recording
  useEffect(() => {
    if (isRecording) {
      // Start pulsing animation loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(micPulseAnim, {
            toValue: 1.2,
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
      // Stop pulsing animation
      micPulseAnim.stopAnimation(() => {
        micPulseAnim.setValue(1);
      });
    }
  }, [isRecording]);

  useEffect(() => {
    // Initial welcome message
    (async () => {
      const notes = await getNotes();
      setAllNotesCount(notes.length);
      
      let welcomeContent = "Hi! I'm your StudyMate Notes Assistant. Ask me any question, and I'll search through all your uploaded study notes to answer you.";
      if (params.noteId && params.noteText) {
        welcomeContent = `I see you came from your notes on chapter. Go ahead and ask me anything about these notes specifically, or about your other subjects!`;
      }

      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: welcomeContent,
        }
      ]);
    })();
  }, [params.noteId]);

  // Retrieve matching context paragraphs from notes database
  const retrieveContext = async (question: string): Promise<{ context: string; sources: string[] }> => {
    // If we passed specific notes context via navigation params, prioritize it
    if (params.noteText && params.noteId) {
      return { 
        context: `[Source Note: Current Note]\n${params.noteText}`,
        sources: ['Current Note']
      };
    }

    const allNotes = await getNotes();
    if (allNotes.length === 0) {
      return { context: "No notes uploaded yet.", sources: [] };
    }

    // Keyword term matching
    const queryTerms = question.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(term => term.length > 2);

    if (queryTerms.length === 0) {
      // Return latest notes as fallback
      const recent = allNotes.slice(0, 2);
      return {
        context: recent.map(n => `[Note: ${n.subject} - ${n.chapter}]\n${n.transcription}`).join('\n\n'),
        sources: recent.map(n => `${n.subject} (${n.chapter})`)
      };
    }

    interface Chunk {
      text: string;
      noteTitle: string;
      score: number;
    }

    const chunks: Chunk[] = [];
    const matchedNotes = new Set<string>();

    for (const note of allNotes) {
      const paragraphs = note.transcription.split(/\n\n+/);
      for (const paragraph of paragraphs) {
        if (paragraph.trim().length < 15) continue;
        
        let score = 0;
        const lowerParagraph = paragraph.toLowerCase();
        
        for (const term of queryTerms) {
          if (lowerParagraph.includes(term)) {
            score += 1;
            // Extra weight if keyword matches subject/chapter titles
            if (note.subject.toLowerCase().includes(term) || note.chapter.toLowerCase().includes(term)) {
              score += 2;
            }
          }
        }

        if (score > 0) {
          chunks.push({
            text: paragraph.trim(),
            noteTitle: `${note.subject} — ${note.chapter}`,
            score
          });
          matchedNotes.add(`${note.subject} — ${note.chapter}`);
        }
      }
    }

    // Sort by relevance score
    chunks.sort((a, b) => b.score - a.score);

    if (chunks.length === 0) {
      // Fallback
      const recent = allNotes.slice(0, 2);
      return {
        context: recent.map(n => `[Note: ${n.subject} - ${n.chapter}]\n${n.transcription}`).join('\n\n'),
        sources: recent.map(n => `${n.subject} (${n.chapter})`)
      };
    }

    // Take top 4 most relevant chunks
    const topChunks = chunks.slice(0, 4);
    const context = topChunks.map(c => `[Source Note: ${c.noteTitle}]\n${c.text}`).join('\n\n');
    
    // Extract unique sources
    const sources = Array.from(new Set(topChunks.map(c => c.noteTitle)));
    
    return { context, sources };
  };

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query) return;

    // Haptic feedback
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Animate send button
    Animated.sequence([
      Animated.timing(sendBtnOpacityAnim, {
        toValue: 0.7,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(sendBtnOpacityAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    if (!textToSend) setInput('');
    setLoading(true);

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: query };
    setMessages(prev => [...prev, userMsg]);
    
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      // 1. Perform Context Retrieval
      const { context, sources } = await retrieveContext(query);

      // 2. Query LLM with retrieved notes context
      const sysPrompt = `You are a helpful companion study AI.
You answer students' academic questions based on their uploaded handwritten study notes.
Here is the context retrieved from their local database of notes:
"""
${context}
"""

Instructions:
1. Answer the question comprehensively using the context.
2. If the context does not contain enough information to answer, use your pre-trained knowledge to answer, but clearly state "Based on general knowledge (not direct notes): ...".
3. Use markdown (headers, lists, bold text) to keep explanations extremely clear.
4. Keep the tone encouraging, scholarly, and supportive.`;

      const aiResponse = await callSarvam(
        [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: query }
        ],
        'doubt_solver'
      );

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponse,
        sources: sources.length > 0 ? sources : undefined
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to query assistant.');
    } finally {
      setLoading(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  // Sarvam Voice Input (STT) recording
  const toggleRecording = async () => {
    if (isProcessingRecording || sttLoading) return;

    if (isRecording) {
      // Stop recording
      setIsProcessingRecording(true);
      // Haptic feedback for stopping recording
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      setIsRecording(false);
      setSttLoading(true);
      try {
        let uri: string | null = null;

        if (Platform.OS === 'web') {
          // Web-specific stop and convert to blob URI
          const mediaRecorder = webMediaRecorderRef.current;
          if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            // Request the last data chunk before stopping
            mediaRecorder.requestData();
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
          const res = await transcribeAudio(uri);
          if (res.text && res.text.trim()) {
            setInput(res.text);
            // Auto send option
            Alert.alert(
              'Voice Input Transcribed',
              `"${res.text}"`,
              [
                { text: 'Edit', style: 'cancel' },
                { text: 'Send Question', onPress: () => handleSend(res.text) }
              ]
            );
          }
        }
      } catch (e: any) {
        console.error(e);
        Alert.alert('STT Failed', 'Could not transcribe your voice. Please try again.');
      } finally {
        setSttLoading(false);
        setIsProcessingRecording(false);
      }
    } else {
      // Start recording
      // Haptic feedback for starting recording
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (permission.status !== 'granted') {
          Alert.alert('Permission Denied', 'Microphone permissions are required for voice input.');
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
        console.error('Failed to start voice input recording', err);
      }
    }
  };

  // Sarvam Voice Output (TTS) reading
  const handleToggleSpeak = async (msg: Message) => {
    // Haptic feedback
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Scale animation
    Animated.sequence([
      Animated.timing(ttsBtnScaleAnim, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(ttsBtnScaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    // If playing, stop it
    if (msg.isPlaying) {
      await stopCurrentAudio();
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isPlaying: false } : m));
      return;
    }

    // Stop other playbacks
    await stopCurrentAudio();
    setMessages(prev => prev.map(m => m.isPlaying ? { ...m, isPlaying: false } : m));

    setTtsLoadingId(msg.id);
    try {
      // Strip markdown tags before synthesizing speech
      const plainText = msg.content
        .replace(/#+\s/g, '')
        .replace(/\*\*/g, '')
        .replace(/_/g, '')
        .replace(/`/g, '')
        .slice(0, 800); // chunk to reasonable length

      const audioBase64 = await synthesizeSpeech(plainText, 'en-IN');
      
      setTtsLoadingId(null);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isPlaying: true } : m));

      const sound = await playAudioBase64(audioBase64);
      
      // Handle completion callback
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if ('didJustFinish' in status && status.didJustFinish) {
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isPlaying: false } : m));
        }
      });
    } catch (e: any) {
      console.error(e);
      setTtsLoadingId(null);
      Alert.alert('TTS Failed', 'Failed to generate audio playback.');
    }
  };

  return (
    <AnimatedScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
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
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
            Ask Notes RAG
          </Text>
          <Text style={{ fontSize: 11, color: colors.textTertiary, fontFamily: Fonts.body }}>
            Searching {params.noteId ? 'Current Note' : `${allNotesCount} Local Study Notes`}
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.chatArea}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.map(msg => (
            <View 
              key={msg.id}
              style={[
                styles.messageRow,
                { justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }
              ]}
            >
              {msg.role === 'assistant' && (
                <View style={[styles.avatar, { backgroundColor: colors.accentMuted }]}>
                  <Ionicons name="sparkles" size={14} color={colors.accent} />
                </View>
              )}

              <View style={{ maxWidth: '82%', gap: 4 }}>
                <View 
                  style={[
                    styles.messageBubble,
                    {
                      backgroundColor: msg.role === 'user' ? colors.accent : colors.surface1,
                      borderColor: msg.role === 'user' ? 'transparent' : colors.borderSubtle,
                      borderTopRightRadius: msg.role === 'user' ? 4 : Radii.card,
                      borderTopLeftRadius: msg.role === 'assistant' ? 4 : Radii.card,
                    }
                  ]}
                >
                  {msg.role === 'user' ? (
                    <Text style={[styles.userText, { color: colors.textInverse, fontFamily: Fonts.body }]}>
                      {msg.content}
                    </Text>
                  ) : (
                    <View style={styles.markdownWrap}>
                      <Markdown
                        style={{
                          body: { color: colors.textPrimary, fontFamily: Fonts.body, fontSize: 14, lineHeight: 22 },
                          heading1: { color: colors.textPrimary, fontFamily: Fonts.display, fontSize: 18, marginTop: 8, marginBottom: 4 },
                          heading2: { color: colors.textPrimary, fontFamily: Fonts.display, fontSize: 16, marginTop: 6, marginBottom: 4 },
                          bullet_list: { marginTop: 4, marginBottom: 4 },
                          ordered_list: { marginTop: 4, marginBottom: 4 },
                        }}
                      >
                        {msg.content}
                      </Markdown>
                    </View>
                  )}
                </View>

                {/* Sources & TTS Actions for AI response */}
                {msg.role === 'assistant' && (
                  <View style={styles.bubbleActionsRow}>
                    {/* Sources Badge */}
                    {msg.sources && msg.sources.length > 0 && (
                      <View style={[styles.sourcesBadge, { backgroundColor: colors.surface2, borderColor: colors.borderSubtle }]}>
                        <Ionicons name="link-outline" size={10} color={colors.textTertiary} />
                        <Text numberOfLines={1} style={[styles.sourcesText, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
                          Sources: {msg.sources.join(', ')}
                        </Text>
                      </View>
                    )}

                    {/* Speaker (TTS) Button */}
                    {msg.id !== 'welcome' && (
                      <TouchableOpacity 
                        onPress={() => handleToggleSpeak(msg)}
                        style={[styles.ttsBtn, { backgroundColor: colors.surface2, borderColor: colors.borderSubtle }]}
                      >
                        {ttsLoadingId === msg.id ? (
                          <ActivityIndicator size="small" color={colors.accent} />
                        ) : (
                          <Ionicons 
                            name={msg.isPlaying ? 'volume-mute' : 'volume-high-outline'} 
                            size={14} 
                            color={msg.isPlaying ? colors.danger : colors.accent} 
                          />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </View>
          ))}

          {loading && (
            <View style={styles.messageRow}>
              <View style={[styles.avatar, { backgroundColor: colors.accentMuted }]}>
                <Ionicons name="sparkles" size={14} color={colors.accent} />
              </View>
              <View style={[styles.messageBubble, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle, borderTopLeftRadius: 4 }]}>
                <View style={styles.loadingBubble}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: Fonts.bodyMedium }}>
                    Searching notes & reasoning...
                  </Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input Bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.surface1, borderTopColor: colors.borderSubtle }]}>
          <View style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.borderSubtle }]}>
            <TextInput
              style={[styles.inputField, { color: colors.textPrimary, fontFamily: Fonts.body }]}
              placeholder="Ask anything about your notes..."
              placeholderTextColor={colors.textTertiary}
              value={input}
              onChangeText={setInput}
              multiline
            />
            
            {/* Mic / STT Button with Pulsing Animation */}
            <Animated.View
              style={{
                transform: [{ scale: micPulseAnim }],
              }}
            >
              <TouchableOpacity
                onPress={toggleRecording}
                disabled={isProcessingRecording}
                style={[
                  styles.micBtn,
                  { backgroundColor: isRecording ? colors.danger : 'transparent' }
                ]}
              >
                {sttLoading ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Ionicons 
                    name={isRecording ? 'stop' : 'mic-outline'} 
                    size={20} 
                    color={isRecording ? '#FFF' : colors.textSecondary} 
                  />
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Send Button with Opacity Animation */}
          <Animated.View
            style={{
              opacity: sendBtnOpacityAnim,
            }}
          >
            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: input.trim() ? colors.accent : colors.surface2 }
              ]}
              onPress={() => handleSend()}
              disabled={!input.trim() || loading}
            >
              <Ionicons 
                name="send" 
                size={16} 
                color={input.trim() ? colors.textInverse : colors.textTertiary} 
              />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
      <TranscriptionOverlay visible={sttLoading} />
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
    marginBottom: 8 
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, letterSpacing: -0.4, fontWeight: '600' },
  chatArea: { flex: 1 },
  chatContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginTop: 2,
  },
  messageBubble: {
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: {
    fontSize: 14,
    lineHeight: 20,
  },
  markdownWrap: {
    marginTop: -4,
  },
  bubbleActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  sourcesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
  },
  sourcesText: {
    fontSize: 10,
    maxWidth: 180,
  },
  ttsBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radii.input,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    marginRight: 10,
    maxHeight: 100,
  },
  inputField: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
  },
  micBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
