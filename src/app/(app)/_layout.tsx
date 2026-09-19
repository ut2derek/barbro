import { Redirect, Stack } from 'expo-router';

import { Loading } from '@/components/ui/loading';
import { useAuth } from '@/lib/auth';

export default function AppLayout() {
  const { session } = useAuth();

  if (session === undefined) return <Loading />;
  // Bez sesji nie ma wstępu do aplikacji.
  if (!session) return <Redirect href="/(auth)/login" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
