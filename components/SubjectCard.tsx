// Subject card component — redesigned for premium dark mode aesthetic
// Left border via nested View pattern, horizontal progress bar, spring animation

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../lib/context';
import { SubjectColors, Radii } from '../constants/colors';
import { Fonts } from '../constants/fonts';
import { BehavioralState } from '../lib/adaptiveEngine';
import { useTranslateSubject } from '../lib/translations';

interface SubjectCardProps {
  name: string;
  icon: string;
  state?: BehavioralState;
  weighted_avg?: number;
  onPress: () => void;
  index?: number;
}

const STATE_BADGES: Record<string, { label: string; color: string; borderOnly?: boolean }> = {
  EMPIRICALLY_WEAK: { label: 'Weak', color: '#EF4444' },
  AVOIDED_AND_WEAK: { label: 'Needs focus', color: '#F59E0B' },       // Changed from "Avoided"
  AVOIDED_BUT_STRONG: { label: 'Review soon', color: '#3B8EF3' },
  ACTIVE_AND_STRONG: { label: 'On Track', color: '#22C55E' },
  INSUFFICIENT_DATA: { label: 'New', color: '#5D5B6E', borderOnly: true },
};

export function SubjectCard({ name, icon, state, weighted_avg, onPress, index = 0 }: SubjectCardProps) {
  const { colors, isDark } = useTheme();
  const translateSubject = useTranslateSubject();
  const displayName = translateSubject(name);

  const subjectColor = isDark
    ? SubjectColors[name]?.dark || colors.accent
    : SubjectColors[name]?.light || colors.accent;

  const badge = state ? STATE_BADGES[state] : STATE_BADGES.INSUFFICIENT_DATA;
  const progress = weighted_avg ?? 0;

  // Animation values
  const cardScale = useRef(new Animated.Value(1)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(16)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;

  // Staggered card entrance
  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: 1, duration: 250, delay: index * 60,
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslateY, {
        toValue: 0, duration: 250, delay: index * 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index]);

  // Spring progress bar animation
  useEffect(() => {
    Animated.spring(progressWidth, {
      toValue: Math.max(progress, 5),
      tension: 180,
      friction: 12,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const handlePressIn = () => {
    Animated.spring(cardScale, {
      toValue: 0.96, tension: 100, friction: 6, useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(cardScale, {
      toValue: 1, tension: 100, friction: 6, useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  // Subject-tinted background: subject color at 6% opacity
  const tintedBg = subjectColor + '0F';  // 0F hex ≈ 6% opacity

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={styles.cardContainer}
    >
      <Animated.View style={[
        styles.cardOuter,
        {
          transform: [{ scale: cardScale }, { translateY: cardTranslateY }],
          opacity: cardOpacity,
        }
      ]}>
        {/* Outer View with borderRadius + overflow hidden clips the left border cleanly */}
        <View style={styles.borderClip}>
          <View style={[
            styles.cardInner,
            {
              backgroundColor: tintedBg,
              borderLeftColor: subjectColor,
            }
          ]}>
            {/* Header: name + icon */}
            <View style={styles.header}>
              <Text
                style={[styles.name, { color: colors.textPrimary, fontFamily: Fonts.displayMedium }]}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              <Ionicons name={icon as any} size={18} color={colors.textTertiary} />
            </View>

            {/* Progress bar */}
            <View style={[styles.progressTrack, { backgroundColor: subjectColor + '26' }]}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: subjectColor,
                    width: progressWidth.interpolate({
                      inputRange: [0, 100],
                      outputRange: ['0%', '100%'],
                      extrapolate: 'clamp',
                    }),
                  }
                ]}
              />
            </View>

            {/* Badge */}
            <View style={[
              styles.badge,
              badge.borderOnly
                ? { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.textTertiary }
                : { backgroundColor: badge.color + '26' }
            ]}>
              <Text style={[
                styles.badgeText,
                { color: badge.borderOnly ? colors.textTertiary : badge.color }
              ]}>
                {badge.label}
              </Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    width: '48%',
    marginBottom: 12,
  },
  cardOuter: {},
  borderClip: {
    borderRadius: Radii.card,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.055)',
  },
  cardInner: {
    borderLeftWidth: 3,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    borderRadius: 1.5,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
