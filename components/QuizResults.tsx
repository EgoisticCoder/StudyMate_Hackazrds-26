// Quiz results component
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../lib/context';
import { ScoreCircle } from './ScoreCircle';

interface QuizResultsProps {
  score: number;
  total: number;
  timeTaken: number;
  wrongAnswers: Array<{ question: string; selected: string; correct: string }>;
}

export function QuizResults({ score, total, timeTaken, wrongAnswers }: QuizResultsProps) {
  const { colors } = useTheme();
  const pct = (score / total) * 100;
  const grade = pct >= 90 ? 'A+' : pct >= 75 ? 'A' : pct >= 60 ? 'B' : pct >= 40 ? 'C' : 'F';

  return (
    <View style={styles.container}>
      <ScoreCircle obtained={score} total={total} label={grade} />
      <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.statValue, { color: colors.text }]}>
          {Math.floor(timeTaken / 60)}:{String(timeTaken % 60).padStart(2, '0')}
        </Text>
        <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Time Taken</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', padding: 24 },
  stat: { marginTop: 20, padding: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center', width: '100%' },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 12, marginTop: 4 },
});
