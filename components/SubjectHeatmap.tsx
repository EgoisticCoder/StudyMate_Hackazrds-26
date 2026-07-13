// Subject heatmap component (GitHub-style contribution grid)
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../lib/context';

interface HeatmapData {
  chapter: string;
  performance: number; // 0-1
}

interface SubjectHeatmapProps {
  data: HeatmapData[];
  onPress?: (chapter: string) => void;
}

export function SubjectHeatmap({ data, onPress }: SubjectHeatmapProps) {
  const { colors } = useTheme();

  const getColor = (perf: number) => {
    if (perf === 0) return colors.surfaceContainer;
    if (perf < 0.5) return '#EF444460';
    if (perf < 0.75) return '#F59E0B60';
    return '#179C6E60';
  };

  return (
    <View style={styles.grid}>
      {data.map((d, i) => (
        <TouchableOpacity
          key={i}
          style={[styles.cell, { backgroundColor: getColor(d.performance) }]}
          onPress={() => onPress?.(d.chapter)}
        >
          <Text style={[styles.cellText, { color: colors.textTertiary }]} numberOfLines={1}>
            {d.chapter.substring(0, 3)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { width: 28, height: 28, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 7 },
});
