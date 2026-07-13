// Crisis card component — shown when stress is at crisis level
// Redesigned: surface2 bg, danger left-border, nested View pattern

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/context';
import { ICALL_HELPLINE } from '../lib/stressDetection';
import { Radii } from '../constants/colors';
import { Fonts } from '../constants/fonts';

export function CrisisCard() {
  const { colors } = useTheme();

  const handleCall = () => {
    Linking.openURL(`tel:${ICALL_HELPLINE}`);
  };

  return (
    <View style={[styles.outerClip, { borderColor: colors.borderSubtle }]}>
      <View style={[styles.inner, { backgroundColor: colors.surface2, borderLeftColor: colors.danger }]}>
        <View style={styles.header}>
          <Ionicons name="heart" size={20} color={colors.danger} />
          <Text style={[styles.title, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
            We're here for you
          </Text>
        </View>

        <Text style={[styles.message, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
          You've had a tough few days. It's okay to not be okay. Consider talking 
          to someone you trust — a parent, teacher, or counselor.
        </Text>

        <TouchableOpacity style={[styles.callBtn, { backgroundColor: colors.danger }]} onPress={handleCall}>
          <Ionicons name="call" size={18} color="#FFF" />
          <Text style={[styles.callText, { fontFamily: Fonts.displayMedium }]}>
            Call iCall: {ICALL_HELPLINE}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.helpNote, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
          iCall is a free, confidential helpline staffed by trained counselors who 
          understand student stress. Available Mon-Sat, 8AM-10PM.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerClip: {
    borderRadius: Radii.card,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  inner: {
    borderLeftWidth: 3,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  message: {
    fontSize: 14,
    lineHeight: 22.4,
    marginBottom: 16,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radii.button,
    marginBottom: 12,
  },
  callText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  helpNote: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
