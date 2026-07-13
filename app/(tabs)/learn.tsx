import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Animated, Easing, Platform, TouchableOpacity, Text } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { useT } from '../../lib/translations';
import { getSubjectStates, SubjectState } from '../../lib/adaptiveEngine';
import { SUBJECTS } from '../../constants/subjects';
import { SubjectCard } from '../../components/SubjectCard';
import { ScreenSkeleton } from '../../components/LoadingSkeleton';
import { ScreenHero, AnimatedScreenWrapper, SectionLabel } from '../../components/ui/premium';
import { Fonts } from '../../constants/fonts';

export default function LearnScreen() {
  const { colors } = useTheme();
  const { studentId } = useAuth();
  const tr = useT();
  const [states, setStates] = useState<SubjectState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      try { setStates(await getSubjectStates(studentId)); }
      catch (err) { console.error('Failed to load subject states:', err); }
      finally { setLoading(false); }
    })();
  }, [studentId]);

  if (loading) return <ScreenSkeleton />;

  const getSubjectState = (name: string) => states.find(s => s.subject === name);

  return (
    <AnimatedScreenWrapper>
      <ScrollView
        style={[st.container, { backgroundColor: colors.background }]}
        contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHero title={tr('subjects')} subtitle={tr('subjects_sub')} />

        {/* Quick Notes AI Tools section */}
        <View style={st.toolsContainer}>
          <SectionLabel text="ACTIVE NOTES AI TOOLS" style={{ marginLeft: 16, marginBottom: 8 }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.toolsScroll}>
            {[
              { label: 'Upload Note', icon: 'camera-outline', route: '/screens/NotesUploadScreen', color: colors.accent },
              { label: 'My Notes', icon: 'document-text-outline', route: '/screens/NotesViewerScreen', color: colors.info },
              { label: 'Ask Notes RAG', icon: 'chatbubbles-outline', route: '/screens/NotesRAGScreen', color: colors.success },
              { label: 'Mind Maps', icon: 'git-network-outline', route: '/screens/MindMapScreen', color: '#8B5CF6' },
              { label: 'Flashcards', icon: 'copy-outline', route: '/screens/FlashcardsScreen', color: colors.warning },
            ].map(tool => (
              <TouchableOpacity
                key={tool.label}
                onPress={() => router.push(tool.route as any)}
                style={[st.toolCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}
              >
                <View style={[st.toolIconBg, { backgroundColor: tool.color + '15' }]}>
                  <Ionicons name={tool.icon as any} size={20} color={tool.color} />
                </View>
                <Text style={[st.toolLabel, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>
                  {tool.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <SectionLabel text="SUBJECT ANALYTICS & DRILL" style={{ marginLeft: 16, marginBottom: 4 }} />
        <View style={st.grid}>
          {SUBJECTS.map((subject, index) => {
            const state = getSubjectState(subject.name);
            return (
              <SubjectCard
                key={subject.name}
                name={subject.name}
                icon={subject.icon}
                index={index}
                state={state?.state}
                weighted_avg={state?.weighted_avg}
                onPress={() => router.push({ pathname: '/screens/ChapterDetailScreen', params: { subject: subject.name } })}
              />
            );
          })}
        </View>
      </ScrollView>
    </AnimatedScreenWrapper>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: Platform.OS === 'ios' ? 120 : 96 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', padding: 16, paddingTop: 8 },
  toolsContainer: {
    marginBottom: 20,
    marginTop: 8,
  },
  toolsScroll: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
  },
  toolCard: {
    width: 120,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: 10,
  },
  toolIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
});
