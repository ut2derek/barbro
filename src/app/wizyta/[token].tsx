import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Stars } from '@/components/ui/stars';
import { Text } from '@/components/ui/text';
import { statusLabel, statusTone } from '@/features/bookings/status';
import type { BookingStatus } from '@/features/bookings/queries';
import {
  useCancelBookingByToken,
  useConfirmBookingByToken,
  usePublicBookingByToken,
  useReviewState,
  useSubmitReview,
} from '@/features/public-booking/queries';
import { t } from '@/i18n';
import { formatFullDate, formatPrice, formatTimeRange } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * Wizyta otwarta z linku wysłanego klientowi. Bez konta i bez hasła —
 * dostęp daje sam token, dlatego jest długi, jednorazowy i wygasa.
 */
export default function ClientBookingScreen() {
  const theme = useTheme();
  const { token } = useLocalSearchParams<{ token: string }>();

  const { data, isPending, error, refetch } = usePublicBookingByToken(token);
  const confirm = useConfirmBookingByToken();
  const cancel = useCancelBookingByToken();
  const { data: reviewState, refetch: refetchReview } = useReviewState(token);
  const submitReview = useSubmitReview();

  const [rating, setRating] = useState<number | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  if (isPending) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Text tone="muted">{t('common.loading')}</Text>
      </Screen>
    );
  }

  if (error || !data) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Text variant="title">{t('clientBooking.invalidTitle')}</Text>
        <Text tone="secondary">{t('clientBooking.invalidDescription')}</Text>
      </Screen>
    );
  }

  const booking = data;
  const zone = booking.timezone;
  const needsConfirmation = booking.status === 'pending_confirmation';
  const isCancelled = booking.status.startsWith('cancelled');

  async function run(action: 'confirm' | 'cancel') {
    setActionError(null);
    try {
      if (action === 'confirm') {
        await confirm.mutateAsync(token);
      } else {
        await cancel.mutateAsync(token);
        setCancelling(false);
      }
      await refetch();
    } catch (cause) {
      setActionError((cause as Error).message || t('clientBooking.actionError'));
    }
  }

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <View style={{ gap: theme.spacing.xxs }}>
        <Text variant="display">{booking.salonName}</Text>
        <Text tone="secondary">
          {t('clientBooking.greeting', { name: booking.clientName })}
        </Text>
      </View>

      <Card>
        <Text variant="heading">{formatFullDate(booking.startsAt, zone)}</Text>
        <Text variant="title">{formatTimeRange(booking.startsAt, booking.endsAt, zone)}</Text>
        <Text tone="secondary">{booking.services.join(' + ')}</Text>
        <Text tone="secondary">{booking.staffName}</Text>
        <Text variant="bodyStrong">{formatPrice(booking.totalPriceGrosz)}</Text>
        <Badge
          label={statusLabel(booking.status as BookingStatus)}
          tone={statusTone(booking.status as BookingStatus)}
        />
      </Card>

      {needsConfirmation ? (
        <Card style={{ borderColor: theme.colors.warning }}>
          <Text variant="heading">{t('clientBooking.confirmTitle')}</Text>
          <Text tone="secondary">{t('clientBooking.confirmDescription')}</Text>
          <Button
            label={t('clientBooking.confirmButton')}
            loading={confirm.isPending}
            onPress={() => void run('confirm')}
          />
        </Card>
      ) : isCancelled ? (
        <Card>
          <Text variant="heading">{t('clientBooking.cancelledTitle')}</Text>
          <Text tone="secondary">{t('clientBooking.cancelledDescription')}</Text>
        </Card>
      ) : (
        <Card>
          <Text variant="heading">{t('clientBooking.confirmedTitle')}</Text>
          <Text tone="secondary">
            {booking.status === 'pending_approval'
              ? t('clientBooking.waitingForSalon')
              : t('clientBooking.seeYouThere')}
          </Text>
        </Card>
      )}

      {actionError ? <Text tone="danger">{actionError}</Text> : null}

      {/* Opinię wystawia się dopiero po wizycie — wcześniej nie ma o czym pisać. */}
      {reviewState?.canReview ? (
        <Card>
          <Text variant="heading">{t('reviews.rateVisitTitle')}</Text>
          <Text tone="secondary" variant="small">
            {t('reviews.rateVisitDescription')}
          </Text>

          <Stars value={rating} onChange={setRating} size="large" count={null} />

          <Input
            label={t('reviews.comment')}
            value={reviewComment}
            onChangeText={setReviewComment}
            multiline
            numberOfLines={3}
            placeholder={t('reviews.commentPlaceholder')}
          />

          {reviewError ? <Text tone="danger">{reviewError}</Text> : null}

          <Button
            label={t('reviews.submit')}
            loading={submitReview.isPending}
            onPress={async () => {
              setReviewError(null);
              if (!rating) {
                setReviewError(t('reviews.pickRating'));
                return;
              }
              try {
                await submitReview.mutateAsync({ token, rating, comment: reviewComment });
                await refetchReview();
              } catch (cause) {
                setReviewError((cause as Error).message || t('reviews.submitError'));
              }
            }}
          />
        </Card>
      ) : reviewState?.review ? (
        <Card>
          <Text variant="heading">{t('reviews.yourReview')}</Text>
          <Stars value={reviewState.review.rating} count={null} />
          {reviewState.review.comment ? <Text>{reviewState.review.comment}</Text> : null}
          {reviewState.review.salonReply ? (
            <>
              <Text variant="label" tone="secondary">
                {t('reviews.salonReply')}
              </Text>
              <Text variant="small">{reviewState.review.salonReply}</Text>
            </>
          ) : null}
        </Card>
      ) : null}

      {booking.canCancel ? (
        cancelling ? (
          <Card style={{ borderColor: theme.colors.danger }}>
            <Text variant="heading" tone="danger">
              {t('clientBooking.cancelQuestion')}
            </Text>
            <Text tone="secondary" variant="small">
              {t('clientBooking.cancelWarning')}
            </Text>
            <Button
              label={t('clientBooking.cancelConfirm')}
              variant="danger"
              loading={cancel.isPending}
              onPress={() => void run('cancel')}
            />
            <Button
              label={t('clientBooking.keepBooking')}
              variant="secondary"
              onPress={() => setCancelling(false)}
            />
          </Card>
        ) : (
          <Button
            label={t('clientBooking.cancelButton')}
            variant="secondary"
            onPress={() => setCancelling(true)}
          />
        )
      ) : !isCancelled ? (
        <Text variant="small" tone="muted">
          {t('clientBooking.tooLateToCancel', { hours: booking.cancelLeadHours })}
        </Text>
      ) : null}

      {booking.cancellationPolicy ? (
        <Card>
          <Text variant="label" tone="secondary">
            {t('publicBooking.policy')}
          </Text>
          <Text variant="small">{booking.cancellationPolicy}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}
