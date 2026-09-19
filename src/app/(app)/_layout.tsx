import { Redirect, Stack } from 'expo-router';

import { Loading } from '@/components/ui/loading';
import { useAuth } from '@/lib/auth';

/**
 * Część zalogowana. Zakładki są jednym ekranem stosu, dzięki czemu szczegóły
 * wizyty mogą otworzyć się arkuszem nad kalendarzem, a nie zamiast niego.
 */
export default function AppLayout() {
  const { session } = useAuth();

  if (session === undefined) return <Loading />;
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />

      {/* Wizyta otwiera się arkuszem: pół ekranu na akcje, pełny na szczegóły. */}
      <Stack.Screen
        name="booking/[id]/index"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.6, 1],
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
        }}
      />

      <Stack.Screen name="new-booking" options={{ presentation: 'modal' }} />
      <Stack.Screen name="time-block" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
