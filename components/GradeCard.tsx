// Grade card component for answer grader results
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../lib/context';

interface GradeCardProps {
  title: string;
  items: string[];
  borderColor: string;
  icon?: string;
}

export function GradeCard({ title, items, borderColor }: GradeCardProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { borderLeftColor: borderColor, backgroundColor: colors.surface }]}>
      <Text style={[styles.title, { color: borderColor }]}>{title}</Text>
      {items.map((item, i) => (
        <Text key={i} style={[styles.item, { color: colors.text }]}>• {item}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderLeftWidth: 3, borderRadius: 8, padding: 16, marginBottom: 12 },
  title: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  item: { fontSize: 14, lineHeight: 22, marginBottom: 2 },
});
