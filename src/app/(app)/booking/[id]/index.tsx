import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { BookingPhotos } from '@/components/bookings/booking-photos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useBookingPhotos } from '@/features/bookings/photos';
import { useBooking, useChangeBookingStatus } from '@/features/bookings/queries';
import { statusLabel, statusTone } from '@/features/bookings/status';
import { useCurrentSalon, useMyStaffId } from '@/features/salon/use-current-salon';
import { useSalonTimezone } from '@/features/salon/use-salon-timezone';
import { t } from '@/i18n';
import { formatFullDate, formatPrice, formatTimeRange } from '@/lib/format';
import { useTheme } from '@/theme';

export default function BookingDetailScreen() {
  const zone = useSalonTimezone();
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: booking, isPending } = useBooking(id);
  const { data: salon } = useCurrentSalon();
  const { data: myStaffId } = useMyStaffId();
  const { data: photos, isPending: photosPending } = useBookingPhotos(id ? [id] : []);
  const changeStatus = useChangeBookingStatus();

  const [cancelling, setCancelling] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (isPending || !booking) {
    return (
      <Screen>
        <Text tone="muted">{t('common.loading')}</Text>
      </Screen>
    );
  }

  const isPendingApproval = booking.status === 'pending_approval';
  const isConfirmed = booking.status === 'confirmed';
  const canReschedule = ['pending_confirmation', 'pending_approval', 'confirmed'].includes(
    booking.status,
  );
  const canCancel = canReschedule;

  async function apply(status: Parameters<typeof changeStatus.mutate>[0]['status'], text?: string) {
    setError(null);
    try {
      await changeStatus.mutateAsync({ bookingId: booking!.id, status, comment: text });
      setCancelling(false);
      setComment('');
    } catch {
      setError(t('booking.actionError'));
    }
  }

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title">{formatTimeRange(booking.startsAt, booking.endsAt, zone)}</Text>
        <Text tone="secondary">{formatFullDate(booking.startsAt, zone)}</Text>
        <Badge label={statusLabel(booking.status)} tone={statusTone(booking.status)} />
      </View>

      <Card>
        <Text variant="heading">{booking.clientName}</Text>
        <Text tone="secondary">{booking.clientPhone}</Text>
        <Button
          label={t('booking.call')}
          variant="secondary"
          onPress={() => void Linking.openURL(`tel:${booking.clientPhone.replace(/\s/g, '')}`)}
        />
      </Card>

      <Card>
        <Text variant="heading">{t('booking.services')}</Text>
        {booking.services.map((service, index) => (
          <Text key={`${service}-${index}`} tone="secondary">
            {service}
          </Text>
        ))}
        <Text variant="bodyStrong">{formatPrice(booking.totalPriceGrosz)}</Text>
        <Text variant="small" tone="muted">
          {t('booking.priceLocked')}
        </Text>
      </Card>

      <Card>
        <BookingPhotos
          bookingId={booking.id}
          salonId={salon?.salonId}
          photos={photos?.[booking.id] ?? []}
          loading={photosPending}
          canEdit={salon?.role === 'owner' || booking.staffId === myStaffId}
        />
      </Card>

      <Card>
        <Text variant="label" tone="secondary">
          {t('booking.staff')}
        </Text>
        <Text>{booking.staffName}</Text>
        {booking.clientNote ? (
          <>
            <Text variant="label" tone="secondary">
              {t('booking.clientNote')}
            </Text>
            <Text>{booking.clientNote}</Text>
          </>
        ) : null}
        {booking.cancellationComment ? (
          <>
            <Text variant="label" tone="secondary">
              {t('booking.cancellationComment')}
            </Text>
            <Text>{booking.cancellationComment}</Text>
          </>
        ) : null}
      </Card>

      {error ? <Text tone="danger">{error}</Text> : null}

      {isPendingApproval ? (
        <Button
          label={t('booking.accept')}
          loading={changeStatus.isPending}
          onPress={() => void apply('confirmed')}
        />
      ) : null}

      {isConfirmed ? (
        <>
          <Button
            label={t('booking.markCompleted')}
            loading={changeStatus.isPending}
            onPress={() => void apply('completed')}
          />
          <Button
            label={t('booking.markNoShow')}
            variant="secondary"
            loading={changeStatus.isPending}
            onPress={() => void apply('no_show')}
          />
        </>
      ) : null}

      {canReschedule ? (
        <Button
          label={t('booking.reschedule')}
          variant="secondary"
          onPress={() => router.push(`/(app)/booking/${booking.id}/reschedule`)}
        />
      ) : null}

      {canCancel ? (
        cancelling ? (
          <Card style={{ borderColor: theme.colors.danger }}>
            <Text variant="heading" tone="danger">
              {t('booking.cancelTitle')}
            </Text>
            <Text tone="secondary" variant="small">
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
              loading={changeStatus.isPending}
              onPress={() => void apply('cancelled_by_salon', comment.trim())}
            />
            <Button
              label={t('common.cancel')}
              variant="secondary"
              onPress={() => setCancelling(false)}
            />
          </Card>
        ) : (
          <Button
            label={t('booking.cancelBooking')}
            variant="secondary"
            onPress={() => setCancelling(true)}
          />
        )
      ) : null}
    </Screen>
  );
}