import { useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookingCard } from '@/components/bookings/booking-card';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useDayBookings, useSalonStaff } from '@/features/bookings/queries';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { t } from '@/i18n';
import { formatFullDate } from '@/lib/format';
import { useTheme } from '@/theme';

const ZONE = 'Europe/Warsaw';

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: theme.minTouchTarget,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
      }}
    >
      <Text variant="label" tone={selected ? 'onAccent' : 'secondary'}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function CalendarScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: salon } = useCurrentSalon();
  const { data: staff } = useSalonStaff(salon?.salonId);

  const [day, setDay] = useState(() => DateTime.now().setZone(ZONE).startOf('day'));
  const [staffId, setStaffId] = useState<string | null>(null);

  const { data: bookings, isPending, refetch, isRefetching } = useDayBookings({
    salonId: salon?.salonId,
    zone: ZONE,
    day,
    staffId,
  });

  const isToday = day.hasSame(DateTime.now().setZone(ZONE), 'day');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      <View
        style={{
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
          width: '100%',
          maxWidth: 560,
          alignSelf: 'center',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('calendar.previousDay')}
            onPress={() => setDay(day.minus({ days: 1 }))}
            style={{
              width: theme.minTouchTarget,
              height: theme.minTouchTarget,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Text variant="heading">‹</Text>
          </Pressable>

          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text variant="heading">{formatFullDate(day.toISO()!, ZONE)}</Text>
            {isToday ? (
              <Text variant="small" tone="muted">
                {t('calendar.today')}
              </Text>
            ) : (
              <Pressable onPress={() => setDay(DateTime.now().setZone(ZONE).startOf('day'))}>
                <Text variant="small" tone="accent">
                  {t('calendar.backToToday')}
                </Text>
              </Pressable>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('calendar.nextDay')}
            onPress={() => setDay(day.plus({ days: 1 }))}
            style={{
              width: theme.minTouchTarget,
              height: theme.minTouchTarget,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Text variant="heading">›</Text>
          </Pressable>
        </View>

        {salon?.role === 'owner' && staff && staff.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: theme.spacing.sm }}
          >
            <Chip
              label={t('calendar.allStaff')}
              selected={staffId === null}
              onPress={() => setStaffId(null)}
            />
            {staff.map((member) => (
              <Chip
                key={member.id}
                label={member.display_name}
                selected={staffId === member.id}
                onPress={() => setStaffId(member.id)}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.xxl,
          gap: theme.spacing.md,
          width: '100%',
          maxWidth: 560,
          alignSelf: 'center',
        }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        {isPending ? (
          <Text tone="muted">{t('common.loading')}</Text>
        ) : bookings && bookings.length > 0 ? (
          bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              zone={ZONE}
              showStaff={staffId === null}
              onPress={() => router.push(`/(app)/booking/${booking.id}`)}
            />
          ))
        ) : (
          <Card>
            <Text variant="heading">{t('calendar.emptyTitle')}</Text>
            <Text tone="secondary">{t('calendar.emptyDescription')}</Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
