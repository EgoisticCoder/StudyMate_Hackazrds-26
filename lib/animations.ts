// Shared animation utilities for Stitch design system
// All screens use these hooks for consistent entrance/interaction animations

import { useRef, useEffect, useCallback } from 'react';
import { Animated, Easing } from 'react-native';

// ─── Spring config ───────────────────────────────────────────────────
export const SPRING = {
  press: { tension: 100, friction: 6, useNativeDriver: true },
  bounce: { tension: 120, friction: 7, useNativeDriver: true },
  gentle: { tension: 80, friction: 8, useNativeDriver: true },
  progress: { tension: 180, friction: 12, useNativeDriver: false },
  cardHover: { tension: 100, friction: 8, useNativeDriver: true },
} as const;

export const TIMING = {
  fast: 150,
  normal: 250,
  slow: 500,
  entrance: 200,
} as const;

// ─── useFadeIn ───────────────────────────────────────────────────────
// Opacity 0→1 with optional delay
export function useFadeIn(delay = 0) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 1,
        duration: TIMING.entrance,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, opacity]);

  return opacity;
}

// ─── useSlideUp ──────────────────────────────────────────────────────
// TranslateY 24→0 + opacity 0→1 with delay
export function useSlideUp(delay = 0) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: TIMING.entrance,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: TIMING.entrance,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, opacity, translateY]);

  return { opacity, transform: [{ translateY }] };
}

// ─── useStaggeredList ────────────────────────────────────────────────
// Returns array of { opacity, transform } for N items, each delayed by stagger
export function useStaggeredList(count: number, baseDelay = 80) {
  const animsRef = useRef<{ opacity: Animated.Value; translateY: Animated.Value }[]>([]);

  while (animsRef.current.length < count) {
    animsRef.current.push({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(20),
    });
  }
  const anims = animsRef.current;

  useEffect(() => {
    const animations = anims.slice(0, count).map((anim, i) =>
      Animated.parallel([
        Animated.timing(anim.opacity, {
          toValue: 1,
          duration: TIMING.normal,
          delay: i * baseDelay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(anim.translateY, {
          toValue: 0,
          duration: TIMING.normal,
          delay: i * baseDelay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );
    Animated.parallel(animations).start();
  }, [count, baseDelay]);

  return anims.slice(0, count).map(a => ({
    opacity: a.opacity,
    transform: [{ translateY: a.translateY }],
  }));
}

// ─── useSpringScale ──────────────────────────────────────────────────
// Returns { scale, onPressIn, onPressOut }
export function useSpringScale(toValue = 0.96) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = useCallback(() => {
    Animated.spring(scale, { toValue, ...SPRING.press }).start();
  }, [scale, toValue]);

  const onPressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, ...SPRING.press }).start();
  }, [scale]);

  return { scale, onPressIn, onPressOut };
}

// ─── usePulse ────────────────────────────────────────────────────────
// Continuous pulse animation (for loading dots, mic indicators, etc.)
export function usePulse(minOpacity = 0.4, maxOpacity = 1, duration = 1200) {
  const anim = useRef(new Animated.Value(minOpacity)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: maxOpacity,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: minOpacity,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, minOpacity, maxOpacity, duration]);

  return anim;
}

// ─── useCountUp ──────────────────────────────────────────────────────
// Animate a number from 0 to target (for score reveals)
export function useCountUp(target: number, duration = 800, delay = 200) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(anim, {
        toValue: target,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false, // needed for text interpolation
      }).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [target, duration, delay, anim]);

  return anim;
}

// ─── useShimmer ──────────────────────────────────────────────────────
// Shimmer effect for skeleton loading
export function useShimmer() {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });
}
