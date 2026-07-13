// Step 6 — Commitment: Final step, create Student node in Neo4j

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { writeTransaction, initNeo4j } from '../../lib/neo4j';
import { v4 as uuidv4 } from 'uuid';
import { useSignupDraft } from '../../lib/signupDraft';
import { hashPassword } from '../../lib/password';
import { normalizeEmail, isEmailRegistered } from '../../lib/studentAuth';
import { setupDefaultNotifications } from '../../lib/notifications';

export default function Step6Commitment() {
  const { colors } = useTheme();
  const { setStudentId } = useAuth();
  const { email: signupEmail, password: signupPassword, clear: clearSignupSecrets } = useSignupDraft();
  const params = useLocalSearchParams<{
    name: string; school: string; class: string; board: string;
    ambitions: string; motives: string; subjectRatings: string;
    daily_study_mins: string; peak_study_time: string;
    has_textbooks: string; exams: string;
  }>();
  const [loading, setLoading] = useState(false);

  const findWeakSubject = (subjectRatings: Record<string, { interest: number; confidence: number }>) => {
    let weakSubject: string | undefined;
    let lowestConfidence = Infinity;
    for (const [subject, rating] of Object.entries(subjectRatings)) {
      if (rating.confidence < lowestConfidence) {
        lowestConfidence = rating.confidence;
        weakSubject = subject;
      }
    }
    return weakSubject;
  };

  const proceedWithLocalSignup = async (email: string, level: 'committed' | 'exploratory') => {
    try {
      const studentId = uuidv4();
      await setStudentId(studentId);
      
      // Set up notifications
      const subjectRatings: Record<string, { interest: number; confidence: number }> =
        JSON.parse(params.subjectRatings || '{}');
      const weakSubject = findWeakSubject(subjectRatings);
      await setupDefaultNotifications({
        peakStudyTime: params.peak_study_time || 'Evening',
        streak: 0,
        weakSubject,
      });

      clearSignupSecrets();
      router.replace('/(tabs)');
    } catch (err: any) {
      console.error('Local signup failed:', err);
      Alert.alert('Error', 'Could not complete signup. Please try again.');
      setLoading(false);
    }
  };

  const handleCommit = async (level: 'committed' | 'exploratory') => {
    setLoading(true);
    try {
      const normEmail = normalizeEmail(signupEmail || '');
      if (!normEmail || !signupPassword || signupPassword.length < 8) {
        Alert.alert(
          'Account error',
          'Email or password missing. Go back to step 1 and set your email and password.'
        );
        setLoading(false);
        return;
      }

      // First try to proceed with Neo4j
      try {
        const { saltHex, hashHex } = await hashPassword(signupPassword);
        const studentId = uuidv4();
        const ambitions: string[] = JSON.parse(params.ambitions || '[]');
        const motives: string[] = JSON.parse(params.motives || '[]');
        const subjectRatings: Record<string, { interest: number; confidence: number }> =
          JSON.parse(params.subjectRatings || '{}');
        const exams: Array<{ name: string; date: string }> = JSON.parse(params.exams || '[]');

        // Build transaction: Create Student + SubjectRelationships + Exams
        const queries: Array<{ cypher: string; params: Record<string, any> }> = [];

        // Create Student node
        queries.push({
          cypher: `CREATE (s:Student {
            id: $id,
            email: $email,
            password_hash: $password_hash,
            password_salt: $password_salt,
            name: $name,
            school: $school,
            class: $class,
            board: $board,
            ambitions: $ambitions,
            motives: $motives,
            daily_study_mins: $daily_study_mins,
            peak_study_time: $peak_study_time,
            has_textbooks: $has_textbooks,
            commitment_level: $commitment_level,
            streak: 0,
            created_at: datetime(),
            last_active: datetime()
          })`,
          params: {
            id: studentId,
            email: normEmail,
            password_hash: hashHex,
            password_salt: saltHex,
            name: params.name,
            school: params.school,
            class: parseInt(params.class),
            board: params.board,
            ambitions,
            motives,
            daily_study_mins: parseInt(params.daily_study_mins),
            peak_study_time: params.peak_study_time,
            has_textbooks: params.has_textbooks === 'true',
            commitment_level: level,
          },
        });

        // Create SubjectRelationship nodes
        for (const [subject, rating] of Object.entries(subjectRatings)) {
          queries.push({
            cypher: `MATCH (s:Student {id: $studentId})
                     CREATE (sr:SubjectRelationship {
                       subject: $subject,
                       interest_level: $interest,
                       confidence_level: $confidence,
                       recorded_at: datetime()
                     })
                     CREATE (s)-[:HAS_RELATIONSHIP]->(sr)`,
            params: {
              studentId,
              subject,
              interest: rating.interest,
              confidence: rating.confidence,
            },
          });
        }

        // Create Exam nodes
        for (const exam of exams) {
          queries.push({
            cypher: `MATCH (s:Student {id: $studentId})
                     CREATE (e:Exam {
                       id: $examId,
                       name: $name,
                       date: datetime($date)
                     })
                     CREATE (s)-[:HAS_EXAM]->(e)`,
            params: {
              studentId,
              examId: uuidv4(),
              name: exam.name,
              date: exam.date.split('/').reverse().join('-'), // DD/MM/YYYY → YYYY-MM-DD
            },
          });
        }

        await writeTransaction(queries);
        await setStudentId(studentId);
        
        // Set up notifications
        const weakSubject = findWeakSubject(subjectRatings);
        await setupDefaultNotifications({
          peakStudyTime: params.peak_study_time || 'Evening',
          streak: 0,
          weakSubject,
        });

        clearSignupSecrets();

        // Navigate to main app
        router.replace('/(tabs)');
      } catch (neoError: any) {
        // If Neo4j fails (for any reason: proxy not running, etc.), fall back to local mode
        console.warn('Neo4j signup failed, falling back to local mode:', neoError);
        Alert.alert(
          'Local Mode',
          'Database features are not available right now. You can still explore the app with limited features.',
          [
            { text: 'Continue Anyway', onPress: () => proceedWithLocalSignup(normEmail, level) },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Onboarding save failed:', err);
      Alert.alert(
        'Setup Error',
        'Could not save your profile. Please try again.\n\nError: ' + (err.message || 'Unknown error'),
        [{ text: 'OK' }]
      );
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.progressRow}>
        {[1, 2, 3, 4, 5, 6].map(step => (
          <View
            key={step}
            style={[styles.progressDot, {
              backgroundColor: colors.primary,
              width: step === 6 ? 24 : 8,
            }]}
          />
        ))}
      </View>

      <Text style={[styles.step, { color: colors.textTertiary }]}>STEP 6 OF 6</Text>
      <Text style={[styles.title, { color: colors.text }]}>One last thing</Text>

      <View style={[styles.messageCard, { backgroundColor: colors.surfaceContainer, borderColor: colors.border }]}>
        <Ionicons name="shield-checkmark" size={40} color={colors.primary} style={styles.icon} />
        <Text style={[styles.message, { color: colors.text }]}>
          StudyMate will push you when you are avoiding subjects. It will not give you 
          breaks you have not earned. It will be honest about your performance.
        </Text>
        <Text style={[styles.message, { color: colors.text, fontWeight: '600', marginTop: 12 }]}>
          Are you okay with that?
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 32 }} />
      ) : (
        <View style={styles.btnGroup}>
          <TouchableOpacity
            style={[styles.commitBtn, { backgroundColor: colors.primary }]}
            onPress={() => handleCommit('committed')}
          >
            <Ionicons name="checkmark-circle" size={22} color={colors.onPrimary} />
            <Text style={[styles.commitText, { color: colors.onPrimary }]}>
              Yes, I am ready
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.exploreBtn, { borderColor: colors.border }]}
            onPress={() => handleCommit('exploratory')}
          >
            <Ionicons name="compass-outline" size={22} color={colors.textSecondary} />
            <Text style={[styles.exploreText, { color: colors.textSecondary }]}>
              I just want to explore
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={[styles.note, { color: colors.textTertiary }]}>
        You can change this anytime in Settings.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40, alignItems: 'center' },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 32, alignItems: 'center', alignSelf: 'flex-start' },
  progressDot: { height: 4, borderRadius: 2 },
  step: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 8, alignSelf: 'flex-start' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 32, letterSpacing: -0.5, alignSelf: 'flex-start' },
  messageCard: {
    borderRadius: 16, borderWidth: 1, padding: 32,
    alignItems: 'center', width: '100%',
  },
  icon: { marginBottom: 20 },
  message: { fontSize: 16, lineHeight: 26, textAlign: 'center' },
  btnGroup: { marginTop: 32, width: '100%', gap: 12 },
  commitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 18, borderRadius: 12,
  },
  commitText: { fontSize: 17, fontWeight: '700' },
  exploreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16, borderRadius: 12, borderWidth: 1,
  },
  exploreText: { fontSize: 15, fontWeight: '500' },
  note: { marginTop: 20, fontSize: 13 },
});
