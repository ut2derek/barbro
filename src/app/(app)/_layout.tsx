import { Redirect, Stack } from 'expo-router';

import { Loading } from '@/components/ui/loading';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

/**
 * Część zalogowana. Zakładki są jednym ekranem stosu, dzięki czemu szczegóły
 * wizyty mogą otworzyć się arkuszem nad kalendarzem, a nie zamiast niego.
 *
 * Ekrany otwierane z zakładek mają systemowy nagłówek ze strzałką powrotu —
 * na telefonie to jedyny sposób wyjścia, jakiego użytkownik szuka odruchowo.
 */
export default function AppLayout() {
  const { session } = useAuth();
  const theme = useTheme();

  if (session === undefined) return <Loading />;
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: theme.colors.surfaceElevated },
        headerTintColor: theme.colors.textPrimary,
        headerTitleStyle: { color: theme.colors.textPrimary },
        headerShadowVisible: false,
        // „Wstecz” zamiast nazwy poprzedniego ekranu — krótkie nazwy po polsku
        // i tak się nie mieszczą przy dłuższych tytułach.
        headerBackTitle: t('navigation.backShort'),
      }}
    >
      {/* Zakładki mają własne duże tytuły na ekranach. */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

      {/* Wizyta otwiera się arkuszem: pół ekranu na akcje, pełny na szczegóły. */}
      <Stack.Screen
        name="booking/[id]/index"
        options={{
          title: t('booking.screenTitle'),
          presentation: 'formSheet',
          sheetAllowedDetents: [0.6, 1],
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
        }}
      />
      <Stack.Screen
        name="booking/[id]/reschedule"
        options={{ title: t('booking.rescheduleTitle') }}
      />

      <Stack.Screen
        name="new-booking"
        options={{ title: t('newBooking.title'), presentation: 'modal' }}
      />
      <Stack.Screen
        name="time-block"
        options={{ title: t('timeBlock.title'), presentation: 'modal' }}
      />

      <Stack.Screen name="services/index" options={{ title: t('services.title') }} />
      <Stack.Screen name="services/[id]" options={{ title: t('serviceForm.screenTitle') }} />
      <Stack.Screen name="services/categories" options={{ title: t('categories.title') }} />

      <Stack.Screen name="addons/index" options={{ title: t('addonsAdmin.title') }} />
      <Stack.Screen name="addons/[id]" options={{ title: t('addonsAdmin.screenTitle') }} />

      <Stack.Screen name="schedule/index" options={{ title: t('schedule.title') }} />
      <Stack.Screen name="schedule/exceptions" options={{ title: t('exceptions.title') }} />

      <Stack.Screen name="settings/index" options={{ title: t('settings.title') }} />
      <Stack.Screen name="team/index" options={{ title: t('team.title') }} />
      <Stack.Screen name="team/[id]" options={{ title: t('teamForm.screenTitle') }} />
      <Stack.Screen name="clients/[id]" options={{ title: t('clients.screenTitle') }} />
      <Stack.Screen name="reviews/index" options={{ title: t('reviews.title') }} />
      <Stack.Screen name="admin/index" options={{ title: t('admin.title') }} />
      <Stack.Screen name="account" options={{ title: t('account.title') }} />
    </Stack>
  );
}