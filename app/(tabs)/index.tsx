// HOME DASHBOARD — Premium dark/light design with flat header, separate stat cards, 
// nested view borders, and structured feature hierarchies.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  RefreshControl, Platform, useWindowDimensions, Pressable, Animated, Easing,
  Modal, TextInput, TouchableOpacity, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, useAuth } from '../../lib/context';
import { useT, useTranslateSubject } from '../../lib/translations';
import { getStudentProfile, StudentProfile } from '../../lib/adaptiveEngine';
import { readQuery } from '../../lib/neo4j';
import { persistExam, createRefreshCallback } from '../../lib/dataPersistence';
import { computeStressVerdict } from '../../lib/stressDetection';
import { getGamificationStats, GamificationStats } from '../../lib/gamification';
import { getActiveMissions, Mission } from '../../lib/missions';
import { MoodCheckIn } from '../../components/MoodCheckIn';
import { CrisisCard } from '../../components/CrisisCard';
import { ScreenSkeleton } from '../../components/LoadingSkeleton';
import { WeeklyTimetableCard } from '../../components/WeeklyTimetableCard';
import { DailyTimetableCard } from '../../components/DailyTimetableCard';
import { hasMoodCheckedToday } from '../../lib/moodUtils';
import { SubjectColors } from '../../constants/colors';
import { getSubjectStates, SubjectState } from '../../lib/adaptiveEngine';
import { Fonts } from '../../constants/fonts';
import { LinearGradient } from 'expo-linear-gradient';
import { v4 as uuidv4 } from 'uuid';

// Robust parsing of mood dates to prevent Invalid Date on web/native
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

export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  const { width: SW } = useWindowDimensions();
  const { studentId } = useAuth();
  const tr = useT();
  const translateSubject = useTranslateSubject();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showMoodCheck, setShowMoodCheck] = useState(false);
  const [moodReaction, setMoodReaction] = useState('');
  const [isCrisis, setIsCrisis] = useState(false);
  const [hasBaseline, setHasBaseline] = useState(true);
  const [baselineViewed, setBaselineViewed] = useState(false);
  const [weekStats, setWeekStats] = useState({ quizzes: 0, avgScore: 0, studyMins: 0 });
  const [focusHintKey, setFocusHintKey] = useState<'focus_hint_default' | 'focus_hint_stress' | 'focus_hint_steady'>('focus_hint_default');
  const [nextExam, setNextExam] = useState<{ name: string; days: number } | null>(null);
  const [timetableReload, setTimetableReload] = useState(0);
  const [gStats, setGStats] = useState<GamificationStats | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [subjectStates, setSubjectStates] = useState<SubjectState[]>([]);
  const [showExamModal, setShowExamModal] = useState(false);
  const [newExamName, setNewExamName] = useState('');
  const [newExamDate, setNewExamDate] = useState('');
  const [examList, setExamList] = useState<{ name: string; date: string; days: number }[]>([]);
  const [examLoadError, setExamLoadError] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Load cached profile instantly so the UI is never blocked by a network call.
  // The full fetchData() call then hydrates with fresh data in the background.
  useEffect(() => {
    if (!studentId) return;
    const loadCachedProfile = async () => {
      try {
        const cacheKey = `profile_cache_${studentId}`;
        let cached: string | null = null;
        if (Platform.OS === 'web') {
          cached = localStorage.getItem(cacheKey);
        } else {
          try {
            const SecureStore = require('expo-secure-store');
            cached = await SecureStore.getItemAsync(cacheKey);
          } catch (err) {
            console.warn('[Home] Failed to read SecureStore profile_cache:', err);
          }
        }
        if (cached) {
          setProfile(JSON.parse(cached));
          // Cache hit — stop the skeleton immediately; data arrives shortly after
          setLoading(false);
        }
      } catch (err) {
        console.warn('[Home] Failed to loadCachedProfile:', err);
      }
    };
    loadCachedProfile();
  }, [studentId]);

  const fetchData = useCallback(async () => {
    if (!studentId) return;
    try {
      const p = await getStudentProfile(studentId);
      setProfile(p);

      const safeRead = async (cypher: string, params: any, defaultVal: any = [], onError?: () => void) => {
        try {
          return await readQuery(cypher, params);
        } catch (err) {
          console.warn('Home query failed:', cypher, err);
          onError?.();
          return defaultVal;
        }
      };

      const diagDone = await safeRead(
        `MATCH (s:Student {id: $studentId})-[:TOOK_DIAGNOSTIC]->() RETURN 1 LIMIT 1`,
        { studentId }
      );
      const legacyBaseline = await safeRead(
        `MATCH (s:Student {id: $studentId})-[:TOOK_BASELINE]->() RETURN 1 LIMIT 1`,
        { studentId }
      );
      const baselineDone = diagDone.length > 0 || legacyBaseline.length > 0;
      setHasBaseline(baselineDone);

      // Check if user has viewed results at least once (stored as flag)
      if (baselineDone) {
        const viewedRec = await safeRead(
          `MATCH (s:Student {id: $studentId}) RETURN s.baseline_viewed AS v`,
          { studentId }
        );
        const viewedRecord = viewedRec[0];
        const v = viewedRecord && typeof viewedRecord.get === 'function' ? viewedRecord.get('v') : (viewedRecord as any)?.v;
        setBaselineViewed(v === true);
      }

      const stressRow = await safeRead(
        `MATCH (s:Student {id: $studentId})-[:LOGGED_MOOD]->(m:MoodLog)
         WHERE m.date > datetime() - duration('P7D')
         RETURN avg(toFloat(m.stress_level)) AS a`,
        { studentId }
      );
      const stressRecord = stressRow[0];
      const avgS = stressRecord && typeof stressRecord.get === 'function' ? stressRecord.get('a') : (stressRecord as any)?.a;
      if (avgS != null && !Number.isNaN(Number(avgS))) {
        const v = Number(avgS);
        if (v > 3.6) setFocusHintKey('focus_hint_stress');
        else if (v < 2.2) setFocusHintKey('focus_hint_steady');
        else setFocusHintKey('focus_hint_default');
      } else setFocusHintKey('focus_hint_default');

      // Load upcoming exams for exam list (fetch all, filter in JS for mixed date types)
      setExamLoadError(false);
      const examListRec = await safeRead(
        `MATCH (s:Student {id: $studentId})-[:HAS_EXAM]->(e:Exam)
         RETURN e.name AS name, e.date AS dt ORDER BY e.date ASC`,
        { studentId },
        [],
        () => setExamLoadError(true)
      );
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const exams = examListRec
        .map((r: any) => {
          const rawDt = r && typeof r.get === 'function' ? r.get('dt') : (r as any)?.dt;
          const rawName = r && typeof r.get === 'function' ? r.get('name') : (r as any)?.name;
          const d = parseNeo4jDate(rawDt);
          const days = !Number.isNaN(d.getTime())
            ? Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400000))
            : 0;
          return { name: String(rawName || 'Exam'), date: d.toISOString().split('T')[0], days, sortTime: d.getTime() };
        })
        .filter((exam: { sortTime: number }) => !Number.isNaN(exam.sortTime) && exam.sortTime >= todayStart.getTime())
        .sort((a: { sortTime: number }, b: { sortTime: number }) => a.sortTime - b.sortTime)
        .map(({ sortTime, ...exam }: { sortTime: number; name: string; date: string; days: number }) => exam);
      setExamList(exams);

      const examRec = exams.slice(0, 1); // Use first exam from the list for nextExam
      if (examRec.length) {
        const exam = examRec[0];
        setNextExam({ name: exam.name, days: exam.days });
      } else setNextExam(null);

      // Check if logged mood today (calendar day, not rolling 24h)
      const moodCheckedLocal = await hasMoodCheckedToday(studentId);
      let checkedInToday = moodCheckedLocal;

      if (!checkedInToday) {
        const moodToday = await safeRead(
          `MATCH (s:Student {id: $studentId})-[:LOGGED_MOOD]->(m:MoodLog)
           RETURN m.date AS date ORDER BY m.date DESC LIMIT 5`,
          { studentId }
        );
        const todayKey = new Date();
        checkedInToday = moodToday.some((r: any) => {
          const raw = r && typeof r.get === 'function' ? r.get('date') : (r as any)?.date;
          const d = typeof raw === 'string' ? new Date(raw) : parseNeo4jDate(raw);
          return d.getFullYear() === todayKey.getFullYear() &&
            d.getMonth() === todayKey.getMonth() &&
            d.getDate() === todayKey.getDate();
        });
      }

      if (!checkedInToday) {
        try {
          const cacheKey = `local_mood_logs_${studentId}`;
          const cached = Platform.OS === 'web'
            ? localStorage.getItem(cacheKey)
            : await (require('expo-secure-store')).getItemAsync(cacheKey);
          if (cached) {
            const localLogs = JSON.parse(cached);
            const todayKey = new Date();
            checkedInToday = localLogs.some((l: any) => {
              const d = new Date(l.date);
              return d.getFullYear() === todayKey.getFullYear() &&
                d.getMonth() === todayKey.getMonth() &&
                d.getDate() === todayKey.getDate();
            });
          }
        } catch (cacheErr) {
          console.warn('Failed to check local mood logs on Home:', cacheErr);
        }
      }
      setShowMoodCheck(!checkedInToday);

      const recentMoods = await safeRead(
        `MATCH (s:Student {id: $studentId})-[:LOGGED_MOOD]->(m:MoodLog)
         WHERE m.date > datetime() - duration('P7D')
         RETURN m.stress_level AS stress_level, m.date AS date ORDER BY m.date DESC`,
        { studentId }
      );
      const quizzes = await safeRead(
        `MATCH (s:Student {id: $studentId})-[:ATTEMPTED]->(q:Quiz)
         WHERE q.date > datetime() - duration('P7D')
         RETURN count(q) AS count, avg(toFloat(q.score)/q.total) AS avg`,
        { studentId }
      );
      const sessions = await safeRead(
        `MATCH (s:Student {id: $studentId})-[:STUDIED]->(ss:StudySession)
         WHERE ss.date > datetime() - duration('P7D')
         RETURN count(ss) AS count`,
        { studentId }
      );

      const moods = recentMoods.map((r: any) => {
        const stress = r && typeof r.get === 'function' ? r.get('stress_level') : (r as any)?.stress_level;
        const date = r && typeof r.get === 'function' ? r.get('date') : (r as any)?.date;
        return {
          stress_level: stress || 0,
          date: parseNeo4jDate(date).toISOString(),
        };
      });
      const sessionRecord = sessions[0];
      const sessionCount = sessionRecord && typeof sessionRecord.get === 'function' ? sessionRecord.get('count') : (sessionRecord as any)?.count || 0;
      const quizRecord = quizzes[0];
      const quizCount = quizRecord && typeof quizRecord.get === 'function' ? quizRecord.get('count') : (quizRecord as any)?.count || 0;
      const avgScore = quizRecord && typeof quizRecord.get === 'function' ? quizRecord.get('avg') : (quizRecord as any)?.avg || 0;

      const verdict = computeStressVerdict({
        recentMoods: moods, activeSessions7Days: sessionCount,
        quizzesAttempted7Days: quizCount, avgQuizScoreStable: true,
      });
      setIsCrisis(verdict === 'CRISIS_RISK');

      const studySessions = await safeRead(
        `MATCH (s:Student {id: $studentId})-[:STUDIED]->(ss:StudySession)
         WHERE ss.date > datetime() - duration('P7D')
         RETURN sum(ss.duration_mins) AS total`,
        { studentId }
      );
      const studyRecord = studySessions[0];
      const studyTotal = studyRecord && typeof studyRecord.get === 'function' ? studyRecord.get('total') : (studyRecord as any)?.total || 0;
      setWeekStats({
        quizzes: quizCount,
        avgScore: Math.round(avgScore * 100) || 0,
        studyMins: studyTotal,
      });

      const st2 = await getGamificationStats(studentId);
      setGStats(st2);
      const activeMs = await getActiveMissions(studentId);
      setMissions(activeMs);

      // Subject states for Current Focus section
      const sStates = await getSubjectStates(studentId);
      setSubjectStates(sStates.slice(0, 6)); // Show top 6

      // Schedule default notifications based on profile
      try {
        const { setupDefaultNotifications } = require('../../lib/notifications');
        await setupDefaultNotifications({
          peakStudyTime: p?.peak_study_time || 'Evening',
          streak: st2?.streak ?? 0,
          weakSubject: sStates.length > 0 ? sStates[sStates.length - 1]?.subject : undefined,
        });
      } catch (notifErr) {
        console.warn('Notification setup skipped:', notifErr);
      }

    } catch (err) {
      console.error('Home data fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setTimetableReload(t => t + 1);
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return tr('good_morning');
    if (hour < 17) return tr('good_afternoon');
    return tr('good_evening');
  };

  const handleViewResults = async () => {
    if (studentId) {
      try {
        const { writeQuery } = require('../../lib/neo4j');
        await writeQuery(`MATCH (s:Student {id: $studentId}) SET s.baseline_viewed = true`, { studentId });
      } catch (err) {
        console.warn('[Home] Failed to update baseline_viewed in Neo4j:', err);
      }
    }
    setBaselineViewed(true);
    router.push({ pathname: '/screens/BaselineTestScreen', params: { viewResults: 'true' } });
  };



  const handleAddExam = async () => {
    if (!newExamName.trim() || !newExamDate.trim() || !studentId) {
      Alert.alert('Incomplete', 'Enter exam name and date.');
      return;
    }
    
    // Strict regex for YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newExamDate.trim())) {
      Alert.alert('Invalid Format', 'Please enter the date exactly as YYYY-MM-DD (e.g., 2026-12-15).');
      return;
    }
    
    const parsedDate = new Date(newExamDate.trim());
    if (isNaN(parsedDate.getTime())) {
      Alert.alert('Invalid Date', 'The date entered is not a valid calendar date.');
      return;
    }

    try {
      const id = uuidv4();
      
      // Persist to Neo4j with reactive state management
      await persistExam(
        studentId,
        {
          subject: newExamName.trim(),
          date: new Date(newExamDate).toISOString(),
        },
        {
          onSuccess: createRefreshCallback(async () => {
            console.log('[Dashboard] Exam saved, refreshing data...');
            
            // Schedule exam notifications
            try {
              const { scheduleExamReminder } = require('../../lib/notifications');
              await scheduleExamReminder(newExamName.trim(), parsedDate);
            } catch (notifErr) {
              console.warn('Failed to schedule exam notifications:', notifErr);
            }
            
            // Refresh all dashboard data
            await fetchData();
          }),
          onError: (err) => {
            Alert.alert('Error', err.message || 'Failed to save exam.');
          },
          onFinally: () => {
            setShowExamModal(false);
            setNewExamName('');
            setNewExamDate('');
          },
        }
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save exam.');
    }
  };

  // Entrance animation
  const screenFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(screenFade, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  if (loading) return <ScreenSkeleton />;

  // Hierarchical Feature Lists
  const QUICK_ACTIONS = [
    { icon: 'chatbubble-ellipses-outline', labelKey: 'feature_ask_ai', route: '/screens/AskAIScreen', color: '#7C5CFC' },
    { icon: 'newspaper-outline', labelKey: 'feature_mock', route: '/screens/MockExamScreen', color: '#F472B6' },
    { icon: 'help-circle-outline', labelKey: 'tab_quiz', route: '/(tabs)/quiz', color: '#3B8EF3' },
    { icon: 'cart-outline', labelKey: 'feature_shop', route: '/screens/ShopScreen', color: '#F5A623' },
  ];

  const STUDY_TOOLS = [
    { icon: 'bulb-outline', labelKey: 'feature_concepts', route: '/screens/ConceptExplainerScreen', color: '#FBBF24' },
    { icon: 'albums-outline', labelKey: 'feature_review', route: '/screens/ReviewDeckScreen', color: '#FB923C' },
    { icon: 'today-outline', labelKey: 'feature_schedule', route: '/screens/StudyScheduleScreen', color: '#34D399' },
    { icon: 'calendar-outline', labelKey: 'feature_calendar', route: '/screens/CalendarScreen', color: '#10B981' },
    { icon: 'reader-outline', labelKey: 'feature_notes', route: '/screens/NotesViewerScreen', color: '#A78BFA' },
    { icon: 'mic-outline', labelKey: 'feature_voice', route: '/screens/VoiceModeScreen', color: '#38BDF8' },
  ];

  const CARE_COACHING = [
    { icon: 'heart-outline', labelKey: 'feature_wellness', route: '/screens/MoodHistoryScreen', color: '#F87171' },
    { icon: 'people-outline', labelKey: 'feature_parent', route: '/screens/ParentPortalScreen', color: '#C084FC' },
    { icon: 'timer-outline', labelKey: 'feature_focus', route: '/screens/FocusTimerScreen', color: '#2DD4BF' },
    { icon: 'document-text-outline', labelKey: 'feature_grade', route: '/screens/AnswerGraderScreen', color: '#60A5FA' },
  ];

  return (
    <LinearGradient
      colors={isDark ? ['#09090C', '#070235'] : ['#F3F3F8', '#E6E6F2']}
      style={{ flex: 1 }}
    >
      <Animated.ScrollView
        style={[st.container, { opacity: screenFade }]}
        contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Hero Header — Flat premium styling */}
        <View style={st.hero}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          {/* Streak Badge */}
          <View style={[
            st.streakPill,
            {
              backgroundColor: 'rgba(245, 166, 35, 0.08)',
              borderColor: 'rgba(245, 166, 35, 0.2)',
              borderWidth: StyleSheet.hairlineWidth,
            }
          ]}>
            <Ionicons name="flame" size={14} color={colors.xpGold} />
            <Text style={[st.streakText, { color: colors.xpGold, fontFamily: Fonts.bodyMedium }]}>
              {gStats?.streak || 0} {tr('day_streak')}
            </Text>
          </View>
          {/* Level Badge */}
          <View style={[
            st.streakPill,
            {
              backgroundColor: colors.accentMuted,
              borderColor: colors.accentBorder,
              borderWidth: StyleSheet.hairlineWidth,
              marginLeft: 8,
            }
          ]}>
            <Ionicons name="star" size={14} color={colors.accent} />
            <Text style={[st.streakText, { color: colors.accent, fontFamily: Fonts.bodyMedium }]}>
              {tr('level')} {gStats?.level || 1} • {gStats?.xp || 0} {tr('xp')}
            </Text>
          </View>
        </View>

        <Text style={[st.greeting, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
          {getGreeting()}, {profile?.name?.split(' ')[0] || tr('student')}
        </Text>
        <Text style={[st.greetingSub, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
          {tr(focusHintKey)}
        </Text>
      </View>

      {/* Stats Cards Row — 3 separate elevated cards */}
      <View style={[st.statsContainer, { paddingHorizontal: SW < 365 ? 12 : 20 }]}>
        <View style={[st.statsRow, { gap: SW < 365 ? 6 : 8 }]}>
          {/* Study Time */}
          <View style={[st.statCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle, padding: SW < 365 ? 10 : 14, minHeight: SW < 365 ? 78 : 88 }]}>
            <View style={[st.statHeader, { gap: SW < 365 ? 4 : 6 }]}>
              <Ionicons name="time-outline" size={14} color={colors.textTertiary} />
              <Text style={[st.statLabel, { color: colors.textTertiary, fontFamily: Fonts.displayMedium, fontSize: SW < 365 ? 8 : 10, letterSpacing: SW < 365 ? 0.3 : 0.77 }]}>
                {tr('stat_time')}
              </Text>
            </View>
            <Text style={[st.statValue, { color: colors.textPrimary, fontFamily: Fonts.display, fontSize: SW < 365 ? 18 : 22 }]} numberOfLines={1}>
              {Math.floor(weekStats.studyMins / 60)}<Text style={[st.statUnit, { fontSize: SW < 365 ? 10 : 12 }]}>h</Text> {weekStats.studyMins % 60}<Text style={[st.statUnit, { fontSize: SW < 365 ? 10 : 12 }]}>m</Text>
            </Text>
          </View>

          {/* Average Score */}
          <View style={[st.statCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle, padding: SW < 365 ? 10 : 14, minHeight: SW < 365 ? 78 : 88 }]}>
            <View style={[st.statHeader, { gap: SW < 365 ? 4 : 6 }]}>
              <Ionicons name="trophy-outline" size={14} color={colors.textTertiary} />
              <Text style={[st.statLabel, { color: colors.textTertiary, fontFamily: Fonts.displayMedium, fontSize: SW < 365 ? 8 : 10, letterSpacing: SW < 365 ? 0.3 : 0.77 }]}>
                {tr('stat_avg_score')}
              </Text>
            </View>
            <Text style={[st.statValue, { color: colors.textPrimary, fontFamily: Fonts.display, fontSize: SW < 365 ? 18 : 22 }]} numberOfLines={1}>
              {weekStats.avgScore}<Text style={[st.statUnit, { fontSize: SW < 365 ? 10 : 12 }]}>%</Text>
            </Text>
          </View>

          {/* Quizzes Attempted */}
          <View style={[st.statCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle, padding: SW < 365 ? 10 : 14, minHeight: SW < 365 ? 78 : 88 }]}>
            <View style={[st.statHeader, { gap: SW < 365 ? 4 : 6 }]}>
              <Ionicons name="checkmark-done-outline" size={14} color={colors.textTertiary} />
              <Text style={[st.statLabel, { color: colors.textTertiary, fontFamily: Fonts.displayMedium, fontSize: SW < 365 ? 8 : 10, letterSpacing: SW < 365 ? 0.3 : 0.77 }]}>
                {tr('stat_quizzes')}
              </Text>
            </View>
            <Text style={[st.statValue, { color: colors.textPrimary, fontFamily: Fonts.display, fontSize: SW < 365 ? 18 : 22 }]} numberOfLines={1}>
              {weekStats.quizzes}
            </Text>
          </View>
        </View>
      </View>

      {/* Current Focus — Subject Cards with nested View pattern for left borders */}
      {subjectStates.length > 0 && (
        <View style={st.sectionContainer}>
          <View style={st.sectionHeaderRow}>
            <Text style={[st.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
              Current Focus
            </Text>
            <Pressable onPress={() => router.push('/(tabs)/progress')}>
              <Text style={{ fontSize: 13, fontFamily: Fonts.displayMedium, color: colors.accent }}>View All</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
            {subjectStates.map(s => {
              const subColor = isDark
                ? SubjectColors[s.subject]?.dark || colors.accent
                : SubjectColors[s.subject]?.light || colors.accent;
              const progressWidth = Math.max(s.weighted_avg, 8);
              return (
                <View
                  key={s.subject}
                  style={[st.subjectCardWrapper, { borderColor: colors.borderSubtle }]}
                >
                  <View style={[st.subjectCardInner, { borderLeftColor: subColor, backgroundColor: colors.surface1 }]}>
                    <Text style={[st.subjectName, { color: colors.textPrimary, fontFamily: Fonts.displayMedium }]} numberOfLines={1}>
                      {translateSubject(s.subject)}
                    </Text>
                    <Text style={[st.subjectStateText, { color: colors.textTertiary, fontFamily: Fonts.body }]} numberOfLines={1}>
                      {s.state === 'EMPIRICALLY_WEAK' || s.state === 'AVOIDED_AND_WEAK' ? 'Needs focus' :
                       s.state === 'ACTIVE_AND_STRONG' ? 'Going strong' :
                       s.state === 'AVOIDED_BUT_STRONG' ? 'Review soon' : 'Getting started'}
                    </Text>
                    <View style={st.progressBarTrack}>
                      <View style={[st.progressBarFill, { backgroundColor: subColor, width: `${progressWidth}%` }]} />
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Missions — Redesigned with nested View pattern and accent left borders */}
      {missions.length > 0 && (
        <View style={st.sectionContainer}>
          <Text style={[st.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display, paddingHorizontal: 20 }]}>
            {tr('todays_missions')}
          </Text>
          <View style={{ paddingHorizontal: 20 }}>
            {missions.map(m => (
              <View key={m.id} style={[st.missionCardWrapper, { borderColor: colors.borderSubtle }]}>
                <View style={[st.missionCardInner, { borderLeftColor: colors.accent, backgroundColor: colors.surface1 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontFamily: Fonts.displayMedium, color: colors.textPrimary }}>{m.title}</Text>
                    <Text style={{ fontSize: 13, fontFamily: Fonts.display, color: colors.accent }}>+{m.rewardXP} XP</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontFamily: Fonts.body, color: colors.textSecondary, marginTop: 4 }}>{m.description}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 }}>
                    <View style={{ flex: 1, height: 3, backgroundColor: colors.borderSubtle, borderRadius: 2, overflow: 'hidden' }}>
                      <View style={{ height: 3, backgroundColor: colors.accent, width: `${Math.min((m.progress / m.target) * 100, 100)}%` }} />
                    </View>
                    <Text style={{ fontSize: 12, fontFamily: Fonts.bodyMedium, color: colors.textSecondary }}>{m.progress} / {m.target}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Timetable */}
      {studentId ? (
        <View style={{ marginTop: 8 }}>
          <WeeklyTimetableCard studentId={studentId} reloadTick={timetableReload} />
        </View>
      ) : null}

      {/* Exam Management */}
      <View style={{ marginHorizontal: 20, marginTop: 24 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={[st.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display, flex: 1 }]}>
            {tr('upcoming_exam') || 'Exams'}
          </Text>
          <TouchableOpacity
            onPress={() => setShowExamModal(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.accentMuted }}
          >
            <Ionicons name="add" size={14} color={colors.accent} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.accent }}>Add</Text>
          </TouchableOpacity>
        </View>
        
        {examLoadError ? (
          <TouchableOpacity
            onPress={() => fetchData()}
            style={[st.bannerWrapper, { borderColor: colors.danger + '40', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' }]}
          >
            <View style={[st.bannerInner, { borderLeftColor: colors.danger, backgroundColor: colors.surface1, padding: 16 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="cloud-offline-outline" size={20} color={colors.danger} />
                <Text style={{ fontSize: 14, fontFamily: Fonts.body, color: colors.textSecondary, flex: 1 }}>
                  Couldn't load your exams — check your connection to the dev server. Tap to retry.
                </Text>
                <Ionicons name="refresh" size={16} color={colors.textTertiary} />
              </View>
            </View>
          </TouchableOpacity>
        ) : examList.length === 0 ? (
          <TouchableOpacity
            onPress={() => setShowExamModal(true)}
            style={[st.bannerWrapper, { borderColor: colors.borderSubtle, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' }]}
          >
            <View style={[st.bannerInner, { borderLeftColor: colors.accent, backgroundColor: colors.surface1, padding: 16 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="calendar-outline" size={20} color={colors.accent} />
                <Text style={{ fontSize: 14, fontFamily: Fonts.body, color: colors.textSecondary, flex: 1 }}>
                  No exams added yet. Tap to add your first exam deadline.
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </View>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={{ gap: 8 }}>
            {examList.map((exam, i) => {
              const isUrgent = exam.days <= 7;
              const isToday = exam.days === 0;
              const color = isToday ? colors.danger : isUrgent ? colors.warning : colors.success;
              return (
                <View key={i} style={[st.bannerWrapper, { borderColor: color + '25', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' }]}>
                  <View style={[st.bannerInner, { borderLeftColor: color, backgroundColor: colors.surface1, padding: 14 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontFamily: Fonts.display, color: colors.textPrimary }}>{exam.name}</Text>
                        <Text style={{ fontSize: 12, fontFamily: Fonts.body, color: colors.textSecondary, marginTop: 2 }}>
                          {exam.date || 'Date not set'}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 22, fontFamily: Fonts.display, color, fontWeight: '700' }}>
                          {exam.days}
                        </Text>
                        <Text style={{ fontSize: 10, fontFamily: Fonts.bodyMedium, color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {isToday ? 'Today!' : isUrgent ? 'Days left' : 'days'}
                        </Text>
                      </View>
                    </View>
                    {isUrgent && !isToday && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle }}>
                        <Ionicons name="alert-circle" size={14} color={colors.warning} />
                        <Text style={{ fontSize: 11, fontFamily: Fonts.body, color: colors.warning }}>
                          {exam.days <= 3 ? 'CRITICAL - Start intensive revision' : 'Urgent - Prioritize this subject'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Diagnostic Banner — Redesigned with nested View pattern */}
      {!hasBaseline && (
        <View style={st.bannerWrapper}>
          <View style={[st.bannerInner, { borderLeftColor: colors.warning, backgroundColor: colors.surface2 }]}>
            <Text style={{ fontSize: 16, fontFamily: Fonts.display, color: colors.warning, marginBottom: 6 }}>
              {tr('diagnostic_recommended')}
            </Text>
            <Text style={{ fontSize: 13, fontFamily: Fonts.body, color: colors.textSecondary, marginBottom: 16 }}>
              {tr('diagnostic_desc')}
            </Text>
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web' && Haptics.ImpactFeedbackStyle) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                router.push('/screens/BaselineTestScreen');
              }}
              style={({ pressed }) => [
                st.bannerButton,
                {
                  backgroundColor: colors.warning,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                }
              ]}
            >
              <Text style={{ color: colors.textInverse, fontFamily: Fonts.displayMedium, fontSize: 14 }}>
                {tr('take_baseline')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {hasBaseline && !baselineViewed && (
        <View style={st.bannerWrapper}>
          <View style={[st.bannerInner, { borderLeftColor: colors.success, backgroundColor: colors.surface2 }]}>
            <Text style={{ fontSize: 16, fontFamily: Fonts.display, color: colors.success, marginBottom: 6 }}>
              {tr('diagnostic_complete')}
            </Text>
            <Text style={{ fontSize: 13, fontFamily: Fonts.body, color: colors.textSecondary, marginBottom: 16 }}>
              {tr('view_results')}
            </Text>
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web' && Haptics.ImpactFeedbackStyle) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                handleViewResults();
              }}
              style={({ pressed }) => [
                st.bannerButton,
                {
                  backgroundColor: colors.success,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                }
              ]}
            >
              <Text style={{ color: colors.textInverse, fontFamily: Fonts.displayMedium, fontSize: 14 }}>
                {tr('view_results')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {isCrisis && <View style={{ paddingHorizontal: 20, marginTop: 16 }}><CrisisCard /></View>}

      {/* Mood Check-in */}
      {showMoodCheck && !isCrisis && (
        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <MoodCheckIn onComplete={(quote) => { setShowMoodCheck(false); setMoodReaction(quote); fetchData(); }} />
        </View>
      )}

      {moodReaction ? (
        <View style={[st.moodReactionCard, { backgroundColor: colors.surface2, borderColor: colors.borderSubtle }]}>
          <Text style={{ fontSize: 14, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 22, textAlign: 'center', fontFamily: Fonts.body }}>
            "{moodReaction}"
          </Text>
        </View>
      ) : null}

      {/* Exam Deadline Widget */}
      {nextExam ? (
        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <View style={[st.examWidget, { backgroundColor: colors.surface2, borderColor: colors.borderSubtle }]}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.warning + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="alert-circle" size={22} color={colors.warning} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 12, color: colors.textTertiary, fontFamily: Fonts.displayMedium, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                Next Big Deadline
              </Text>
              <Text style={{ fontSize: 16, color: colors.textPrimary, fontFamily: Fonts.display, marginBottom: 2 }}>
                {nextExam.name}
              </Text>
              <Text style={{ fontSize: 13, color: nextExam.days <= 3 ? colors.danger : colors.warning, fontFamily: Fonts.bodyMedium }}>
                {nextExam.days === 0 ? 'Today!' : `In ${nextExam.days} day${nextExam.days === 1 ? '' : 's'}`}
              </Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/screens/CalendarScreen')} style={{ padding: 8, backgroundColor: colors.surface3, borderRadius: 12 }}>
              <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Hierarchical Feature Sections */}
      
      {/* 1. Quick Actions */}
      <View style={st.sectionContainer}>
        <Text style={[st.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display, paddingHorizontal: 20 }]}>
          Quick Actions
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingHorizontal: 20, paddingBottom: 4 }}
        >
          {QUICK_ACTIONS.map(action => (
            <Pressable
              key={action.labelKey}
              onPress={() => {
                if (Platform.OS !== 'web' && Haptics.ImpactFeedbackStyle) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push(action.route as any);
              }}
              style={({ pressed }) => [
                st.quickActionCard,
                {
                  width: SW * 0.35,
                  borderColor: colors.borderSubtle,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                }
              ]}
            >
              <View style={[st.quickActionInner, { borderLeftColor: action.color, backgroundColor: colors.surface1 }]}>
                <Ionicons name={action.icon as any} size={20} color={action.color} style={st.quickActionIcon} />
                <Text style={[st.quickActionLabel, { color: colors.textPrimary, fontFamily: Fonts.displayMedium }]}>
                  {tr(action.labelKey)}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* 2. Study Tools */}
      <View style={st.sectionContainer}>
        <Text style={[st.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display, paddingHorizontal: 20 }]}>
          Study Tools
        </Text>
        <View style={st.studyToolsGrid}>
          {STUDY_TOOLS.map(action => (
            <Pressable
              key={action.labelKey}
              onPress={() => {
                if (Platform.OS !== 'web' && Haptics.ImpactFeedbackStyle) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push(action.route as any);
              }}
              style={({ pressed }) => [
                st.studyToolCard,
                {
                  width: (SW - 48) / 2,
                  backgroundColor: colors.surface1,
                  borderColor: colors.borderSubtle,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                }
              ]}
            >
              <View style={[st.studyToolIconContainer, { backgroundColor: action.color + '14' }]}>
                <Ionicons name={action.icon as any} size={18} color={action.color} />
              </View>
              <Text style={[st.studyToolLabel, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>
                {tr(action.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 3. Care & Coaching */}
      <View style={st.sectionContainer}>
        <Text style={[st.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display, paddingHorizontal: 20 }]}>
          Care & Coaching
        </Text>
        <View style={{ paddingHorizontal: 20 }}>
          {CARE_COACHING.map(action => (
            <Pressable
              key={action.labelKey}
              onPress={() => {
                if (Platform.OS !== 'web' && Haptics.ImpactFeedbackStyle) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push(action.route as any);
              }}
              style={({ pressed }) => [
                st.careRow,
                {
                  backgroundColor: colors.surface1,
                  borderColor: colors.borderSubtle,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                }
              ]}
            >
              <View style={[st.careIconContainer, { backgroundColor: action.color + '14' }]}>
                <Ionicons name={action.icon as any} size={18} color={action.color} />
              </View>
              <Text style={[st.careLabel, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>
                {tr(action.labelKey)}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>
          ))}
        </View>
      </View>
        {/* Exam Add Modal */}
        <Modal visible={showExamModal} transparent animationType="slide">
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <View style={[st.examModalCard, { backgroundColor: colors.surface1, borderTopColor: colors.borderSubtle }]}>
              <View style={st.examModalHeader}>
                <Text style={[st.examModalTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Add Exam Deadline</Text>
                <TouchableOpacity onPress={() => setShowExamModal(false)}>
                  <Ionicons name="close" size={22} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 13, fontFamily: Fonts.body, color: colors.textSecondary, marginBottom: 16 }}>
                Adding exams helps us personalize your study schedule and send reminders.
              </Text>
              <TextInput
                style={[st.examInput, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.surface2, fontFamily: Fonts.body }]}
                placeholder="Exam name (e.g. Math Midterms)"
                placeholderTextColor={colors.textTertiary}
                value={newExamName}
                onChangeText={setNewExamName}
              />
              <TextInput
                style={[st.examInput, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.surface2, fontFamily: Fonts.body, marginTop: 10 }]}
                placeholder="Exam date (YYYY-MM-DD, e.g. 2026-12-15)"
                placeholderTextColor={colors.textTertiary}
                value={newExamDate}
                onChangeText={setNewExamDate}
              />
              <TouchableOpacity
                  onPress={handleAddExam}
                style={[st.examAddBtn, { backgroundColor: colors.accent, marginTop: 20 }]}
              >
                <Ionicons name="checkmark-circle" size={18} color={colors.textInverse} />
                <Text style={{ color: colors.textInverse, fontFamily: Fonts.bodyMedium, fontSize: 15 }}>Save Exam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Global Add Menu Modal */}
        <Modal visible={showAddMenu} transparent animationType="fade">
          <TouchableOpacity 
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} 
            activeOpacity={1} 
            onPress={() => setShowAddMenu(false)}
          >
            <View style={[st.addMenuCard, { backgroundColor: colors.surface1, borderTopColor: colors.borderSubtle }]}>
              <View style={st.examModalHeader}>
                <Text style={[st.examModalTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Quick Add</Text>
                <TouchableOpacity onPress={() => setShowAddMenu(false)}>
                  <Ionicons name="close" size={24} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
              
              <View style={{ gap: 12 }}>
                <TouchableOpacity 
                  onPress={() => { setShowAddMenu(false); router.push('/screens/NotesViewerScreen'); }}
                  style={[st.addMenuItem, { backgroundColor: colors.surface2, borderColor: colors.borderSubtle }]}
                >
                  <View style={[st.addMenuIconWrap, { backgroundColor: '#A78BFA20' }]}>
                    <Ionicons name="reader-outline" size={20} color="#A78BFA" />
                  </View>
                  <Text style={[st.addMenuLabel, { color: colors.textPrimary, fontFamily: Fonts.displayMedium }]}>Add Study Notes</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  onPress={() => { setShowAddMenu(false); router.push('/screens/ReviewDeckScreen'); }}
                  style={[st.addMenuItem, { backgroundColor: colors.surface2, borderColor: colors.borderSubtle }]}
                >
                  <View style={[st.addMenuIconWrap, { backgroundColor: '#FB923C20' }]}>
                    <Ionicons name="albums-outline" size={20} color="#FB923C" />
                  </View>
                  <Text style={[st.addMenuLabel, { color: colors.textPrimary, fontFamily: Fonts.displayMedium }]}>Create Flashcards</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  onPress={() => { setShowAddMenu(false); router.push('/screens/AskAIScreen'); }}
                  style={[st.addMenuItem, { backgroundColor: colors.surface2, borderColor: colors.borderSubtle }]}
                >
                  <View style={[st.addMenuIconWrap, { backgroundColor: '#7C5CFC20' }]}>
                    <Ionicons name="help-circle-outline" size={20} color="#7C5CFC" />
                  </View>
                  <Text style={[st.addMenuLabel, { color: colors.textPrimary, fontFamily: Fonts.displayMedium }]}>Ask Question</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

      </Animated.ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity 
        style={[st.fab, { backgroundColor: colors.primary }]}
        onPress={() => setShowAddMenu(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={30} color="#FFF" />
      </TouchableOpacity>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: Platform.OS === 'ios' ? 128 : 108 },
  hero: { padding: 24, paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingBottom: 16 },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  streakText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  greeting: { fontSize: 28, fontWeight: '600', marginBottom: 10, letterSpacing: -0.5 },
  greetingSub: { fontSize: 14, lineHeight: 24, maxWidth: '95%', marginBottom: 4 },
  
  // Stats
  statsContainer: { marginTop: 20 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'space-between',
  },
  statHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  statLabel: { fontWeight: '600', textTransform: 'uppercase' },
  statValue: { fontWeight: '600' },
  statUnit: { fontWeight: '500' },

  // Sections
  sectionContainer: { marginTop: 24 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.88,
    textTransform: 'uppercase',
    marginBottom: 12,
  },

  // Focus
  subjectCardWrapper: {
    width: 140,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  subjectCardInner: {
    borderLeftWidth: 3,
    padding: 14,
    flex: 1,
    height: 92,
    justifyContent: 'space-between',
  },
  subjectName: { fontSize: 14, fontWeight: '600' },
  subjectStateText: { fontSize: 11, marginTop: -2 },
  progressBarTrack: { height: 3, backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: 3, borderRadius: 2 },

  // Missions
  missionCardWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  missionCardInner: {
    borderLeftWidth: 3,
    padding: 16,
  },

  // Banners
  bannerWrapper: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  bannerInner: {
    borderLeftWidth: 3,
    padding: 16,
  },
  bannerButton: {
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },

  // Mood
  moodReactionCard: {
    padding: 16,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  examWidget: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },

  // Quick Actions
  quickActionCard: {
    height: 88,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickActionInner: {
    borderLeftWidth: 4,
    padding: 12,
    flex: 1,
    justifyContent: 'space-between',
  },
  quickActionIcon: { alignSelf: 'flex-start' },
  quickActionLabel: { fontSize: 13, fontWeight: '600', lineHeight: 16 },

  // Study Tools Grid
  studyToolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 8,
  },
  studyToolCard: {
    height: 88,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  studyToolIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studyToolLabel: { fontSize: 12, fontWeight: '500' },

  // Care Rows
  careRow: {
    height: 56,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  careIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  careLabel: { flex: 1, fontSize: 13, fontWeight: '500' },
  examModalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
  },
  examModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  examModalTitle: { fontSize: 18, fontWeight: '600' },
  examInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
  },
  examAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
      web: {
        boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.3)',
      },
    }),
  },
  addMenuCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
  },
  addMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addMenuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  addMenuLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
