import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Stars } from '@/components/ui/stars';
import { Text } from '@/components/ui/text';
import { useReplyToReview, useSalonRating, useSalonReviews } from '@/features/reviews/queries';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { useSalonTimezone } from '@/features/salon/use-salon-timezone';
import { t } from '@/i18n';
import { formatFullDate } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * Opinie klientów. Salon może odpowiedzieć, ale nie może usunąć ani ukryć —
 * dlatego w ogóle warto je czytać.
 */
export default function ReviewsScreen() {
  const zone = useSalonTimezone();
  const theme = useTheme();
  const router = useRouter();
  const { data: salon } = useCurrentSalon();
  const { data: reviews, isPending } = useSalonReviews(salon?.salonId);
  const { data: rating } = useSalonRating(salon?.salonId);
  const reply = useReplyToReview();

  const [replying, setReplying] = useState<string | null>(null);
  const [text, setText] = useState('');

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title">{t('reviews.title')}</Text>
        {rating?.average ? (
          <Stars value={rating.average} count={rating.count} />
        ) : (
          <Text tone="secondary">{t('reviewsAdmin.noneYet')}</Text>
        )}
      </View>

      <Text variant="small" tone="muted">
        {t('reviewsAdmin.policy')}
      </Text>

      {isPending ? (
        <Text tone="muted">{t('common.loading')}</Text>
      ) : (
        (reviews ?? []).map((review) => (
          <Card key={review.id}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: theme.spacing.sm,
              }}
            >
              <Stars value={review.rating} count={null} />
              <Text variant="small" tone="muted">
                {formatFullDate(review.createdAt, zone)}
              </Text>
            </View>

            <Text variant="small" tone="muted">
              {review.clientName} · {review.staffName}
            </Text>

            {review.comment ? <Text>{review.comment}</Text> : null}

            {review.salonReply ? (
              <>
                <Text variant="label" tone="secondary">
                  {t('reviews.salonReply')}
                </Text>
                <Text variant="small">{review.salonReply}</Text>
              </>
            ) : null}

            {replying === review.id ? (
              <>
                <Input
                  label={t('reviewsAdmin.replyLabel')}
                  value={text}
                  onChangeText={setText}
                  multiline
                  numberOfLines={3}
                  placeholder={t('reviewsAdmin.replyPlaceholder')}
                />
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  <Button
                    label={t('common.save')}
                    style={{ flex: 1 }}
                    loading={reply.isPending}
                    onPress={async () => {
                      await reply.mutateAsync({ reviewId: review.id, reply: text });
                      setReplying(null);
                      setText('');
                    }}
                  />
                  <Button
                    label={t('common.cancel')}
                    variant="secondary"
                    style={{ flex: 1 }}
                    onPress={() => setReplying(null)}
                  />
                </View>
              </>
            ) : (
              <Button
                label={review.salonReply ? t('reviewsAdmin.editReply') : t('reviewsAdmin.reply')}
                variant="secondary"
                onPress={() => {
                  setReplying(review.id);
                  setText(review.salonReply ?? '');
                }}
              />
            )}
          </Card>
        ))
      )}

      <Button
        label={t('common.back')}
        variant="secondary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)/(tabs)/more'))}
      />
    </Screen>
  );
}