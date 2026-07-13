// Spaced-style review — surfaces incorrect diagnostic items by chapter
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { readQuery, writeQuery } from '../../lib/neo4j';
import { v4 as uuidv4 } from 'uuid';
import { EmptyState } from '../../components/ui/premium';
import { Fonts } from '../../constants/fonts';
import { ScreenSkeleton } from '../../components/LoadingSkeleton';
import { useTranslateSubject } from '../../lib/translations';

interface ReviewItem {
  subject: string;
  chapter: string;
  snippet: string;
  explanation: string;
}

export default function ReviewDeckScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const translateSubject = useTranslateSubject();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [idx, setIdx] = useState(0);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const recs = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:TOOK_DIAGNOSTIC]->(:DiagnosticRun)-[:HAS_ATTEMPT]->(a:DiagnosticAttempt)
         WHERE a.is_correct = false
         RETURN DISTINCT a.subject AS subject, a.chapter AS chapter,
                collect(a.question_text)[0] AS snippet,
                collect(a.explanation)[0] AS explanation
         LIMIT 24`,
        { studentId }
      );

      const parsed: ReviewItem[] = recs.map(r => {
        const subject = r && typeof r.get === 'function' ? r.get('subject') : (r as any)?.subject;
        const chapter = r && typeof r.get === 'function' ? r.get('chapter') : (r as any)?.chapter;
        const snippet = r && typeof r.get === 'function' ? r.get('snippet') : (r as any)?.snippet;
        const explanation = r && typeof r.get === 'function' ? r.get('explanation') : (r as any)?.explanation;
        return {
          subject: String(subject ?? ''),
          chapter: String(chapter ?? ''),
          snippet: String(snippet ?? '').slice(0, 320),
          explanation: String(explanation ?? '').slice(0, 600),
        };
      });

      setItems(parsed);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const logReview = async (item: ReviewItem) => {
    if (!studentId) return;
    try {
      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (rv:ReviewSession {
           id: $id,
           subject: $subject,
           chapter: $chapter,
           reviewed_at: datetime(),
           source: 'review_deck'
         })
         CREATE (s)-[:COMPLETED_REVIEW]->(rv)`,
        {
          studentId,
          id: uuidv4(),
          subject: item.subject,
          chapter: item.chapter,
        }
      );
    } catch {
      /* ignore */
    }
  };

  // Animations
  const screenFade = React.useRef(new Animated.Value(0)).current;
  const cardFade = React.useRef(new Animated.Value(1)).current;
  const cardSlide = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(screenFade, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [screenFade]);

  // Animate card transition
  React.useEffect(() => {
    cardFade.setValue(0);
    cardSlide.setValue(16);
    Animated.parallel([
      Animated.timing(cardFade, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(cardSlide, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [idx, cardFade, cardSlide]);

  if (loading) return <ScreenSkeleton />;

  const cur = items[idx];

  return (
    <Animated.ScrollView style={[styles.container, { backgroundColor: colors.background, opacity: screenFade }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
  try {
    router.back();
  } catch {
    router.replace('/');
  }
}} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Review Deck</Text>
        <View style={{ width: 32 }} />
      </View>

      <Text style={[styles.sub, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
        Pulled from diagnostic mistakes — revisit weak chapters in short bursts (classic spaced repetition pattern).
      </Text>

      {!items.length ? (
        <EmptyState
          icon={<Ionicons name="albums-outline" size={40} color={colors.textTertiary} />}
          heading="No review items yet"
          body="Take the diagnostic test from Profile, then come back here to review your mistakes."
        />
      ) : (
        <>
          <Text style={[styles.counter, { color: colors.textTertiary, fontFamily: Fonts.bodyMedium }]}>
            Card {idx + 1} / {items.length}
          </Text>

          <Animated.View style={[styles.card, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle, opacity: cardFade, transform: [{ translateY: cardSlide }] }]}>
            <Text style={[styles.meta, { color: colors.accent, fontFamily: Fonts.display }]}>
              {translateSubject(cur.subject).toUpperCase()} • {cur.chapter.toUpperCase()}
            </Text>
            <Text style={[styles.q, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>{cur.snippet || 'Review this chapter concept.'}</Text>
            <TouchableOpacity
              style={[styles.reveal, { backgroundColor: colors.accentMuted }]}
              onPress={() =>
                setExpanded(prev => {
                  const next = { ...prev, [idx]: !prev[idx] };
                  return next;
                })
              }
            >
              <Text style={{ color: colors.accentHover, fontWeight: '700', fontFamily: Fonts.display }}>
                {expanded[idx] ? 'Hide recap' : 'Show recap'}
              </Text>
            </TouchableOpacity>
            {expanded[idx] ? (
              <Text style={[styles.exp, { color: colors.textSecondary, fontFamily: Fonts.body, marginTop: 14 }]}>{cur.explanation}</Text>
            ) : null}
          </Animated.View>

          <View style={styles.nav}>
            <TouchableOpacity
              style={[
                styles.navBtn, 
                { 
                  backgroundColor: 'transparent',
                  borderColor: idx <= 0 ? colors.borderSubtle : colors.borderMedium 
                }
              ]}
              disabled={idx <= 0}
              onPress={() => setIdx(i => Math.max(0, i - 1))}
            >
              <Text style={{ color: idx <= 0 ? colors.textTertiary : colors.textPrimary, fontFamily: Fonts.display }}>Previous</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navBtn, { backgroundColor: colors.accent, borderColor: colors.accent }]}
              onPress={() => {
                void logReview(cur);
                if (idx < items.length - 1) setIdx(i => i + 1);
                else router.back();
              }}
            >
              <Text style={{ color: colors.textInverse, fontWeight: '700', fontFamily: Fonts.display }}>
                {idx < items.length - 1 ? 'Got it — next' : 'Finish'}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: Platform.OS === 'ios' ? 100 : 80 },
  backBtn: { padding: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '600', letterSpacing: -0.4 },
  sub: { fontSize: 14, lineHeight: 22, marginBottom: 20 },
  counter: { fontSize: 13, marginBottom: 10 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 20, marginBottom: 20 },
  meta: { fontSize: 11, letterSpacing: 0.88, marginBottom: 12 },
  q: { fontSize: 17, lineHeight: 26, fontWeight: '600' },
  reveal: { marginTop: 16, padding: 12, borderRadius: 12, alignItems: 'center' },
  exp: { fontSize: 15, lineHeight: 24 },
  nav: { flexDirection: 'row', gap: 12 },
  navBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
