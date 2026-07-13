// STUDY NOTES — Generate revision notes with AI

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator, Animated, Easing,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme, useAuth } from '../../lib/context';
import { buildStudentContext, getStudentProfile } from '../../lib/adaptiveEngine';
import { callSarvam } from '../../lib/ai';
import { writeQuery } from '../../lib/neo4j';
import { SUBJECTS } from '../../constants/subjects';
import { getChaptersForSubject } from '../../constants/chapters';
import { Fonts } from '../../constants/fonts';
import { Radii, Spacing } from '../../constants/colors';
import { SectionLabel, Chip, PrimaryButton, AnimatedCard, AnimatedScreenWrapper } from '../../components/ui/premium';
import { v4 as uuidv4 } from 'uuid';

export default function StudyNotesScreen() {
  const { colors } = useTheme();
  const { studentId } = useAuth();
  const [subject, setSubject] = useState('');
  const [chapter, setChapter] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [board, setBoard] = useState('ICSE');
  const [classNum, setClassNum] = useState(10);
  const [chapters, setChapters] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const profile = await getStudentProfile(studentId);
      if (profile) { setBoard(profile.board); setClassNum(profile.class); }
    })();
  }, [studentId]);

  useEffect(() => {
    if (subject) setChapters(getChaptersForSubject(subject, board, classNum));
  }, [subject, board, classNum]);

  const handleGenerate = async () => {
    if (!subject || !chapter || !studentId) return;
    setLoading(true);
    setNotes('');
    try {
      const context = await buildStudentContext(studentId);
      const result = await callSarvam(
        [
          { role: 'system', content: `You are an expert ${board} tutor. ${context}` },
          {
            role: 'user',
            content: `Generate concise exam revision notes for "${chapter}" in ${subject}, ${board} Class ${classNum}.

Format exactly as:
KEY CONCEPTS:
(5-8 bullet points, each under 20 words)

IMPORTANT FORMULAS / FACTS / DATES:
(list format, each on own line)

EXAMINER FAVOURITES:
(3 most commonly asked question types with brief answer approach)

MEMORY AIDS:
(1-2 mnemonics or memory tricks)

CONNECTION TO YOUR WEAK AREAS:
(based on this student's profile, highlight connections if any exist — skip if none)

Max 400 words total. Dense. No filler.`,
          },
        ],
        'notes_generator'
      );
      setNotes(result);

      // Log study session
      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (ss:StudySession {
           id: $id, subject: $subject, chapter: $chapter,
           duration_mins: 10, session_type: 'notes_review', date: datetime()
         })
         CREATE (s)-[:STUDIED]->(ss)`,
         { studentId, id: uuidv4(), subject, chapter }
      );
    } catch (err: any) {
      setNotes(err.message || 'Failed to generate notes');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(notes);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isButtonDisabled = !subject || !chapter || loading;

  return (
    <AnimatedScreenWrapper style={{ backgroundColor: colors.background }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
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
          <Text style={[styles.title, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Revision Notes</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Subject */}
        <SectionLabel text="Select Subject" style={{ marginBottom: 10, marginTop: 12 }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 4 }}>
            {SUBJECTS.map(s => (
              <Chip
                key={s.name}
                label={s.name}
                selected={subject === s.name}
                onPress={() => {
                  setSubject(s.name);
                  setChapter('');
                }}
              />
            ))}
          </View>
        </ScrollView>

        {/* Chapter */}
        {subject && (
          <View style={{ marginTop: 8 }}>
            <SectionLabel text="Select Chapter" style={{ marginBottom: 10 }} />
            <View style={[styles.chapterList, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}>
              <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }}>
                {chapters.map((ch, chIdx) => {
                  const isSelected = chapter === ch;
                  return (
                    <TouchableOpacity
                      key={ch}
                      style={[
                        styles.chapterItem,
                        {
                          backgroundColor: isSelected ? colors.accentMuted : 'transparent',
                          borderBottomColor: colors.borderSubtle,
                          borderBottomWidth: chIdx === chapters.length - 1 ? 0 : StyleSheet.hairlineWidth,
                        }
                      ]}
                      onPress={() => setChapter(ch)}
                    >
                      <Text style={{ 
                        color: isSelected ? colors.accentHover : colors.textPrimary, 
                        fontFamily: isSelected ? Fonts.bodyMedium : Fonts.body,
                        fontSize: 14 
                      }}>
                        {ch}
                      </Text>
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        )}

        {/* Generate Button */}
        <PrimaryButton
          label={loading ? 'Generating notes...' : 'Generate Notes'}
          disabled={isButtonDisabled}
          icon={
            loading ? (
              <ActivityIndicator size="small" color={colors.textTertiary} />
            ) : (
              <Ionicons 
                name="sparkles" 
                size={16} 
                color={isButtonDisabled ? colors.textTertiary : colors.textInverse} 
              />
            )
          }
          onPress={handleGenerate}
        />

        {/* Notes display */}
        {notes ? (
          <AnimatedCard style={{ marginTop: 24, padding: Spacing.cardPaddingLg }}>
            <View style={styles.notesHeader}>
              <Text style={[styles.notesTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
                {chapter}
              </Text>
              <TouchableOpacity 
                onPress={handleCopy} 
                style={[styles.copyBtn, { backgroundColor: colors.surface2, borderColor: colors.borderSubtle }]}
              >
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={colors.accent} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.notesText, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
              {notes}
            </Text>
          </AnimatedCard>
        ) : null}
      </ScrollView>
    </AnimatedScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, letterSpacing: -0.4 },
  chapterList: { 
    borderWidth: StyleSheet.hairlineWidth, 
    borderRadius: Radii.card, 
    overflow: 'hidden' 
  },
  chapterItem: { 
    padding: 14, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between' 
  },
  notesHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 16 
  },
  notesTitle: { fontSize: 16, flex: 1, marginRight: 12 },
  copyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesText: { fontSize: 14, lineHeight: 22 },
});
