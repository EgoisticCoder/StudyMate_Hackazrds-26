// Today's study routine — dashboard card with checkboxes
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../lib/context';
import { loadSlotsForWeek, setSlotDone, TimetableSlotRow } from '../lib/timetableSlots';
import { weekKeyFromDate } from '../lib/weekUtils';
import { SubjectColors } from '../constants/colors';
import { useTranslateSubject } from '../lib/translations';
import { Fonts } from '../constants/fonts';
import { Radii } from '../constants/colors';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function todayDayIndex(): number {
  const js = new Date().getDay();
  return js === 0 ? 6 : js - 1;
}

interface Props {
  studentId: string;
  reloadTick?: number;
}

export function DailyTimetableCard({ studentId, reloadTick = 0 }: Props) {
  const { colors, isDark } = useTheme();
  const translateSubject = useTranslateSubject();
  const [slots, setSlots] = useState<TimetableSlotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const dayIndex = todayDayIndex();
  const dayName = DAY_NAMES[dayIndex];
  const weekKey = weekKeyFromDate();

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadSlotsForWeek(studentId, weekKey);
      const today = data
        .filter(s => s.day_index === dayIndex)
        .sort((a, b) => (a.slot_order ?? 0) - (b.slot_order ?? 0) || a.time_slot.localeCompare(b.time_slot));
      setSlots(today);
    } catch (err) {
      console.warn('Daily timetable load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [studentId, weekKey, dayIndex]);

  useEffect(() => { fetchSlots(); }, [fetchSlots, reloadTick]);

  const toggleDone = async (slot: TimetableSlotRow) => {
    const next = !slot.done;
    await setSlotDone(studentId, slot.id, next);
    setSlots(prev => prev.map(s => (s.id === slot.id ? { ...s, done: next } : s)));
  };

  if (loading) {
    return (
      <View style={[st.card, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle, marginHorizontal: 20, marginTop: 16 }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (slots.length === 0) return null;

  const doneCount = slots.filter(s => s.done).length;

  return (
    <View style={[st.card, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
      <View style={st.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[st.dayBadge, { backgroundColor: colors.accentMuted }]}>
            <Ionicons name="today-outline" size={16} color={colors.accent} />
          </View>
          <View>
            <Text style={[st.title, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
              Today's Routine
            </Text>
            <Text style={{ color: colors.textTertiary, fontSize: 12, fontFamily: Fonts.body }}>
              {dayName} · {doneCount}/{slots.length} done
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => router.push('/screens/StudyScheduleScreen')}>
          <Text style={{ color: colors.accent, fontFamily: Fonts.bodyMedium, fontSize: 13 }}>Edit</Text>
        </TouchableOpacity>
      </View>

      {slots.map(slot => {
        const subColor = SubjectColors[slot.subject]
          ? (isDark ? SubjectColors[slot.subject].dark : SubjectColors[slot.subject].light)
          : colors.accent;
        return (
          <TouchableOpacity
            key={slot.id}
            style={[st.row, { borderColor: colors.borderSubtle, backgroundColor: slot.done ? subColor + '10' : 'transparent' }]}
            onPress={() => toggleDone(slot)}
            activeOpacity={0.7}
          >
            <View style={[st.checkbox, { borderColor: slot.done ? colors.success : colors.borderMedium, backgroundColor: slot.done ? colors.success : 'transparent' }]}>
              {slot.done && <Ionicons name="checkmark" size={14} color="#FFF" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textTertiary, fontSize: 11, fontFamily: Fonts.bodyMedium }}>
                {slot.time_slot}
              </Text>
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontFamily: Fonts.displayMedium, marginTop: 2 }}>
                {translateSubject(slot.subject)}{slot.title ? ` · ${slot.title}` : ''}
              </Text>
              {slot.sticky_note ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: Fonts.body, marginTop: 2 }} numberOfLines={1}>
                  {slot.sticky_note}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  dayBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
