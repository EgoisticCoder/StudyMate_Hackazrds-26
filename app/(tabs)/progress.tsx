// PROGRESS DASHBOARD — Stitch-inspired analytics with stress chart, performance bars, mastery heatmap
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, useWindowDimensions, Animated, Easing, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { useT, useTranslateSubject } from '../../lib/translations';
import { getSubjectStates, SubjectState } from '../../lib/adaptiveEngine';
import { readQuery } from '../../lib/neo4j';
import { shouldShowBurnoutAlert } from '../../lib/stressDetection';
import { getGamificationStats, GamificationStats } from '../../lib/gamification';
import { CrisisCard } from '../../components/CrisisCard';
import { ScreenSkeleton } from '../../components/LoadingSkeleton';
import { SubjectColors } from '../../constants/colors';
import { ScreenHero, EmptyState } from '../../components/ui/premium';
import { Fonts } from '../../constants/fonts';

export default function ProgressScreen() {
  const { colors, isDark } = useTheme();
  const { width: SW } = useWindowDimensions();
  const { studentId } = useAuth();
  const tr = useT();
  const translateSubject = useTranslateSubject();

  // On web, readQuery results come back as plain JSON objects from the proxy
  // (no .get() method). On native, they're real Neo4j Record instances. This
  // helper works with both so the screen doesn't crash on web.
  const rget = (record: any, key: string) =>
    record && typeof record.get === 'function' ? record.get(key) : record?.[key];

  const [loading, setLoading] = useState(true);
  const [studyMins, setStudyMins] = useState(0);
  const [studyHrs, setStudyHrs] = useState(0);
  const [totalQuizzes, setTotalQuizzes] = useState(0);
  const [states, setStates] = useState<SubjectState[]>([]);
  const [moodData, setMoodData] = useState<Array<{ stress: number; day: string }>>([]);
  const [showBurnout, setShowBurnout] = useState(false);
  const [quizHistory, setQuizHistory] = useState<any[]>([]);
  const [answerHistory, setAnswerHistory] = useState<any[]>([]);
  const [gStats, setGStats] = useState<GamificationStats | null>(null);
  const [stressTrend, setStressTrend] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      try {
        const safeRead = async (query: string, params: any, defaultVal: any = []) => {
          try {
            return await readQuery(query, params);
          } catch (err) {
            console.warn('Progress safeRead failed for query:', query, err);
            return defaultVal;
          }
        };

        const [subStates, studyR, quizR, moodR, quizHistR, ansHistR] = await Promise.all([
          (async () => {
            try {
              return await getSubjectStates(studentId);
            } catch (err) {
              console.warn('Failed to fetch subject states for progress:', err);
              return [];
            }
          })(),
          safeRead(`MATCH (s:Student {id: $studentId})-[:STUDIED]->(ss:StudySession) WHERE ss.date > datetime() - duration('P7D') RETURN sum(ss.duration_mins) AS total`, { studentId }),
          safeRead(`MATCH (s:Student {id: $studentId})-[:ATTEMPTED]->(q:Quiz) RETURN count(q) AS count`, { studentId }),
          safeRead(`MATCH (s:Student {id: $studentId})-[:LOGGED_MOOD]->(m:MoodLog) WHERE m.date > datetime() - duration('P7D') RETURN m.stress_level AS stress, m.date AS date ORDER BY m.date ASC`, { studentId }),
          safeRead(`MATCH (s:Student {id: $studentId})-[:ATTEMPTED]->(q:Quiz) RETURN q.date AS date, q.subject AS subject, q.chapter AS chapter, q.score AS score, q.total AS total ORDER BY q.date DESC LIMIT 20`, { studentId }),
          safeRead(`MATCH (s:Student {id: $studentId})-[:SUBMITTED]->(a:AnswerSubmission) RETURN a.date AS date, a.subject AS subject, a.marks_obtained AS obtained, a.marks_max AS max ORDER BY a.date DESC LIMIT 10`, { studentId }),
        ]);

        setStates(subStates);
        const totalMins = rget(studyR[0], 'total') || 0;
        setStudyMins(totalMins);
        setStudyHrs(Math.round((totalMins / 60) * 10) / 10);
        setTotalQuizzes(rget(quizR[0], 'count') || 0);

        // Fetch local offline mood logs
        let localMoods: any[] = [];
        try {
          const cacheKey = `local_mood_logs_${studentId}`;
          const cached = Platform.OS === 'web'
            ? localStorage.getItem(cacheKey)
            : await (require('expo-secure-store')).getItemAsync(cacheKey);
          if (cached) {
            localMoods = JSON.parse(cached);
          }
        } catch (cacheErr) {
          console.warn('Failed to load local mood logs:', cacheErr);
        }
        const parseNeo4jDate = (dateObj: any): Date => {
          if (!dateObj) return new Date();
          if (typeof dateObj === 'string') return new Date(dateObj);
          if (dateObj.year && dateObj.month && dateObj.day) {
            return new Date(
              dateObj.year,
              dateObj.month - 1,
              dateObj.day,
              dateObj.hour || 0,
              dateObj.minute || 0,
              dateObj.second || 0
            );
          }
          if (typeof dateObj.toString !== 'function') {
            return new Date();
          }
          const str = dateObj.toString();
          if (str === '[object Object]') {
            if (dateObj.properties?.date) return parseNeo4jDate(dateObj.properties.date);
            return new Date();
          }
          const d = new Date(str);
          return isNaN(d.getTime()) ? new Date() : d;
        };

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const activeLocalMoods = localMoods.filter(m => parseNeo4jDate(m.date) > sevenDaysAgo);

        // Map Neo4j mood logs
        const dbMoods = moodR.map((r: any) => ({
          stress: Number(rget(r, 'stress')) || 0,
          date: parseNeo4jDate(rget(r, 'date')).toISOString()
        }));

        // Map local offline mood logs
        const localMapped = activeLocalMoods.map((m: any) => ({
          stress: Number(m.stress_level) || 0,
          date: m.date
        }));

        // Merge and sort ascending by date
        const allMoods = [...dbMoods, ...localMapped];
        allMoods.sort((a, b) => parseNeo4jDate(a.date).getTime() - parseNeo4jDate(b.date).getTime());

        // Transform for UI layout
        const moods = allMoods.map((m: any) => ({
          stress: m.stress,
          day: parseNeo4jDate(m.date).toLocaleDateString('en', { weekday: 'short' }).toUpperCase()
        }));
        setMoodData(moods);

        const burnoutCheckData = allMoods.map((m: any) => ({
          stress_level: m.stress,
          date: m.date
        }));
        setShowBurnout(shouldShowBurnoutAlert(burnoutCheckData));

        setQuizHistory(quizHistR.map((r: any) => ({ date: parseNeo4jDate(rget(r, 'date')).toLocaleDateString('en', { month: 'short', day: 'numeric' }), subject: rget(r, 'subject'), chapter: rget(r, 'chapter'), score: rget(r, 'score'), total: rget(r, 'total') })));
        setAnswerHistory(ansHistR.map((r: any) => ({ date: parseNeo4jDate(rget(r, 'date')).toLocaleDateString('en', { month: 'short', day: 'numeric' }), subject: rget(r, 'subject'), obtained: rget(r, 'obtained'), max: rget(r, 'max') })));

        try {
          setGStats(await getGamificationStats(studentId));
        } catch (gStatsErr) {
          console.warn('Failed to fetch gamification stats for progress:', gStatsErr);
        }

        // Compute stress trend
        if (moods.length >= 3) {
          const half = Math.floor(moods.length / 2);
          const firstHalf = moods.slice(0, half).reduce((a, m) => a + m.stress, 0) / half;
          const secondHalf = moods.slice(half).reduce((a, m) => a + m.stress, 0) / (moods.length - half);
          const delta = Math.round(((secondHalf - firstHalf) / Math.max(firstHalf, 1)) * 100);
          setStressTrend(delta);
        }
      } catch (err) { console.error('Progress fetch error:', err); }
      finally { setLoading(false); }
    })();
  }, [studentId]);

  // Build mastery heatmap data (5x6 grid from subject chapter data)
  const masteryGrid: Array<{ color: string; opacity: number }> = [];
  states.forEach(s => {
    const subColor = isDark ? SubjectColors[s.subject]?.dark || '#C4C1FB' : SubjectColors[s.subject]?.light || '#070235';
    const count = Math.min(Math.ceil(s.weighted_avg / 20), 5);
    for (let c = 0; c < count; c++) {
      masteryGrid.push({ color: subColor, opacity: 0.3 + (s.weighted_avg / 100) * 0.7 });
    }
  });
  while (masteryGrid.length < 24) {
    masteryGrid.push({ color: colors.borderSubtle, opacity: 0.3 });
  }

  // Entrance animation
  const screenFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(screenFade, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  if (loading) return <ScreenSkeleton />;

  return (
    <Animated.ScrollView style={[st.container, { backgroundColor: colors.background, opacity: screenFade }]} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
      <ScreenHero title={tr('progress_title')}>
        {/* Streak + Study Time hero cards */}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          {/* Streak Card */}
          <View style={[st.heroCard, { backgroundColor: colors.surface2, borderColor: colors.borderSubtle, borderWidth: StyleSheet.hairlineWidth, flex: 1 }]}>
            <Text style={[st.heroCardLabel, { color: colors.textTertiary, fontFamily: Fonts.bodyMedium }]}>CURRENT STREAK</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={[st.heroCardValue, { color: colors.textPrimary, fontFamily: Fonts.display }]}>{gStats?.streak || 0}</Text>
              <Text style={[st.heroCardUnit, { color: colors.textSecondary, fontFamily: Fonts.body }]}>days</Text>
            </View>
            <Ionicons name="flame" size={18} color={colors.xpGold} style={{ position: 'absolute', top: 16, right: 16 }} />
          </View>
          
          {/* Study Time Card */}
          <View style={[st.heroCard, { backgroundColor: colors.surface2, borderColor: colors.borderSubtle, borderWidth: StyleSheet.hairlineWidth, flex: 1 }]}>
            <Text style={[st.heroCardLabel, { color: colors.textTertiary, fontFamily: Fonts.bodyMedium }]}>STUDY TIME (WEEK)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={[st.heroCardValue, { color: colors.textPrimary, fontFamily: Fonts.display }]}>{studyHrs}</Text>
              <Text style={[st.heroCardUnit, { color: colors.textSecondary, fontFamily: Fonts.body }]}>hours</Text>
            </View>
            <Ionicons name="time-outline" size={18} color={colors.textTertiary} style={{ position: 'absolute', top: 16, right: 16 }} />
          </View>
        </View>
      </ScreenHero>

      <View style={st.body}>
        {showBurnout && <View style={{ marginBottom: 4 }}><CrisisCard /></View>}

        {/* Stress Levels — Line Chart */}
        <View style={[st.card, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={[st.cardTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Stress Levels</Text>
            <Text style={[st.cardMeta, { color: colors.textTertiary, fontFamily: Fonts.bodyMedium }]}>Last 7 Days</Text>
          </View>
          {moodData.length > 0 ? (
            <View style={st.lineChartWrap}>
              <View style={st.lineChartArea}>
                {/* Grid lines */}
                {[0, 1, 2, 3, 4].map(i => (
                  <View key={i} style={[st.gridLine, { top: `${i * 25}%`, backgroundColor: colors.borderSubtle }]} />
                ))}
                {/* Dots & lines */}
                {moodData.map((m, i) => {
                  const x = (i / Math.max(moodData.length - 1, 1)) * 100;
                  const y = 100 - (m.stress / 5) * 100;
                  return (
                    <View key={i} style={[st.chartDot, { left: `${x}%`, top: `${y}%`, backgroundColor: colors.accent }]} />
                  );
                })}
              </View>
              <View style={st.lineChartLabels}>
                {moodData.map((m, i) => (
                  <Text key={i} style={[st.chartLabel, { color: colors.textTertiary, fontFamily: Fonts.body }]}>{m.day.slice(0, 3)}</Text>
                ))}
              </View>
            </View>
          ) : (
            <EmptyState
              icon={<Ionicons name="trending-up" size={40} color={colors.textTertiary} />}
              heading="No mood data yet"
              body="Log your first check-in on the Home tab"
            />
          )}
        </View>

        {/* Performance by Subject & Stress Trend */}
        <View style={{ flexDirection: SW < 365 ? 'column' : 'row', gap: 12 }}>
          {/* Performance Card */}
          <View style={[st.card, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle, flex: SW < 365 ? undefined : 2 }]}>
            <Text style={[st.cardTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Performance</Text>
            {states.length > 0 ? (
              states.map(s => {
                const barWidth = `${Math.max(s.weighted_avg, 5)}%`;
                const subColor = isDark ? SubjectColors[s.subject]?.dark || colors.accent : SubjectColors[s.subject]?.light || colors.accent;
                return (
                  <View key={s.subject} style={st.perfRow}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={[st.perfSubject, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]} numberOfLines={1}>{translateSubject(s.subject)}</Text>
                      <Text style={[st.perfPct, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>{s.weighted_avg}%</Text>
                    </View>
                    <View style={[st.perfBarBg, { backgroundColor: colors.surface3 }]}>
                      <View style={[st.perfBar, { width: barWidth as `${number}%`, backgroundColor: subColor }]} />
                    </View>
                  </View>
                );
              })
            ) : (
              <EmptyState
                icon={<Ionicons name="bar-chart-outline" size={40} color={colors.textTertiary} />}
                heading="No quiz data yet"
                body="Complete a quiz to see your breakdown"
              />
            )}
          </View>

          {/* Stress Trend */}
          {stressTrend !== null && (
            <View style={[st.card, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle, flex: SW < 365 ? undefined : 1, justifyContent: 'space-between' }]}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="flash-outline" size={14} color={colors.accent} />
                  <Text style={[st.cardMeta, { color: colors.textTertiary, fontFamily: Fonts.bodyMedium }]}>TREND</Text>
                </View>
                <Ionicons
                  name={stressTrend <= 0 ? 'trending-down' : 'trending-up'}
                  size={28}
                  color={stressTrend <= 0 ? colors.success : colors.danger}
                  style={{ marginTop: 10 }}
                />
                <Text style={[{ fontSize: 13, fontFamily: Fonts.bodyMedium, color: stressTrend <= 0 ? colors.success : colors.danger, marginTop: 6 }]}>
                  Stress {stressTrend <= 0 ? 'down' : 'up'}
                </Text>
                <Text style={[{ fontSize: 18, fontFamily: Fonts.display, color: stressTrend <= 0 ? colors.success : colors.danger }]}>
                  ({stressTrend > 0 ? '+' : ''}{stressTrend}%)
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Chapter Mastery Heatmap */}
        <View style={[st.card, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={[st.cardTitle, { color: colors.textPrimary, fontFamily: Fonts.display, marginBottom: 0 }]}>Chapter Mastery</Text>
            <Text style={[st.cardMeta, { color: colors.textTertiary, fontFamily: Fonts.bodyMedium }]}>All Subjects</Text>
          </View>
          <View style={st.heatmapGrid}>
            {masteryGrid.slice(0, 24).map((cell, i) => {
              const cellWidth = (SW - 90) / 8;
              return (
                <View
                  key={i}
                  style={[
                    st.heatmapCell,
                    {
                      width: cellWidth,
                      height: cellWidth,
                      backgroundColor: cell.color,
                      opacity: cell.opacity,
                      borderColor: colors.borderSubtle,
                    },
                  ]}
                />
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={[st.heatmapLegend, { backgroundColor: colors.borderSubtle, opacity: 0.3 }]} />
              <Text style={{ fontSize: 10, color: colors.textTertiary, fontFamily: Fonts.body }}>Needs Review</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={[st.heatmapLegend, { backgroundColor: colors.accent, opacity: 0.6 }]} />
              <Text style={{ fontSize: 10, color: colors.textTertiary, fontFamily: Fonts.body }}></Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={[st.heatmapLegend, { backgroundColor: colors.accent }]} />
              <Text style={{ fontSize: 10, color: colors.textTertiary, fontFamily: Fonts.body }}>Mastered</Text>
            </View>
          </View>
        </View>

        {/* Recent Assessments */}
        {(quizHistory.length > 0 || answerHistory.length > 0) ? (
          <View style={[st.card, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
            <Text style={[st.cardTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Recent Assessments</Text>
            {quizHistory.slice(0, 6).map((q, i) => {
              const pct = q.total > 0 ? Math.round((q.score / q.total) * 100) : 0;
              const scoreColor = pct >= 80 ? colors.success : pct >= 50 ? colors.warning : colors.danger;
              return (
                <View key={`q${i}`} style={[st.assessRow, { borderBottomColor: colors.borderSubtle }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.assessTitle, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]} numberOfLines={1}>{q.chapter || translateSubject(q.subject)}</Text>
                    <Text style={[st.assessMeta, { color: colors.textTertiary, fontFamily: Fonts.body }]}>{q.date} • {translateSubject(q.subject)}</Text>
                  </View>
                  <Text style={[st.assessScore, { color: scoreColor, fontFamily: Fonts.display }]}>{q.score}/{q.total}</Text>
                </View>
              );
            })}
            {answerHistory.slice(0, 4).map((a, i) => {
              const pct = a.max > 0 ? Math.round((a.obtained / a.max) * 100) : 0;
              const scoreColor = pct >= 80 ? colors.success : pct >= 50 ? colors.warning : colors.danger;
              return (
                <View key={`a${i}`} style={[st.assessRow, { borderBottomColor: colors.borderSubtle }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.assessTitle, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]} numberOfLines={1}>{translateSubject(a.subject)}</Text>
                    <Text style={[st.assessMeta, { color: colors.textTertiary, fontFamily: Fonts.body }]}>{a.date} • Answer Grader</Text>
                  </View>
                  <Text style={[st.assessScore, { color: scoreColor, fontFamily: Fonts.display }]}>{a.obtained}/{a.max}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Fatigue / Burnout Alert */}
        {showBurnout && (
          <View style={st.fatigueWrapper}>
            <View style={[st.fatigueInner, { borderLeftColor: colors.danger, backgroundColor: colors.surface2 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Ionicons name="warning-outline" size={18} color={colors.danger} />
                <Text style={{ fontSize: 15, fontFamily: Fonts.display, color: colors.danger }}>Fatigue Detected</Text>
              </View>
              <Text style={{ fontSize: 13, fontFamily: Fonts.body, color: colors.textSecondary, lineHeight: 20 }}>
                Your focus scores have dropped in recent sessions. Consider taking a 15-minute cognitive break to consolidate learning.
              </Text>
            </View>
          </View>
        )}
      </View>
    </Animated.ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: Platform.OS === 'ios' ? 100 : 80 },
  body: { padding: 20, gap: 12 },

  // Hero cards
  heroCard: {
    padding: 16,
    borderRadius: 14,
    minHeight: 92,
  },
  heroCardLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  heroCardValue: {
    fontSize: 32,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  heroCardUnit: {
    fontSize: 14,
    fontWeight: '400',
    marginLeft: 2,
  },

  // Card
  card: {
    padding: 20,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    letterSpacing: -0.2,
  },
  cardMeta: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Line chart
  lineChartWrap: { height: 140 },
  lineChartArea: {
    flex: 1,
    position: 'relative',
    marginBottom: 8,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  chartDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: -4,
    marginTop: -4,
  },
  lineChartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chartLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // Performance bars
  perfRow: {
    marginBottom: 14,
  },
  perfSubject: {
    fontSize: 13,
    fontWeight: '500',
  },
  perfPct: {
    fontSize: 13,
  },
  perfBarBg: {
    height: 12,
    borderRadius: 4,
    overflow: 'hidden',
  },
  perfBar: {
    height: 12,
    borderRadius: 4,
  },

  // Heatmap
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  heatmapCell: {
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heatmapLegend: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },

  // Assessments
  assessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  assessTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  assessMeta: {
    fontSize: 11,
    fontWeight: '400',
    marginTop: 2,
  },
  assessScore: {
    fontSize: 16,
    fontWeight: '600',
  },

  // Fatigue card
  fatigueWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  fatigueInner: {
    borderLeftWidth: 3,
    padding: 16,
  },
});
