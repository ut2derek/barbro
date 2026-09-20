import { useRouter } from 'expo-router';

import { AddonsSheet } from '@/components/public/addons-sheet';
import { SalonHeader } from '@/components/public/salon-header';
import { CategoryPills } from '@/components/public/steps/category-pills';
import { BookingDisabledCard, ServiceRow } from '@/components/public/steps/services-step';
import { ReviewsSection } from '@/components/public/steps/reviews-section';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import type { BookingFlow } from '@/features/public-booking/use-booking-flow';
import { t } from '@/i18n';

/** Krok 1: salon, jego usługi i opinie. */
export function ServicesScreen({ flow }: { flow: BookingFlow }) {
  const router = useRouter();
  const salon = flow.catalog.data!.salon;

  return (
    <>
      <Screen scroll edges={['top', 'bottom']}>
        <SalonHeader
          name={salon.name}
          address={salon.address}
          logoUrl={salon.logoUrl}
          coverUrl={salon.coverUrl}
          brandColor={salon.brandColor}
          rating={salon.rating}
          reviewsCount={salon.reviewsCount}
        />

        {!salon.onlineBookingEnabled ? (
          <BookingDisabledCard phone={salon.phone} />
        ) : (
          <>
            <Text variant="heading">{t('publicBooking.stepServices')}</Text>
            <Text variant="small" tone="muted">
              {t('publicBooking.servicesHint')}
            </Text>

            <CategoryPills
              categories={flow.categories}
              selected={flow.categoryFilter}
              onSelect={flow.setCategoryFilter}
            />

            {flow.visibleServices.map((service) => (
              <ServiceRow
                key={service.id}
                service={service}
                onBook={() => flow.chooseService(service.id)}
              />
            ))}
          </>
        )}

        <ReviewsSection reviews={flow.reviews} />

        <Button
          label={t('publicBooking.backToApp')}
          variant="secondary"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </Screen>

      <AddonsSheet
        visible={flow.addonsOpen}
        serviceName={flow.chosenServices[0]?.name ?? ''}
        addons={flow.relevantAddons}
        chosen={flow.chosenAddons}
        onChange={flow.changeAddons}
        onClose={() => flow.setAddonsOpen(false)}
        onContinue={() => {
          flow.setAddonsOpen(false);
          flow.setStep('term');
        }}
      />
    </>
  );
}
