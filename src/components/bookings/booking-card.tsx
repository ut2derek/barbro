import { Pressable, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import type { BookingListItem } from '@/features/bookings/queries';
import { statusLabel, statusTone } from '@/features/bookings/status';
import { formatPrice, formatTimeRange } from '@/lib/format';
import { useTheme } from '@/theme';

type Props = {
  booking: BookingListItem;
  zone: string;
  showStaff?: boolean;
  onPress: () => void;
};

export function BookingCard({ booking, zone, showStaff = false, onPress }: Props) {
  const theme = useTheme();
  const cancelled = booking.status.startsWith('cancelled') || booking.status === 'no_show';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatTimeRange(booking.startsAt, booking.endsAt, zone)} ${booking.clientName}`}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: theme.spacing.lg,
        gap: theme.spacing.xs,
        opacity: pressed ? 0.85 : cancelled ? 0.6 : 1,
      })}
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
  );
}
