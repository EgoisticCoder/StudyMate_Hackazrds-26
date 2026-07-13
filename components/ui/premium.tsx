// Premium UI Components — Shared design system for StudyMate
// Used across all tabs and screens for consistent premium look

import React, { ReactNode, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
  ViewStyle, TextStyle, Platform, StyleProp
} from 'react-native';
import { useTheme } from '../../lib/context';
import { Fonts } from '../../constants/fonts';
import { Radii, Spacing } from '../../constants/colors';

// ── AnimatedScreenWrapper ────────────────────────────────────
// Wraps a screen with a fade-in animation

interface AnimatedScreenWrapperProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedScreenWrapper({ children, style }: AnimatedScreenWrapperProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <Animated.View style={[{ flex: 1, opacity }, style]}>
      {children}
    </Animated.View>
  );
}

// ── ScreenHero ───────────────────────────────────────────────
// Hero header with title, optional subtitle and children

interface ScreenHeroProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export function ScreenHero({ title, subtitle, children }: ScreenHeroProps) {
  const { colors } = useTheme();

  return (
    <View style={heroStyles.container}>
      <Text style={[heroStyles.title, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[heroStyles.subtitle, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
          {subtitle}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

const heroStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
    opacity: 0.7,
  },
});

// ── SectionLabel ─────────────────────────────────────────────
// Small uppercase section heading

interface SectionLabelProps {
  text: string;
  style?: StyleProp<TextStyle>;
}

export function SectionLabel({ text, style }: SectionLabelProps) {
  const { colors } = useTheme();

  return (
    <Text
      style={[
        {
          fontSize: 11,
          fontFamily: Fonts.bodyMedium,
          color: colors.textTertiary,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          marginBottom: 8,
        },
        style,
      ]}
    >
      {text}
    </Text>
  );
}

// ── Chip ─────────────────────────────────────────────────────
// Selectable pill/tag component

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Chip({ label, selected, onPress, disabled, icon, style }: ChipProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[
        chipStyles.chip,
        {
          backgroundColor: selected ? colors.accent + '18' : colors.surface2,
          borderColor: selected ? colors.accent : colors.borderSubtle,
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      {icon ? <View style={{ marginRight: 4 }}>{icon}</View> : null}
      <Text
        style={[
          chipStyles.label,
          {
            color: selected ? colors.accent : colors.textSecondary,
            fontFamily: selected ? Fonts.bodyMedium : Fonts.body,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
  },
});

// ── PrimaryButton ────────────────────────────────────────────
// Full-width primary action button

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  loading?: boolean;
}

export function PrimaryButton({ label, onPress, disabled, icon, style, loading }: PrimaryButtonProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        btnStyles.button,
        {
          backgroundColor: disabled ? colors.textTertiary + '30' : colors.accent,
        },
        style,
      ]}
    >
      {icon ? <View style={{ marginRight: 8 }}>{icon}</View> : null}
      <Text
        style={[
          btnStyles.label,
          {
            color: disabled ? colors.textTertiary : colors.textInverse,
            fontFamily: Fonts.bodyMedium,
          },
        ]}
      >
        {loading ? 'Loading...' : label}
      </Text>
    </TouchableOpacity>
  );
}

const btnStyles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: Radii.button,
    marginTop: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
});

// ── SurfaceCard ──────────────────────────────────────────────
// Elevated card container with subtle border

interface SurfaceCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  delay?: number;
}

export function SurfaceCard({ children, style, onPress, delay }: SurfaceCardProps) {
  const { colors } = useTheme();

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={[
          surfaceStyles.card,
          {
            backgroundColor: colors.surface1,
            borderColor: colors.borderSubtle,
          },
          style,
        ]}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={[
        surfaceStyles.card,
        {
          backgroundColor: colors.surface1,
          borderColor: colors.borderSubtle,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const surfaceStyles = StyleSheet.create({
  card: {
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.cardPaddingLg,
    marginBottom: 12,
  },
});

// ── AnimatedCard ─────────────────────────────────────────────
// Card with fade-in entrance animation

interface AnimatedCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
}

export function AnimatedCard({ children, style, delay = 0 }: AnimatedCardProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, opacity, translateY]);

  return (
    <Animated.View
      style={[
        surfaceStyles.card,
        {
          backgroundColor: colors.surface1,
          borderColor: colors.borderSubtle,
          opacity,
          transform: [{ translateY }],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

// ── EmptyState ───────────────────────────────────────────────
// Placeholder for empty data sections

interface EmptyStateProps {
  icon: ReactNode;
  heading: string;
  body: string;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ icon, heading, body, style }: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={[emptyStyles.container, style]}>
      {icon}
      <Text style={[emptyStyles.heading, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>
        {heading}
      </Text>
      <Text style={[emptyStyles.body, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
        {body}
      </Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  heading: {
    fontSize: 15,
    marginTop: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 18,
  },
});
