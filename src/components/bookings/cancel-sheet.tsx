import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import type { BookingListItem } from '@/features/bookings/queries';
import { t } from '@/i18n';
import { formatFullDate, formatTimeRange } from '@/lib/format';
import { useTheme } from '@/theme';

type Props = {
  booking: BookingListItem | null;
  zone: string;
  busy?: boolean;
  onClose: () => void;
  /**
   * Identyfikator podajemy razem z powodem, bo wizyta do odwołania jest
   * trzymana w stanie arkusza — ekran nie musi jej stamtąd wyłuskiwać.
   */
  onConfirm: (comment: string, bookingId: string) => void;
};

/**
 * Odwołanie wizyty przez salon. Powód jest wymagany, bo trafia do klienta
 * w mailu — to jedyna informacja, jaką dostanie.
 */
export function CancelSheet({ booking, zone, busy = false, onClose, onConfirm }: Props) {
  const theme = useTheme();
  const [comment, setComment] = useState('');

  if (!booking) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]}
        />

        <View
          style={{
            backgroundColor: theme.colors.surfaceElevated,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            padding: theme.spacing.lg,
            paddingBottom: theme.spacing.xxl,
            gap: theme.spacing.md,
          }}
        >
          <Text variant="title" tone="danger">
            {t('booking.cancelTitle')}
          </Text>

          <Text tone="secondary">
            {booking.clientName} · {formatFullDate(booking.startsAt, zone)},{' '}
            {formatTimeRange(booking.startsAt, booking.endsAt, zone)}
          </Text>

          <Text variant="small" tone="secondary">
            {t('booking.cancelDescription')}
          </Text>

          <Input
            label={t('booking.cancelReason')}
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={3}
            placeholder={t('booking.cancelPlaceholder')}
          />

          <Button
            label={t('booking.cancelConfirm')}
            variant="danger"
            disabled={comment.trim().length < 3}
            loading={busy}
            onPress={() => onConfirm(comment.trim(), booking.id)}
          />

          <Button label={t('booking.keepBooking')} variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}