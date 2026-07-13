import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../lib/context';
import { Fonts } from '../constants/fonts';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ScoreCircleProps {
  obtained: number;
  total: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  showPercentage?: boolean;
}

export function ScoreCircle({
  obtained,
  total,
  size = 160,
  strokeWidth = 10,
  label,
  showPercentage = false,
}: ScoreCircleProps) {
  const { colors } = useTheme();
  const percentage = total > 0 ? (obtained / total) * 100 : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const targetOffset = circumference - (percentage / 100) * circumference;

  // Animated ring
  const animatedOffset = useRef(new Animated.Value(circumference)).current;
  // Animated number
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);
  // Fade in
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    // Entrance: fade + scale
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 400,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1, tension: 60, friction: 8, useNativeDriver: true,
      }),
    ]).start();

    // Ring fill
    Animated.timing(animatedOffset, {
      toValue: targetOffset,
      duration: 900,
      delay: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    // Count-up
    Animated.timing(animatedValue, {
      toValue: showPercentage ? percentage : obtained,
      duration: 900,
      delay: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    const listener = animatedValue.addListener(({ value }) => {
      setDisplayValue(Math.round(value * 10) / 10);
    });

    return () => animatedValue.removeListener(listener);
  }, [obtained, total, percentage, targetOffset]);

  const getColor = () => {
    if (percentage >= 75) return colors.success;
    if (percentage >= 50) return colors.warning;
    return colors.danger;
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      <Svg width={size} height={size}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.surface2}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle (animated) */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={getColor()}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={animatedOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[styles.textContainer, { width: size, height: size }]}>
        <Text style={[styles.score, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
          {showPercentage
            ? `${Math.round(displayValue)}%`
            : displayValue % 1 === 0
              ? displayValue.toFixed(0)
              : displayValue.toFixed(1)}
        </Text>
        {!showPercentage && (
          <Text style={[styles.total, { color: colors.textTertiary, fontFamily: Fonts.bodyMedium }]}>
            / {total}
          </Text>
        )}
        {label && (
          <Text style={[styles.label, { color: getColor(), fontFamily: Fonts.displayMedium }]}>{label}</Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontSize: 32,
    letterSpacing: -0.5,
  },
  total: {
    fontSize: 13,
    marginTop: -2,
  },
  label: {
    fontSize: 11,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
