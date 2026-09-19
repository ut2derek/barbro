import { Pressable, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { t } from '@/i18n';
import { formatTime } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * SIATKA WOLNYCH TERMINÓW
 *
 * Jedno miejsce dla wszystkich trzech ekranów, które pozwalają wybrać godzinę:
 * ręczna wizyta, przełożenie i strona rezerwacji dla klienta. Wcześniej każdy
 * z nich rysował własną kopię tej samej siatki — czwarty ekran oznaczałby
 * czwartą kopię, a poprawka trafiłaby do jednej z nich.
 *
 * Terminy przychodzą z bazy; komponent ich nie liczy i nie filtruje poza
 * usunięciem powtórzeń (przy „dowolnym fryzjerze" ta sama godzina wraca raz
 * na każdego, kto jest wtedy wolny).
 */

export type SlotOption = { slot_start: string };

type Props = {
  slots: SlotOption[] | undefined;
  zone: string;
  onSelect: (startsAt: string) => void;
  /** Podświetlona godzina — gdy ekran najpierw wybiera, a zapisuje później. */
  selected?: string | null;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
};

export function SlotPicker({
  slots,
  zone,
  onSelect,
  selected = null,
  loading = false,
  emptyTitle,
  emptyDescription,
}: Props) {
  const theme = useTheme();

  if (loading) {
    return <Text tone="muted">{t('common.loading')}</Text>;
  }

  const starts = Array.from(new Set((slots ?? []).map((slot) => slot.slot_start)));

  if (starts.length === 0) {
    return (
      <Card>
        <Text variant="heading">{emptyTitle ?? t('booking.noSlotsTitle')}</Text>
        <Text tone="secondary">{emptyDescription ?? t('booking.noSlotsDescription')}</Text>
      </Card>
    );
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
      {starts.map((start) => {
        const isSelected = selected === start;

        return (
          <Pressable
            key={start}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={t('booking.pickSlot', { time: formatTime(start, zone) })}
            onPress={() => onSelect(start)}
            style={{
              minHeight: theme.minTouchTarget,
              minWidth: 88,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: theme.spacing.lg,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: isSelected ? theme.colors.accent : theme.colors.border,
              backgroundColor: isSelected ? theme.colors.accent : theme.colors.surface,
            }}
          >
            <Text variant="bodyStrong" tone={isSelected ? 'onAccent' : 'primary'}>
              {formatTime(start, zone)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
