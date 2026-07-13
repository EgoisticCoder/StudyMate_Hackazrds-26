// WeeklyTimetableCard — Clean editable grid with colors, custom time ranges, +/- controls
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput,
  Modal, Alert, useWindowDimensions, Platform, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/context';
import { 
  loadSlotsForWeek, setSlotDone, updateSlotNote, updateSlot, 
  createSlot, deleteSlot, replaceSlotsForWeek, TimetableSlotRow 
} from '../lib/timetableSlots';
import { weekKeyFromDate } from '../lib/weekUtils';
import { SubjectColors } from '../constants/colors';
import { v4 as uuidv4 } from 'uuid';
import { useAudioRecorder, requestRecordingPermissionsAsync, setAudioModeAsync, AudioModule } from 'expo-audio';

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

import { transcribeAudio } from '../lib/sarvam';
import { callSarvam, parseSarvamJSON } from '../lib/ai';
import { useTranslateSubject } from '../lib/translations';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FULL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getSubjectColor(subject: string, isDark: boolean): string {
  const entry = SubjectColors[subject];
  if (entry) return isDark ? entry.dark : entry.light;
  const FALLBACK = ['#818CF8', '#F472B6', '#34D399', '#FB923C', '#60A5FA', '#FBBF24', '#A78BFA', '#38BDF8'];
  let hash = 0;
  for (let i = 0; i < subject.length; i++) hash = subject.charCodeAt(i) + ((hash << 5) - hash);
  return FALLBACK[Math.abs(hash) % FALLBACK.length];
}

interface Props {
  studentId: string;
  reloadTick?: number;
}

export function WeeklyTimetableCard({ studentId, reloadTick = 0 }: Props) {
  const { colors, isDark } = useTheme();
  const translateSubject = useTranslateSubject();
  const [slots, setSlots] = useState<TimetableSlotRow[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeDayIndex, setActiveDayIndex] = useState(() => {
    const today = (new Date().getDay() + 6) % 7;
    return today;
  });

  const [editModal, setEditModal] = useState<{ slot?: TimetableSlotRow } | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editTimeRange, setEditTimeRange] = useState('');

  // AI Adjustments states
  const [showModifyConsole, setShowModifyConsole] = useState(false);
  const [adjustRequest, setAdjustRequest] = useState('');
  const [aiQuestion, setAiQuestion] = useState('');
  const [conversationContext, setConversationContext] = useState('');
  const [planning, setPlanning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const audioRecorder = useAudioRecorder(SARVAM_RECORDING_OPTIONS);
  const [transcribing, setTranscribing] = useState(false);

  const weekKey = weekKeyFromDate();

  const fetchSlots = useCallback(async () => {
    try {
      const data = await loadSlotsForWeek(studentId, weekKey);
      setSlots(data);
    } catch (err) { console.error('Failed to load slots:', err); }
    finally { setLoading(false); }
  }, [studentId, weekKey]);

  useEffect(() => { fetchSlots(); }, [fetchSlots, reloadTick]);

  const activeSlots = slots
    .filter(s => s.day_index === activeDayIndex)
    .sort((a, b) => a.time_slot.localeCompare(b.time_slot));

  const handleToggleDone = async (slot: TimetableSlotRow) => {
    const newDone = !slot.done;
    await setSlotDone(studentId, slot.id, newDone);
    setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, done: newDone } : s));
  };

  const handleOpenAddModal = () => {
    setEditModal({});
    setEditSubject('');
    setEditTitle('');
    setEditNote('');
    setEditTimeRange('10:00 - 11:00');
  };

  const handleOpenEditModal = (slot: TimetableSlotRow) => {
    setEditModal({ slot });
    setEditSubject(slot.subject);
    setEditTitle(slot.title);
    setEditNote(slot.sticky_note || '');
    setEditTimeRange(slot.time_slot);
  };

  const handleSaveSlot = async () => {
    if (!editModal) return;
    if (!editTimeRange.trim() || !editSubject.trim()) {
      Alert.alert('Required', 'Time range and Subject are required.');
      return;
    }
    const { slot } = editModal;
    
    if (slot) {
      await updateSlot(studentId, slot.id, { title: editTitle, subject: editSubject, time_slot: editTimeRange });
      if (editNote !== slot.sticky_note) await updateSlotNote(studentId, slot.id, editNote);
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, title: editTitle, subject: editSubject, sticky_note: editNote, time_slot: editTimeRange } : s));
    } else {
      const id = uuidv4();
      
      await createSlot(studentId, weekKey, {
        id,
        week_start: weekKey,
        day_index: activeDayIndex,
        day_name: FULL_DAYS[activeDayIndex],
        slot_order: 0,
        title: editTitle,
        minutes_estimate: 60,
        done: false,
        time_slot: editTimeRange,
        subject: editSubject,
      });

      if (editNote) {
        await updateSlotNote(studentId, id, editNote);
      }

      setSlots(prev => [...prev, { 
        id, 
        week_start: weekKey, 
        day_index: activeDayIndex, 
        day_name: FULL_DAYS[activeDayIndex], 
        slot_order: 0, 
        title: editTitle, 
        minutes_estimate: 60, 
        done: false, 
        time_slot: editTimeRange, 
        subject: editSubject, 
        sticky_note: editNote 
      }]);
    }
    setEditModal(null);
  };

  const handleDeleteSlot = async () => {
    if (!editModal?.slot) return;
    await deleteSlot(studentId, weekKey, editModal.slot.id);
    setSlots(prev => prev.filter(s => s.id !== editModal.slot!.id));
    setEditModal(null);
  };

  const startRecording = async () => {
    try {
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Microphone access is required to use voice adjustments.');
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
        setAdjustRequest(prev => (prev ? prev + ' ' : '') + result.text);
      }
    } catch (err: any) {
      console.error('STT failed:', err);
      Alert.alert('Error', err.message || "Couldn't transcribe audio. Please try again.");
    } finally {
      setTranscribing(false);
    }
  };

  const handleAiAdjust = async () => {
    if (!adjustRequest.trim()) return;
    setPlanning(true);
    try {
      const prompt = `You are a study schedule planning assistant. Your task is to modify the existing study timetable slots according to the student's request.

Current Timetable Slots:
${JSON.stringify(slots, null, 2)}

${conversationContext ? `Conversation History:\n${conversationContext}\n` : ''}
User request: "${adjustRequest}"

If you do NOT have enough information to fulfill the user's request (e.g. they say "school timings" but haven't provided them), ask a clarifying question.
If you DO have enough information, output the modified JSON array containing the new list of slots for the week.

You must output ONLY a valid JSON object matching ONE of these two schemas. Do NOT wrap in markdown backticks.

Schema 1 (Need more info):
{
  "type": "question",
  "question": "What time do you usually come back from school?"
}

Schema 2 (Finalized slots):
{
  "type": "timetable",
  "slots": [
    {
      "day": "Monday",
      "subject": "Mathematics",
      "title": "Quadratic Equations",
      "time_slot": "14:00 - 15:00",
      "minutes": 60,
      "order": 1
    }
  ]
}`;

      const response = await callSarvam([
        { role: 'system', content: 'You are an expert study planner. Output ONLY valid JSON.' },
        { role: 'user', content: prompt }
      ], 'schedule_planner');

      let parsed: any;
      try {
        parsed = parseSarvamJSON<any>(response);
      } catch (err) {
        const retry = await callSarvam([
          { role: 'system', content: 'Extract the JSON object from this text. Output ONLY the raw JSON.' },
          { role: 'user', content: response }
        ], 'schedule_planner');
        parsed = parseSarvamJSON<any>(retry);
      }

      if (parsed && parsed.type === 'question') {
        setAiQuestion(parsed.question);
        setConversationContext(prev => prev + `\nUser: ${adjustRequest}\nAI: ${parsed.question}`);
        setAdjustRequest('');
      } else if (parsed && parsed.type === 'timetable' && Array.isArray(parsed.slots)) {
        await replaceSlotsForWeek(studentId, weekKey, parsed.slots);
        Alert.alert('Timetable Updated', 'The AI has successfully adjusted your study timetable slots.');
        setAdjustRequest('');
        setAiQuestion('');
        setConversationContext('');
        setShowModifyConsole(false);
        fetchSlots();
      } else if (Array.isArray(parsed)) {
        // Fallback if the AI mistakenly just returns the array of slots directly
        await replaceSlotsForWeek(studentId, weekKey, parsed);
        Alert.alert('Timetable Updated', 'The AI has successfully adjusted your study timetable slots.');
        setAdjustRequest('');
        setAiQuestion('');
        setConversationContext('');
        setShowModifyConsole(false);
        fetchSlots();
      } else {
        Alert.alert('AI Plan Error', 'The AI returned an invalid structure. Please try again.');
      }
    } catch (err: any) {
      console.error('AI Timetable adjust failed:', err);
      Alert.alert('Adjust Failed', `Could not adjust timetable: ${err?.message || String(err)}`);
    } finally {
      setPlanning(false);
    }
  };

  if (loading) return null;

  return (
    <View style={{ marginHorizontal: 16, marginTop: 16 }}>
      <View style={st.headerRow}>
        <Text style={[st.sectionTitle, { color: colors.text }]}>Daily Schedule</Text>
      </View>

      <View style={st.daysScroll}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {DAYS.map((d, i) => {
            const isActive = activeDayIndex === i;
            return (
              <TouchableOpacity
                key={i}
                onPress={() => setActiveDayIndex(i)}
                style={[st.dayBubble, { 
                  backgroundColor: isActive ? colors.primary : colors.surface,
                  borderColor: isActive ? colors.primary : colors.border
                }]}
              >
                <Text style={{ 
                  color: isActive ? colors.onPrimary || colors.textInverse : colors.textSecondary,
                  fontWeight: isActive ? '700' : '500',
                  fontSize: 13
                }}>{d}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={[st.listContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {activeSlots.length === 0 ? (
          <View style={st.emptyState}>
            <Ionicons name="calendar-clear-outline" size={32} color={colors.textTertiary} />
            <Text style={{ color: colors.textSecondary, marginTop: 8 }}>No classes scheduled</Text>
          </View>
        ) : (
          activeSlots.map(slot => {
            const subColor = getSubjectColor(slot.subject, isDark);
            return (
              <View key={slot.id} style={[st.slotCard, { borderBottomColor: colors.border }]}>
                <TouchableOpacity 
                  onPress={() => handleToggleDone(slot)}
                  style={[st.checkCircle, { 
                    borderColor: slot.done ? subColor : colors.border,
                    backgroundColor: slot.done ? subColor : 'transparent'
                  }]}
                >
                  {slot.done && <Ionicons name="checkmark" size={14} color="#FFF" />}
                </TouchableOpacity>

                <TouchableOpacity 
                  style={{ flex: 1, paddingLeft: 12 }} 
                  onPress={() => handleOpenEditModal(slot)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ color: subColor, fontWeight: '700', fontSize: 11, textTransform: 'uppercase' }}>
                      {translateSubject(slot.subject)}
                    </Text>
                    <View style={st.dot} />
                    <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '600' }}>
                      {slot.time_slot}
                    </Text>
                  </View>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500', textDecorationLine: slot.done ? 'line-through' : 'none' }}>
                    {slot.title || 'Study Session'}
                  </Text>
                  {slot.sticky_note ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                      {slot.sticky_note}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              </View>
            );
          })
        )}

        <TouchableOpacity 
          onPress={handleOpenAddModal}
          style={[st.addSlotBtn, { borderTopColor: activeSlots.length > 0 ? colors.border : 'transparent' }]}
        >
          <Ionicons name="add" size={18} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '600', marginLeft: 6 }}>Add Slot</Text>
        </TouchableOpacity>
      </View>

      {/* AI Adjustments Panel */}
      <View style={{ marginTop: 12 }}>
        <TouchableOpacity 
          onPress={() => setShowModifyConsole(!showModifyConsole)} 
          style={[st.aiAdjustBtn, { backgroundColor: colors.accent + '15', borderColor: colors.accentBorder }]}
        >
          <Ionicons name="sparkles" size={16} color={colors.accent} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.accent, marginLeft: 6 }}>
            {showModifyConsole ? 'Hide AI Adjustments' : 'Modify Timetable with AI'}
          </Text>
          <Ionicons name={showModifyConsole ? "chevron-up" : "chevron-down"} size={14} color={colors.accent} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        {showModifyConsole && (
          <View style={[st.aiConsole, { backgroundColor: colors.surfaceContainerLow || colors.surface, borderColor: colors.border }]}>
            {aiQuestion ? (
              <View style={{ marginBottom: 12, padding: 12, backgroundColor: colors.accent + '15', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accentBorder }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Ionicons name="chatbubble-ellipses" size={16} color={colors.accent} />
                  <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13, marginLeft: 6 }}>AI Question:</Text>
                </View>
                <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{aiQuestion}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TextInput
                style={[st.consoleInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                value={adjustRequest}
                onChangeText={setAdjustRequest}
                placeholder={aiQuestion ? "Type your answer here..." : "e.g. Add Math on Tuesday 10:00, or remove Wednesday slot"}
                placeholderTextColor={colors.textTertiary}
                multiline
              />
              <TouchableOpacity
                onPress={isRecording ? stopRecording : startRecording}
                disabled={planning || transcribing}
                style={[st.micBtn, { backgroundColor: isRecording ? '#EF4444' : colors.primary }]}
              >
                {transcribing ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name={isRecording ? "stop" : "mic"} size={18} color="#FFF" />
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleAiAdjust}
              disabled={planning || !adjustRequest.trim()}
              style={[st.applyBtn, { backgroundColor: colors.accent, opacity: planning || !adjustRequest.trim() ? 0.6 : 1 }]}
            >
              {planning ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={{ color: colors.textInverse, fontWeight: '700', fontSize: 13 }}>Apply Adjustments</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Edit/Add Cell Modal */}
      <Modal visible={!!editModal} transparent animationType="slide">
        <View style={st.modalOverlay}>
          <View style={[st.modalCard, { backgroundColor: colors.surface }]}>
            <View style={st.modalHeader}>
              <Text style={[st.modalTitle, { color: colors.text }]}>{editModal?.slot ? 'Edit Slot' : 'Add Slot'}</Text>
              <TouchableOpacity onPress={() => setEditModal(null)}>
                <Ionicons name="close" size={22} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
            <Text style={[st.modalLabel, { color: colors.textTertiary }]}>
              {FULL_DAYS[activeDayIndex]}
            </Text>

            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Time Range</Text>
            <TextInput style={[st.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow || colors.surface }]} value={editTimeRange} onChangeText={setEditTimeRange} placeholder="e.g. 10:30 - 11:30" placeholderTextColor={colors.textTertiary} />

            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Subject</Text>
            <TextInput style={[st.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow || colors.surface }]} value={editSubject} onChangeText={setEditSubject} placeholder="e.g. Mathematics" placeholderTextColor={colors.textTertiary} />

            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Topic / Chapter</Text>
            <TextInput style={[st.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow || colors.surface }]} value={editTitle} onChangeText={setEditTitle} placeholder="e.g. Quadratic Equations" placeholderTextColor={colors.textTertiary} />

            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Notes</Text>
            <TextInput style={[st.input, st.multiInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow || colors.surface }]} value={editNote} onChangeText={setEditNote} placeholder="Any notes..." placeholderTextColor={colors.textTertiary} multiline />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              {editModal?.slot && (
                <TouchableOpacity style={[st.deleteBtn, { borderColor: '#EF4444' }]} onPress={handleDeleteSlot}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[st.saveBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={handleSaveSlot}>
                <Text style={{ color: colors.onPrimary || colors.textInverse, fontWeight: '600', fontSize: 15 }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  daysScroll: { marginBottom: 12 },
  dayBubble: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  listContainer: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  emptyState: { padding: 30, alignItems: 'center', justifyContent: 'center' },
  slotCard: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  checkCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#888', marginHorizontal: 8 },
  addSlotBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderTopWidth: StyleSheet.hairlineWidth },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalLabel: { fontSize: 13, fontWeight: '500', marginBottom: 20 },
  fieldLabel: { fontSize: 12, fontWeight: '500', marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
  multiInput: { minHeight: 60, textAlignVertical: 'top' },
  saveBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  deleteBtn: { width: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  
  // AI Panel
  aiAdjustBtn: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  aiConsole: { marginTop: 8, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: 10 },
  consoleInput: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 10, fontSize: 13, minHeight: 40, maxHeight: 80, textAlignVertical: 'top' },
  micBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  applyBtn: { paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
