// CHAPTER DETAIL SCREEN — Chapter list for a subject + actions
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { getStudentProfile } from '../../lib/adaptiveEngine';
import { readQuery } from '../../lib/neo4j';
import { getChaptersForSubject } from '../../constants/chapters';
import { Fonts } from '../../constants/fonts';
import { SubjectColors, PerformanceDotColors, Radii, Spacing } from '../../constants/colors';
import { SectionLabel, AnimatedScreenWrapper } from '../../components/ui/premium';

export default function ChapterDetailScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const params = useLocalSearchParams<{ subject: string }>();
  const subject = params.subject || 'Physics';
  const [chapters, setChapters] = useState<string[]>([]);
  const [chapterPerf, setChapterPerf] = useState<Record<string, { avg: number; lastStudied: string }>>({});

  const subjectColor = isDark
    ? SubjectColors[subject]?.dark || colors.accent
    : SubjectColors[subject]?.light || colors.accent;

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const profile = await getStudentProfile(studentId);
      if (!profile) return;
      const ch = getChaptersForSubject(subject, profile.board, profile.class);
      setChapters(ch);

      // Get chapter performance
      const perf = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:ATTEMPTED]->(q:Quiz)
         WHERE q.subject = $subject
         WITH q.chapter AS chapter, avg(toFloat(q.score)/q.total) AS avg, max(q.date) AS last
         RETURN chapter, avg, last`,
        { studentId, subject }
      );
      const perfMap: Record<string, { avg: number; lastStudied: string }> = {};
      for (const r of perf) {
        const chapter = r && typeof r.get === 'function' ? r.get('chapter') : (r as any)?.chapter;
        const avg = r && typeof r.get === 'function' ? r.get('avg') : (r as any)?.avg;
        const last = r && typeof r.get === 'function' ? r.get('last') : (r as any)?.last;
        perfMap[chapter] = {
          avg: avg || 0,
          lastStudied: last?.toString() || '',
        };
      }
      setChapterPerf(perfMap);
    })();
  }, [studentId, subject]);

  const getDotColor = (chapterName: string) => {
    const perf = chapterPerf[chapterName];
    if (!perf) return PerformanceDotColors.unattempted;
    if (perf.avg >= 0.75) return PerformanceDotColors.excellent;
    if (perf.avg >= 0.50) return PerformanceDotColors.good;
    return PerformanceDotColors.weak;
  };

  return (
    <AnimatedScreenWrapper style={{ backgroundColor: colors.background }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => {
  try {
    router.back();
  } catch {
    router.replace('/');
  }
}} 
            style={[styles.backBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
          >
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={[styles.colorPip, { backgroundColor: subjectColor }]} />
            <Text style={[styles.title, { color: colors.textPrimary, fontFamily: Fonts.display }]}>{subject}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          {[
            { icon: 'chatbubble-ellipses-outline', label: 'Ask Doubt', screen: '/screens/AskAIScreen' },
            { icon: 'help-circle-outline', label: 'Quiz', screen: '/(tabs)/quiz' },
            { icon: 'reader-outline', label: 'Notes', screen: '/screens/StudyNotesScreen' },
          ].map(a => (
            <TouchableOpacity
              key={a.label}
              style={[styles.actionCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}
              onPress={() => router.push(a.screen as any)}
            >
              <Ionicons name={a.icon as any} size={20} color={subjectColor} />
              <Text style={[styles.actionLabel, { color: colors.textPrimary, fontFamily: Fonts.displayMedium }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Chapter list */}
        <SectionLabel text="Chapters" style={{ marginTop: 8, marginBottom: 12 }} />
        
        {chapters.map((ch, i) => {
          const dotColor = getDotColor(ch);
          const perf = chapterPerf[ch];
          return (
            <TouchableOpacity
              key={i}
              style={[styles.chapterRow, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}
              onPress={() => router.push({
                pathname: '/screens/StudyNotesScreen',
                params: { subject, chapter: ch },
              })}
            >
              <View style={[styles.perfDot, { backgroundColor: dotColor }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.chapterName, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>
                  {ch}
                </Text>
                {perf?.lastStudied ? (
                  <Text style={[styles.chapterDate, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
                    Last studied: {new Date(perf.lastStudied).toLocaleDateString()}
                  </Text>
                ) : (
                  <Text style={[styles.chapterDate, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
                    Not studied yet
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </AnimatedScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  colorPip: { width: 4, height: 22, borderRadius: 2 },
  title: { fontSize: 20, letterSpacing: -0.4 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  actionCard: {
    flex: 1, 
    paddingVertical: 14, 
    paddingHorizontal: 8,
    borderRadius: Radii.card, 
    borderWidth: StyleSheet.hairlineWidth, 
    alignItems: 'center', 
    gap: 6,
  },
  actionLabel: { fontSize: 12 },
  chapterRow: {
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 12,
    padding: 16, 
    borderRadius: Radii.card, 
    borderWidth: StyleSheet.hairlineWidth, 
    marginBottom: 8,
  },
  perfDot: { width: 8, height: 8, borderRadius: 4 },
  chapterName: { fontSize: 14 },
  chapterDate: { fontSize: 11, marginTop: 2 },
});
