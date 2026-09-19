import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View, type ColorValue } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { usePendingApprovalCount } from '@/features/bookings/queries';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

/** Szerokość paska zgodna z treścią ekranów — na telefonie i tak zajmuje całą. */
const MAX_BAR_WIDTH = 560;

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Ikona zakładki: wypełniona, gdy zakładka jest aktywna. */
function tabIcon(active: IconName, inactive: IconName) {
  return function Icon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? active : inactive} size={24} color={color as string} />;
  };
}

/**
 * Pięć zakładek ze środkowym przyciskiem akcji. Środkowy nie prowadzi do
 * ekranu — otwiera arkusz z wyborem, bo „dodaj” to dwie różne czynności:
 * wizyta i blokada czasu.
 */
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
            // Na szerokim ekranie pasek trzyma się tej samej szerokości
            // co treść — rozciągnięty przez cały monitor wygląda przypadkowo.
            width: '100%',
            maxWidth: MAX_BAR_WIDTH,
            alignSelf: 'center',
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('today.title'),
            tabBarIcon: tabIcon('today', 'today-outline'),
            // Liczba wizyt czekających na decyzję barbera.
            tabBarBadge: pending > 0 ? pending : undefined,
            tabBarBadgeStyle: {
              backgroundColor: theme.colors.danger,
              color: theme.colors.textOnAccent,
              fontSize: 11,
            },
            tabBarAccessibilityLabel:
              pending > 0 ? t('today.pendingAccessibility', { count: pending }) : t('today.title'),
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: t('calendar.title'),
            tabBarIcon: tabIcon('calendar', 'calendar-outline'),
          }}
        />
        <Tabs.Screen
          name="new"
          options={{
            title: t('navigation.add'),
            tabBarIcon: tabIcon('add-circle', 'add-circle-outline'),
          }}
          listeners={{
            tabPress: (event) => {
              // Zamiast przechodzić na ekran, otwieramy wybór akcji.
              event.preventDefault();
              setActionsOpen(true);
            },
          }}
        />
        <Tabs.Screen
          name="clients"
          options={{
            title: t('clients.title'),
            tabBarIcon: tabIcon('people', 'people-outline'),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: t('navigation.more'),
            tabBarIcon: tabIcon('ellipsis-horizontal', 'ellipsis-horizontal-outline'),
          }}
        />
      </Tabs>

      <Modal
        visible={actionsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setActionsOpen(false)}
      >
        {/* Tło zamykające arkusz leży pod nim, a nie wokół niego — inaczej
            przyciski w arkuszu byłyby przyciskami w przycisku. */}
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            onPress={() => setActionsOpen(false)}
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]}
          />

          <View
            style={{
              backgroundColor: theme.colors.surfaceElevated,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              padding: theme.spacing.lg,
              gap: theme.spacing.md,
              paddingBottom: theme.spacing.xxl,
              width: '100%',
              maxWidth: MAX_BAR_WIDTH,
              alignSelf: 'center',
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
        </View>
      </Modal>
    </>
  );
}
