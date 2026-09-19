import { Redirect, Tabs } from 'expo-router';

import { Loading } from '@/components/ui/loading';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

export default function AppLayout() {
  const { session } = useAuth();
  const theme = useTheme();

  if (session === undefined) return <Loading />;
  // Bez sesji nie ma wstępu do aplikacji.
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.textPrimary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surfaceElevated,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        // Docelowe ikony przyjdą z designem; na razie same podpisy.
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('today.title') }} />
      <Tabs.Screen name="calendar" options={{ title: t('calendar.title') }} />
      <Tabs.Screen name="services/index" options={{ title: t('services.title') }} />
      <Tabs.Screen name="account" options={{ title: t('account.title') }} />
      {/* Szczegóły otwierają się z listy, więc nie ma dla nich zakładki. */}
      <Tabs.Screen name="booking/[id]/index" options={{ href: null }} />
      <Tabs.Screen name="new-booking" options={{ href: null }} />
      <Tabs.Screen name="time-block" options={{ href: null }} />
      <Tabs.Screen name="services/[id]" options={{ href: null }} />
      <Tabs.Screen name="services/categories" options={{ href: null }} />
      <Tabs.Screen name="booking/[id]/reschedule" options={{ href: null }} />
    </Tabs>
  );
}
