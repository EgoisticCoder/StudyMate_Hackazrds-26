// Mood History — Weekly trends, AI insights, mood-performance correlation
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform, ScrollView, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { readQuery } from '../../lib/neo4j';
import { callSarvam } from '../../lib/ai';
import { Fonts } from '../../constants/fonts';
import { Radii, Spacing } from '../../constants/colors';
import { SectionLabel, PrimaryButton, AnimatedScreenWrapper } from '../../components/ui/premium';

export default function MoodHistoryScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [moods, setMoods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [avgStress, setAvgStress] = useState(0);
  const [topSource, setTopSource] = useState('');
  const [trend, setTrend] = useState<'up' | 'down' | 'stable'>('stable');
  const [aiInsight, setAiInsight] = useState('');
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [sleepStats, setSleepStats] = useState({ great: 0, okay: 0, poor: 0 });

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      try {
        const res = await readQuery(
          `MATCH (s:Student {id: $studentId})-[:LOGGED_MOOD]->(m:MoodLog)
           RETURN m.stress_level AS stress, m.source AS source, m.note AS note, m.date AS date,
                  m.sleep_quality AS sleep, m.energy_level AS energy
           ORDER BY m.date DESC LIMIT 14`,
          { studentId }
        );
        const parsed = res.map(r => {
          const stress = r && typeof r.get === 'function' ? r.get('stress') : (r as any)?.stress;
          const source = r && typeof r.get === 'function' ? r.get('source') : (r as any)?.source;
          const note = r && typeof r.get === 'function' ? r.get('note') : (r as any)?.note;
          const sleep = r && typeof r.get === 'function' ? r.get('sleep') : (r as any)?.sleep;
          const energy = r && typeof r.get === 'function' ? r.get('energy') : (r as any)?.energy;
          const date = r && typeof r.get === 'function' ? r.get('date') : (r as any)?.date;
          return {
            stress: stress || 0,
            source: source || '',
            note: note || '',
            sleep: sleep || '',
            energy: energy || '',
            date: new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          };
        });
        setMoods(parsed);

        // Compute stats
        if (parsed.length > 0) {
          const avg = parsed.reduce((a, m) => a + m.stress, 0) / parsed.length;
          setAvgStress(Math.round(avg * 10) / 10);

          // Top source
          const sources: Record<string, number> = {};
          parsed.forEach(m => { if (m.source) sources[m.source] = (sources[m.source] || 0) + 1; });
          const top = Object.entries(sources).sort((a, b) => b[1] - a[1])[0];
          setTopSource(top ? top[0] : 'General');

          // Trend
          if (parsed.length >= 4) {
            const recent = parsed.slice(0, Math.floor(parsed.length / 2)).reduce((a, m) => a + m.stress, 0) / Math.floor(parsed.length / 2);
            const older = parsed.slice(Math.floor(parsed.length / 2)).reduce((a, m) => a + m.stress, 0) / (parsed.length - Math.floor(parsed.length / 2));
            if (recent > older + 0.4) setTrend('up');
            else if (recent < older - 0.4) setTrend('down');
            else setTrend('stable');
          }

          // Sleep stats
          const sleepCount = { great: 0, okay: 0, poor: 0 };
          parsed.forEach(m => { if (m.sleep === 'great') sleepCount.great++; else if (m.sleep === 'poor') sleepCount.poor++; else if (m.sleep === 'okay') sleepCount.okay++; });
          setSleepStats(sleepCount);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [studentId]);

  const generateInsight = async () => {
    if (moods.length === 0 || !studentId) return;
    setLoadingInsight(true);
    try {
      const summary = moods.slice(0, 7).map(m => `Stress:${m.stress}/5, Source:${m.source || 'none'}, Sleep:${m.sleep || '?'}, Energy:${m.energy || '?'}`).join('; ');
      const result = await callSarvam([
        { role: 'system', content: 'You are a student wellness advisor. Analyze mood data and give 3-4 practical, evidence-based wellness tips. Be specific and actionable. Max 100 words. Use bullet points.' },
        { role: 'user', content: `Recent mood data (newest first): ${summary}. Avg stress: ${avgStress}/5. Main stressor: ${topSource}. Trend: stress is ${trend === 'up' ? 'increasing' : trend === 'down' ? 'decreasing' : 'stable'}.` }
      ], 'wellness_insight');
      setAiInsight(result);
    } catch { setAiInsight('Could not generate insight. Try again later.'); }
    finally { setLoadingInsight(false); }
  };

  const getMoodIcon = (level: number): { name: string; color: string } => {
    if (level <= 1) return { name: 'happy-outline', color: colors.success };
    if (level === 2) return { name: 'thumbs-up-outline', color: '#34D399' };
    if (level === 3) return { name: 'remove-circle-outline', color: colors.warning };
    if (level === 4) return { name: 'sad-outline', color: '#F97316' };
    return { name: 'alert-circle-outline', color: colors.danger };
  };
  const trendIcon = trend === 'up' ? 'trending-up' : trend === 'down' ? 'trending-down' : 'remove';
  const trendColor = trend === 'up' ? colors.danger : trend === 'down' ? colors.success : colors.warning;

  // Build heatmap data (last 30 days grouped into rows of 7)
  const heatmapCells: Array<{ stress: number; hasData: boolean }> = [];
  for (let i = 0; i < 35; i++) {
    const moodEntry = moods[i % moods.length];
    heatmapCells.push({
      stress: moodEntry ? moodEntry.stress : 0,
      hasData: i < moods.length,
    });
  }

  const getHeatColor = (stress: number, hasData: boolean) => {
    if (!hasData) return isDark ? 'rgba(255,255,255,0.05)' : 'rgba(17,17,40,0.04)';
    if (stress <= 1) return colors.success;
    if (stress === 2) return '#6EE7B7';
    if (stress === 3) return colors.borderMedium;
    if (stress === 4) return '#FB923C';
    return colors.danger;
  };

  const loggingStreak = moods.length;

  return (
    <AnimatedScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
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
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={[styles.title, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Journal</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
            Track your cognitive load and emotional patterns
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : moods.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <Ionicons name="heart-outline" size={48} color={colors.textTertiary} />
            <Text style={{ color: colors.textTertiary, fontFamily: Fonts.body, marginTop: 16, fontSize: 14, textAlign: 'center' }}>
              No mood logs yet. Check in from the dashboard!
            </Text>
          </View>
        ) : (
          <>
            {/* Mood Heatmap */}
            <View style={[styles.card, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Mood History</Text>
              <Text style={{ fontSize: 12, color: colors.textTertiary, fontFamily: Fonts.body, marginBottom: 16 }}>
                Your cognitive load over the last 30 days.
              </Text>
              <View style={styles.heatmapContainer}>
                <View style={styles.heatmapDayLabels}>
                  {['', 'MON', '', 'WED', '', 'FRI', ''].map((d, i) => (
                    <Text key={i} style={[styles.heatmapDayLabel, { color: colors.textTertiary, fontFamily: Fonts.body }]}>{d}</Text>
                  ))}
                </View>
                <View style={styles.heatmapGrid}>
                  {Array.from({ length: 5 }).map((_, colIdx) => (
                    <View key={colIdx} style={styles.heatmapColumn}>
                      {Array.from({ length: 7 }).map((_, rowIdx) => {
                        const cellIdx = colIdx * 7 + rowIdx;
                        const cell = heatmapCells[cellIdx] || { stress: 0, hasData: false };
                        return (
                          <View
                            key={rowIdx}
                            style={[
                              styles.heatmapCell,
                              {
                                backgroundColor: getHeatColor(cell.stress, cell.hasData),
                                borderColor: cell.hasData ? 'transparent' : colors.borderSubtle,
                                borderWidth: cell.hasData ? 0 : 1,
                                borderStyle: cell.hasData ? 'solid' : 'dashed',
                              },
                            ]}
                          />
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>
              {/* Legend */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
                <Text style={{ fontSize: 10, color: colors.textTertiary, fontFamily: Fonts.body }}>Stress Level:</Text>
                {[
                  { label: 'Low', color: colors.success },
                  { label: '', color: '#6EE7B7' },
                  { label: '', color: colors.borderMedium },
                  { label: '', color: '#FB923C' },
                  { label: 'High', color: colors.danger },
                ].map((l, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: l.color }} />
                    {l.label ? <Text style={{ fontSize: 10, color: colors.textTertiary, fontFamily: Fonts.body }}>{l.label}</Text> : null}
                  </View>
                ))}
              </View>
            </View>

            {/* Consistency + Trend side by side */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <View style={[styles.card, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle, flex: 1, marginBottom: 0 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name="flash" size={14} color={colors.accent} />
                  <Text style={[styles.miniTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Consistency</Text>
                </View>
                <Text style={{ fontSize: 28, fontWeight: '700', color: colors.textPrimary, fontFamily: Fonts.display, letterSpacing: -0.5 }}>
                  {loggingStreak} <Text style={{ fontSize: 13, color: colors.textSecondary, fontFamily: Fonts.body }}>Days</Text>
                </Text>
                <Text style={{ fontSize: 11, color: colors.textTertiary, fontFamily: Fonts.body, marginTop: 6, lineHeight: 15 }}>
                  {loggingStreak >= 7 ? "Great job maintaining self-awareness." : "Keep logging to build awareness."}
                </Text>
              </View>
              
              <View style={[styles.card, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle, flex: 1, marginBottom: 0 }]}>
                <Text style={[styles.miniLabel, { color: colors.textTertiary, fontFamily: Fonts.body }]}>CURRENT TREND</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <Ionicons name={trendIcon as any} size={20} color={trendColor} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: trendColor, fontFamily: Fonts.displayMedium }}>
                    {trend === 'up' ? 'Increasing' : trend === 'down' ? 'Decreasing' : 'Stable'}
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.textTertiary, fontFamily: Fonts.body, marginTop: 6, lineHeight: 15 }}>
                  {trend === 'down' ? 'Well-being improving!' : trend === 'up' ? 'Consider taking a short break.' : 'Stress load is stable.'}
                </Text>
              </View>
            </View>

            {/* Summary Cards */}
            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
                <Text style={{ fontSize: 24, fontWeight: '700', color: colors.textPrimary, fontFamily: Fonts.display }}>{avgStress}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textTertiary, fontFamily: Fonts.body }]}>Avg Stress</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
                <Ionicons name={trendIcon as any} size={24} color={trendColor} />
                <Text style={[styles.summaryLabel, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
                  {trend === 'up' ? 'Rising' : trend === 'down' ? 'Improving' : 'Stable'}
                </Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary, fontFamily: Fonts.displayMedium }} numberOfLines={1}>
                  {topSource || '—'}
                </Text>
                <Text style={[styles.summaryLabel, { color: colors.textTertiary, fontFamily: Fonts.body }]}>Top Cause</Text>
              </View>
            </View>

            {/* Sleep Summary */}
            {(sleepStats.great + sleepStats.okay + sleepStats.poor) > 0 && (
              <View style={[styles.card, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Sleep Pattern</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                  {[
                    { label: '8h+', count: sleepStats.great, color: colors.success, icon: 'moon-outline' as const },
                    { label: '6-8h', count: sleepStats.okay, color: colors.warning, icon: 'cloudy-night-outline' as const },
                    { label: '<6h', count: sleepStats.poor, color: colors.danger, icon: 'thunderstorm-outline' as const }
                  ].map(s => (
                    <View key={s.label} style={{ flex: 1, alignItems: 'center', padding: 12, borderRadius: Radii.card, backgroundColor: s.color + '0c', borderWidth: StyleSheet.hairlineWidth, borderColor: s.color + '20' }}>
                      <Ionicons name={s.icon} size={20} color={s.color} />
                      <Text style={{ fontSize: 18, fontWeight: '700', color: s.color, marginTop: 4, fontFamily: Fonts.display }}>{s.count}</Text>
                      <Text style={{ fontSize: 11, color: colors.textTertiary, fontFamily: Fonts.body, fontWeight: '500' }}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* AI Insight */}
            <View style={[styles.card, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Ionicons name="sparkles" size={16} color={colors.accent} />
                <Text style={[styles.cardTitle, { color: colors.textPrimary, marginBottom: 0, fontFamily: Fonts.display }]}>AI Wellness Insight</Text>
              </View>
              {aiInsight ? (
                <Text style={{ fontSize: 14, lineHeight: 22, color: colors.textSecondary, fontFamily: Fonts.body }}>{aiInsight}</Text>
              ) : (
                <PrimaryButton
                  label={loadingInsight ? "Generating..." : "Generate Personalized Tips"}
                  onPress={generateInsight}
                  disabled={loadingInsight}
                  icon={loadingInsight ? <ActivityIndicator size="small" color={colors.textTertiary} /> : <Ionicons name="bulb-outline" size={16} color={colors.textInverse} />}
                />
              )}
            </View>

            {/* Quick Actions */}
            <View style={[styles.card, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Quick Wellness Tools</Text>
              
              <TouchableOpacity 
                style={[styles.toolRow, { borderBottomColor: colors.borderSubtle }]} 
                onPress={() => router.push('/screens/FocusTimerScreen')}
              >
                <View style={[styles.toolIcon, { backgroundColor: colors.accentMuted }]}>
                  <Ionicons name="timer-outline" size={18} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, fontFamily: Fonts.displayMedium }}>Focus Timer</Text>
                  <Text style={{ fontSize: 12, color: colors.textTertiary, fontFamily: Fonts.body }}>Pomodoro sessions with breaks</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.toolRow} 
                onPress={() => router.push('/screens/VoiceModeScreen')}
              >
                <View style={[styles.toolIcon, { backgroundColor: colors.accentMuted }]}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, fontFamily: Fonts.displayMedium }}>Talk to AI Coach</Text>
                  <Text style={{ fontSize: 12, color: colors.textTertiary, fontFamily: Fonts.body }}>Voice-based support and guidance</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            {/* Recent logs */}
            <SectionLabel text="Recent Logs" style={{ marginTop: 8, marginBottom: 12 }} />
            {moods.map((m, i) => {
              const iconInfo = getMoodIcon(m.stress);
              return (
                <View key={i} style={[styles.logCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
                  <View style={styles.logHeader}>
                    <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: iconInfo.color + '10', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: iconInfo.color + '20' }}>
                      <Ionicons name={iconInfo.name as any} size={18} color={iconInfo.color} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textTertiary, fontFamily: Fonts.body, letterSpacing: 0.8 }}>
                        {m.date.toUpperCase()}
                      </Text>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, fontFamily: Fonts.displayMedium }}>
                        {m.source || 'General Check-in'}
                      </Text>
                      {m.sleep && (
                        <Text style={{ fontSize: 11, color: colors.textTertiary, fontFamily: Fonts.body, marginTop: 2 }}>
                          Sleep: {m.sleep} · Energy: {m.energy || '—'}
                        </Text>
                      )}
                    </View>
                    <View style={[styles.levelBadge, { backgroundColor: m.stress > 3 ? colors.danger + '10' : colors.success + '10', borderColor: m.stress > 3 ? colors.danger + '20' : colors.success + '20' }]}>
                      <Text style={{ color: m.stress > 3 ? colors.danger : colors.success, fontSize: 12, fontWeight: '700', fontFamily: Fonts.display }}>
                        {m.stress}/5
                      </Text>
                    </View>
                  </View>
                  {m.note ? (
                    <View style={[styles.logNote, { backgroundColor: colors.surface2 }]}>
                      <Text style={{ color: colors.textSecondary, fontFamily: Fonts.body, fontSize: 13, fontStyle: 'italic', lineHeight: 18 }}>
                        "{m.note}"
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </AnimatedScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { 
    paddingTop: Platform.OS === 'ios' ? 60 : 40, 
    paddingBottom: 16, 
    paddingHorizontal: 20, 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 2, lineHeight: 17 },
  content: { padding: 20, paddingBottom: 40 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  summaryCard: { 
    flex: 1, 
    paddingVertical: 14, 
    paddingHorizontal: 8,
    borderRadius: Radii.card, 
    borderWidth: StyleSheet.hairlineWidth, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  summaryLabel: { fontSize: 10, fontWeight: '600', marginTop: 4, letterSpacing: 0.5, textTransform: 'uppercase' },
  card: { borderRadius: Radii.card, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.cardPaddingLg, marginBottom: 12 },
  cardTitle: { fontSize: 15, marginBottom: 10 },
  miniTitle: { fontSize: 14 },
  miniLabel: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  // Heatmap
  heatmapContainer: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  heatmapDayLabels: { justifyContent: 'space-between', height: 7 * 22 + 6 * 4 },
  heatmapDayLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3, height: 22, lineHeight: 22 },
  heatmapGrid: { flexDirection: 'row', gap: 4 },
  heatmapColumn: { flexDirection: 'column', gap: 4 },
  heatmapCell: { width: 22, height: 22, borderRadius: 4 },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  toolIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  logCard: { padding: 16, borderRadius: Radii.card, borderWidth: StyleSheet.hairlineWidth, marginBottom: 10 },
  logHeader: { flexDirection: 'row', alignItems: 'center' },
  levelBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  logNote: { marginTop: 12, padding: 12, borderRadius: 8 },
});
