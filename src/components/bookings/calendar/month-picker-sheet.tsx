import { DateTime } from 'luxon';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

/** Wybór miesiąca i roku. Otwiera się z nagłówka kalendarza. */
export function MonthPickerSheet({
  visible,
  current,
  zone,
  onClose,
  onPick,
}: {
  visible: boolean;
  current: DateTime;
  zone: string;
  onClose: () => void;
  onPick: (day: DateTime) => void;
}) {
  const theme = useTheme();
  // Klucz na arkuszu (niżej w ekranie) sprawia, że rok startuje od aktualnie
  // oglądanego miesiąca przy każdym otwarciu.
  const [year, setYear] = useState(current.year);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Tło zamykające arkusz leży pod nim, a nie wokół niego — inaczej
          przyciski w arkuszu byłyby przyciskami w przycisku. */}
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
            gap: theme.spacing.lg,
            paddingBottom: theme.spacing.xxl,
          }}
        >
          <Text variant="heading">{t('calendar.pickMonth')}</Text>

          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <IconButton
              glyph="‹"
              label={t('calendar.previousYear')}
              onPress={() => setYear(year - 1)}
            />
            <Text variant="title">{year}</Text>
            <IconButton glyph="›" label={t('calendar.nextYear')} onPress={() => setYear(year + 1)} />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
              const label = DateTime.fromObject({ month })
                .setLocale('pl')
                .toLocaleString({ month: 'short' });
              const selected = current.month === month && current.year === year;

              return (
                <Pressable
                  key={month}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    // Zachowujemy dzień miesiąca, o ile istnieje w nowym miesiącu.
                    const target = DateTime.fromObject({ year, month, day: 1 }, { zone });
                    onPick(target.set({ day: Math.min(current.day, target.daysInMonth ?? 28) }));
                  }}
                  style={{
                    width: '30%',
                    minHeight: theme.minTouchTarget,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: theme.radius.md,
                    borderWidth: 1,
                    borderColor: selected ? theme.colors.accent : theme.colors.border,
                    backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
                  }}
                >
                  <Text variant="label" tone={selected ? 'onAccent' : 'secondary'}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
