// Onboarding layout

import { Stack } from 'expo-router';
import { useTheme } from '../../lib/context';
import { SignupDraftProvider } from '../../lib/signupDraft';

export default function OnboardingLayout() {
  const { colors } = useTheme();

  return (
    <SignupDraftProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      />
    </SignupDraftProvider>
  );
}
