import { Pressable, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import type { BookingListItem, BookingStatus } from '@/features/bookings/queries';
import { statusLabel, statusTone } from '@/features/bookings/status';
import { t } from '@/i18n';
import { formatPrice, formatTimeRange } from '@/lib/format';
import { useTheme } from '@/theme';

type QuickAction = {
  label: string;
  status: BookingStatus;
  tone: 'success' | 'danger';
};

/**
 * Szybkie akcje zależą od stanu wizyty. Odwołanie celowo ich nie ma —
 * wymaga komentarza dla klienta, więc otwiera pełny widok.
 */
function quickActions(status: BookingStatus): { right?: QuickAction; left?: QuickAction } {
  if (status === 'pending_approval') {
    return { right: { label: t('booking.accept'), status: 'confirmed', tone: 'success' } };
  }
  if (status === 'confirmed') {
    return {
      right: { label: t('booking.markCompleted'), status: 'completed', tone: 'success' },
      left: { label: t('booking.markNoShow'), status: 'no_show', tone: 'danger' },
    };
  }
  return {};
}

type Props = {
  booking: BookingListItem;
  zone: string;
  showStaff?: boolean;
  onPress: () => void;
  onQuickAction?: (booking: BookingListItem, status: BookingStatus, label: string) => void;
};

export function BookingCard({ booking, zone, showStaff = false, onPress, onQuickAction }: Props) {
  const theme = useTheme();
  const cancelled = booking.status.startsWith('cancelled') || booking.status === 'no_show';
  const actions = onQuickAction ? quickActions(booking.status) : {};

  function ActionPanel({ action }: { action: QuickAction }) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={action.label}
        onPress={() => onQuickAction?.(booking, action.status, action.label)}
        style={{
          justifyContent: 'center',
          paddingHorizontal: theme.spacing.lg,
          marginVertical: 0,
          backgroundColor:
            action.tone === 'success' ? theme.colors.successMuted : theme.colors.dangerMuted,
          borderRadius: theme.radius.lg,
        }}
      >
        <Text variant="label" tone={action.tone === 'success' ? 'success' : 'danger'}>
          {action.label}
        </Text>
      </Pressable>
    );
  }

  // Kafelek jest kontenerem, a nie przyciskiem — akcje muszą być jego
  // rodzeństwem, inaczej powstaje przycisk w przycisku (nieprawidłowy układ).
  const card = (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: theme.spacing.lg,
        gap: theme.spacing.xs,
        opacity: cancelled ? 0.6 : 1,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${formatTimeRange(booking.startsAt, booking.endsAt, zone)} ${booking.clientName}`}
        onPress={onPress}
        style={({ pressed }) => ({ gap: theme.spacing.xs, opacity: pressed ? 0.7 : 1 })}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="heading">{formatTimeRange(booking.startsAt, booking.endsAt, zone)}</Text>
          <Badge label={statusLabel(booking.status)} tone={statusTone(booking.status)} />
        </View>

        <Text variant="bodyStrong">{booking.clientName}</Text>
        <Text tone="secondary" variant="small">
          {booking.services.join(' + ')}
        </Text>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          {showStaff ? (
            <Text tone="muted" variant="small">
              {booking.staffName}
            </Text>
          ) : (
            <View />
          )}
          <Text tone="secondary" variant="small">
            {formatPrice(booking.totalPriceGrosz)}
          </Text>
        </View>
      </Pressable>

      {/* Te same akcje co gest — dla myszy, czytnika ekranu i tych, którzy
          nie wiedzą, że kafelek da się przesunąć. */}
      {actions.right || actions.left ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
          {actions.right ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onQuickAction?.(booking, actions.right!.status, actions.right!.label)}
              style={{
                flex: 1,
                minHeight: theme.minTouchTarget,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.successMuted,
              }}
            >
              <Text variant="label" tone="success">
                {actions.right.label}
              </Text>
            </Pressable>
          ) : null}

          {actions.left ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onQuickAction?.(booking, actions.left!.status, actions.left!.label)}
              style={{
                flex: 1,
                minHeight: theme.minTouchTarget,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.dangerMuted,
              }}
            >
              <Text variant="label" tone="danger">
                {actions.left.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  if (!actions.right && !actions.left) return card;

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={48}
      leftThreshold={48}
      renderLeftActions={actions.right ? () => <ActionPanel action={actions.right!} /> : undefined}
      renderRightActions={actions.left ? () => <ActionPanel action={actions.left!} /> : undefined}
    >
      {card}
    </ReanimatedSwipeable>
  );
}
