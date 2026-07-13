// Parent portal — PIN-verified access + private study observations for AI adaptation
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/context';
import { verifyParentAccess, ParentAuthResult } from '../../lib/parentAuth';
import { readQuery, writeQuery } from '../../lib/neo4j';
import { Fonts } from '../../constants/fonts';
import { Radii, Spacing } from '../../constants/colors';
import { SectionLabel, PrimaryButton, AnimatedScreenWrapper } from '../../components/ui/premium';

export default function ParentPortalScreen() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [sid, setSid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<string>('');

  // Parent notes state (hidden from student)
  const [studyNotes, setStudyNotes] = useState('');
  const [weaknessNotes, setWeaknessNotes] = useState('');
  const [notesUpdatedAt, setNotesUpdatedAt] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);

  const handleUnlock = async () => {
    if (!email.trim() || pin.length < 4) {
      Alert.alert('Missing info', 'Enter the student email and parent PIN from their Profile.');
      return;
    }
    setLoading(true);
    try {
      const result: ParentAuthResult = await verifyParentAccess(email, pin);
      if (!result.success) {
        const msgs: Record<string, { title: string; body: string }> = {
          email_not_found: {
            title: 'Student not found',
            body: 'No student account found with this email. Please check the email address.',
          },
          pin_not_set: {
            title: 'Parent access not set up',
            body: 'Parent access has not been set up yet. The student needs to set a parent PIN in their Profile settings.',
          },
          wrong_pin: {
            title: 'Incorrect PIN',
            body: 'The parent PIN is incorrect. Please check the PIN set in the student\'s Profile.',
          },
        };
        const msg = msgs[result.reason] || { title: 'Access denied', body: 'Check email and PIN.' };
        Alert.alert(msg.title, msg.body);
        setLoading(false);
        return;
      }
      setSid(result.studentId);

      // Load stats with safety catches for offline mode
      let quizAgg: any[] = [], sessRow: any[] = [], mood: any[] = [];
      try {
        [quizAgg, sessRow, mood] = await Promise.all([
          readQuery(
            `MATCH (s:Student {id: $sid})-[:ATTEMPTED]->(q:Quiz)
             WHERE q.date > datetime() - duration('P14D')
             RETURN count(q) AS quizzes, avg(toFloat(q.score)/q.total) AS avg`,
            { sid: result.studentId }
          ),
          readQuery(
            `MATCH (s:Student {id: $sid})-[:STUDIED]->(ss:StudySession)
             WHERE ss.date > datetime() - duration('P14D')
             RETURN count(ss) AS sessions`,
            { sid: result.studentId }
          ),
          readQuery(
            `MATCH (s:Student {id: $sid})-[:LOGGED_MOOD]->(m:MoodLog)
             WHERE m.date > datetime() - duration('P7D')
             RETURN avg(toFloat(m.stress_level)) AS ms`,
            { sid: result.studentId }
          ),
        ]);
      } catch (dbErr) {
        console.warn('Parent portal summary query failed:', dbErr);
      }

      const quizRecord = quizAgg[0];
      const q = quizRecord && typeof quizRecord.get === 'function' ? quizRecord.get('quizzes') : (quizRecord as any)?.quizzes ?? 0;
      const avg = quizRecord && typeof quizRecord.get === 'function' ? quizRecord.get('avg') : (quizRecord as any)?.avg;
      const sessRecord = sessRow[0];
      const sess = sessRecord && typeof sessRecord.get === 'function' ? sessRecord.get('sessions') : (sessRecord as any)?.sessions ?? 0;
      const moodRecord = mood[0];
      const moodAvg = moodRecord && typeof moodRecord.get === 'function' ? moodRecord.get('ms') : (moodRecord as any)?.ms;

      const lines = [
        `• Quizzes attempted (Last 14 days): ${q}`,
        avg != null ? `• Average quiz score: ${Math.round(Number(avg) * 100)}%` : '• No quiz averages yet.',
        `• Study sessions logged: ${sess}`,
        moodAvg != null ? `• Avg stress level (1–5): ${Number(moodAvg).toFixed(1)}` : '• No mood logs this week.',
      ];
      setStats(lines.join('\n'));

      // Load parent notes from local cache first
      try {
        let cached = Platform.OS === 'web'
          ? localStorage.getItem(`profile_cache_${result.studentId}`)
          : await (require('expo-secure-store')).getItemAsync(`profile_cache_${result.studentId}`);
        if (cached) {
          const profileData = JSON.parse(cached);
          if (profileData.parent_study_notes !== undefined) setStudyNotes(profileData.parent_study_notes || '');
          if (profileData.parent_weakness_notes !== undefined) setWeaknessNotes(profileData.parent_weakness_notes || '');
          if (profileData.parent_notes_updated_at) {
            setNotesUpdatedAt(new Date(profileData.parent_notes_updated_at).toLocaleDateString());
          }
        }
      } catch (cacheErr) {
        console.warn('Failed to load parent notes from cache:', cacheErr);
      }

      // Load existing parent notes from database
      try {
        const noteRecs = await readQuery(
          `MATCH (s:Student {id: $sid})
           RETURN s.parent_study_notes AS sn, s.parent_weakness_notes AS wn, s.parent_notes_updated_at AS ua`,
          { sid: result.studentId }
        );
        if (noteRecs.length > 0) {
          const record = noteRecs[0];
          const sn = record && typeof record.get === 'function' ? record.get('sn') : (record as any)?.sn;
          const wn = record && typeof record.get === 'function' ? record.get('wn') : (record as any)?.wn;
          const ua = record && typeof record.get === 'function' ? record.get('ua') : (record as any)?.ua;
          setStudyNotes(sn || '');
          setWeaknessNotes(wn || '');
          setNotesUpdatedAt(ua ? new Date(ua.toString()).toLocaleDateString() : null);
        }
      } catch { /* ignore */ }
    } catch (e) {
      Alert.alert('Connection error', 'Could not connect. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!sid) return;
    setSavingNotes(true);
    const updatedDateStr = new Date().toISOString();

    // Save locally to cache first
    try {
      let cached = Platform.OS === 'web'
        ? localStorage.getItem(`profile_cache_${sid}`)
        : await (require('expo-secure-store')).getItemAsync(`profile_cache_${sid}`);
      if (cached) {
        const profileData = JSON.parse(cached);
        profileData.parent_study_notes = studyNotes;
        profileData.parent_weakness_notes = weaknessNotes;
        profileData.parent_notes_updated_at = updatedDateStr;
        const stringified = JSON.stringify(profileData);
        if (Platform.OS === 'web') {
          localStorage.setItem(`profile_cache_${sid}`, stringified);
        } else {
          await (require('expo-secure-store')).setItemAsync(`profile_cache_${sid}`, stringified);
        }
      }
    } catch (cacheErr) {
      console.warn('Failed to cache parent notes locally:', cacheErr);
    }

    try {
      await writeQuery(
        `MATCH (s:Student {id: $sid})
         SET s.parent_study_notes = $studyNotes,
             s.parent_weakness_notes = $weaknessNotes,
             s.parent_notes_updated_at = datetime()`,
        { sid, studyNotes, weaknessNotes }
      );
      setNotesUpdatedAt(new Date().toLocaleDateString());
      Alert.alert('Saved', 'Observations saved. The AI will adapt its tutoring pacing and check-in style accordingly.');
    } catch {
      setNotesUpdatedAt(new Date().toLocaleDateString());
      Alert.alert('Saved Locally', 'Saved observations locally (offline mode).');
    } finally {
      setSavingNotes(false);
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Parent View</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sub, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
          Enter student email and PIN from Profile &gt; Parent access to view academic metrics and private observations.
        </Text>

        {!sid ? (
          <View style={{ marginTop: 8 }}>
            <SectionLabel text="Student email" style={{ marginBottom: 8 }} />
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
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="student@email.com"
              placeholderTextColor={colors.textTertiary}
            />
            
            <SectionLabel text="Parent PIN" style={{ marginBottom: 8, marginTop: 16 }} />
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
              secureTextEntry
              keyboardType="number-pad"
              value={pin}
              onChangeText={setPin}
              placeholder="••••"
              placeholderTextColor={colors.textTertiary}
            />

            <View style={{ marginTop: 24 }}>
              <PrimaryButton
                label={loading ? 'Verifying access...' : 'View Summary'}
                disabled={loading}
                icon={loading ? <ActivityIndicator size="small" color={colors.textTertiary} /> : <Ionicons name="lock-open-outline" size={16} color={colors.textInverse} />}
                onPress={() => void handleUnlock()}
              />
            </View>
          </View>
        ) : (
          <>
            {/* Stats card */}
            <View style={[styles.card, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Ionicons name="stats-chart-outline" size={18} color={colors.accent} />
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary, fontFamily: Fonts.display }}>
                  Study Summary
                </Text>
              </View>
              <Text style={[styles.stats, { color: colors.textSecondary, fontFamily: Fonts.body }]}>{stats}</Text>
            </View>

            {/* Parent Observations — hidden from student */}
            <View style={[styles.card, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle, marginTop: 16 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Ionicons name="eye-off-outline" size={18} color={colors.accent} />
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary, fontFamily: Fonts.display }}>
                  Parent Observations
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.textTertiary, fontFamily: Fonts.body, marginBottom: 16, lineHeight: 18 }}>
                These private inputs are not shown to your child. They help the AI tutor customize instruction style.
              </Text>

              <SectionLabel text="How does your child study?" style={{ marginTop: 8, marginBottom: 8 }} />
              <TextInput
                style={[
                  styles.notesInput, 
                  { 
                    color: colors.textPrimary, 
                    borderColor: colors.borderSubtle, 
                    backgroundColor: colors.surface2,
                    fontFamily: Fonts.body,
                  }
                ]}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                value={studyNotes}
                onChangeText={setStudyNotes}
                placeholder="e.g., Studies only before exams, gets distracted easily, prefers visual learning, needs constant reminders..."
                placeholderTextColor={colors.textTertiary}
              />

              <SectionLabel text="Known weaknesses or concerns" style={{ marginTop: 16, marginBottom: 8 }} />
              <TextInput
                style={[
                  styles.notesInput, 
                  { 
                    color: colors.textPrimary, 
                    borderColor: colors.borderSubtle, 
                    backgroundColor: colors.surface2,
                    fontFamily: Fonts.body,
                  }
                ]}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                value={weaknessNotes}
                onChangeText={setWeaknessNotes}
                placeholder="e.g., Struggles with algebra word problems, avoids Chemistry, gets anxious during timed tests..."
                placeholderTextColor={colors.textTertiary}
              />

              {notesUpdatedAt && (
                <Text style={{ fontSize: 11, color: colors.textTertiary, fontFamily: Fonts.body, marginTop: 12 }}>
                  Last updated: {notesUpdatedAt}
                </Text>
              )}

              <View style={{ marginTop: 16 }}>
                <PrimaryButton
                  label={savingNotes ? 'Saving...' : 'Save Observations'}
                  disabled={savingNotes}
                  icon={savingNotes ? <ActivityIndicator size="small" color={colors.textTertiary} /> : <Ionicons name="save-outline" size={16} color={colors.textInverse} />}
                  onPress={handleSaveNotes}
                />
              </View>
            </View>

            <TouchableOpacity 
              style={{ marginTop: 24, paddingVertical: 8, alignSelf: 'center' }} 
              onPress={() => { setSid(null); setStats(''); setStudyNotes(''); setWeaknessNotes(''); }}
            >
              <Text style={{ color: colors.accentHover, fontFamily: Fonts.displayMedium, fontSize: 14 }}>
                Sign out of Portal
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </AnimatedScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  header: { 
    paddingHorizontal: 20, 
    paddingVertical: 12, 
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
  content: { padding: 20, paddingBottom: 40 },
  sub: { fontSize: 14, lineHeight: 22, marginBottom: 20 },
  input: { 
    borderWidth: StyleSheet.hairlineWidth, 
    borderRadius: Radii.input, 
    padding: 14, 
    fontSize: 15,
  },
  notesInput: { 
    borderWidth: StyleSheet.hairlineWidth, 
    borderRadius: Radii.input, 
    padding: 14, 
    fontSize: 14, 
    minHeight: 80, 
    lineHeight: 20,
  },
  card: { borderRadius: Radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 20 },
  stats: { fontSize: 14, lineHeight: 24 },
});
