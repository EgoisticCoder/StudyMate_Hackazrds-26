// Step 2 — Ambition: "What do you want to become?"

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/context';
import { AMBITION_OPTIONS } from '../../constants/subjects';

export default function Step2Ambition() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    name: string; school: string; class: string; board: string;
  }>();
  const [selected, setSelected] = useState<string[]>([]);
  const [customText, setCustomText] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const toggleSelect = (label: string) => {
    setSelected(prev => {
      if (prev.includes(label)) return prev.filter(s => s !== label);
      if (prev.length >= 2) return prev; // Max 2
      return [...prev, label];
    });
  };

  const handleNext = () => {
    const ambitions = [...selected];
    if (showCustom && customText.trim()) {
      ambitions.push(customText.trim());
    }
    if (ambitions.length === 0) return;

    router.push({
      pathname: '/(onboarding)/step3-motive',
      params: { ...params, ambitions: JSON.stringify(ambitions) },
    });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Progress */}
      <View style={styles.progressRow}>
        {[1, 2, 3, 4, 5, 6].map(step => (
          <View
            key={step}
            style={[
              styles.progressDot,
              {
                backgroundColor: step <= 2 ? colors.primary : colors.border,
                width: step === 2 ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>

      <Text style={[styles.step, { color: colors.textTertiary }]}>STEP 2 OF 6</Text>
      <Text style={[styles.title, { color: colors.text }]}>
        What do you want to become?
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        This personalises your learning priority. Pick up to 2.
      </Text>

      {/* Ambition cards */}
      <View style={styles.grid}>
        {AMBITION_OPTIONS.map(opt => {
          const isSelected = selected.includes(opt.label);
          return (
            <TouchableOpacity
              key={opt.label}
              style={[
                styles.card,
                {
                  backgroundColor: isSelected ? colors.primaryContainer : colors.surface,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
              onPress={() => toggleSelect(opt.label)}
            >
              <Ionicons
                name={opt.icon as any}
                size={24}
                color={isSelected ? colors.onPrimaryContainer : colors.textSecondary}
              />
              <Text
                style={[
                  styles.cardText,
                  { color: isSelected ? colors.onPrimaryContainer : colors.text },
                ]}
              >
                {opt.label}
              </Text>
              {isSelected && (
                <View style={[styles.checkmark, { backgroundColor: colors.primary }]}>
                  <Ionicons name="checkmark" size={12} color={colors.onPrimary} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Custom option */}
        <TouchableOpacity
          style={[
            styles.card,
            {
              backgroundColor: showCustom ? colors.primaryContainer : colors.surface,
              borderColor: showCustom ? colors.primary : colors.border,
              borderStyle: showCustom ? 'solid' : 'dashed',
            },
          ]}
          onPress={() => setShowCustom(!showCustom)}
        >
          <Ionicons
            name="add-circle-outline"
            size={24}
            color={showCustom ? colors.onPrimaryContainer : colors.textTertiary}
          />
          <Text
            style={[
              styles.cardText,
              { color: showCustom ? colors.onPrimaryContainer : colors.textTertiary },
            ]}
          >
            Custom
          </Text>
        </TouchableOpacity>
      </View>

      {showCustom && (
        <TextInput
          style={[styles.customInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="Type your ambition..."
          placeholderTextColor={colors.textTertiary}
          value={customText}
          onChangeText={setCustomText}
        />
      )}

      <TouchableOpacity
        style={[styles.nextBtn, { backgroundColor: selected.length > 0 || (showCustom && customText.trim()) ? colors.primary : colors.surfaceContainerHigh }]}
        onPress={handleNext}
        disabled={selected.length === 0 && !(showCustom && customText.trim())}
      >
        <Text style={[styles.nextText, { color: selected.length > 0 || (showCustom && customText.trim()) ? colors.onPrimary : colors.textTertiary }]}>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '48%', padding: 16, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', gap: 8, minHeight: 80, justifyContent: 'center',
  },
  cardText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  checkmark: {
    position: 'absolute', top: 8, right: 8,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  customInput: {
    marginTop: 16, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16,
  },
  nextBtn: { marginTop: 32, paddingVertical: 18, borderRadius: 14, alignItems: 'center' },
  nextText: { fontSize: 16, fontWeight: '600' },
});
