import { Pressable, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import type { PublicService } from '@/features/public-booking/queries';
import { t } from '@/i18n';
import { formatDuration, formatPrice } from '@/lib/format';
import { useTheme } from '@/theme';

export type AddonLine = { addon: { id: string; name: string }; quantity: number };

/**
 * „Twoje zamówienie" — wybrane usługi i wiersz z dodatkami otwierający arkusz.
 * Ceny przychodzą policzone z serwera; tutaj wyłącznie je wyświetlamy.
 */
export function OrderSummary({
  services,
  addonLines,
  addonsPrice,
  hasAddons,
  onOpenAddons,
}: {
  services: PublicService[];
  addonLines: AddonLine[];
  addonsPrice: number;
  hasAddons: boolean;
  onOpenAddons: () => void;
}) {
  const theme = useTheme();

  return (
    <Card>
      <Text variant="heading">{t('publicBooking.yourOrder')}</Text>

      {services.map((service) => (
        <View key={service.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{service.name}</Text>
            <Text variant="small" tone="muted">
              {formatDuration(service.durationMinutes)}
            </Text>
          </View>
          <Text variant="bodyStrong">{formatPrice(service.priceGrosz)}</Text>
        </View>
      ))}

      {hasAddons ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('addons.summaryRow')}
          onPress={onOpenAddons}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: theme.minTouchTarget,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            paddingTop: theme.spacing.sm,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text tone={addonLines.length > 0 ? 'primary' : 'muted'}>{t('addons.summaryRow')}</Text>
            {addonLines.map((line) => (
              <Text key={line.addon.id} variant="small" tone="secondary">
                {t('addons.chosen', { count: line.quantity, name: line.addon.name })}
              </Text>
            ))}
          </View>
          <Text tone="secondary">
            {addonsPrice > 0 ? formatPrice(addonsPrice) : t('addons.none')} ›
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
