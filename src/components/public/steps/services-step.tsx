import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import type { PublicService } from '@/features/public-booking/queries';
import { t } from '@/i18n';
import { formatDuration, formatPrice } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * Jedna usługa na liście. Cała karta i przycisk robią to samo: wybierają tę
 * usługę i prowadzą dalej.
 *
 * Wcześniej dotknięcie karty po cichu dodawało usługę do koszyka, a przycisk
 * „Umów" ten koszyk kasował i rezerwował tylko ją — dwa różne zachowania w
 * jednym kafelku, nie do odgadnięcia. Dobieranie kilku usług wróci osobnym
 * oknem po wybraniu pierwszej.
 */
export function ServiceRow({
  service,
  onBook,
}: {
  service: PublicService;
  onBook: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        gap: theme.spacing.sm,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('publicBooking.pickService', { name: service.name })}
        onPress={onBook}
        style={{ gap: theme.spacing.xxs }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {service.name}
          </Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="bodyStrong">{formatPrice(service.priceGrosz)}</Text>
            {service.promoActive ? (
              <Text variant="small" tone="muted" style={{ textDecorationLine: 'line-through' }}>
                {formatPrice(service.regularPriceGrosz)}
              </Text>
            ) : null}
          </View>
        </View>

        <Text variant="small" tone="muted">
          {formatDuration(service.durationMinutes)}
          {service.categoryName ? ` · ${service.categoryName}` : ''}
        </Text>

        {service.description ? (
          <Text variant="small" tone="secondary">
            {service.description}
          </Text>
        ) : null}

        {/* Wymóg ustawy o informowaniu o cenach. */}
        {service.promoActive && service.lowestPriceBeforePromoGrosz !== null ? (
          <Text variant="small" tone="muted">
            {t('services.lowestPrice', {
              price: formatPrice(service.lowestPriceBeforePromoGrosz),
            })}
          </Text>
        ) : null}
      </Pressable>

      <Button
        label={t('publicBooking.bookService', { price: formatPrice(service.priceGrosz) })}
        onPress={onBook}
      />
    </View>
  );
}

/** Informacja, że salon chwilowo nie przyjmuje rezerwacji przez internet. */
export function BookingDisabledCard({ phone }: { phone: string | null }) {
  return (
    <Card>
      <Text variant="heading">{t('publicBooking.disabledTitle')}</Text>
      <Text tone="secondary">{t('publicBooking.disabledDescription', { phone: phone ?? '' })}</Text>
    </Card>
  );
}