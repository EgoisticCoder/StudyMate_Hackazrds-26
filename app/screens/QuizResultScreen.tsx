// Quiz result screen — simple redirect (results are shown in QuizPlayScreen)
import { Redirect } from 'expo-router';
export default function QuizResultScreen() {
  return <Redirect href="/(tabs)/quiz" />;
}
