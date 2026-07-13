import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Animated, Easing, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, useAuth, useLanguage } from '../lib/context';
import { useT } from '../lib/translations';
import { writeQuery } from '../lib/neo4j';
import { callSarvam } from '../lib/ai';
import { STRESS_SOURCES } from '../constants/subjects';
import { markMoodCheckedToday, hasMoodCheckedToday } from '../lib/moodUtils';
import { Fonts } from '../constants/fonts';

import { v4 as uuidv4 } from 'uuid';

interface MoodCheckInProps { onComplete: (quote: string) => void; }

const MOOD_OPTIONS = [
  { level: 1, icon: 'happy-outline' as const, label: 'Great', color: '#059669' },
  { level: 2, icon: 'thumbs-up-outline' as const, label: 'Good', color: '#34D399' },
  { level: 3, icon: 'ellipse-outline' as const, label: 'Okay', color: '#F59E0B' },
  { level: 4, icon: 'sad-outline' as const, label: 'Stressed', color: '#F97316' },
  { level: 5, icon: 'warning-outline' as const, label: 'Overwhelmed', color: '#EF4444' },
];

const SLEEP_OPTIONS = [
  { value: 'great', icon: 'moon-outline' as const, label: '8h+', color: '#059669' },
  { value: 'okay', icon: 'cloudy-night-outline' as const, label: '6-8h', color: '#F59E0B' },
  { value: 'poor', icon: 'thunderstorm-outline' as const, label: '<6h', color: '#EF4444' },
];

const ENERGY_OPTIONS = [
  { value: 'high', icon: 'flash-outline' as const, label: 'High', color: '#059669' },
  { value: 'medium', icon: 'remove-outline' as const, label: 'Medium', color: '#F59E0B' },
  { value: 'low', icon: 'battery-dead-outline' as const, label: 'Low', color: '#EF4444' },
];

export function MoodCheckIn({ onComplete }: MoodCheckInProps) {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const { language } = useLanguage();
  const tr = useT();
  const [stress, setStress] = useState<number | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [sleep, setSleep] = useState<string | null>(null);
  const [energy, setEnergy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  // Entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  // Detail expand
  const expandAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: stress !== null ? 1 : 0,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [stress]);

  const handleSubmit = async () => {
    if (stress === null || !studentId) return;
    
    // Double-check if already submitted today (prevent duplicates)
    const alreadyChecked = await hasMoodCheckedToday(studentId);
    if (alreadyChecked) {
      onComplete("You've already checked in today. Check back tomorrow!");
      return;
    }

    setLoading(true);
    const moodId = uuidv4();
    const newLog = {
      id: moodId,
      stress_level: stress,
      source: source || '',
      note,
      sleep_quality: sleep || '',
      energy_level: energy || '',
      date: new Date().toISOString()
    };

    // Save locally + mark calendar day checked.
    // Cache is written FIRST: hasMoodCheckedToday() falls back to scanning this
    // cache if the dedicated "checked" flag write fails, so the cache is the
    // more important write to get right.
    try {
      const cacheKey = `local_mood_logs_${studentId}`;
      let cached = Platform.OS === 'web'
        ? localStorage.getItem(cacheKey)
        : await (require('expo-secure-store')).getItemAsync(cacheKey);

      let logsList = cached ? JSON.parse(cached) : [];
      logsList.push(newLog);

      const logsStr = JSON.stringify(logsList);
      if (Platform.OS === 'web') {
        localStorage.setItem(cacheKey, logsStr);
      } else {
        await (require('expo-secure-store')).setItemAsync(cacheKey, logsStr);
      }
    } catch (cacheErr) {
      console.warn('Failed to cache mood log locally:', cacheErr);
    }

    try {
      await markMoodCheckedToday(studentId);
    } catch (flagErr) {
      console.warn('Failed to set mood-checked flag (cache fallback will cover it):', flagErr);
    }

    let aiQuote = "Remember, every step forward counts.";
    try {
      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (m:MoodLog {
           id: $moodId, stress_level: $stress, source: $source, note: $note,
           sleep_quality: $sleep, energy_level: $energy, date: datetime()
         })
         CREATE (s)-[:LOGGED_MOOD]->(m)`,
        { studentId, moodId, stress, source: source || '', note, sleep: sleep || '', energy: energy || '' }
      );
      try {
        const sleepCtx = sleep ? ` Sleep: ${sleep}.` : '';
        const energyCtx = energy ? ` Energy: ${energy}.` : '';
        aiQuote = await callSarvam([
          { role: 'system', content: 'You are an empathetic study coach. Give ONE short, actionable tip based on the student\'s state. Max 2 sentences. Be warm but practical.' },
          { role: 'user', content: `Stress: ${stress}/5. Cause: ${source || 'general'}.${sleepCtx}${energyCtx}` }
        ], 'mood_quote');
      } catch (aiErr) {
        console.warn('Sarvam call for mood quote failed:', aiErr);
      }
      
      // Play success notification haptics on successful log
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) { 
      console.warn('Mood log Neo4j write failed, logged offline:', err); 
      aiQuote = "Offline mode active. Mood saved locally on your device.";
    } finally { 
      setLoading(false); 
      onComplete(aiQuote);
    }
  };

  return (
    <Animated.View style={[st.container, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="sparkles" size={14} color={colors.accent} />
        </View>
        <Text style={[st.label, { color: colors.textTertiary, fontFamily: Fonts.displayMedium }]}>{tr('mood_daily_check')}</Text>
      </View>
      <Text style={[st.title, { color: colors.textPrimary, fontFamily: Fonts.display }]}>{tr('mood_title')}</Text>

      {/* Mood selector with icons */}
      <View style={st.moodRow}>
        {MOOD_OPTIONS.map(m => {
          const isSelected = stress === m.level;
          return (
            <Pressable key={m.level} 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setStress(m.level);
              }}
              style={({ pressed }) => [
                st.moodBtn, 
                {
                  transform: [{ scale: pressed ? 0.9 : isSelected ? 1.05 : 1 }],
                  borderColor: isSelected ? m.color : colors.borderSubtle,
                  borderWidth: isSelected ? 2 : 1,
                  backgroundColor: isSelected ? m.color + '10' : colors.surface,
                }
              ]}>
              {isSelected && (
                <LinearGradient
                  colors={[m.color + '30', m.color + '05']}
                  style={[StyleSheet.absoluteFillObject, { borderRadius: 18 }]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
              )}
              <Ionicons name={m.icon} size={28} color={isSelected ? m.color : colors.textTertiary} />
              <Text style={{ fontSize: 10, fontFamily: Fonts.bodyMedium, color: isSelected ? m.color : colors.textTertiary, marginTop: 6 }}>{tr('mood_' + m.label.toLowerCase())}</Text>
            </Pressable>
          );
        })}
      </View>

      {stress !== null && (
        <Animated.View style={{ opacity: expandAnim, transform: [{ translateY: expandAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
          {/* Sleep */}
          <Text style={[st.sectionLabel, { color: colors.textSecondary, fontFamily: Fonts.displayMedium }]}>
            <Ionicons name="moon-outline" size={12} color={colors.textSecondary} /> {' '}{tr('mood_sleep')}
          </Text>
          <View style={st.optionRow}>
            {SLEEP_OPTIONS.map(s => {
              const isActive = sleep === s.value;
              return (
                <Pressable key={s.value} 
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSleep(s.value);
                  }}
                  style={({ pressed }) => [
                    st.optionPill, 
                    {
                      backgroundColor: isActive ? s.color + '15' : colors.surface2,
                      borderColor: isActive ? s.color : colors.borderSubtle,
                      transform: [{ scale: pressed ? 0.95 : 1 }]
                    }
                  ]}>
                  <Ionicons name={s.icon} size={16} color={isActive ? s.color : colors.textSecondary} />
                  <Text style={[st.optionLabel, { color: isActive ? s.color : colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>{tr('sleep_' + s.value.toLowerCase())}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Energy */}
          <Text style={[st.sectionLabel, { color: colors.textSecondary }]}>
            <Ionicons name="flash-outline" size={12} color={colors.textSecondary} /> {' '}{tr('mood_energy')}
          </Text>
          <View style={st.optionRow}>
            {ENERGY_OPTIONS.map(e => {
              const isActive = energy === e.value;
              return (
                <Pressable key={e.value} 
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setEnergy(e.value);
                  }}
                  style={({ pressed }) => [
                    st.optionPill, 
                    {
                      backgroundColor: isActive ? e.color + '15' : colors.surface2,
                      borderColor: isActive ? e.color : colors.borderSubtle,
                      transform: [{ scale: pressed ? 0.95 : 1 }]
                    }
                  ]}>
                  <Ionicons name={e.icon} size={16} color={isActive ? e.color : colors.textTertiary} />
                  <Text style={[st.optionLabel, { color: isActive ? e.color : colors.textPrimary }]}>{tr('energy_' + e.value.toLowerCase())}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Source */}
          <Text style={[st.sectionLabel, { color: colors.textSecondary }]}>
            <Ionicons name="help-circle-outline" size={12} color={colors.textSecondary} /> {' '}{tr('mood_mind')}
          </Text>
          <View style={st.pillRow}>
            {STRESS_SOURCES.map(s => (
              <Pressable key={s} 
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setSource(s);
                }}
                style={({ pressed }) => [
                  st.pill, 
                  {
                    backgroundColor: source === s ? colors.accent + '18' : colors.surface2,
                    borderColor: source === s ? colors.accent : colors.borderSubtle,
                    transform: [{ scale: pressed ? 0.95 : 1 }]
                  }
                ]}>
                <Text style={[st.pillText, { color: source === s ? colors.accent : colors.textPrimary }]}>{tr('stress_' + s.replace(' ', '_'))}</Text>
              </Pressable>
            ))}
          </View>

          {/* Note */}
          <TextInput style={[st.noteInput, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
            placeholder={tr('mood_note_placeholder')} placeholderTextColor={colors.textTertiary} value={note} onChangeText={setNote} multiline />

          {/* Submit */}
          <Pressable 
            onPress={handleSubmit} 
            disabled={loading}
            style={({ pressed }) => [
              st.submitBtn, 
              { 
                backgroundColor: colors.accent,
                opacity: loading ? 0.7 : 1,
                transform: [{ scale: pressed && !loading ? 0.97 : 1 }]
              }
            ]}
          >
            {loading ? <ActivityIndicator color={colors.textInverse} /> : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="checkmark" size={14} color={colors.textInverse} />
                </View>
                <Text style={[st.submitText, { color: colors.textInverse, fontFamily: Fonts.displayMedium }]}>{tr('mood_submit')}</Text>
              </View>
            )}
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const st = StyleSheet.create({
  container: { 
    borderRadius: 24, 
    borderWidth: 1, 
    padding: 24, 
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.04,
        shadowRadius: 24,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.04)',
      },
    }),
  },
  label: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { fontSize: 20, textAlign: 'center', marginBottom: 24, lineHeight: 26 },
  moodRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 8 },
  moodBtn: { flex: 1, minHeight: 76, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, overflow: 'hidden' },
  sectionLabel: { fontSize: 13, marginBottom: 12, marginTop: 22, letterSpacing: 0.3 },
  optionRow: { flexDirection: 'row', gap: 10 },
  optionPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16, borderWidth: 1 },
  optionLabel: { fontSize: 13 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20, marginTop: 4 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  pillText: { fontSize: 13 },
  noteInput: { borderWidth: 1, borderRadius: 16, padding: 16, fontSize: 14, minHeight: 52, marginBottom: 20, textAlignVertical: 'top' },
  submitBtn: { paddingVertical: 16, borderRadius: 16, alignItems: 'center', ...Platform.select({
    ios: {
      shadowColor: '#7C5CFC',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
    },
    android: {
      elevation: 4,
    },
    web: {
      boxShadow: '0px 4px 8px rgba(124, 92, 252, 0.2)',
    },
  }) },
  submitText: { fontSize: 16 },
});
