// Stress slider component

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../lib/context';

interface StressSliderProps {
  value: number;
  onChange: (v: number) => void;
}

const LEVELS = [
  { level: 1, label: 'Great', color: '#179C6E' },
  { level: 2, label: 'Good', color: '#34D399' },
  { level: 3, label: 'Okay', color: '#F59E0B' },
  { level: 4, label: 'Stressed', color: '#F97316' },
  { level: 5, label: 'Overwhelmed', color: '#EF4444' },
];

export function StressSlider({ value, onChange }: StressSliderProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.dotsRow}>
        {LEVELS.map(l => (
          <TouchableOpacity
            key={l.level}
            onPress={() => onChange(l.level)}
            style={[
              styles.dot,
              {
                backgroundColor: value === l.level ? l.color : colors.surfaceContainer,
                borderColor: value === l.level ? l.color : colors.border,
                transform: [{ scale: value === l.level ? 1.2 : 1 }],
              },
            ]}
          >
            <Text style={[styles.dotNum, { color: value === l.level ? '#FFF' : colors.textTertiary }]}>
              {l.level}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.textTertiary }]}>Calm</Text>
        <Text style={[styles.label, { color: colors.textTertiary }]}>Overwhelmed</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 8 },
  dotsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 },
  dot: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  dotNum: { fontSize: 16, fontWeight: '600' },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 4 },
  label: { fontSize: 10, fontWeight: '500', letterSpacing: 0.5 },
});
