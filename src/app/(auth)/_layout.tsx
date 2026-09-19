import { Redirect, Stack } from 'expo-router';

import { Loading } from '@/components/ui/loading';
import { useAuth } from '@/lib/auth';

export default function AuthLayout() {
  const { session } = useAuth();

  if (session === undefined) return <Loading />;
  // Zalogowany nie ma czego szukać na ekranie logowania.
  if (session) return <Redirect href="/(app)/(tabs)" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
