import { Card } from '@/components/ui/card';
import { Stars } from '@/components/ui/stars';
import { Text } from '@/components/ui/text';
import type { PublicReview } from '@/features/public-booking/queries';
import { t } from '@/i18n';

/** Opinie publiczne — imię bez nazwiska, bez kontaktu, najwyżej pięć. */
export function ReviewsSection({ reviews }: { reviews: PublicReview[] }) {
  return (
    <>
      <Text variant="heading">{t('reviews.sectionTitle')}</Text>

      {reviews.length === 0 ? (
        <Text tone="muted" variant="small">
          {t('reviews.empty')}
        </Text>
      ) : (
        reviews.slice(0, 5).map((review) => (
          <Card key={review.id}>
            <Stars value={review.rating} count={null} />
            <Text variant="small" tone="muted">
              {review.authorName} · {review.staffName}
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
          </Card>
        ))
      )}
    </>
  );
}