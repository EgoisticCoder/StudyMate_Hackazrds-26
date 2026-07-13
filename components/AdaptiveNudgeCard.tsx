// Adaptive nudge card — AI-generated daily nudge from buildStudentContext()
// Redesigned: streaming text animation, better error handling, accent-muted bg

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../lib/context';
import { buildStudentContext } from '../lib/adaptiveEngine';
import { callSarvam } from '../lib/ai';
import { LoadingSkeleton } from './LoadingSkeleton';
import { Radii } from '../constants/colors';
import { Fonts } from '../constants/fonts';

export function AdaptiveNudgeCard() {
  const { colors } = useTheme();
  const { studentId } = useAuth();
  const [nudge, setNudge] = useState<string | null>(null);
  const [displayedText, setDisplayedText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  
  // Shimmer animation for loading
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (loading) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(shimmerAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [loading]);

  // Streaming text effect — reveal characters progressively
  useEffect(() => {
    if (!nudge) return;
    setDisplayedText('');
    fadeIn.setValue(0);
    Animated.timing(fadeIn, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    
    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      if (idx <= nudge.length) {
        setDisplayedText(nudge.slice(0, idx));
      } else {
        clearInterval(interval);
      }
    }, 18); // ~55 chars/sec for smooth typing feel

    return () => clearInterval(interval);
  }, [nudge]);

  const fetchNudge = async () => {
    if (!studentId) return;
    setLoading(true);
    setError(false);
    setNudge(null);
    setDisplayedText('');
    try {
      const context = await buildStudentContext(studentId);
      const response = await callSarvam(
        [
          {
            role: 'system',
            content: `You are StudyMate AI, an adaptive study assistant. ${context}`,
          },
          {
            role: 'user',
            content:
              'Generate a single, specific, actionable nudge for this student for today. Max 2 sentences. Reference their actual weak subject by name. If they have been inactive, be direct. If they are stressed and studying hard, be warm. Do not be generic.',
          },
        ],
        'ai_nudge'
      );
      setNudge(response.trim());
    } catch (err) {
      console.error('Nudge fetch failed:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNudge();
  }, [studentId]);

  if (loading) {
    return (
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: colors.accentMuted,
            borderColor: colors.accentBorder,
            opacity: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
          },
        ]}
      >
        <View style={styles.header}>
          <Ionicons name="sparkles" size={18} color={colors.accent} />
          <Text style={[styles.headerText, { color: colors.accent, fontFamily: Fonts.bodyMedium }]}>
            AI Nudge
          </Text>
          <View style={styles.loadingDots}>
            <Animated.View
              style={[
                styles.dot,
                {
                  backgroundColor: colors.accent,
                  opacity: shimmerAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1, 0.3] }),
                },
              ]}
            />
            <Animated.View
              style={[
                styles.dot,
                {
                  backgroundColor: colors.accent,
                  opacity: shimmerAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 0.3, 1] }),
                },
              ]}
            />
            <Animated.View
              style={[
                styles.dot,
                {
                  backgroundColor: colors.accent,
                  opacity: shimmerAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.6, 0.3] }),
                },
              ]}
            />
          </View>
        </View>
        <LoadingSkeleton width="90%" height={14} />
        <LoadingSkeleton width="70%" height={14} style={{ marginTop: 8 }} />
      </Animated.View>
    );
  }

  if (error) {
    return (
      <TouchableOpacity
        style={[styles.container, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}
        onPress={() => { setRetryCount(c => c + 1); fetchNudge(); }}
      >
        <View style={styles.errorRow}>
          <Ionicons name="refresh-outline" size={20} color={colors.textTertiary} />
          <Text style={[styles.errorText, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
            {retryCount > 1 ? 'AI is still loading — tap to try again' : 'AI is taking too long — tap to retry'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.accentMuted,
          borderColor: colors.accentBorder,
          opacity: fadeIn,
        },
      ]}
    >
      <View style={styles.header}>
        <Ionicons name="sparkles" size={18} color={colors.accent} />
        <Text style={[styles.headerText, { color: colors.accent, fontFamily: Fonts.bodyMedium }]}>
          AI Nudge
        </Text>
      </View>
      <Text style={[styles.nudgeText, { color: colors.textPrimary, fontFamily: Fonts.body }]}>
        {displayedText}
        {displayedText.length < (nudge?.length || 0) && (
          <Text style={{ color: colors.accent }}>▍</Text>
        )}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  headerText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  loadingDots: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 'auto',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  nudgeText: {
    fontSize: 14,
    lineHeight: 22.4,
    fontWeight: '400',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    marginLeft: 8,
  },
});

