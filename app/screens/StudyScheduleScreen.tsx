// AI study schedule - template + Neo4j persistence
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Animated,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { buildStudentContext, getStudentProfile } from '../../lib/adaptiveEngine';
import { callSarvam } from '../../lib/ai';
import { v4 as uuidv4 } from 'uuid';
import { buildTimetablePromptBlock } from '../../lib/timetableTemplate';
import { readQuery, writeQuery } from '../../lib/neo4j';
import { searchStudyReferences, formatSnippetsForPrompt } from '../../lib/webSearch';
import { extractSlotsFromPlanMarkdown, replaceSlotsForWeek } from '../../lib/timetableSlots';
import { weekKeyFromDate } from '../../lib/weekUtils';
import { scheduleTimetableNudge } from '../../lib/notifications';
import { MarkdownView } from '../../components/MarkdownView';
import { Fonts } from '../../constants/fonts';
import { Radii, Spacing } from '../../constants/colors';
import { SectionLabel, PrimaryButton, AnimatedScreenWrapper } from '../../components/ui/premium';

function peakTimeToHour(peak: string): number {
  const m: Record<string, number> = {
    'Early Morning': 6,
    Morning: 9,
    Afternoon: 14,
    Evening: 18,
    'Late Night': 21,
    Night: 21,
  };
  return m[peak] ?? 18;
}

export default function StudyScheduleScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [schedule, setSchedule] = useState('');
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState<7 | 14 | 30>(14);
  const [board, setBoard] = useState('ICSE');
  const [classNum, setClassNum] = useState(10);
  const [dailyMins, setDailyMins] = useState(60);
  const [peakTime, setPeakTime] = useState('Evening');
  const [justGenerated, setJustGenerated] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const profile = await getStudentProfile(studentId);
      if (profile) {
        setBoard(profile.board);
        setClassNum(profile.class);
        setDailyMins(profile.daily_study_mins);
        setPeakTime(profile.peak_study_time);
      }

      try {
        const recs = await readQuery(
          `MATCH (s:Student {id: $studentId})-[:HAS_STUDY_PLAN]->(sp:StudyPlan)
           RETURN sp ORDER BY sp.created_at DESC LIMIT 1`,
          { studentId }
        );
        if (recs.length) {
          const record = recs[0];
          const spNode = record && typeof record.get === 'function' ? record.get('sp') : (record as any)?.sp;
          const sp = spNode?.properties as { body?: string } || spNode as { body?: string };
          if (sp.body) setSchedule(sp.body);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [studentId]);

  const generateSchedule = async () => {
    if (!studentId) return;
    setLoading(true);
    setSchedule('');
    try {
      const context = await buildStudentContext(studentId);
      const templateBlock = buildTimetablePromptBlock({
        daily_study_mins: dailyMins,
        peak_study_time: peakTime,
        board,
        class: classNum,
      });

      let refs = '';
      try {
        const snippets = await searchStudyReferences(
          `${board} class ${classNum} syllabus timetable study tips weak subjects`
        );
        refs = formatSnippetsForPrompt(snippets);
      } catch {
        refs = '';
      }

      const studentInstructions = customInstructions.trim()
        ? `\n\nStudent's Custom Requirements:\n${customInstructions.trim()}\n\nIMPORTANT: You MUST incorporate these requirements into the timetable. Ask clarifying questions if needed in the "## Weekly Focus" section.`
        : '';

      const result = await callSarvam(
        [
          {
            role: 'system',
            content: `You are a study planning expert for ${board} Class ${classNum}. ${context}

${templateBlock}

REFERENCE LINKS / SNIPPETS (optional grounding — cite names of chapters and books, never paste paywalled text):
${refs || '(no web results — rely on syllabus knowledge)'}`,
          },
          {
            role: 'user',
            content: `Generate a ${duration}-day study schedule for this student.

Rules:
1. Prioritize EMPIRICALLY_WEAK and AVOIDED_AND_WEAK subjects over strong subjects.
2. Use the timetable template table above; replace placeholders with concrete chapters from their syllabus.
3. Allocate minutes using roughly ${dailyMins} minutes/day on school days.
4. Put hardest cognitive work inside their peak window: ${peakTime}.
5. Every cell in the table must include: Subject + Chapter/Topic (e.g., "Physics: Optics Ch.10")
6. Leave most cells BLANK — students only study 2-4 hours/day.
7. End with a "## Weekly Focus" section with 3-5 bullet points on priority chapters.
${studentInstructions}
Format STRICTLY using markdown: use # for headings, **bold** for emphasis, | for tables, - for bullet points.`,
          },
        ],
        'schedule_planner'
      );
      setSchedule(result);

      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (sp:StudyPlan {
           id: $id,
           created_at: datetime(),
           duration_days: $duration_days,
           body: $body,
           template_version: 'weekly_table_v1'
         })
         CREATE (s)-[:HAS_STUDY_PLAN]->(sp)`,
        {
          studentId,
          id: uuidv4(),
          duration_days: duration,
          body: result,
        }
      );

      try {
        const extracted = await extractSlotsFromPlanMarkdown(result);
        if (extracted.length && studentId) {
          await replaceSlotsForWeek(studentId, weekKeyFromDate(), extracted);
          const incomplete = extracted.length;
          await scheduleTimetableNudge(peakTimeToHour(peakTime), 0, incomplete);
          setJustGenerated(true);
        }
      } catch (slotErr) {
        console.warn('Timetable slot extraction:', slotErr);
      }
    } catch (err: unknown) {
      setSchedule(err instanceof Error ? err.message : 'Failed to generate schedule');
    } finally {
      setLoading(false);
    }
  };

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
        <Text style={[styles.title, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Study Schedule</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
          Uses your diagnostic strengths/weaknesses, daily time budget, and weekly templates to consistently structure study sessions.
        </Text>

        <SectionLabel text="PLAN DURATION" style={{ marginTop: 8, marginBottom: 12 }} />
        <View style={styles.durRow}>
          {([7, 14, 30] as const).map(d => {
            const isSelected = duration === d;
            return (
              <TouchableOpacity
                key={d}
                style={[
                  styles.durPill,
                  {
                    backgroundColor: isSelected ? colors.accentMuted : colors.surface1,
                    borderColor: isSelected ? colors.accentBorder : colors.borderSubtle,
                  },
                ]}
                onPress={() => setDuration(d)}
              >
                <Text 
                  style={[
                    styles.durNum, 
                    { 
                      color: isSelected ? colors.accentHover : colors.textPrimary,
                      fontFamily: Fonts.display 
                    }
                  ]}
                >
                  {d}
                </Text>
                <Text 
                  style={[
                    styles.durUnit, 
                    { 
                      color: isSelected ? colors.accent : colors.textSecondary,
                      fontFamily: Fonts.body 
                    }
                  ]}
                >
                  days
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom Instructions */}
        <SectionLabel text="SPECIAL INSTRUCTIONS (OPTIONAL)" style={{ marginTop: 12, marginBottom: 8 }} />
        <TextInput
          style={[styles.customInput, { 
            color: colors.textPrimary, 
            borderColor: colors.borderSubtle, 
            backgroundColor: colors.surface1,
            fontFamily: Fonts.body,
          }]}
          placeholder="e.g. I go to school 7am-2pm, tuitions Mon/Wed/Fri 5-7pm, prefer studying Math in morning..."
          placeholderTextColor={colors.textTertiary}
          value={customInstructions}
          onChangeText={setCustomInstructions}
          multiline
        />

        <PrimaryButton
          label={loading ? 'Generating study plan...' : 'Generate & Save Plan'}
          disabled={loading}
          icon={
            loading ? (
              <ActivityIndicator size="small" color={colors.textTertiary} />
            ) : (
              <Ionicons name="calendar" size={16} color={colors.textInverse} />
            )
          }
          onPress={() => void generateSchedule()}
        />

        {justGenerated && (
          <TouchableOpacity
            style={[
              styles.nudgeBanner,
              {
                backgroundColor: colors.success + '0c',
                borderColor: colors.success + '20',
              }
            ]}
            onPress={() => {
  try {
    router.back();
  } catch {
    router.replace('/');
  }
}}
          >
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={[styles.nudgeText, { color: colors.success, fontFamily: Fonts.displayMedium }]}>
              Timetable saved! View in Dashboard
            </Text>
            <Ionicons name="arrow-forward" size={16} color={colors.success} />
          </TouchableOpacity>
        )}

        {schedule ? (
          <View style={[styles.scheduleCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
            <View style={styles.scheduleHeader}>
              <Ionicons name="calendar-outline" size={16} color={colors.accent} />
              <Text style={[styles.scheduleTitle, { color: colors.accentHover, fontFamily: Fonts.display }]}>
                {duration}-Day Study Plan
              </Text>
            </View>
            <MarkdownView content={schedule} />
          </View>
        ) : null}
      </ScrollView>
    </AnimatedScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, lineHeight: 22, marginBottom: 20 },
  durRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  durPill: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  durNum: { fontSize: 24, fontWeight: '700' },
  durUnit: { fontSize: 11, marginTop: 2 },
  scheduleCard: { borderRadius: Radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 20, marginTop: 24 },
  scheduleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  scheduleTitle: { fontSize: 14, fontWeight: '600' },
  nudgeBanner: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 8, 
    paddingVertical: 14, 
    borderRadius: Radii.card, 
    marginTop: 16, 
    borderWidth: StyleSheet.hairlineWidth 
  },
  nudgeText: { fontSize: 14 },
  customInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
});
