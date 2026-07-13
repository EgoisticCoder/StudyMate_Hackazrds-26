// Step 1 — Identity: Name, School, Class, Board

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../../lib/context';
import { CLASS_OPTIONS, BOARD_OPTIONS } from '../../constants/subjects';
import { useSignupDraft } from '../../lib/signupDraft';

export default function Step1Identity() {
  const { colors } = useTheme();
  const { setEmail, setPassword, email: draftEmail, password: draftPassword } = useSignupDraft();
  const [email, setEmailLocal] = useState(draftEmail);
  const [password, setPasswordLocal] = useState(draftPassword);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [board, setBoard] = useState<'ICSE' | 'CBSE' | null>(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordOk = password.length >= 8;
  const confirmOk = password === confirmPassword && password.length > 0;
  const isValid =
    emailOk &&
    passwordOk &&
    confirmOk &&
    name.trim() &&
    school.trim() &&
    selectedClass &&
    board;

  const handleNext = () => {
    if (!isValid) return;
    setEmail(email.trim());
    setPassword(password);
    // Pass non-sensitive profile fields via params through onboarding
    router.push({
      pathname: '/(onboarding)/step2-ambition',
      params: {
        name: name.trim(),
        school: school.trim(),
        class: String(selectedClass),
        board: board!,
      },
    });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Progress indicator */}
        <View style={styles.progressRow}>
          {[1, 2, 3, 4, 5, 6].map(step => (
            <View
              key={step}
              style={[
                styles.progressDot,
                {
                  backgroundColor: step === 1 ? colors.primary : colors.border,
                  width: step === 1 ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>

        <Text style={[styles.step, { color: colors.textTertiary }]}>STEP 1 OF 6</Text>
        <Text style={[styles.title, { color: colors.text }]}>Tell us about yourself</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          This helps us personalize your learning experience
        </Text>

        {/* Account */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Email</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="student@email.com"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={t => {
            setEmailLocal(t);
          }}
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>Password</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="At least 8 characters"
          placeholderTextColor={colors.textTertiary}
          secureTextEntry
          value={password}
          onChangeText={setPasswordLocal}
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>Confirm password</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="Repeat password"
          placeholderTextColor={colors.textTertiary}
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />

        {/* Name */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Student name</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="Enter your full name"
          placeholderTextColor={colors.textTertiary}
          value={name}
          onChangeText={setName}
          autoFocus
        />

        {/* School */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>School Name</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="Enter your school name"
          placeholderTextColor={colors.textTertiary}
          value={school}
          onChangeText={setSchool}
        />

        {/* Class */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Class</Text>
        <View style={styles.pillRow}>
          {CLASS_OPTIONS.map(c => (
            <TouchableOpacity
              key={c}
              style={[
                styles.classPill,
                {
                  backgroundColor: selectedClass === c ? colors.primary : colors.surface,
                  borderColor: selectedClass === c ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setSelectedClass(c)}
            >
              <Text
                style={[
                  styles.classPillText,
                  { color: selectedClass === c ? colors.onPrimary : colors.text },
                ]}
              >
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Board */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Board</Text>
        <View style={styles.boardRow}>
          {BOARD_OPTIONS.map(b => (
            <TouchableOpacity
              key={b}
              style={[
                styles.boardPill,
                {
                  backgroundColor: board === b ? colors.primary : colors.surface,
                  borderColor: board === b ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setBoard(b)}
            >
              <Text
                style={[
                  styles.boardPillText,
                  { color: board === b ? colors.onPrimary : colors.text },
                ]}
              >
                {b}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Next button */}
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: isValid ? colors.primary : colors.surfaceContainerHigh }]}
          onPress={handleNext}
          disabled={!isValid}
        >
          <Text style={[styles.nextText, { color: isValid ? colors.onPrimary : colors.textTertiary }]}>
            Continue
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 60 },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 32, alignItems: 'center' },
  progressDot: { height: 5, borderRadius: 3 },
  step: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 8, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 32 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 8, marginTop: 20, letterSpacing: 0.5, textTransform: 'uppercase' },
  input: {
    borderWidth: 1, borderRadius: 12, padding: 16,
    fontSize: 16, fontWeight: '400',
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  classPill: {
    width: 52, height: 52, borderRadius: 12, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  classPillText: { fontSize: 16, fontWeight: '700' },
  boardRow: { flexDirection: 'row', gap: 12 },
  boardPill: {
    flex: 1, paddingVertical: 20, borderRadius: 12, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  boardPillText: { fontSize: 18, fontWeight: '700' },
  nextBtn: {
    marginTop: 40, paddingVertical: 18, borderRadius: 14,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#070235', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12, shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
      web: {
        boxShadow: '0px 4px 12px rgba(7, 2, 53, 0.12)',
      },
    }),
  },
  nextText: { fontSize: 16, fontWeight: '700' },
});
