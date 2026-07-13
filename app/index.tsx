// Index — redirect based on auth state

import { Redirect } from 'expo-router';
import { useAuth } from '../lib/context';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme } from '../lib/context';

export default function Index() {
  const { studentId, isLoading } = useAuth();
  const { colors } = useTheme();

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (studentId) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
