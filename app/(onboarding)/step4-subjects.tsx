// Step 4 — Subject Relationship: Interest + Confidence sliders for each subject

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../lib/context';
import { SUBJECTS } from '../../constants/subjects';
import { SubjectColors } from '../../constants/colors';

interface SubjectRating {
  interest: number;
  confidence: number;
}

export default function Step4Subjects() {
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams();

  const initialRatings: Record<string, SubjectRating> = {};
  SUBJECTS.forEach(s => { initialRatings[s.name] = { interest: 3, confidence: 3 }; });
  const [ratings, setRatings] = useState(initialRatings);

  const setRating = (subject: string, field: 'interest' | 'confidence', value: number) => {
    setRatings(prev => ({
      ...prev,
      [subject]: { ...prev[subject], [field]: value },
    }));
  };

  const handleNext = () => {
    router.push({
      pathname: '/(onboarding)/step5-habits',
      params: { ...params, subjectRatings: JSON.stringify(ratings) },
    });
  };

  const RatingDots = ({
    value, onChange, color,
  }: { value: number; onChange: (v: number) => void; color: string }) => (
    <View style={styles.dotRow}>
      {[1, 2, 3, 4, 5].map(v => (
        <TouchableOpacity
          key={v}
          onPress={() => onChange(v)}
          style={[
            styles.dot,
            {
              backgroundColor: v <= value ? color : colors.surfaceContainer,
              borderColor: v <= value ? color : colors.border,
            },
          ]}
        >
          <Text style={[styles.dotText, { color: v <= value ? '#FFF' : colors.textTertiary }]}>
            {v}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.progressRow}>
        {[1, 2, 3, 4, 5, 6].map(step => (
          <View
            key={step}
            style={[styles.progressDot, {
              backgroundColor: step <= 4 ? colors.primary : colors.border,
              width: step === 4 ? 24 : 8,
            }]}
          />
        ))}
      </View>

      <Text style={[styles.step, { color: colors.textTertiary }]}>STEP 4 OF 6</Text>
      <Text style={[styles.title, { color: colors.text }]}>
        Tell us about each subject
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Boring is not the same as weak. Rate both honestly.
      </Text>

      {SUBJECTS.map(subject => {
        const subjectColor = isDark
          ? SubjectColors[subject.name]?.dark || colors.primary
          : SubjectColors[subject.name]?.light || colors.primary;

        return (
          <View
            key={subject.name}
            style={[styles.subjectCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.subjectHeader}>
              <View style={[styles.colorPip, { backgroundColor: subjectColor }]} />
              <Text style={[styles.subjectName, { color: colors.text }]}>
                {subject.name}
              </Text>
            </View>

            <Text style={[styles.ratingLabel, { color: colors.textSecondary }]}>
              How interesting is this to you?
            </Text>
            <RatingDots
              value={ratings[subject.name].interest}
              onChange={v => setRating(subject.name, 'interest', v)}
              color={subjectColor}
            />

            <Text style={[styles.ratingLabel, { color: colors.textSecondary, marginTop: 14 }]}>
              How confident are you in it?
            </Text>
            <RatingDots
              value={ratings[subject.name].confidence}
              onChange={v => setRating(subject.name, 'confidence', v)}
              color={subjectColor}
            />
          </View>
        );
      })}

      <TouchableOpacity
        style={[styles.nextBtn, { backgroundColor: colors.primary }]}
        onPress={handleNext}
      >
        <Text style={[styles.nextText, { color: colors.onPrimary }]}>Continue</Text>
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
  subjectCard: {
    borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 12,
  },
  subjectHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  colorPip: { width: 4, height: 24, borderRadius: 2 },
  subjectName: { fontSize: 17, fontWeight: '600' },
  ratingLabel: { fontSize: 13, fontWeight: '400', marginBottom: 8 },
  dotRow: { flexDirection: 'row', gap: 8 },
  dot: {
    width: 38, height: 38, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  dotText: { fontSize: 14, fontWeight: '600' },
  nextBtn: { marginTop: 24, paddingVertical: 18, borderRadius: 14, alignItems: 'center' },
  nextText: { fontSize: 16, fontWeight: '600' },
});
