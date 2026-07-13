// Chapter list component
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/context';
import { PerformanceDotColors } from '../constants/colors';

interface Chapter {
  name: string;
  performance?: number; // 0-1
  lastStudied?: string;
}

interface ChapterListProps {
  chapters: Chapter[];
  onPress: (chapter: Chapter) => void;
}

export function ChapterList({ chapters, onPress }: ChapterListProps) {
  const { colors } = useTheme();

  const getDotColor = (perf?: number) => {
    if (perf === undefined) return PerformanceDotColors.unattempted;
    if (perf >= 0.75) return PerformanceDotColors.excellent;
    if (perf >= 0.50) return PerformanceDotColors.good;
    return PerformanceDotColors.weak;
  };

  return (
    <View>
      {chapters.map((ch, i) => (
        <TouchableOpacity
          key={i}
          style={[styles.row, { borderBottomColor: colors.border }]}
          onPress={() => onPress(ch)}
        >
          <View style={[styles.dot, { backgroundColor: getDotColor(ch.performance) }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.text }]}>{ch.name}</Text>
            {ch.lastStudied && (
              <Text style={[styles.date, { color: colors.textTertiary }]}>
                Last studied: {ch.lastStudied}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { fontSize: 14, fontWeight: '500' },
  date: { fontSize: 11, marginTop: 2 },
});
