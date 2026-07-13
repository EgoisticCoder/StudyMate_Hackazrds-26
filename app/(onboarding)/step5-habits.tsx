// Step 5 — Study Habits & Exams

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/context';
import { STUDY_TIME_OPTIONS, PEAK_TIME_OPTIONS } from '../../constants/subjects';

interface ExamEntry {
  name: string;
  date: string;
}

export default function Step5Habits() {
  const { colors } = useTheme();
  const params = useLocalSearchParams();
  const [studyTime, setStudyTime] = useState<number | null>(null);
  const [peakTime, setPeakTime] = useState<string | null>(null);
  const [textbooks, setTextbooks] = useState<string | null>(null);
  const [exams, setExams] = useState<ExamEntry[]>([]);
  const [examName, setExamName] = useState('');
  const [examDate, setExamDate] = useState('');

  const addExam = () => {
    if (examName.trim() && examDate.trim() && exams.length < 3) {
      setExams([...exams, { name: examName.trim(), date: examDate.trim() }]);
      setExamName('');
      setExamDate('');
    }
  };

  const removeExam = (index: number) => {
    setExams(exams.filter((_, i) => i !== index));
  };

  const isValid = studyTime !== null && peakTime !== null && textbooks !== null;

  const handleNext = () => {
    if (!isValid) return;
    const hasTextbooks = textbooks === 'yes_official' || textbooks === 'yes_school';

    router.push({
      pathname: '/(onboarding)/step6-commitment',
      params: {
        ...params,
        daily_study_mins: String(studyTime),
        peak_study_time: peakTime!,
        has_textbooks: String(hasTextbooks),
        exams: JSON.stringify(exams),
      },
    });
  };

  const TEXTBOOK_OPTIONS = [
    { value: 'yes_official', label: 'Yes, official textbooks' },
    { value: 'yes_school', label: 'Yes, school-provided' },
    { value: 'no', label: 'No — notes/online only' },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.progressRow}>
        {[1, 2, 3, 4, 5, 6].map(step => (
          <View
            key={step}
            style={[styles.progressDot, {
              backgroundColor: step <= 5 ? colors.primary : colors.border,
              width: step === 5 ? 24 : 8,
            }]}
          />
        ))}
      </View>

      <Text style={[styles.step, { color: colors.textTertiary }]}>STEP 5 OF 6</Text>
      <Text style={[styles.title, { color: colors.text }]}>Study habits & exams</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Help us plan your daily sessions
      </Text>

      {/* Daily study time */}
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        Daily study time available
      </Text>
      <View style={styles.pillRow}>
        {STUDY_TIME_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.pill, {
              backgroundColor: studyTime === opt.value ? colors.primary : colors.surface,
              borderColor: studyTime === opt.value ? colors.primary : colors.border,
            }]}
            onPress={() => setStudyTime(opt.value)}
          >
            <Text style={[styles.pillText, { color: studyTime === opt.value ? colors.onPrimary : colors.text }]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Peak time */}
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        Best time to study
      </Text>
      <View style={styles.pillRow}>
        {PEAK_TIME_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.pill, {
              backgroundColor: peakTime === opt ? colors.primary : colors.surface,
              borderColor: peakTime === opt ? colors.primary : colors.border,
            }]}
            onPress={() => setPeakTime(opt)}
          >
            <Text style={[styles.pillText, { color: peakTime === opt ? colors.onPrimary : colors.text }]}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Textbooks */}
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        Do you have textbooks?
      </Text>
      {TEXTBOOK_OPTIONS.map(opt => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.textbookOption, {
            backgroundColor: textbooks === opt.value ? colors.primaryContainer : colors.surface,
            borderColor: textbooks === opt.value ? colors.primary : colors.border,
          }]}
          onPress={() => setTextbooks(opt.value)}
        >
          <View style={[styles.radio, {
            borderColor: textbooks === opt.value ? colors.primary : colors.outline,
          }]}>
            {textbooks === opt.value && (
              <View style={[styles.radioFill, { backgroundColor: colors.primary }]} />
            )}
          </View>
          <Text style={[styles.textbookLabel, { color: colors.text }]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}

      {/* Exams */}
      <Text style={[styles.label, { color: colors.textSecondary, marginTop: 8 }]}>
        Upcoming exams (optional, up to 3)
      </Text>
      {exams.map((e, i) => (
        <View key={i} style={[styles.examTag, { backgroundColor: colors.surfaceContainer }]}>
          <Text style={[styles.examTagText, { color: colors.text }]}>
            {e.name} — {e.date}
          </Text>
          <TouchableOpacity onPress={() => removeExam(i)}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      ))}
      {exams.length < 3 && (
        <View style={styles.examRow}>
          <TextInput
            style={[styles.examInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="Exam name"
            placeholderTextColor={colors.textTertiary}
            value={examName}
            onChangeText={setExamName}
          />
          <TextInput
            style={[styles.examDateInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="DD/MM/YYYY"
            placeholderTextColor={colors.textTertiary}
            value={examDate}
            onChangeText={setExamDate}
            keyboardType="numeric"
          />
          <TouchableOpacity
            style={[styles.addExamBtn, { backgroundColor: colors.primary }]}
            onPress={addExam}
          >
            <Ionicons name="add" size={20} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={[styles.nextBtn, { backgroundColor: isValid ? colors.primary : colors.surfaceContainerHigh }]}
        onPress={handleNext}
        disabled={!isValid}
      >
        <Text style={[styles.nextText, { color: isValid ? colors.onPrimary : colors.textTertiary }]}>
          Continue
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 32, alignItems: 'center' },
  progressDot: { height: 4, borderRadius: 2 },
  step: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 8, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 24 },
  label: { fontSize: 12, fontWeight: '500', marginBottom: 10, marginTop: 20, letterSpacing: 0.5 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  pillText: { fontSize: 13, fontWeight: '500' },
  textbookOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioFill: { width: 10, height: 10, borderRadius: 5 },
  textbookLabel: { fontSize: 14, fontWeight: '400' },
  examTag: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 12, borderRadius: 12, marginBottom: 8,
  },
  examTagText: { fontSize: 14 },
  examRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  examInput: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 14 },
  examDateInput: { width: 110, borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 14 },
  addExamBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nextBtn: { marginTop: 32, paddingVertical: 18, borderRadius: 14, alignItems: 'center' },
  nextText: { fontSize: 16, fontWeight: '600' },
});
