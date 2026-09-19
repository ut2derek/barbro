import { Tabs, useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { usePendingApprovalCount } from '@/features/bookings/queries';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

/**
 * Pięć zakładek ze środkowym przyciskiem akcji. Środkowy nie prowadzi do
 * ekranu — otwiera arkusz z wyborem, bo „dodaj” to dwie różne czynności:
 * wizyta i blokada czasu.
 */
/** Kropka z liczbą wizyt czekających na decyzję barbera. */
function PendingDot({ count }: { count: number }) {
  const theme = useTheme();

  return (
    <View
      style={{
        minWidth: 20,
        height: 20,
        paddingHorizontal: theme.spacing.xs,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.danger,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="small" tone="onAccent" style={{ fontWeight: '700' }}>
        {count}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const theme = useTheme();
  const router = useRouter();
  const { data: salon } = useCurrentSalon();
  const { data: pending = 0 } = usePendingApprovalCount(salon?.salonId);

  const [actionsOpen, setActionsOpen] = useState(false);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.textPrimary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarStyle: {
            backgroundColor: theme.colors.surfaceElevated,
            borderTopColor: theme.colors.border,
          },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
          // Docelowe ikony przyjdą z designem. Do tego czasu każda zakładka
          // rezerwuje tę samą wysokość, żeby podpisy stały w jednej linii,
          // a kropka powiadomienia miała gdzie usiąść.
          tabBarIcon: () => <View style={{ height: 20 }} />,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('today.title'),
            // Wizyty czekające na akceptację sygnalizujemy kropką z liczbą.
            // Wbudowana kropka doczepia się do ikony, a ikon jeszcze nie mamy,
            // więc rysujemy własną nad podpisem.
            tabBarIcon: () =>
              pending > 0 ? <PendingDot count={pending} /> : <View style={{ height: 20 }} />,
            tabBarAccessibilityLabel:
              pending > 0 ? t('today.pendingAccessibility', { count: pending }) : t('today.title'),
          }}
        />
        <Tabs.Screen name="calendar" options={{ title: t('calendar.title') }} />
        <Tabs.Screen
          name="new"
          options={{ title: t('navigation.add') }}
          listeners={{
            tabPress: (event) => {
              // Zamiast przechodzić na ekran, otwieramy wybór akcji.
              event.preventDefault();
              setActionsOpen(true);
            },
          }}
        />
        <Tabs.Screen name="clients" options={{ title: t('clients.title') }} />
        <Tabs.Screen name="more" options={{ title: t('navigation.more') }} />
      </Tabs>

      <Modal
        visible={actionsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setActionsOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          onPress={() => setActionsOpen(false)}
          style={{ flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' }}
        >
          <View
            style={{
              backgroundColor: theme.colors.surfaceElevated,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              padding: theme.spacing.lg,
              gap: theme.spacing.md,
              paddingBottom: theme.spacing.xxl,
            }}
          >
            <Text variant="heading">{t('navigation.addTitle')}</Text>

            <Button
              label={t('newBooking.title')}
              onPress={() => {
                setActionsOpen(false);
                router.push('/(app)/new-booking');
              }}
            />
            <Button
              label={t('timeBlock.title')}
              variant="secondary"
              onPress={() => {
                setActionsOpen(false);
                router.push('/(app)/time-block');
              }}
            />
            <Button
              label={t('common.cancel')}
              variant="secondary"
              onPress={() => setActionsOpen(false)}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
