import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { authenticateStudent } from '../../lib/studentAuth';
import { initNeo4j } from '../../lib/neo4j';

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const { setStudentId } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const buttonScale = useRef(new Animated.Value(1)).current;

  const animateButton = () => {
    Animated.sequence([
      Animated.timing(buttonScale, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.timing(buttonScale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Enter your registered email and password.');
      return;
    }
    animateButton();
    setLoading(true);
    try {
      await initNeo4j();
      const session = await authenticateStudent(email, password);
      if (!session) {
        Alert.alert(
          'Account not found',
          'No account found with this email and password. Please check your credentials or create a new account.',
          [
            { text: 'Try Again', style: 'cancel' },
            { text: 'Create Account', onPress: () => router.push('/(onboarding)/step1-identity') },
          ]
        );
        return;
      }
      await setStudentId(session.id);
      router.replace('/(tabs)');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not connect. Check your internet connection and Neo4j settings.';
      if (msg.includes('Neo4j') || msg.includes('connect')) {
        Alert.alert('Connection error', 'Could not connect to the database. Please check your internet connection and try again.');
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const goSignup = () => {
    router.push('/(onboarding)/step1-identity');
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero gradient header */}
        <LinearGradient
          colors={isDark ? ['#1E1B4B', '#0F0E1A'] : ['#E0E7FF', '#F9F9FF']}
          style={styles.heroGradient}
        >
          <Image
            source={require('../../assets/logo_dark-removebg-preview.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={[styles.brand, { color: isDark ? '#E3DFFF' : '#070235' }]}>StudyMate AI</Text>
          <Text style={[styles.brandSub, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(7,2,53,0.45)' }]}>
            Your personal learning companion
          </Text>
        </LinearGradient>

        <View style={styles.formContainer}>
          <Text style={[styles.title, { color: colors.text }]}>Welcome back</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            Sign in to continue your learning journey
          </Text>

          {/* Email input with icon */}
          <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Ionicons name="mail-outline" size={18} color={colors.textTertiary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="you@school.edu"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          {/* Password input with icon and toggle */}
          <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textTertiary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.text, flex: 1 }]}
              placeholder="••••••••"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* Login button */}
          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <TouchableOpacity
              style={[styles.primary, { backgroundColor: colors.primary }]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <View style={styles.btnContent}>
                  <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Log in</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.onPrimary} />
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.textTertiary }]}>or</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* Sign up */}
          <TouchableOpacity
            style={[styles.secondary, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={goSignup}
            activeOpacity={0.7}
          >
            <Text style={[styles.secondaryText, { color: colors.primary }]}>
              New student? Create an account
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1 },
  heroGradient: {
    paddingTop: Platform.OS === 'ios' ? 80 : 56,
    paddingBottom: 44,
    alignItems: 'center',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  logoImage: {
    width: 80,
    height: 80,
    marginBottom: 16,
  },
  brand: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  brandSub: {
    fontSize: 14,
    marginTop: 6,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  formContainer: {
    padding: 24,
    paddingTop: 40,
  },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 8, letterSpacing: -0.3 },
  sub: { fontSize: 14, marginBottom: 32, lineHeight: 22 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 18,
    overflow: 'hidden',
  },
  inputIcon: {
    paddingLeft: 14,
    paddingRight: 4,
  },
  input: {
    flex: 1,
    padding: 14,
    fontSize: 15,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  primary: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#070235',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
      web: {
        boxShadow: '0px 4px 12px rgba(7, 2, 53, 0.15)',
      },
    }),
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryText: { fontSize: 16, fontWeight: '700' },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    gap: 12,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, fontWeight: '500' },
  secondary: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryText: { fontSize: 15, fontWeight: '600' },
});
