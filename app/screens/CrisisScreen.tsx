// Crisis screen — Full screen crisis resources
import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform, Animated, Easing } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/context';
import { ICALL_HELPLINE } from '../../lib/stressDetection';
import { Fonts } from '../../constants/fonts';
import { Radii } from '../../constants/colors';
import { SectionLabel, AnimatedScreenWrapper } from '../../components/ui/premium';

export default function CrisisScreen() {
  const { colors } = useTheme();
  const heartScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.spring(heartScale, { toValue: 1, tension: 50, friction: 6, useNativeDriver: true }).start();
  }, []);

  return (
    <AnimatedScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.View style={{ transform: [{ scale: heartScale }], marginBottom: 20 }}>
        <Ionicons name="heart" size={64} color={colors.danger} />
      </Animated.View>
      
      <Text style={[styles.title, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
        You are not alone
      </Text>
      <Text style={[styles.message, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
        It is okay to not feel okay. Stress during studies is common, but when it
        becomes overwhelming, talking to someone really helps.
      </Text>

      <TouchableOpacity
        style={[styles.callBtn, { backgroundColor: colors.danger }]}
        onPress={() => Linking.openURL(`tel:${ICALL_HELPLINE}`)}
        activeOpacity={0.8}
      >
        <Ionicons name="call" size={20} color="#FFF" />
        <Text style={[styles.callText, { fontFamily: Fonts.display }]}>Call iCall: {ICALL_HELPLINE}</Text>
      </TouchableOpacity>

      <Text style={[styles.callNote, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
        Free, confidential helpline. Mon-Sat, 8AM-10PM.{"\n"}
        Trained counselors who understand student stress.
      </Text>

      <View style={{ width: '100%', marginTop: 8 }}>
        <SectionLabel text="Other things that help" style={{ marginBottom: 12 }} />
        <View style={[styles.tipsCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
          {[
            'Talk to a parent or guardian',
            'Speak to a teacher you trust',
            'Write down what you are feeling',
            'Take a walk outside',
            'Remember: exams are important, but your health comes first',
          ].map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <Text style={{ color: colors.accent, marginRight: 8, fontSize: 14 }}>•</Text>
              <Text style={[styles.tipText, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
                {tip}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <TouchableOpacity 
        style={[styles.backBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]} 
        onPress={() => {
  try {
    router.back();
  } catch {
    router.replace('/');
  }
}}
      >
        <Text style={[styles.backText, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
          Go Back
        </Text>
      </TouchableOpacity>
    </AnimatedScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, 
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    alignItems: 'center',
  },
  title: { fontSize: 24, marginBottom: 12, textAlign: 'center' },
  message: { fontSize: 15, lineHeight: 24, textAlign: 'center', marginBottom: 28 },
  callBtn: {
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 10,
    paddingHorizontal: 28, 
    paddingVertical: 16,
    borderRadius: Radii.button, 
    marginBottom: 12, 
    width: '100%', 
    justifyContent: 'center',
  },
  callText: { color: '#FFF', fontSize: 16 },
  callNote: { fontSize: 12, textAlign: 'center', marginBottom: 24, lineHeight: 18 },
  tipsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.card,
    padding: 16,
    gap: 10,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  backBtn: {
    marginTop: 32, 
    paddingHorizontal: 28, 
    paddingVertical: 12,
    borderRadius: Radii.button, 
    borderWidth: StyleSheet.hairlineWidth,
  },
  backText: { fontSize: 14 },
});
