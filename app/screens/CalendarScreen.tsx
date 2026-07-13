// Monthly Calendar - events and timetable
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput, Platform, Animated, Easing } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { readQuery } from '../../lib/neo4j';
import { persistCalendarEvent, createRefreshCallback } from '../../lib/dataPersistence';
import { Fonts } from '../../constants/fonts';
import { Radii, Spacing } from '../../constants/colors';
import { SectionLabel, PrimaryButton, AnimatedScreenWrapper } from '../../components/ui/premium';
import { v4 as uuidv4 } from 'uuid';
import { useTranslateSubject } from '../../lib/translations';
import { scheduleCalendarEventNotification } from '../../lib/notifications';

interface CalendarEvent {
  id: string;
  title: string;
  type: 'event' | 'reminder';
  date: string; // YYYY-MM-DD
}

interface TimetableSlotInfo {
  subject: string;
  title: string;
  time_slot: string;
}

export default function CalendarScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const translateSubject = useTranslateSubject();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [timetableSlots, setTimetableSlots] = useState<Record<string, TimetableSlotInfo[]>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventType, setNewEventType] = useState<'event'|'reminder'>('event');
  const [newEventTime, setNewEventTime] = useState('09:00');

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay(); // 0 is Sunday
  };

  const loadData = async () => {
    if (!studentId) return;
    try {
      // Load custom events for this month
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString();
      
      let dbEvents: CalendarEvent[] = [];
      try {
        const eventRes = await readQuery(
          `MATCH (s:Student {id: $studentId})-[:HAS_EVENT]->(e:CalendarEvent)
           WHERE e.date >= $start AND e.date <= $end
           RETURN e.id AS id, e.title AS title, e.type AS type, e.date AS date`,
          { studentId, start: startOfMonth, end: endOfMonth }
        );
        dbEvents = eventRes.map(r => {
          const id = r && typeof r.get === 'function' ? r.get('id') : (r as any)?.id;
          const title = r && typeof r.get === 'function' ? r.get('title') : (r as any)?.title;
          const type = r && typeof r.get === 'function' ? r.get('type') : (r as any)?.type;
          const date = r && typeof r.get === 'function' ? r.get('date') : (r as any)?.date;
          return {
            id, title, type, date: date?.split('T')[0]
          };
        });
      } catch (dbErr) {
        console.warn('Failed to load events from Neo4j, using local cache:', dbErr);
      }

      // Fetch local offline calendar events
      let localEvents: CalendarEvent[] = [];
      try {
        const cacheKey = `local_calendar_events_${studentId}`;
        const cached = Platform.OS === 'web'
          ? localStorage.getItem(cacheKey)
          : await (require('expo-secure-store')).getItemAsync(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          const startObj = new Date(startOfMonth);
          const endObj = new Date(endOfMonth);
          localEvents = parsed.filter((e: any) => {
            const d = new Date(e.date);
            return d >= startObj && d <= endObj;
          }).map((e: any) => ({
            id: e.id,
            title: e.title,
            type: e.type,
            date: e.date.split('T')[0]
          }));
        }
      } catch (cacheErr) {
        console.warn('Failed to load local events from cache:', cacheErr);
      }

      // Merge and deduplicate by id
      const allEventsMap = new Map<string, CalendarEvent>();
      dbEvents.forEach(e => allEventsMap.set(e.id, e));
      localEvents.forEach(e => allEventsMap.set(e.id, e));
      setEvents(Array.from(allEventsMap.values()));

      // Load timetable template to map to days
      let ttRes: any[] = [];
      try {
        ttRes = await readQuery(
          `MATCH (s:Student {id: $studentId})-[:HAS_TIMETABLE_SLOT]->(slot:TimetableSlot)
           RETURN slot.day_index AS di, slot.subject AS sub, slot.title AS title, slot.time_slot AS ts`,
          { studentId }
        );
      } catch (ttErr) {
        console.warn('Failed to load timetable for calendar from Neo4j:', ttErr);
      }
      
      const mappedSlots: Record<string, TimetableSlotInfo[]> = {};
      const daysInMonth = getDaysInMonth(currentDate);
      const slotsList = ttRes.map((r: any) => {
        const di = r && typeof r.get === 'function' ? r.get('di') : (r as any)?.di;
        const sub = r && typeof r.get === 'function' ? r.get('sub') : (r as any)?.sub;
        const title = r && typeof r.get === 'function' ? r.get('title') : (r as any)?.title;
        const ts = r && typeof r.get === 'function' ? r.get('ts') : (r as any)?.ts;
        return {
          day_index: Number(di), subject: sub, title: title, time_slot: ts
        };
      });

      // Map weekly template onto the month's dates
      for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
        const dayOfWeek = (d.getDay() + 6) % 7; // Convert to Mon=0, Sun=6
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        const daySlots = slotsList.filter(s => s.day_index === dayOfWeek);
        if (daySlots.length > 0) {
          mappedSlots[dateStr] = daySlots.map(s => ({
            subject: s.subject, title: s.title, time_slot: s.time_slot
          }));
        }
      }
      setTimetableSlots(mappedSlots);
    } catch (e) {
      console.error("Calendar fetch error", e);
    }
  };

  useEffect(() => { loadData(); }, [studentId, currentDate]);

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const handleAddEvent = async () => {
    if (!selectedDate || !newEventTitle.trim() || !studentId) return;
    
    // Combine date and time for notification
    const [hours, minutes] = newEventTime.split(':').map(Number);
    const eventDateTime = new Date(selectedDate);
    eventDateTime.setHours(hours, minutes, 0, 0);
    const isoDate = eventDateTime.toISOString();
    
    const id = uuidv4();
    const newEvent: CalendarEvent = {
      id,
      title: newEventTitle,
      type: newEventType,
      date: isoDate
    };

    // Schedule notification (15 mins before for reminders, at time for events)
    try {
      await scheduleCalendarEventNotification(
        newEventTitle,
        newEventType === 'reminder' ? 'Reminder' : 'Event',
        eventDateTime,
        id,
        newEventType === 'reminder' ? 15 : 0
      );
    } catch (notifErr) {
      console.warn('Failed to schedule notification:', notifErr);
    }

    // Save locally first for immediate UI update
    try {
      const cacheKey = `local_calendar_events_${studentId}`;
      let cached = Platform.OS === 'web'
        ? localStorage.getItem(cacheKey)
        : await (require('expo-secure-store')).getItemAsync(cacheKey);
      
      let eventsList = cached ? JSON.parse(cached) : [];
      eventsList.push(newEvent);
      
      const eventsStr = JSON.stringify(eventsList);
      if (Platform.OS === 'web') {
        localStorage.setItem(cacheKey, eventsStr);
      } else {
        await (require('expo-secure-store')).setItemAsync(cacheKey, eventsStr);
      }
      
      // Optimistically update UI state
      setEvents(prev => [...prev, newEvent]);
    } catch (cacheErr) {
      console.warn('Failed to cache event locally:', cacheErr);
    }

    // Persist to Neo4j with reactive state update
    try {
      await persistCalendarEvent(
        studentId,
        {
          title: newEventTitle,
          type: newEventType,
          date: isoDate,
        },
        {
          onSuccess: createRefreshCallback(() => {
            console.log('[Calendar] Event saved, refreshing data...');
            loadData(); // Re-fetch to ensure consistency
          }),
          onError: (err) => {
            console.error('[Calendar] Failed to persist event to Neo4j:', err);
          },
        }
      );
    } finally {
      setAddModal(false);
      setNewEventTitle('');
      setNewEventTime('09:00');
    }
  };

  const renderGrid = () => {
    const days = getDaysInMonth(currentDate);
    let firstDay = getFirstDayOfMonth(currentDate) - 1; // Start Monday
    if (firstDay === -1) firstDay = 6; // Sunday is 6

    const grid = [];
    let week = [];
    
    for (let i = 0; i < firstDay; i++) {
      week.push(<View key={`empty-${i}`} style={styles.dayCell} />);
    }

    for (let i = 1; i <= days; i++) {
      const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const hasEvents = events.some(e => e.date === dateStr);
      const hasTimetable = !!timetableSlots[dateStr];
      const isSelected = selectedDate === dateStr;
      
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const isToday = todayStr === dateStr;

      week.push(
        <TouchableOpacity 
          key={i} 
          style={[
            styles.dayCell, 
            isSelected && { backgroundColor: colors.accentMuted, borderColor: colors.accentBorder }
          ]}
          onPress={() => setSelectedDate(dateStr)}
        >
          <View style={[
            styles.dayCircle, 
            isToday && { backgroundColor: colors.accent }
          ]}>
            <Text 
              style={[
                styles.dayText, 
                { color: isToday ? colors.textInverse : colors.textPrimary, fontFamily: Fonts.bodyMedium }
              ]}
            >
              {i}
            </Text>
          </View>
          <View style={styles.dotRow}>
            {hasTimetable && <View style={[styles.dot, { backgroundColor: colors.success }]} />}
            {hasEvents && <View style={[styles.dot, { backgroundColor: colors.warning }]} />}
          </View>
        </TouchableOpacity>
      );

      if (week.length === 7) {
        grid.push(<View key={`week-${i}`} style={styles.weekRow}>{week}</View>);
        week = [];
      }
    }

    if (week.length > 0) {
      while (week.length < 7) week.push(<View key={`empty-end-${week.length}`} style={styles.dayCell} />);
      grid.push(<View key={`week-end`} style={styles.weekRow}>{week}</View>);
    }

    return grid;
  };

  const selectedEvents = events.filter(e => e.date === selectedDate);
  const selectedTimetable = selectedDate ? timetableSlots[selectedDate] || [] : [];

  return (
    <AnimatedScreenWrapper style={{ backgroundColor: colors.background }}>
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Calendar</Text>
        <TouchableOpacity 
          onPress={() => { if(selectedDate) setAddModal(true); }}
          disabled={!selectedDate}
          style={[styles.backBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1, opacity: selectedDate ? 1 : 0.4 }]}
        >
          <Ionicons name="add" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.calendarCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
          <View style={styles.monthHeader}>
            <TouchableOpacity onPress={handlePrevMonth}>
              <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={[styles.monthTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
              {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </Text>
            <TouchableOpacity onPress={handleNextMonth}>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.weekRow}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <Text key={i} style={[styles.dayHeaderCell, { color: colors.textTertiary, fontFamily: Fonts.bodyMedium }]}>{d}</Text>
            ))}
          </View>
          
          {renderGrid()}
        </View>

        {selectedDate && (
          <View style={styles.detailsArea}>
            <Text style={[styles.detailsTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
              {new Date(selectedDate).toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>

            {selectedEvents.length === 0 && selectedTimetable.length === 0 ? (
              <Text style={{ color: colors.textTertiary, fontFamily: Fonts.body, marginTop: 12 }}>
                No schedule for this day.
              </Text>
            ) : (
              <>
                {selectedEvents.length > 0 && (
                  <View style={{ marginTop: 20 }}>
                    <SectionLabel text="Events & Reminders" style={{ marginBottom: 10 }} />
                    {selectedEvents.map(e => {
                      const leftBorderColor = e.type === 'reminder' ? colors.warning : colors.accent;
                      return (
                        <View key={e.id} style={[styles.eventCardOuter, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}>
                          <View style={[styles.eventCardInner, { borderLeftColor: leftBorderColor }]}>
                            <Ionicons 
                              name={e.type === 'reminder' ? "notifications-outline" : "calendar-outline"} 
                              size={16} 
                              color={leftBorderColor} 
                            />
                            <Text style={{ color: colors.textPrimary, fontFamily: Fonts.bodyMedium, fontSize: 14, marginLeft: 10 }}>
                              {e.title}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {selectedTimetable.length > 0 && (
                  <View style={{ marginTop: 20 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <SectionLabel text="Timetable" />
                      <TouchableOpacity
                        onPress={() => {
                          router.back();
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.accentMuted, borderColor: colors.accentBorder, borderWidth: StyleSheet.hairlineWidth }}
                      >
                        <Ionicons name="add" size={14} color={colors.accent} />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.accent, fontFamily: Fonts.bodyMedium }}>Add to Dashboard</Text>
                      </TouchableOpacity>
                    </View>
                    {/* Formatted timetable table */}
                    <View style={[styles.ttTableContainer, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
                      {/* Table header */}
                      <View style={[styles.ttTableRow, { borderBottomColor: colors.borderSubtle }]}>
                        <Text style={[styles.ttTableHeader, { color: colors.textTertiary, width: 80 }]}>Time</Text>
                        <Text style={[styles.ttTableHeader, { color: colors.textTertiary, flex: 1 }]}>Subject</Text>
                        <Text style={[styles.ttTableHeader, { color: colors.textTertiary, flex: 1 }]}>Topic</Text>
                      </View>
                      {/* Table rows */}
                      {selectedTimetable
                        .sort((a, b) => a.time_slot.localeCompare(b.time_slot))
                        .map((t, i) => (
                        <View key={i} style={[styles.ttTableRow, { borderBottomColor: colors.borderSubtle, backgroundColor: i % 2 === 0 ? 'transparent' : colors.surface2 }]}>
                          <Text style={[styles.ttTableCell, { color: colors.accent, fontFamily: Fonts.bodyMedium, width: 80, fontSize: 11 }]}>
                            {t.time_slot}
                          </Text>
                          <Text style={[styles.ttTableCell, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium, flex: 1 }]}>
                            {translateSubject(t.subject)}
                          </Text>
                          <Text style={[styles.ttTableCell, { color: colors.textSecondary, fontFamily: Fonts.body, flex: 1, fontSize: 12 }]}>
                            {t.title}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Add Event Modal */}
      <Modal visible={addModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface3, borderTopColor: colors.borderSubtle }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
                Add to {selectedDate}
              </Text>
              <TouchableOpacity 
                onPress={() => setAddModal(false)}
                style={[styles.closeBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
              >
                <Ionicons name="close" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.typeRow}>
              <TouchableOpacity 
                onPress={() => setNewEventType('event')} 
                style={[
                  styles.typeBtn, 
                  { 
                    backgroundColor: newEventType === 'event' ? colors.accentMuted : colors.surface1,
                    borderColor: newEventType === 'event' ? colors.accentBorder : colors.borderSubtle,
                  }
                ]}
              >
                <Text style={{ color: newEventType === 'event' ? colors.accentHover : colors.textSecondary, fontFamily: Fonts.bodyMedium }}>Event</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={() => setNewEventType('reminder')} 
                style={[
                  styles.typeBtn, 
                  { 
                    backgroundColor: newEventType === 'reminder' ? colors.warning + '0c' : colors.surface1,
                    borderColor: newEventType === 'reminder' ? colors.warning + '20' : colors.borderSubtle,
                  }
                ]}
              >
                <Text style={{ color: newEventType === 'reminder' ? colors.warning : colors.textSecondary, fontFamily: Fonts.bodyMedium }}>Reminder</Text>
              </TouchableOpacity>
            </View>

            <TextInput 
              style={[
                styles.input, 
                { 
                  color: colors.textPrimary, 
                  borderColor: colors.borderSubtle, 
                  backgroundColor: colors.surface1,
                  fontFamily: Fonts.body,
                }
              ]}
              placeholder="e.g. Math Test, or Doctor's Appointment"
              placeholderTextColor={colors.textTertiary}
              value={newEventTitle}
              onChangeText={setNewEventTitle}
              autoFocus
            />
            
            <TextInput 
              style={[
                styles.input, 
                { 
                  color: colors.textPrimary, 
                  borderColor: colors.borderSubtle, 
                  backgroundColor: colors.surface1,
                  fontFamily: Fonts.body,
                  marginTop: 10
                }
              ]}
              placeholder="Time (e.g. 09:00)"
              placeholderTextColor={colors.textTertiary}
              value={newEventTime}
              onChangeText={setNewEventTime}
              keyboardType="numbers-and-punctuation"
            />
            
            <PrimaryButton 
              label="Save" 
              onPress={handleAddEvent}
              disabled={!newEventTitle.trim()}
            />
          </View>
        </View>
      </Modal>
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
    justifyContent: 'space-between',
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
  headerTitle: { fontSize: 18, letterSpacing: -0.4 },
  calendarCard: { 
    margin: 20, 
    padding: 16, 
    borderRadius: Radii.card, 
    borderWidth: StyleSheet.hairlineWidth 
  },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  monthTitle: { fontSize: 15 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayHeaderCell: { flex: 1, textAlign: 'center', fontSize: 12, marginBottom: 8 },
  dayCell: { 
    flex: 1, 
    height: 48, 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderRadius: 8, 
    borderWidth: StyleSheet.hairlineWidth, 
    borderColor: 'transparent' 
  },
  dayCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 14 },
  dotRow: { flexDirection: 'row', gap: 3, marginTop: 2 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  detailsArea: { paddingHorizontal: 20, paddingBottom: 40 },
  detailsTitle: { fontSize: 18, letterSpacing: -0.4 },
  eventCardOuter: {
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 8,
  },
  eventCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderLeftWidth: 4,
  },
  ttCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 14, 
    borderRadius: Radii.card, 
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8 
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(9,9,12,0.5)' },
  modalCard: { 
    padding: 24, 
    paddingBottom: Platform.OS === 'ios' ? 44 : 24, 
    borderTopLeftRadius: Radii.bottomSheet, 
    borderTopRightRadius: Radii.bottomSheet,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { fontSize: 16 },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeBtn: { 
    flex: 1, 
    paddingVertical: 10, 
    alignItems: 'center', 
    borderRadius: Radii.input,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { 
    borderWidth: StyleSheet.hairlineWidth, 
    borderRadius: Radii.input, 
    padding: 14, 
    fontSize: 15, 
    marginBottom: 20 
  },
  ttTableContainer: { 
    borderRadius: 12, 
    borderWidth: StyleSheet.hairlineWidth, 
    overflow: 'hidden' 
  },
  ttTableRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 10, 
    paddingHorizontal: 12, 
    borderBottomWidth: StyleSheet.hairlineWidth 
  },
  ttTableHeader: { 
    fontSize: 10, 
    fontWeight: '700', 
    textTransform: 'uppercase', 
    letterSpacing: 0.5 
  },
  ttTableCell: { 
    paddingVertical: 2 
  },
});
