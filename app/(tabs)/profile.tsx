// PROFILE & SETTINGS — Premium sectioned layout with flat header, goals, and credentials configuration
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Alert, Platform, ActivityIndicator, Image
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth, useLanguage } from '../../lib/context';
import { useT } from '../../lib/translations';
import { SUPPORTED_LANGUAGES } from '../../constants/languages';
import { SurfaceCard, AnimatedScreenWrapper, SectionLabel, Chip } from '../../components/ui/premium';
import { getStudentProfile, StudentProfile } from '../../lib/adaptiveEngine';
import { setStoredValue, testConnection, writeQuery, getStoredValue, readQuery, deleteStudentCascade, deleteStoredValue, resetStudentProgress } from '../../lib/neo4j';
import { hashPassword, verifyPassword } from '../../lib/password';
import { hasAiApiKey, testSarvamStack } from '../../lib/ai';
import { shouldUseAiProxy } from '../../lib/apiKeys';
import { getGamificationStats, GamificationStats } from '../../lib/gamification';
import { ScreenSkeleton } from '../../components/LoadingSkeleton';
import { Fonts } from '../../constants/fonts';

export default function ProfileScreen() {
  const { colors, mode, setMode, isDark } = useTheme();
  const { studentId, setStudentId } = useAuth();
  const { language, setLanguage } = useLanguage();
  const tr = useT();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [neo4jConnected, setNeo4jConnected] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiConnected, setAiConnected] = useState<boolean | null>(null);
  const [testingAi, setTestingAi] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [sarvamKey, setSarvamKey] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [neo4jUri, setNeo4jUri] = useState('');
  const [neo4jUser, setNeo4jUser] = useState('');
  const [neo4jPass, setNeo4jPass] = useState('');
  const [tavilyKey, setTavilyKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  // Parent PIN states
  const [hasPinSet, setHasPinSet] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [verifyingPin, setVerifyingPin] = useState(false);

  // Baseline state
  const [hasBaseline, setHasBaseline] = useState(false);
  const [lastDiagScore, setLastDiagScore] = useState<string | null>(null);
  const [gStats, setGStats] = useState<GamificationStats | null>(null);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      try {
        const p = await getStudentProfile(studentId);
        setProfile(p);
        const connected = await testConnection();
        setNeo4jConnected(connected);

        let storedSarvam = '';
        let storedModel = '';
        let storedUri = '';
        let storedUser = '';
        let storedPass = '';

        if (Platform.OS === 'web') {
          storedSarvam = localStorage.getItem('sarvam_api_key') || '';
          storedModel = localStorage.getItem('custom_model') || '';
          storedUri = localStorage.getItem('neo4j_uri') || '';
          storedUser = localStorage.getItem('neo4j_username') || '';
          storedPass = localStorage.getItem('neo4j_password') || '';
        } else {
          const SecureStore = require('expo-secure-store');
          storedSarvam = (await SecureStore.getItemAsync('sarvam_api_key')) || '';
          storedModel = (await SecureStore.getItemAsync('custom_model')) || '';
          storedUri = (await SecureStore.getItemAsync('neo4j_uri')) || '';
          storedUser = (await SecureStore.getItemAsync('neo4j_username')) || '';
          storedPass = (await SecureStore.getItemAsync('neo4j_password')) || '';
        }

        // Auto-correct stale incorrect username 'neo4j'
        if (storedUser === 'neo4j') {
          storedUser = '';
          await deleteStoredValue('neo4j_username');
        }

        // Set inputs using stored value or fall back to environment variables
        setSarvamKey(storedSarvam || process.env.EXPO_PUBLIC_SARVAM_API_KEY || '');
        setCustomModel(storedModel || '');
        setNeo4jUri(storedUri || process.env.EXPO_PUBLIC_NEO4J_URI || '');
        setNeo4jUser(storedUser || process.env.EXPO_PUBLIC_NEO4J_USERNAME || '');
        setNeo4jPass(storedPass || process.env.EXPO_PUBLIC_NEO4J_PASSWORD || '');
        const tv = await getStoredValue('tavily_api_key');
        setTavilyKey(tv || '');
        setAiConfigured(await hasAiApiKey());

        // Check if parent PIN is set
        const pinRec = await readQuery(
          `MATCH (s:Student {id: $studentId}) RETURN s.parent_pin_salt AS salt`,
          { studentId }
        );
        const pinRecord = pinRec[0];
        const salt = pinRecord && typeof pinRecord.get === 'function' ? pinRecord.get('salt') : (pinRecord as any)?.salt;
        setHasPinSet(!!(salt));

        // Check baseline status
        const diagDone = await readQuery(
          `MATCH (s:Student {id: $studentId})-[:TOOK_DIAGNOSTIC]->(r:DiagnosticRun)
           RETURN r.correct_total AS c, r.total_questions AS t
           ORDER BY r.completed_at DESC LIMIT 1`,
          { studentId }
        );
        const legacyBaseline = await readQuery(
          `MATCH (s:Student {id: $studentId})-[:TOOK_BASELINE]->() RETURN 1 LIMIT 1`,
          { studentId }
        );
        if (diagDone.length > 0) {
          setHasBaseline(true);
          const record = diagDone[0];
          const c = record && typeof record.get === 'function' ? record.get('c') : (record as any)?.c;
          const t = record && typeof record.get === 'function' ? record.get('t') : (record as any)?.t;
          if (c != null && t != null) setLastDiagScore(`${c}/${t}`);
        } else if (legacyBaseline.length > 0) {
          setHasBaseline(true);
        }

        // Gamification stats for level progress
        try {
          const gs = await getGamificationStats(studentId);
          setGStats(gs);
        } catch (err) {
          console.warn('[Profile] Failed to load gamification stats:', err);
        }

        // Load profile photo
        if (Platform.OS === 'web') {
          setProfilePhoto(localStorage.getItem(`profile_photo_${studentId}`) || null);
        } else {
          const SecureStore = require('expo-secure-store');
          const photo = await SecureStore.getItemAsync(`profile_photo_${studentId}`);
          setProfilePhoto(photo || null);
        }
      } catch (err) {
        console.error('Profile load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [studentId]);

  const saveCredentials = async () => {
    setSaving(true);
    try {
      await setStoredValue('sarvam_api_key', sarvamKey);
      await setStoredValue('custom_model', customModel);
      await setStoredValue('neo4j_uri', neo4jUri);
      await setStoredValue('neo4j_username', neo4jUser);
      await setStoredValue('neo4j_password', neo4jPass);
      await setStoredValue('tavily_api_key', tavilyKey);
      const connected = await testConnection();
      setNeo4jConnected(connected);
      setAiConfigured(await hasAiApiKey());
      setTestingAi(true);
      const stack = await testSarvamStack();
      setAiConnected(stack.chat.ok && stack.voice.ok && stack.ocr.ok);
      setTestingAi(false);
      const neoLine = connected ? 'Neo4j connected.' : 'Neo4j connection failed.';
      const aiLines = [
        stack.chat.ok ? 'Chat: OK' : `Chat: ${stack.chat.message}`,
        stack.voice.ok ? 'Voice: OK' : `Voice: ${stack.voice.message}`,
        stack.ocr.ok ? 'OCR: OK' : `OCR: ${stack.ocr.message}`,
      ].join('\n');
      Alert.alert('Saved', `${neoLine}\n\nSarvam AI\n${aiLines}`);
    } catch (err: any) {
      console.error('Save credentials error:', err);
      Alert.alert('Error', `Failed to save credentials: ${err?.message || String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyCurrentPin = async () => {
    if (!studentId || currentPinInput.length < 4) {
      Alert.alert('Invalid', 'Enter your current 4-8 digit PIN.');
      return;
    }
    setVerifyingPin(true);
    try {
      const recs = await readQuery(
        `MATCH (s:Student {id: $studentId}) RETURN s.parent_pin_salt AS salt, s.parent_pin_hash AS hash`,
        { studentId }
      );
      const record = recs[0];
      const salt = record && typeof record.get === 'function' ? record.get('salt') : (record as any)?.salt;
      const hash = record && typeof record.get === 'function' ? record.get('hash') : (record as any)?.hash;
      if (!salt || !hash) { Alert.alert('Error', 'No PIN found.'); return; }
      const ok = await verifyPassword(currentPinInput, salt, hash);
      if (ok) {
        setPinVerified(true);
      } else {
        Alert.alert('Incorrect', 'Current PIN is wrong. Please try again.');
      }
    } catch { Alert.alert('Error', 'Could not verify PIN.'); }
    finally { setVerifyingPin(false); }
  };

  const handleSaveNewPin = async () => {
    if (newPinInput.length < 4 || newPinInput.length > 8) {
      Alert.alert('Invalid', 'PIN must be 4-8 digits.'); return;
    }
    if (newPinInput !== confirmPinInput) {
      Alert.alert('Mismatch', 'New PIN and confirmation do not match.'); return;
    }
    try {
      const { saltHex, hashHex } = await hashPassword(newPinInput);

      // Update local profile cache with parent PIN salt and hash
      try {
        let cached = Platform.OS === 'web'
          ? localStorage.getItem(`profile_cache_${studentId}`)
          : await (require('expo-secure-store')).getItemAsync(`profile_cache_${studentId}`);
        if (cached) {
          const profileData = JSON.parse(cached);
          profileData.parent_pin_salt = saltHex;
          profileData.parent_pin_hash = hashHex;
          const stringified = JSON.stringify(profileData);
          if (Platform.OS === 'web') {
            localStorage.setItem(`profile_cache_${studentId}`, stringified);
          } else {
            await (require('expo-secure-store')).setItemAsync(`profile_cache_${studentId}`, stringified);
          }
        }
      } catch (cacheErr) {
        console.warn('Failed to cache parent pin locally:', cacheErr);
      }

      await writeQuery(
        `MATCH (s:Student {id: $studentId}) SET s.parent_pin_salt = $salt, s.parent_pin_hash = $hash`,
        { studentId, salt: saltHex, hash: hashHex }
      );
      setHasPinSet(true);
      setPinVerified(false);
      setCurrentPinInput(''); setNewPinInput(''); setConfirmPinInput('');
      Alert.alert('Saved', 'Parent PIN updated successfully.');
    } catch {
      setHasPinSet(true);
      setPinVerified(false);
      setCurrentPinInput(''); setNewPinInput(''); setConfirmPinInput('');
      Alert.alert('Saved Locally', 'Parent PIN updated locally (offline mode).');
    }
  };

  const handleLogout = async () => {
    await setStudentId(null);
    router.replace('/(auth)/login');
  };

  const handleReset = async () => {
    Alert.alert('Reset All Progress', 'This will delete all your quiz scores, study sessions, and progress. Your profile and credentials will remain. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes, Reset', style: 'destructive', onPress: async () => {
        Alert.alert('Final Confirmation', 'Are you absolutely sure? All progress will be permanently deleted.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reset Progress', style: 'destructive', onPress: async () => {
            try {
              await resetStudentProgress(studentId!);
              
              // Refresh the screen data
              setLoading(true);
              try {
                const p = await getStudentProfile(studentId!);
                setProfile(p);
                setHasBaseline(false);
                setLastDiagScore(null);
                try {
                  const gs = await getGamificationStats(studentId!);
                  setGStats(gs);
                } catch (err) {
                  console.warn('[Profile] Failed to reload gamification stats after reset:', err);
                }
              } catch (err) {
                console.error('Profile reload error:', err);
              } finally {
                setLoading(false);
              }

              Alert.alert('Success', 'Progress has been reset!');
            } catch (err) { 
              console.error('[Profile] Failed to reset progress:', err);
              Alert.alert('Error', 'Failed to reset progress.'); 
            }
          }},
        ]);
      }},
    ]);
  };

  if (loading) return <ScreenSkeleton />;

  const SectionHeader = ({ title }: { title: string }) => (
    <SectionLabel text={title} style={{ marginLeft: 4 }} />
  );

  const SettingRow = ({ icon, label, onPress, trailing, danger }: { icon: string; label: string; onPress: () => void; trailing?: React.ReactNode; danger?: boolean }) => (
    <TouchableOpacity style={[s.settingRow, { borderBottomColor: colors.borderSubtle }]} onPress={onPress}>
      <View style={s.settingLeft}>
        <View style={[s.settingIcon, { backgroundColor: danger ? 'rgba(239,68,68,0.08)' : colors.accentMuted }]}>
          <Ionicons name={icon as any} size={18} color={danger ? colors.danger : colors.accent} />
        </View>
        <Text style={[s.settingLabel, { color: danger ? colors.danger : colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>{label}</Text>
      </View>
      {trailing || <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
    </TouchableOpacity>
  );

  return (
    <AnimatedScreenWrapper>
      <ScrollView style={[s.container, { backgroundColor: colors.background }]} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Flat Header — No linear gradient, radial-tinted avatar */}
        <View style={[s.hero, { backgroundColor: colors.background }]}>
          <TouchableOpacity 
            onPress={async () => {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.5,
              });
              if (!result.canceled && result.assets[0]) {
                const manipResult = await ImageManipulator.manipulateAsync(
                  result.assets[0].uri,
                  [{ resize: { width: 300, height: 300 } }],
                  { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
                );
                const uri = Platform.OS === 'web'
                  ? `data:image/jpeg;base64,${manipResult.base64}`
                  : manipResult.uri;
                setProfilePhoto(uri);
                if (Platform.OS === 'web') {
                  localStorage.setItem(`profile_photo_${studentId}`, uri);
                } else {
                  const SecureStore = require('expo-secure-store');
                  await SecureStore.setItemAsync(`profile_photo_${studentId}`, uri);
                }
              }
            }}
            style={[s.avatar, { backgroundColor: colors.accent + '33', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accentBorder, overflow: 'hidden' }]}
          >
            {profilePhoto ? (
              <Image source={{ uri: profilePhoto }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Text style={[s.avatarText, { color: colors.accent, fontFamily: Fonts.display }]}>
                {profile?.name?.[0]?.toUpperCase() || '?'}
              </Text>
            )}
            <View style={{ position: 'absolute', bottom: 0, width: '100%', height: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={[s.heroName, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
            {profile?.name || tr('student')}
          </Text>
          <Text style={[s.heroSub, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
            {profile?.email ? `${profile.email} · ` : ''}Class {profile?.class} · {profile?.board}
          </Text>

          {/* Level Progress */}
          {gStats && (
            <View style={{ marginTop: 16, width: '80%' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 12, fontFamily: Fonts.displayMedium, color: colors.accent }}>Level {gStats.level}</Text>
                <Text style={{ fontSize: 11, fontFamily: Fonts.body, color: colors.textSecondary }}>{gStats.xp} / {gStats.level * 100} XP</Text>
              </View>
              <View style={{ height: 4, backgroundColor: colors.borderSubtle, borderRadius: 2, overflow: 'hidden' }}>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.accent, width: `${Math.min((gStats.xp / (gStats.level * 100)) * 100, 100)}%` }} />
              </View>
            </View>
          )}
        </View>

        <View style={s.body}>
          {/* Edit Profile Section */}
          <SectionHeader title="PROFILE DETAILS" />
          <SurfaceCard style={{ padding: 0, overflow: 'hidden' }}>
            <SettingRow icon="person-outline" label="Edit Profile & Goals" onPress={() => setIsEditing(!isEditing)} />
            {isEditing && profile && (
              <View style={{ padding: 16, paddingTop: 12 }}>
                <Text style={[s.inputLabel, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>Name</Text>
                <TextInput style={[s.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.surface2, fontFamily: Fonts.body }]} value={profile.name} onChangeText={t => setProfile({...profile, name: t})} placeholderTextColor={colors.textTertiary} />
                
                <Text style={[s.inputLabel, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>Email</Text>
                <TextInput style={[s.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.surface2, fontFamily: Fonts.body }]} value={profile.email || ''} onChangeText={t => setProfile({...profile, email: t})} placeholderTextColor={colors.textTertiary} keyboardType="email-address" autoCapitalize="none" />
                
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.inputLabel, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>Class</Text>
                    <TextInput style={[s.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.surface2, fontFamily: Fonts.body }]} value={profile.class.toString()} onChangeText={t => setProfile({...profile, class: parseInt(t) || profile.class})} placeholderTextColor={colors.textTertiary} keyboardType="number-pad" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.inputLabel, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>Board</Text>
                    <TextInput style={[s.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.surface2, fontFamily: Fonts.body }]} value={profile.board} onChangeText={t => setProfile({...profile, board: t.toUpperCase()})} placeholderTextColor={colors.textTertiary} autoCapitalize="characters" />
                  </View>
                </View>

                <Text style={[s.inputLabel, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>Ambitions (e.g. JEE, UPSC, Developer)</Text>
                <TextInput style={[s.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.surface2, fontFamily: Fonts.body }]} defaultValue={profile.ambitions.join(', ')} onChangeText={t => setProfile({...profile, ambitions: t.split(',').map(x => x.trim())})} placeholderTextColor={colors.textTertiary} />
                
                <Text style={[s.inputLabel, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>Motives (e.g. Make parents proud, Financial freedom)</Text>
                <TextInput style={[s.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.surface2, fontFamily: Fonts.body }]} defaultValue={profile.motives.join(', ')} onChangeText={t => setProfile({...profile, motives: t.split(',').map(x => x.trim())})} placeholderTextColor={colors.textTertiary} />
                
                <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.accent, marginTop: 16 }]} onPress={async () => {
                  setIsEditing(false);
                  
                  // Keep local changes in profile state
                  const updatedProfile = {
                    ...profile,
                    name: profile.name,
                    email: profile.email || '',
                    class: profile.class,
                    board: profile.board,
                    ambitions: profile.ambitions,
                    motives: profile.motives,
                  };
                  setProfile(updatedProfile);

                  // Update local storage cache immediately
                  try {
                    const profileJson = JSON.stringify(updatedProfile);
                    if (Platform.OS === 'web') {
                      localStorage.setItem(`profile_cache_${studentId}`, profileJson);
                    } else {
                      const SecureStore = require('expo-secure-store');
                      await SecureStore.setItemAsync(`profile_cache_${studentId}`, profileJson);
                    }
                  } catch (cacheErr) {
                    console.warn('Failed to cache profile update locally:', cacheErr);
                  }

                  // Write to Neo4j database
                  try {
                    await writeQuery(`MATCH (s:Student {id: $studentId}) SET s.name = $name, s.email = $email, s.class = toInteger($classNum), s.board = $board, s.ambitions = $ambitions, s.motives = $motives`, { 
                      studentId, 
                      name: profile.name,
                      email: profile.email || '',
                      classNum: profile.class,
                      board: profile.board,
                      ambitions: profile.ambitions, 
                      motives: profile.motives 
                    });
                    Alert.alert('Success', 'Profile updated successfully!');
                  } catch (neoErr) {
                    console.warn('Could not sync profile update to Neo4j. Saved offline.', neoErr);
                    Alert.alert('Saved Locally', 'Saved profile details locally (offline mode). They will sync to the server when connection is restored.');
                  }
                }}>
                  <Text style={{ color: colors.textInverse, fontFamily: Fonts.display, fontSize: 14 }}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            )}
          </SurfaceCard>

          {/* Study Targets */}
          <SectionHeader title="STUDY TARGETS" />
          <SurfaceCard>
            {[
              { label: 'Daily Study Time', current: '1.5', target: '3', unit: 'hours', pct: 50 },
              { label: 'Weekly Quiz Target', current: '4', target: '10', unit: 'quizzes', pct: 40 },
              { label: 'Streak Goal', current: `${gStats?.streak || 0}`, target: '7', unit: 'days', pct: Math.min(((gStats?.streak || 0) / 7) * 100, 100) },
            ].map((t, i) => (
              <View key={t.label} style={{ marginBottom: i < 2 ? 18 : 0 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 13, fontFamily: Fonts.bodyMedium, color: colors.textPrimary }}>{t.label}</Text>
                  <Text style={{ fontSize: 12, fontFamily: Fonts.body, color: colors.textTertiary }}>{t.current} / {t.target} {t.unit}</Text>
                </View>
                <View style={{ height: 4, backgroundColor: colors.borderSubtle, borderRadius: 2, overflow: 'hidden' }}>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: t.pct >= 80 ? colors.success : t.pct >= 40 ? colors.accent : colors.warning, width: `${t.pct}%` }} />
                </View>
              </View>
            ))}
          </SurfaceCard>

          {/* Appearance */}
          <SectionHeader title={tr('appearance').toUpperCase()} />
          <SurfaceCard style={{ padding: 0 }}>
            {/* Theme Chips */}
            <View style={s.themeRow}>
              {([
                { m: 'light' as const, key: 'theme_light', icon: 'sunny' as const },
                { m: 'dark' as const, key: 'theme_dark', icon: 'moon' as const },
                { m: 'system' as const, key: 'theme_system', icon: 'phone-portrait-outline' as const },
              ]).map(({ m, key, icon }) => (
                <View key={m} style={{ flex: 1 }}>
                  <Chip
                    label={tr(key)}
                    selected={mode === m}
                    onPress={() => setMode(m)}
                    icon={<Ionicons name={icon} size={14} color={mode === m ? colors.accentHover : colors.textTertiary} />}
                  />
                </View>
              ))}
            </View>
            <View style={[s.divider, { backgroundColor: colors.borderSubtle }]} />
            
            {/* Language Static Label */}
            <View style={s.settingRowStatic}>
              <View style={s.settingLeft}>
                <View style={[s.settingIcon, { backgroundColor: colors.accentMuted }]}>
                  <Ionicons name="language-outline" size={18} color={colors.accent} />
                </View>
                <Text style={[s.settingLabel, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>{tr('language')}</Text>
              </View>
            </View>

            {/* Language Chips (High Contrast) */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              {SUPPORTED_LANGUAGES.map(lang => {
                const isSelected = language === lang;
                return (
                  <TouchableOpacity
                    key={lang}
                    style={[
                      s.langPill,
                      {
                        backgroundColor: isSelected ? colors.accent : colors.surface3,
                        borderColor: isSelected ? colors.accent : colors.borderSubtle,
                      }
                    ]}
                    onPress={() => setLanguage(lang)}
                  >
                    <Text style={[s.themeText, { color: isSelected ? colors.textInverse : colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>
                      {lang}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </SurfaceCard>

          {/* COMPETITION */}
          <SectionHeader title="COMPETITION" />
          <SurfaceCard style={{ padding: 0 }}>
            <SettingRow icon="trophy-outline" label="My Rank & Leaderboard" onPress={() => router.push('/screens/LeaderboardScreen' as any)} />
          </SurfaceCard>

          {/* Diagnostics */}
          <SectionHeader title={tr('diagnostics').toUpperCase()} />
          <SurfaceCard style={{ padding: 0 }}>
            {hasBaseline ? (
              <>
                <SettingRow icon="checkmark-circle-outline" label={tr('retake_diagnostic')} onPress={() => router.push('/screens/BaselineTestScreen')}
                  trailing={lastDiagScore ? <View style={{ backgroundColor: colors.accentMuted, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}><Text style={{ fontSize: 12, fontWeight: '700', color: colors.accent }}>{lastDiagScore}</Text></View> : undefined}
                />
              </>
            ) : (
              <SettingRow icon="clipboard-outline" label={tr('take_baseline')} onPress={() => router.push('/screens/BaselineTestScreen')}
                trailing={<View style={{ backgroundColor: colors.accentMuted, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}><Text style={{ fontSize: 10, fontWeight: '700', color: colors.accent }}>{tr('new')}</Text></View>}
              />
            )}
            <SettingRow icon="document-text-outline" label={tr('parental_report')} onPress={() => router.push('/screens/ParentalReportScreen')} />
          </SurfaceCard>

          {/* Parent PIN */}
          <SectionHeader title="PARENT ACCESS" />
          <SurfaceCard style={{ padding: 16 }}>
            <Text style={[s.cardDesc, { color: colors.textSecondary, padding: 0, marginBottom: 12, fontFamily: Fonts.body }]}>
              Set a PIN so parents can view study signals from Parent View using the student email and this PIN.
            </Text>
            {hasPinSet && !pinVerified ? (
              <>
                <Text style={[s.inputLabel, { color: colors.textSecondary, paddingHorizontal: 0, fontFamily: Fonts.bodyMedium }]}>Current PIN</Text>
                <TextInput style={[s.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.surface2, marginHorizontal: 0, fontFamily: Fonts.body }]} value={currentPinInput} onChangeText={setCurrentPinInput} placeholder="Enter current PIN" placeholderTextColor={colors.textTertiary} keyboardType="number-pad" secureTextEntry />
                <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.accent, marginHorizontal: 0 }]} onPress={handleVerifyCurrentPin} disabled={verifyingPin}>
                  {verifyingPin ? <ActivityIndicator color={colors.textInverse} size="small" /> : <Text style={{ color: colors.textInverse, fontFamily: Fonts.display, fontSize: 14 }}>Verify Current PIN</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[s.inputLabel, { color: colors.textSecondary, paddingHorizontal: 0, fontFamily: Fonts.bodyMedium }]}>{hasPinSet ? 'New PIN' : 'Set PIN (4-8 digits)'}</Text>
                <TextInput style={[s.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.surface2, marginHorizontal: 0, fontFamily: Fonts.body }]} value={newPinInput} onChangeText={setNewPinInput} placeholder="••••" placeholderTextColor={colors.textTertiary} keyboardType="number-pad" secureTextEntry />
                <Text style={[s.inputLabel, { color: colors.textSecondary, paddingHorizontal: 0, fontFamily: Fonts.bodyMedium }]}>Confirm PIN</Text>
                <TextInput style={[s.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.surface2, marginHorizontal: 0, fontFamily: Fonts.body }]} value={confirmPinInput} onChangeText={setConfirmPinInput} placeholder="••••" placeholderTextColor={colors.textTertiary} keyboardType="number-pad" secureTextEntry />
                <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.accent, marginHorizontal: 0 }]} onPress={handleSaveNewPin}>
                  <Text style={{ color: colors.textInverse, fontFamily: Fonts.display, fontSize: 14 }}>{hasPinSet ? 'Update PIN' : 'Save PIN'}</Text>
                </TouchableOpacity>
              </>
            )}
          </SurfaceCard>

          {/* API Configuration */}
          <SectionHeader title="API CONFIGURATION" />
          <SurfaceCard style={{ padding: 16 }}>
            <Text style={[s.cardDesc, { color: colors.textSecondary, padding: 0, marginBottom: 12, fontFamily: Fonts.body }]}>
              {Platform.OS === 'web' && shouldUseAiProxy()
                ? 'On Vercel, Sarvam APIs are proxied via /api/ai (chat), /api/voice (STT/TTS), and /api/ocr (document OCR). Set SARVAM_API_KEY in Vercel env or save your key below.'
                : 'Sarvam API key powers all AI features: chat, voice, and OCR. On web deploy, set SARVAM_API_KEY on Vercel or save keys below.'}
            </Text>
            <View style={[s.connectionRow, { paddingHorizontal: 0, marginTop: 4 }]}>
              <View style={[s.statusDot, { backgroundColor: aiConfigured ? colors.success : colors.danger }]} />
              <Text style={[s.connectionText, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>
                AI key: {aiConfigured ? 'Configured' : 'Missing'}
                {aiConnected != null ? ` · ${aiConnected ? 'Connected' : 'Failed'}` : ''}
              </Text>
              {testingAi && <ActivityIndicator size="small" color={colors.accent} />}
            </View>
            {[
              { label: 'Sarvam API Key', value: sarvamKey, onChange: setSarvamKey, placeholder: 'sk_rmrcgdm5_...', secure: true },
              { label: 'Custom Model (Optional)', value: customModel, onChange: setCustomModel, placeholder: 'sarvam-105b', secure: false },
              { label: 'Neo4j URI', value: neo4jUri, onChange: setNeo4jUri, placeholder: 'neo4j+s://xxx.neo4j.io', secure: false },
              { label: 'Neo4j Username', value: neo4jUser, onChange: setNeo4jUser, placeholder: 'neo4j', secure: false },
              { label: 'Neo4j Password', value: neo4jPass, onChange: setNeo4jPass, placeholder: 'Password', secure: true },
              { label: 'Tavily API Key', value: tavilyKey, onChange: setTavilyKey, placeholder: 'tvly-...', secure: true },
            ].map(f => (
              <View key={f.label}>
                <Text style={[s.inputLabel, { color: colors.textSecondary, paddingHorizontal: 0, fontFamily: Fonts.bodyMedium }]}>{f.label}</Text>
                <TextInput style={[s.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.surface2, marginHorizontal: 0, fontFamily: Fonts.body }]} value={f.value} onChangeText={f.onChange} placeholder={f.placeholder} placeholderTextColor={colors.textTertiary} secureTextEntry={f.secure} />
              </View>
            ))}
            <View style={[s.connectionRow, { paddingHorizontal: 0, marginBottom: 12 }]}>
              <View style={[s.statusDot, { backgroundColor: neo4jConnected ? colors.success : colors.danger }]} />
              <Text style={[s.connectionText, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>Neo4j: {neo4jConnected ? 'Connected' : 'Not Connected'}</Text>
            </View>
            <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.accent, marginHorizontal: 0, marginBottom: 0 }]} onPress={saveCredentials} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.textInverse} size="small" /> : <Text style={{ color: colors.textInverse, fontFamily: Fonts.display, fontSize: 14 }}>Save Credentials</Text>}
            </TouchableOpacity>
          </SurfaceCard>

          {/* Account */}
          <SectionHeader title="ACCOUNT" />
          <SurfaceCard style={{ padding: 0 }}>
            <SettingRow icon="log-out-outline" label="Log out" onPress={() => void handleLogout()} />
          </SurfaceCard>
          <SurfaceCard style={{ padding: 0, borderColor: colors.danger + '40' }}>
            <SettingRow icon="trash-outline" label="Reset All Progress" onPress={handleReset} danger />
          </SurfaceCard>

          <Text style={[s.version, { color: colors.textTertiary, fontFamily: Fonts.body }]}>StudyMate AI v1.0.0</Text>
        </View>
      </ScrollView>
    </AnimatedScreenWrapper>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: Platform.OS === 'ios' ? 100 : 80 },
  hero: { paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingBottom: 24, alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { fontSize: 28, fontWeight: '800' },
  heroName: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  heroSub: { fontSize: 13, marginTop: 4, fontWeight: '500' },
  body: { paddingHorizontal: 20, paddingTop: 8 },
  cardDesc: { fontSize: 13, lineHeight: 20 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  settingIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { fontSize: 15, fontWeight: '500' },
  themeRow: { flexDirection: 'row', gap: 8, padding: 16 },
  themeText: { fontSize: 13, fontWeight: '600' },
  inputLabel: { fontSize: 12, fontWeight: '500', marginBottom: 6, marginTop: 12, letterSpacing: 0.3 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 14 },
  divider: { height: 1, marginHorizontal: 16 },
  settingRowStatic: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  connectionText: { fontSize: 13, fontWeight: '500' },
  saveBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  version: { textAlign: 'center', fontSize: 12, marginTop: 16, fontWeight: '500' },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 80,
  },
});
