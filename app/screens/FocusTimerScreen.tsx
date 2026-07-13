// FOCUS TIMER — Vision distraction detection, collectible orbs, premium flat UI
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, TextInput,
  Animated, useWindowDimensions, Alert, ScrollView, Share,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useTheme, useAuth } from '../../lib/context';
import { writeQuery, readQuery } from '../../lib/neo4j';
import { SUBJECTS } from '../../constants/subjects';
import { SubjectColors, Radii, Spacing } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { Chip, PrimaryButton, AnimatedScreenWrapper, SectionLabel } from '../../components/ui/premium';
import { v4 as uuidv4 } from 'uuid';
import { callSarvamVision, hasAiApiKey } from '../../lib/ai';
import { levelUpByOne } from '../../lib/gamification';
import { useT } from '../../lib/translations';
import { sendNotification } from '../../lib/notifications';
import { addXP } from '../../lib/gamification';

type TimerState = 'setup' | 'study' | 'break' | 'complete';
type FocusStatus = 'unknown' | 'checking' | 'focused' | 'distracted';

interface FloatingOrb {
  id: string;
  x: number;
  y: number;
}


const RING_SIZE = 260;
const RING_STROKE = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const DISTRACTION_RESET_SEC = 60;
const VISION_POLL_MS = 20000;
const VISION_INITIAL_DELAY_MS = 3000;
const ORB_LIFETIME_MS = 15000;
const ORB_FIRST_DELAY_MS = 10000;
const ORB_INTERVAL_MIN_MS = 20000;
const ORB_INTERVAL_MAX_MS = 45000;
const XP_PER_ORB = 15;

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function orbSpawnDelayMs(spawnIndex: number): number {
  if (spawnIndex === 0) return ORB_FIRST_DELAY_MS;
  return randomBetween(ORB_INTERVAL_MIN_MS, ORB_INTERVAL_MAX_MS);
}

export default function FocusTimerScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const { width: SW, height: SH } = useWindowDimensions();
  const tr = useT();
  const [permission, requestPermission] = useCameraPermissions();

  const [state, setState] = useState<TimerState>('setup');
  const [subject, setSubject] = useState('');
  const [duration, setDuration] = useState(25);
  const [cognitiveMode, setCognitiveMode] = useState<'deep_work' | 'quick_review'>('deep_work');
  const [timeLeft, setTimeLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [todayTotal, setTodayTotal] = useState(0);

  const [isDistracted, setIsDistracted] = useState(false);
  const [distractionSecs, setDistractionSecs] = useState(0);
  const [focusStatus, setFocusStatus] = useState<FocusStatus>('unknown');
  const [visionBanner, setVisionBanner] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [apiKeyOk, setApiKeyOk] = useState<boolean | null>(null);

  const [totalOrbs, setTotalOrbs] = useState(6);
  const [orbsCollected, setOrbsCollected] = useState(0);
  const [activeOrb, setActiveOrb] = useState<FloatingOrb | null>(null);

  const distractionSecsRef = useRef(0);
  const visionBusyRef = useRef(false);
  const pausedByDistractionRef = useRef(false);
  const levelUpAwardedRef = useRef(false);
  const totalOrbsRef = useRef(6);
  const orbsSpawnedRef = useRef(0);
  const orbsCollectedRef = useRef(0);
  const stateRef = useRef<TimerState>('setup');
  const pausedRef = useRef(false);
  const activeOrbRef = useRef<FloatingOrb | null>(null);
  const distractedCountRef = useRef(0); // consecutive distracted checks required before pausing

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visionRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visionInitialRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orbScheduleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orbHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRef = useRef<InstanceType<typeof CameraView>>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.7)).current;

  const resolvedTheme = isDark ? 'dark' : 'light';
  const subjectColor = SubjectColors[subject]?.[resolvedTheme] || colors.accent;
  const subjectIcon = SUBJECTS.find(s => s.name === subject)?.icon || 'book-outline';

  stateRef.current = state;
  pausedRef.current = paused;
  activeOrbRef.current = activeOrb;

  const clearOrbTimers = useCallback(() => {
    if (orbScheduleRef.current) clearTimeout(orbScheduleRef.current);
    if (orbHideRef.current) clearTimeout(orbHideRef.current);
    orbScheduleRef.current = null;
    orbHideRef.current = null;
  }, []);

  const clearVisionTimers = useCallback(() => {
    if (visionRef.current) clearInterval(visionRef.current);
    if (visionInitialRef.current) clearTimeout(visionInitialRef.current);
    visionRef.current = null;
    visionInitialRef.current = null;
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    clearVisionTimers();
    clearOrbTimers();
  }, [clearVisionTimers, clearOrbTimers]);

  useEffect(() => {
    hasAiApiKey().then(setApiKeyOk).catch(() => setApiKeyOk(false));
  }, []);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const r = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:STUDIED]->(ss:StudySession)
         WHERE ss.date > datetime() - duration('P1D')
         RETURN sum(ss.duration_mins) AS total`,
        { studentId }
      );
      const record = r[0];
      const total = record && typeof record.get === 'function' ? record.get('total') : (record as any)?.total;
      setTodayTotal(typeof total === 'object' ? (total?.low ?? 0) : (total || 0));
    })();
  }, [studentId]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.6, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, [glowAnim]);

  const applyFocusResult = useCallback((distracted: boolean) => {
    if (distracted) {
      distractedCountRef.current += 1;
      // Require 2+ consecutive distracted checks before actually triggering
      if (distractedCountRef.current >= 2) {
        setFocusStatus('distracted');
        setIsDistracted(true);
        pausedByDistractionRef.current = true;
        setPaused(true);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        }
      } else {
        setFocusStatus('distracted');
      }
    } else {
      distractedCountRef.current = 0;
      setFocusStatus('focused');
      setIsDistracted(false);
      distractionSecsRef.current = 0;
      setDistractionSecs(0);
      if (pausedByDistractionRef.current) {
        pausedByDistractionRef.current = false;
        setPaused(false);
      }
    }
  }, []);

  const runFocusCheck = useCallback(async () => {
    if (visionBusyRef.current) return;
    if (stateRef.current !== 'study' || (pausedRef.current && !pausedByDistractionRef.current)) return;
    if (!apiKeyOk) {
      setVisionBanner('Add an API key in Profile → Settings');
      return;
    }
    const cam = cameraRef.current;
    if (!cam || !cameraReady) return;

    visionBusyRef.current = true;
    setFocusStatus('checking');
    try {
      const photo = await cam.takePictureAsync({
        base64: true,
        quality: 0.35,
      });
      if (!photo?.base64) {
        setVisionBanner('Camera capture failed — retrying…');
        return;
      }

      const result = await callSarvamVision(
        'You are a focus monitor. Reply with exactly one word: FOCUSED or DISTRACTED. No punctuation.',
        photo.base64,
        'Is the student at their desk, facing study materials or a screen, actively studying? DISTRACTED if using phone, looking away, eyes closed, or left the desk.',
        'focus_check'
      );

      applyFocusResult(result.trim().toUpperCase().includes('DISTRACTED'));
      setVisionBanner(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Focus check failed';
      console.warn('[FocusTimer] Vision check failed:', msg);
      setFocusStatus('unknown');
      setVisionBanner(
        msg.includes('API key') || msg.includes('not configured')
          ? 'Add API key in Profile for focus detection'
          : 'Focus check unavailable — check network/API'
      );
    } finally {
      visionBusyRef.current = false;
    }
  }, [apiKeyOk, applyFocusResult, cameraReady]);

  const scheduleNextOrbSpawn = useCallback(() => {
    clearOrbTimers();
    if (stateRef.current !== 'study' || pausedRef.current) return;
    if (orbsSpawnedRef.current >= totalOrbsRef.current) return;
    if (activeOrbRef.current) return;

    const delay = orbSpawnDelayMs(orbsSpawnedRef.current);
    orbScheduleRef.current = setTimeout(() => {
      if (stateRef.current !== 'study' || pausedRef.current) return;
      if (orbsSpawnedRef.current >= totalOrbsRef.current) return;
      if (activeOrbRef.current) return;

      const orb: FloatingOrb = {
        id: uuidv4(),
        x: randomBetween(20, Math.max(20, SW - 80)),
        y: randomBetween(160, Math.max(220, SH * 0.55)),
      };
      orbsSpawnedRef.current += 1;
      setActiveOrb(orb);

      orbHideRef.current = setTimeout(() => {
        setActiveOrb(prev => {
          if (prev?.id === orb.id) {
            activeOrbRef.current = null;
            return null;
          }
          return prev;
        });
        scheduleNextOrbSpawn();
      }, ORB_LIFETIME_MS);
    }, delay);
  }, [clearOrbTimers, SW, SH]);

  const tryLevelUpFromOrbs = useCallback(async () => {
    if (levelUpAwardedRef.current || !studentId) return;
    if (orbsCollectedRef.current < totalOrbsRef.current) return;
    levelUpAwardedRef.current = true;
    try {
      await levelUpByOne(studentId);
      Alert.alert(tr('level_up'), tr('level_up_orbs'));
    } catch (err) {
      levelUpAwardedRef.current = false;
      console.error('Orb level-up failed:', err);
    }
  }, [studentId, tr]);

  const handleOrbTap = useCallback(async (orbId: string) => {
    if (!activeOrbRef.current || activeOrbRef.current.id !== orbId) return;
    if (orbHideRef.current) clearTimeout(orbHideRef.current);
    setActiveOrb(null);
    activeOrbRef.current = null;

    orbsCollectedRef.current += 1;
    const collected = orbsCollectedRef.current;
    setOrbsCollected(collected);

    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.25, duration: 100, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    // Award XP immediately per orb
    if (studentId) {
      try {
        await addXP(studentId, XP_PER_ORB, `Focus Orb #${collected}`);
      } catch (err) {
        console.error('Orb XP award failed:', err);
      }
    }

    scheduleNextOrbSpawn();

    if (collected >= totalOrbsRef.current) {
      await tryLevelUpFromOrbs();
    }
  }, [pulseAnim, scheduleNextOrbSpawn, tryLevelUpFromOrbs, studentId]);

  const resetTimerFull = useCallback(() => {
    setTimeLeft(duration * 60);
    setElapsed(0);
    setIsDistracted(false);
    pausedByDistractionRef.current = false;
    distractionSecsRef.current = 0;
    distractedCountRef.current = 0;
    setDistractionSecs(0);
    setPaused(false);
    setFocusStatus('unknown');
  }, [duration]);

  useEffect(() => {
    if (state !== 'study' || !isDistracted) return;
    const tick = setInterval(() => {
      distractionSecsRef.current += 1;
      setDistractionSecs(distractionSecsRef.current);
      if (distractionSecsRef.current >= DISTRACTION_RESET_SEC) {
        resetTimerFull();
        Alert.alert(tr('distracted'), tr('timer_reset'));
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [state, isDistracted, resetTimerFull, tr]);

  const handleComplete = useCallback(async () => {
    setState('complete');
    clearTimers();
    setActiveOrb(null);
    activeOrbRef.current = null;
    const mins = Math.max(1, Math.round(elapsed / 60));

    if (studentId) {
      try {
        await writeQuery(
          `MATCH (s:Student {id: $studentId})
           CREATE (ss:StudySession {
             id: $id, subject: $subject, chapter: '',
             duration_mins: $mins, session_type: $sessionType,
             date: datetime()
           })
           CREATE (s)-[:STUDIED]->(ss)`,
          { 
            studentId, 
            id: uuidv4(), 
            subject, 
            mins, 
            sessionType: cognitiveMode === 'quick_review' ? 'quick_review' : 'focus_timer' 
          }
        );
        setTodayTotal(prev => prev + mins);
      } catch (err) {
        console.error('Failed to save session:', err);
      }
    }

    // Send notification
    sendNotification('focus_session_complete', { subject, mins }).catch(() => {});
  }, [clearTimers, elapsed, studentId, subject, cognitiveMode]);

  useEffect(() => {
    if ((state === 'study' || state === 'break') && !paused && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            if (state === 'study') {
              setState('break');
              return 5 * 60;
            }
            handleComplete();
            return 0;
          }
          return prev - 1;
        });
        if (state === 'study') setElapsed(e => e + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timeLeft is only
    // read via the functional setTimeLeft updater below, never directly; it's
    // intentionally excluded so this interval isn't torn down/recreated every
    // second. state/paused changing is what should (and does) restart it.
  }, [state, paused, handleComplete]);

  // Vision polling — only when camera ready + permission + API key
  useEffect(() => {
    if (state !== 'study') {
      clearVisionTimers();
      setCameraReady(false);
      return;
    }

    if (!permission?.granted) {
      requestPermission();
      return;
    }

    if (!permission?.granted || !cameraReady || apiKeyOk === false) return;

    visionInitialRef.current = setTimeout(() => {
      runFocusCheck();
    }, VISION_INITIAL_DELAY_MS);
    visionRef.current = setInterval(runFocusCheck, VISION_POLL_MS);

    return clearVisionTimers;
  }, [state, permission?.granted, cameraReady, apiKeyOk, runFocusCheck, requestPermission, clearVisionTimers]);

  // Orb spawn loop — pause/resume aware
  useEffect(() => {
    if (state !== 'study') {
      clearOrbTimers();
      return;
    }
    if (paused) {
      clearOrbTimers();
      return;
    }
    if (!activeOrb && orbsSpawnedRef.current < totalOrbsRef.current) {
      scheduleNextOrbSpawn();
    }
  }, [state, paused, activeOrb, scheduleNextOrbSpawn, clearOrbTimers]);

  const handleStart = async () => {
    if (!subject) return;

    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert(tr('focus_timer'), tr('camera_permission'));
      }
    }

    const orbCount = randomBetween(5, 8);
    totalOrbsRef.current = orbCount;
    orbsSpawnedRef.current = 0;
    orbsCollectedRef.current = 0;
    levelUpAwardedRef.current = false;
    setTotalOrbs(orbCount);
    setOrbsCollected(0);
    setActiveOrb(null);
    activeOrbRef.current = null;
    clearOrbTimers();
    clearVisionTimers();

    setState('study');
    setTimeLeft(duration * 60);
    setElapsed(0);
    setPaused(false);
    pausedByDistractionRef.current = false;
    setIsDistracted(false);
    setFocusStatus('unknown');
    setVisionBanner(apiKeyOk === false ? 'Add API key in Profile for focus detection' : null);
    distractionSecsRef.current = 0;
    setDistractionSecs(0);
    setCameraReady(false);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const progress = state === 'study' || state === 'break'
    ? 1 - timeLeft / (state === 'break' ? 5 * 60 : duration * 60)
    : 0;
  const ringOffset = RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)));

  const focusDotColor =
    focusStatus === 'focused' ? colors.success
      : focusStatus === 'distracted' ? colors.danger
        : focusStatus === 'checking' ? colors.warning
          : colors.textTertiary;

  if (state === 'setup') {
    return (
      <AnimatedScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          style={{ width: '100%' }}
          contentContainerStyle={styles.setupContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View>
              <Text style={[styles.setupTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Session Setup</Text>
              <Text style={[styles.setupSub, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
                Configure your environment for optimal cognitive focus.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
              onPress={() => {
  try {
    router.back();
  } catch {
    router.replace('/');
  }
}}
            >
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {apiKeyOk === false && (
            <View style={[styles.bannerWarn, { backgroundColor: colors.surface2, borderColor: colors.warning }]}>
              <Ionicons name="key-outline" size={16} color={colors.warning} />
              <Text style={[styles.bannerWarnText, { color: colors.warning, fontFamily: Fonts.bodyMedium }]}>
                Add API key in Profile for focus detection
              </Text>
            </View>
          )}

          <SectionLabel text="SELECT SUBJECT" style={{ marginTop: 24, marginBottom: 12 }} />
          <View style={styles.subjectGrid}>
            {SUBJECTS.map(s => {
              const isSelected = subject === s.name;
              return (
                <Chip
                  key={s.name}
                  label={s.name}
                  selected={isSelected}
                  onPress={() => setSubject(s.name)}
                  icon={
                    <Ionicons 
                      name={s.icon as any} 
                      size={14} 
                      color={isSelected ? colors.accentHover : colors.textSecondary} 
                    />
                  }
                />
              );
            })}
          </View>

          <SectionLabel text="DURATION OBJECTIVE" style={{ marginTop: 24, marginBottom: 12 }} />
          <View style={styles.durationRow}>
            {[25, 45, 60].map(d => {
              const isSelected = duration === d;
              return (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.durationPill,
                    {
                      borderColor: isSelected ? colors.accentBorder : colors.borderSubtle,
                      backgroundColor: isSelected ? colors.accentMuted : colors.surface1,
                    }
                  ]}
                  onPress={() => setDuration(d)}
                >
                  <Text style={[
                    styles.durationNum, 
                    { 
                      color: isSelected ? colors.accentHover : colors.textPrimary,
                      fontFamily: Fonts.display 
                    }
                  ]}>
                    {d}
                  </Text>
                  <Text style={[
                    styles.durationUnit, 
                    { 
                      color: isSelected ? colors.accent : colors.textSecondary,
                      fontFamily: Fonts.body 
                    }
                  ]}>
                    min
                  </Text>
                </TouchableOpacity>
              );
            })}
            <View style={[
              styles.durationPill,
              {
                borderColor: ![25, 45, 60].includes(duration) ? colors.accentBorder : colors.borderSubtle,
                backgroundColor: ![25, 45, 60].includes(duration) ? colors.accentMuted : colors.surface1,
                paddingVertical: 10
              }
            ]}>
              <TextInput
                style={[
                  styles.durationNum,
                  {
                    color: ![25, 45, 60].includes(duration) ? colors.accentHover : colors.textPrimary,
                    fontSize: 18,
                    textAlign: 'center',
                    width: '100%',
                    fontFamily: Fonts.display,
                  }
                ]}
                placeholder="Custom"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numeric"
                onChangeText={val => {
                  const n = parseInt(val, 10);
                  if (!isNaN(n) && n > 0) setDuration(n);
                }}
              />
              <Text style={[
                styles.durationUnit,
                {
                  color: ![25, 45, 60].includes(duration) ? colors.accent : colors.textSecondary,
                  fontFamily: Fonts.body,
                }
              ]}>
                min
              </Text>
            </View>
          </View>

          <SectionLabel text="COGNITIVE MODE" style={{ marginTop: 24, marginBottom: 12 }} />
          <View style={{ width: '100%', gap: 8 }}>
            <TouchableOpacity
              style={[
                styles.modePill, 
                { 
                  borderColor: cognitiveMode === 'deep_work' ? colors.accentBorder : colors.borderSubtle, 
                  backgroundColor: cognitiveMode === 'deep_work' ? colors.accentMuted : colors.surface1,
                  borderRadius: Radii.card,
                }
              ]}
              activeOpacity={0.7}
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                }
                setCognitiveMode('deep_work');
              }}
            >
              <View style={[styles.modeRadio, { borderColor: cognitiveMode === 'deep_work' ? colors.accent : colors.borderMedium }]}>
                {cognitiveMode === 'deep_work' && <View style={[styles.modeRadioInner, { backgroundColor: colors.accent }]} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modeTitle, { color: cognitiveMode === 'deep_work' ? colors.textPrimary : colors.textSecondary, fontFamily: Fonts.display }]}>Deep Work</Text>
                <Text style={[styles.modeSub, { color: cognitiveMode === 'deep_work' ? colors.textSecondary : colors.textTertiary, fontFamily: Fonts.body }]}>
                  Intense focus, minimal interruptions. Ideal for new concepts.
                </Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.modePill, 
                { 
                  borderColor: cognitiveMode === 'quick_review' ? colors.accentBorder : colors.borderSubtle, 
                  backgroundColor: cognitiveMode === 'quick_review' ? colors.accentMuted : colors.surface1,
                  borderRadius: Radii.card,
                }
              ]}
              activeOpacity={0.7}
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                }
                setCognitiveMode('quick_review');
                setDuration(10); // set default short duration for quick review
              }}
            >
              <View style={[styles.modeRadio, { borderColor: cognitiveMode === 'quick_review' ? colors.accent : colors.borderMedium }]}>
                {cognitiveMode === 'quick_review' && <View style={[styles.modeRadioInner, { backgroundColor: colors.accent }]} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modeTitle, { color: cognitiveMode === 'quick_review' ? colors.textPrimary : colors.textSecondary, fontFamily: Fonts.display }]}>Quick Review</Text>
                <Text style={[styles.modeSub, { color: cognitiveMode === 'quick_review' ? colors.textSecondary : colors.textTertiary, fontFamily: Fonts.body }]}>
                  Flashcards and spaced repetition pacing.
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <PrimaryButton
            label={tr('start_session')}
            disabled={!subject}
            icon={<Ionicons name="play" size={16} color={subject ? colors.textInverse : colors.textTertiary} />}
            onPress={handleStart}
          />
        </ScrollView>
      </AnimatedScreenWrapper>
    );
  }

  if (state === 'complete') {
    const mins = Math.max(1, Math.round(elapsed / 60));
    const orbXpEarned = orbsCollected * XP_PER_ORB;

    const handleShareAchievement = async () => {
      const message = [
        '🎓 StudyMate Achievement!',
        `📚 I just studied ${subject} for ${mins} minutes`,
        orbsCollected > 0 ? `🔮 Collected ${orbsCollected}/${totalOrbs} focus orbs (+${orbXpEarned} XP)` : '',
        `📅 Today's total: ${todayTotal} minutes`,
        '',
        '🚀 Download StudyMate AI — your personal learning companion!',
      ].filter(Boolean).join('\n');

      try {
        await Share.share({ message });
      } catch (err) {
        console.error('Share failed:', err);
      }
    };

    return (
      <AnimatedScreenWrapper style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <Ionicons name="checkmark-circle" size={64} color={colors.success} style={{ marginBottom: 24 }} />
        <Text style={[styles.completeTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
          {tr('session_complete')}
        </Text>
        
        <View style={[styles.statsSummaryCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
          <Text style={[styles.completeSub, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
            {tr('studied_for')} <Text style={{ color: colors.accentHover, fontFamily: Fonts.displayMedium }}>{subject}</Text> {tr('for_minutes')} <Text style={{ color: colors.textPrimary, fontFamily: Fonts.display }}>{mins}</Text> {tr('minutes')}
          </Text>
          <Text style={[styles.todayTotal, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
            {tr('todays_total')}: {todayTotal} {tr('minutes')}
          </Text>
          {orbsCollected > 0 && (
            <View style={[styles.orbSummaryPill, { backgroundColor: colors.accentMuted, borderColor: colors.accentBorder }]}>
              <Ionicons name="planet" size={14} color={colors.accent} />
              <Text style={[styles.orbSummaryText, { color: colors.accentHover, fontFamily: Fonts.bodyMedium }]}>
                {orbsCollected}/{totalOrbs} {tr('orbs_collected')} • +{orbXpEarned} XP
              </Text>
            </View>
          )}
        </View>

        <View style={{ width: '100%', paddingHorizontal: 20, marginTop: 16, gap: 12 }}>
          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: colors.accentMuted, borderColor: colors.accentBorder }]}
            onPress={handleShareAchievement}
            activeOpacity={0.8}
          >
            <Ionicons name="share-social-outline" size={18} color={colors.accentHover} />
            <Text style={{ color: colors.accentHover, fontFamily: Fonts.displayMedium, fontSize: 15 }}>
              Share Achievement
            </Text>
          </TouchableOpacity>
          <PrimaryButton
            label={tr('done')}
            onPress={() => {
  try {
    router.back();
  } catch {
    router.replace('/');
  }
}}
          />
        </View>
      </AnimatedScreenWrapper>
    );
  }

  const showCamera = state === 'study' && permission?.granted;

  return (
    <View style={[styles.sessionRoot, { backgroundColor: colors.background }]}>
      {showCamera && (
        <View style={[styles.cameraPip, { borderColor: focusDotColor }]}>
          <CameraView
            ref={cameraRef}
            style={styles.cameraView}
            facing="front"
            onCameraReady={() => setCameraReady(true)}
          />
          <View style={[styles.focusDot, { backgroundColor: focusDotColor }]} />
          <View style={styles.cameraBadge}>
            <Ionicons name="eye-outline" size={10} color="#fff" />
          </View>
        </View>
      )}

      {state === 'study' && !permission?.granted && (
        <TouchableOpacity 
          style={[styles.bannerWarn, { backgroundColor: colors.surface2, borderColor: colors.warning }]} 
          onPress={() => requestPermission()}
        >
          <Ionicons name="camera-outline" size={16} color={colors.warning} />
          <Text style={[styles.bannerWarnText, { color: colors.warning }]}>Tap to enable camera for focus detection</Text>
        </TouchableOpacity>
      )}

      {visionBanner && state === 'study' && (
        <View style={[styles.bannerWarn, { backgroundColor: colors.surface2, borderColor: colors.warning }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
          <Text style={[styles.bannerWarnText, { color: colors.warning }]}>{visionBanner}</Text>
        </View>
      )}

      <View style={[styles.timerBlock, { pointerEvents: 'box-none' }]}>
        <Text style={[styles.subjectDisplay, { color: colors.textTertiary, fontFamily: Fonts.body }]}>{subject}</Text>
        <Text style={[styles.modeLabel, { color: subjectColor, fontFamily: Fonts.display }]}>
          {(state === 'study' ? tr('study') : tr('break')).toUpperCase()}
        </Text>

        <View style={styles.ringContainer}>
          <Animated.View style={{ opacity: glowAnim }}>
            <Svg width={RING_SIZE} height={RING_SIZE}>
              <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} stroke={colors.surface2} strokeWidth={RING_STROKE} fill="none" />
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke={isDistracted ? colors.danger : subjectColor}
                strokeWidth={RING_STROKE}
                fill="none"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={ringOffset}
                strokeLinecap="round"
                rotation="-90"
                origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
              />
            </Svg>
          </Animated.View>

          <View style={styles.timerTextContainer}>
            <Text 
              style={[
                styles.timerDisplay, 
                { 
                  color: isDistracted ? colors.danger : colors.textPrimary,
                  fontFamily: Fonts.display,
                }
              ]}
            >
              {formatTime(timeLeft)}
            </Text>
          </View>
        </View>

        {state === 'study' && (
          <View style={[styles.orbCounter, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
            <Ionicons name="planet-outline" size={14} color={subjectColor} />
            <Text style={[styles.orbCounterText, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>
              {orbsCollected}/{totalOrbs} {tr('orbs_collected')}
            </Text>
          </View>
        )}
      </View>

      {activeOrb && state === 'study' && (
        <Animated.View
          style={[styles.orbLayer, { left: activeOrb.x, top: activeOrb.y, transform: [{ scale: pulseAnim }] }]}
        >
          <TouchableOpacity
            onPress={() => handleOrbTap(activeOrb.id)}
            activeOpacity={0.85}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          >
            <View style={[styles.orbInner, { borderColor: subjectColor, backgroundColor: colors.surface2 }]}>
              <Ionicons name={subjectIcon as any} size={22} color={subjectColor} />
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}

      {isDistracted && state === 'study' && (
        <View style={[styles.distractionOverlay, { backgroundColor: 'rgba(9,9,12,0.85)', pointerEvents: 'auto' }]}>
          <Ionicons name="warning" size={40} color={colors.danger} />
          <Text style={[styles.distractionTitle, { color: colors.danger, fontFamily: Fonts.display }]}>
            {tr('distracted')}
          </Text>
          <Text style={[styles.distractionSub, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
            {tr('refocus')}
          </Text>
          {distractionSecs > 0 && (
            <Text style={[styles.distractionCount, { color: colors.danger, fontFamily: Fonts.bodyMedium }]}>
              {tr('reset_in')} {DISTRACTION_RESET_SEC - distractionSecs}s
            </Text>
          )}
          <TouchableOpacity
            style={[styles.imBackButton, { backgroundColor: colors.accent, borderColor: colors.accentBorder }]}
            onPress={() => {
              distractedCountRef.current = 0;
              setFocusStatus('focused');
              setIsDistracted(false);
              distractionSecsRef.current = 0;
              setDistractionSecs(0);
              pausedByDistractionRef.current = false;
              setPaused(false);
            }}
          >
            <Text style={[styles.imBackText, { color: colors.background, fontFamily: Fonts.displayMedium }]}>
              I'm Back
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
          onPress={() => {
            if (isDistracted) return;
            pausedByDistractionRef.current = false;
            setPaused(p => !p);
          }}
        >
          <Ionicons name={paused ? 'play' : 'pause'} size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        {state === 'break' && (
          <TouchableOpacity
            style={[styles.controlBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
            onPress={() => { setState('study'); setTimeLeft(duration * 60); }}
          >
            <Ionicons name="play-skip-forward" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity 
          style={[styles.controlBtn, { borderColor: colors.danger, backgroundColor: colors.surface1 }]} 
          onPress={handleComplete}
        >
          <Ionicons name="stop" size={22} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  setupContent: {
    paddingBottom: 40,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  sessionRoot: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupTitle: { fontSize: 24, letterSpacing: -0.4, marginBottom: 4 },
  setupSub: { fontSize: 14, lineHeight: 20 },
  subjectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
  durationRow: { flexDirection: 'row', gap: 12, width: '100%' },
  durationPill: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationNum: { fontSize: 20, fontWeight: '700' },
  durationUnit: { fontSize: 11, marginTop: 2 },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modeRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeRadioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modeTitle: { fontSize: 15, marginBottom: 2 },
  modeSub: { fontSize: 12, lineHeight: 17 },
  bannerWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  bannerWarnText: { flex: 1, fontSize: 12 },
  cameraPip: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 36,
    left: 16,
    zIndex: 40,
    width: 76,
    height: 102,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  cameraView: { flex: 1 },
  focusDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 6,
    padding: 3,
  },
  timerBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  subjectDisplay: { fontSize: 13, marginBottom: 4 },
  modeLabel: { fontSize: 13, letterSpacing: 1.5, marginBottom: 16 },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  timerTextContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerDisplay: {
    fontSize: 48,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
  },
  orbCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radii.chip,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
  },
  orbCounterText: { fontSize: 12 },
  orbLayer: {
    position: 'absolute',
    zIndex: 50,
    elevation: 50,
  },
  orbInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  distractionOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 45,
    padding: 24,
  },
  distractionTitle: { fontSize: 18, marginTop: 12 },
  distractionSub: { fontSize: 14, marginTop: 8, textAlign: 'center' },
  distractionCount: { fontSize: 12, marginTop: 12 },
  controls: {
    flexDirection: 'row',
    gap: 24,
    justifyContent: 'center',
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
    zIndex: 20,
  },
  controlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsSummaryCard: {
    width: '100%',
    padding: 20,
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    marginBottom: 20,
  },
  completeTitle: { fontSize: 26, marginBottom: 20, textAlign: 'center', letterSpacing: -0.3 },
  completeSub: { fontSize: 15, marginBottom: 8, textAlign: 'center', lineHeight: 22 },
  todayTotal: { fontSize: 13, marginBottom: 12 },
  orbSummaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radii.chip,
    borderWidth: StyleSheet.hairlineWidth,
  },
  orbSummaryText: { fontSize: 12 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  imBackButton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imBackText: {
    fontSize: 15,
  },
});
