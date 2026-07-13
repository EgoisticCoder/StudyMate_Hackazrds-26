// Step 3 — Motive: "Why are you using StudyMate?"

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../lib/context';
import { MOTIVE_OPTIONS } from '../../constants/subjects';

export default function Step3Motive() {
  const { colors } = useTheme();
  const params = useLocalSearchParams();
  const [selected, setSelected] = useState<string[]>([]);
  const [customText, setCustomText] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const toggleSelect = (label: string) => {
    setSelected(prev => {
      if (prev.includes(label)) return prev.filter(s => s !== label);
      if (prev.length >= 3) return prev; // Max 3
      return [...prev, label];
    });
  };

  const handleNext = () => {
    const motives = [...selected];
    if (showCustom && customText.trim()) motives.push(customText.trim());
    if (motives.length === 0) return;

    router.push({
      pathname: '/(onboarding)/step4-subjects',
      params: { ...params, motives: JSON.stringify(motives) },
    });
  };

  const isValid = selected.length > 0 || (showCustom && customText.trim());

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
              backgroundColor: step <= 3 ? colors.primary : colors.border,
              width: step === 3 ? 24 : 8,
            }]}
          />
        ))}
      </View>

      <Text style={[styles.step, { color: colors.textTertiary }]}>STEP 3 OF 6</Text>
      <Text style={[styles.title, { color: colors.text }]}>
        Why are you using StudyMate?
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Be honest — this stays completely private. Pick up to 3.
      </Text>

      <View style={styles.pillWrap}>
        {MOTIVE_OPTIONS.map(opt => {
          const isSelected = selected.includes(opt);
          return (
            <TouchableOpacity
              key={opt}
              style={[
                styles.pill,
                {
                  backgroundColor: isSelected ? colors.primary : colors.surface,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
              onPress={() => toggleSelect(opt)}
            >
              <Text style={[styles.pillText, { color: isSelected ? colors.onPrimary : colors.text }]}>
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={[
            styles.pill,
            {
              backgroundColor: showCustom ? colors.primaryContainer : colors.surface,
              borderColor: showCustom ? colors.primary : colors.border,
              borderStyle: showCustom ? 'solid' : 'dashed',
            },
          ]}
          onPress={() => setShowCustom(!showCustom)}
        >
          <Text style={[styles.pillText, { color: showCustom ? colors.onPrimaryContainer : colors.textTertiary }]}>
            + Custom
          </Text>
        </TouchableOpacity>
      </View>

      {showCustom && (
        <TextInput
          style={[styles.customInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="Type your reason..."
          placeholderTextColor={colors.textTertiary}
          value={customText}
          onChangeText={setCustomText}
        />
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
  content: { padding: 24, paddingTop: 60 },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 32, alignItems: 'center' },
  progressDot: { height: 4, borderRadius: 2 },
  step: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 8, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 24 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pill: {
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1,
  },
  pillText: { fontSize: 14, fontWeight: '500' },
  customInput: {
    marginTop: 16, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16,
  },
  nextBtn: { marginTop: 32, paddingVertical: 18, borderRadius: 14, alignItems: 'center' },
  nextText: { fontSize: 16, fontWeight: '600' },
});
