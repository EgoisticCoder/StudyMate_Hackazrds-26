// TranscriptionOverlay — Full-screen animated overlay for STT loading state
// Shows animated waves + status text while Sarvam AI transcribes audio

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  Platform,
  Easing,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/context';
import { Fonts } from '../constants/fonts';



interface TranscriptionOverlayProps {
  visible: boolean;
  statusText?: string;
  subText?: string;
  brandText?: string;
  icon?: string;
}

export function TranscriptionOverlay({
  visible,
  statusText = 'Transcribing with Sarvam AI...',
  subText = 'Processing audio...',
  brandText = 'Powered by Sarvam AI • Saaras v3',
  icon = 'mic',
}: TranscriptionOverlayProps) {
  const { colors } = useTheme();
  const { width: SW } = useWindowDimensions();

  // Pulse animation for the microphone icon
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;
  
  // Wave animations (3 bars)
  const wave1 = useRef(new Animated.Value(0.3)).current;
  const wave2 = useRef(new Animated.Value(0.5)).current;
  const wave3 = useRef(new Animated.Value(0.4)).current;
  const wave4 = useRef(new Animated.Value(0.6)).current;
  const wave5 = useRef(new Animated.Value(0.35)).current;

  // Dot animation
  const dotOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    // Pulse loop
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 1.15, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        ]),
      ])
    );

    // Wave animations
    const createWaveLoop = (anim: Animated.Value, minVal: number, maxVal: number, dur: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: maxVal, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(anim, { toValue: minVal, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ])
      );

    const w1 = createWaveLoop(wave1, 0.2, 0.8, 500);
    const w2 = createWaveLoop(wave2, 0.3, 0.9, 600);
    const w3 = createWaveLoop(wave3, 0.15, 0.85, 450);
    const w4 = createWaveLoop(wave4, 0.25, 0.95, 550);
    const w5 = createWaveLoop(wave5, 0.2, 0.7, 480);

    // Dots pulsing
    const dotLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(dotOpacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ])
    );

    pulseLoop.start();
    w1.start();
    w2.start();
    w3.start();
    w4.start();
    w5.start();
    dotLoop.start();

    return () => {
      pulseLoop.stop();
      w1.stop();
      w2.stop();
      w3.stop();
      w4.stop();
      w5.stop();
      dotLoop.stop();
    };
  }, [visible]);

  if (!visible) return null;

  const WAVE_HEIGHT = 60;
  const BAR_WIDTH = 6;
  const BAR_GAP = 8;

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.container, { backgroundColor: colors.surface1 + 'F5', width: SW * 0.82 }]}>
          {/* Glowing mic icon */}
          <Animated.View
            style={[
              styles.micCircle,
              {
                backgroundColor: colors.accentMuted,
                borderColor: colors.accent + '40',
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              },
            ]}
          >
            <Ionicons name={icon as any} size={32} color={colors.accent} />
          </Animated.View>

          {/* Audio wave bars */}
          <View style={styles.waveContainer}>
            {[wave1, wave2, wave3, wave4, wave5].map((anim, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.waveBar,
                  {
                    backgroundColor: colors.accent,
                    width: BAR_WIDTH,
                    marginHorizontal: BAR_GAP / 2,
                    height: anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [8, WAVE_HEIGHT],
                    }),
                    opacity: anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.4, 1],
                    }),
                  },
                ]}
              />
            ))}
          </View>

          {/* Status text */}
          <Text style={[styles.statusText, { color: colors.textPrimary, fontFamily: Fonts.displayMedium }]}>
            {statusText}
          </Text>

          {/* Loading indicator */}
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Animated.Text
              style={[
                styles.subText,
                {
                  color: colors.textSecondary,
                  fontFamily: Fonts.body,
                  opacity: dotOpacity,
                },
              ]}
            >
              {subText}
            </Animated.Text>
          </View>

          {/* Sarvam AI branding */}
          <Text style={[styles.brandText, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
            {brandText}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    gap: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
      web: {
        boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.25)',
      },
    }),
  },
  micCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 64,
  },
  waveBar: {
    borderRadius: 3,
  },
  statusText: {
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subText: {
    fontSize: 13,
  },
  brandText: {
    fontSize: 11,
    marginTop: 4,
    opacity: 0.7,
    letterSpacing: 0.3,
  },
});
