import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform, Animated
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/context';
import { getNotes, Note } from '../../lib/notesDB';
import { callSarvamWithRetry, truncateForPrompt, parseSarvamJSON } from '../../lib/ai';
import { Fonts } from '../../constants/fonts';
import { Radii } from '../../constants/colors';
import { AnimatedScreenWrapper, PrimaryButton } from '../../components/ui/premium';
import { useTranslateSubject } from '../../lib/translations';

interface Flashcard {
  id: string;
  question: string;
  answer: string;
}

export default function FlashcardsScreen() {
  const { colors } = useTheme();
  const translateSubject = useTranslateSubject();
  const params = useLocalSearchParams<{ noteId?: string; noteText?: string; title?: string }>();

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [notesList, setNotesList] = useState<Note[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set(params.noteId ? [params.noteId] : []));
  
  // Flashcard states
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [score, setScore] = useState({ gotIt: 0, reviewLater: 0 });
  const [showSummary, setShowSummary] = useState(false);

  // Card Flip Animation references
  const flipAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const allNotes = await getNotes();
      setNotesList(allNotes);

      if (params.noteId) {
        setSelectedNoteIds(new Set([params.noteId]));
      }

      // If we were navigated here directly with note text (e.g. from the Notes
      // Viewer "Flashcards" button), the manual selector is hidden, so we must
      // kick off generation ourselves instead of leaving the screen blank.
      if (params.noteText) {
        generateFlashcards(params.noteText, params.title || 'Notes');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.noteId, params.noteText, params.title]);

  const generateFlashcards = async (text: string, title: string) => {
    setLoading(true);
    setErrorMsg('');
    setFlipped(false);
    flipAnim.setValue(0);
    setCurrentIndex(0);
    setShowSummary(false);
    setScore({ gotIt: 0, reviewLater: 0 });
    
    try {
      const sysPrompt = `You are a helpful study revision assistant. 
Extract key revision Q&A flashcards from the study notes provided.
Return ONLY a valid JSON array of objects representing the flashcards. Do NOT wrap your response in markdown code blocks like \`\`\`json. Return RAW JSON only. Do not write explanations.

JSON format MUST exactly match this schema:
[
  {
    "id": "1",
    "question": "What is Newton's First Law?",
    "answer": "An object remains in a state of rest or uniform motion unless acted upon by an external force."
  },
  {
    "id": "2",
    "question": "Define Inertia.",
    "answer": "The tendency of an object to resist changes in its state of motion."
  }
]`;

      const prompt = `Extract exactly 5 to 8 structured revision Q&A flashcards for the notes titled "${title}".
Notes Content:
"""
${truncateForPrompt(text)}
"""`;

      const response = await callSarvamWithRetry(
        [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: prompt }
        ],
        'notes_generator'
      );

      const parsed = parseSarvamJSON<Flashcard[]>(response);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setCards(parsed);
      } else {
        throw new Error('Empty or invalid flashcard data');
      }
    } catch (e: any) {
      console.error('Flashcard generation error:', e);
      setErrorMsg(e.message || 'Generation failed');
      setCards([]);
      Alert.alert(
        'Generation Failed',
        e.message?.includes('API')
          ? 'Your AI API key may not be configured. Go to Profile → Settings to add your Sarvam API key.'
          : 'Could not generate flashcards. Check your connection and try again.',
        [
          { text: 'Retry', onPress: () => generateFlashcards(text, title) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  const handleToggleNote = (id: string) => {
    setSelectedNoteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerateFromSelected = () => {
    const selected = notesList.filter(n => selectedNoteIds.has(n.id));
    if (selected.length === 0) return;
    const combinedText = selected.map(n => n.transcription).join('\n\n---\n\n');
    const title = selected.length === 1 ? selected[0].chapter : `${selected.length} Combined Notes`;
    generateFlashcards(combinedText, title);
  };

  const handleFlip = () => {
    const toValue = flipped ? 0 : 180;
    Animated.timing(flipAnim, {
      toValue,
      duration: 300,
      useNativeDriver: true,
    }).start();
    setFlipped(!flipped);
  };

  const handleGotIt = () => {
    setScore(prev => ({ ...prev, gotIt: prev.gotIt + 1 }));
    nextCard();
  };

  const handleReviewLater = () => {
    setScore(prev => ({ ...prev, reviewLater: prev.reviewLater + 1 }));
    nextCard();
  };

  const nextCard = () => {
    // Return card to front state before transition
    if (flipped) {
      handleFlip();
      // Wait for flip back animation to complete before changing card
      setTimeout(() => {
        if (currentIndex < cards.length - 1) {
          setCurrentIndex(prev => prev + 1);
        } else {
          setShowSummary(true);
        }
      }, 300);
    } else {
      if (currentIndex < cards.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        setShowSummary(true);
      }
    }
  };

  // Card Flip Interpolations
  const frontInterpolate = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });

  const backInterpolate = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['180deg', '360deg'],
  });

  const frontAnimatedStyle = {
    transform: [{ rotateY: frontInterpolate }]
  };

  const backAnimatedStyle = {
    transform: [{ rotateY: backInterpolate }]
  };

  return (
    <AnimatedScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.headerArea}>
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
          AI Flashcards
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Select Note Selector (if not navigated from viewer) */}
      {!params.noteText && notesList.length > 0 && !showSummary && (
        <View style={styles.selectorContainer}>
          <Text style={[styles.selectorLabel, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>
            Select Notes (tap to toggle, then Generate):
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorScroll}>
            {notesList.map(n => (
              <TouchableOpacity
                key={n.id}
                onPress={() => handleToggleNote(n.id)}
                style={[
                  styles.selectChip,
                  {
                    backgroundColor: selectedNoteIds.has(n.id) ? colors.accentMuted : colors.surface1,
                    borderColor: selectedNoteIds.has(n.id) ? colors.accentBorder : colors.borderSubtle
                  }
                ]}
              >
                <Text style={{ 
                  color: selectedNoteIds.has(n.id) ? colors.accentHover : colors.textSecondary,
                  fontSize: 12,
                  fontFamily: Fonts.bodyMedium
                }}>
                  {selectedNoteIds.has(n.id) ? '✓ ' : ''}{translateSubject(n.subject)} • {n.chapter}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {selectedNoteIds.size > 0 && (
            <TouchableOpacity
              onPress={handleGenerateFromSelected}
              style={[styles.generateBtn, { backgroundColor: colors.accent, marginTop: 10 }]}
            >
              <Ionicons name="sparkles" size={14} color={colors.textInverse} />
              <Text style={{ color: colors.textInverse, fontFamily: Fonts.bodyMedium, fontSize: 12 }}>
                Generate from {selectedNoteIds.size} note{selectedNoteIds.size > 1 ? 's' : ''}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium, marginTop: 12 }}>
            Extracting core questions...
          </Text>
        </View>
      ) : showSummary ? (
        /* Summary view */
        <View style={styles.summaryContainer}>
          <Ionicons name="checkmark-done-circle" size={80} color={colors.success} />
          <Text style={[styles.summaryTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
            Deck Completed!
          </Text>
          <Text style={[styles.summaryText, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
            Spaced repetition logs updated. Keep repeating to strengthen recall.
          </Text>

          <View style={[styles.statsBox, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
            <View style={styles.statRow}>
              <Text style={{ color: colors.success, fontFamily: Fonts.bodyMedium }}>Got it first try:</Text>
              <Text style={{ color: colors.textPrimary, fontFamily: Fonts.displayMedium }}>{score.gotIt} cards</Text>
            </View>
            <View style={[styles.statRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle, paddingTop: 10, marginTop: 10 }]}>
              <Text style={{ color: colors.warning, fontFamily: Fonts.bodyMedium }}>Needs review later:</Text>
              <Text style={{ color: colors.textPrimary, fontFamily: Fonts.displayMedium }}>{score.reviewLater} cards</Text>
            </View>
          </View>

          <PrimaryButton
            label="Restart Deck"
            onPress={() => {
              setShowSummary(false);
              setCurrentIndex(0);
              setScore({ gotIt: 0, reviewLater: 0 });
            }}
          />

          <TouchableOpacity
            style={[styles.backSelectorBtn, { borderColor: colors.borderSubtle }]}
            onPress={() => {
  try {
    router.back();
  } catch {
    router.replace('/');
  }
}}
          >
            <Text style={{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium }}>
              Back to Study
            </Text>
          </TouchableOpacity>
        </View>
      ) : cards.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="copy-outline" size={64} color={colors.textTertiary} />
          <Text style={{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium, marginTop: 12 }}>
            No Flashcards Generated
          </Text>
          <Text style={{ color: colors.textTertiary, fontFamily: Fonts.body, fontSize: 13, marginTop: 4, textAlign: 'center', paddingHorizontal: 40 }}>
            Select a study note or upload one to generate flashcards.
          </Text>
        </View>
      ) : (
        /* Active Cards view */
        <View style={styles.deckContainer}>
          {/* Progress Bar */}
          <View style={styles.progressHeader}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: Fonts.bodyMedium }}>
              Card {currentIndex + 1} of {cards.length}
            </Text>
            <View style={[styles.progressBarTrack, { backgroundColor: colors.surface1 }]}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { 
                    width: `${((currentIndex + 1) / cards.length) * 100}%`,
                    backgroundColor: colors.accent 
                  }
                ]} 
              />
            </View>
          </View>

          {/* Flashcard with 3D Flip */}
          <TouchableOpacity activeOpacity={0.9} onPress={handleFlip} style={styles.cardContainer}>
            {/* Front Card */}
            <Animated.View 
              style={[
                styles.card,
                frontAnimatedStyle,
                { 
                  backgroundColor: colors.surface1, 
                  borderColor: colors.borderSubtle,
                  backfaceVisibility: 'hidden'
                }
              ]}
            >
              <Text style={[styles.cardTag, { color: colors.accent, fontFamily: Fonts.bodyMedium }]}>
                QUESTION
              </Text>
              <Text style={[styles.cardContentText, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
                {cards[currentIndex].question}
              </Text>
              <Text style={[styles.tapHint, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
                Tap card to reveal answer
              </Text>
            </Animated.View>

            {/* Back Card */}
            <Animated.View 
              style={[
                styles.card,
                styles.cardBack,
                backAnimatedStyle,
                { 
                  backgroundColor: colors.surface2, 
                  borderColor: colors.accentBorder,
                  backfaceVisibility: 'hidden'
                }
              ]}
            >
              <Text style={[styles.cardTag, { color: colors.success, fontFamily: Fonts.bodyMedium }]}>
                ANSWER
              </Text>
              <Text style={[styles.cardContentText, { color: colors.textPrimary, fontFamily: Fonts.body, fontSize: 16, lineHeight: 24 }]}>
                {cards[currentIndex].answer}
              </Text>
              <Text style={[styles.tapHint, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
                Tap card to view question
              </Text>
            </Animated.View>
          </TouchableOpacity>

          {/* Spaced Repetition Actions */}
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
              onPress={handleReviewLater}
              style={[styles.actionBtn, { backgroundColor: colors.surface1, borderColor: colors.warning }]}
            >
              <Ionicons name="refresh" size={20} color={colors.warning} />
              <Text style={[styles.actionBtnText, { color: colors.warning, fontFamily: Fonts.bodyMedium }]}>
                Review Later
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleGotIt}
              style={[styles.actionBtn, { backgroundColor: colors.accent, borderColor: 'transparent' }]}
            >
              <Ionicons name="checkmark" size={20} color={colors.textInverse} />
              <Text style={[styles.actionBtnText, { color: colors.textInverse, fontFamily: Fonts.display }]}>
                Got It!
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </AnimatedScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  headerArea: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    marginBottom: 8 
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, letterSpacing: -0.4, fontWeight: '600' },
  selectorContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  selectorLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  selectorScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  selectChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  deckContainer: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
    paddingBottom: 40,
  },
  progressHeader: {
    marginTop: 10,
    marginBottom: 20,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  cardContainer: {
    flex: 1,
    minHeight: 320,
    position: 'relative',
    marginBottom: 24,
  },
  card: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardBack: {
    borderWidth: 1.5,
  },
  cardTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  cardContentText: {
    fontSize: 20,
    lineHeight: 28,
    textAlign: 'center',
    marginVertical: 40,
  },
  tapHint: {
    fontSize: 11,
    opacity: 0.8,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 52,
    borderRadius: Radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  actionBtnText: {
    fontSize: 14,
  },
  summaryContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingBottom: 40,
  },
  summaryTitle: {
    fontSize: 22,
    marginTop: 16,
    fontWeight: '600',
  },
  summaryText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    marginBottom: 24,
  },
  statsBox: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 24,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backSelectorBtn: {
    marginTop: 12,
    height: 52,
    width: '100%',
    borderRadius: Radii.button,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
});
