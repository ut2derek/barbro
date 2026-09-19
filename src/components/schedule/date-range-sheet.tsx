import { DateTime } from 'luxon';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

/** Skróty dni tygodnia nad siatką: pon … niedz. */
const WEEKDAY_HEADS = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
  DateTime.fromObject({ weekday: weekday as 1 })
    .setLocale('pl')
    .toFormat('ccccc'),
);

type Range = { from: DateTime; to: DateTime };

/**
 * WYBÓR DNIA ALBO ZAKRESU DNI Z KALENDARZA
 *
 * Nieobecność bywa jednodniowa („dziś wychodzę o 14”) i dwutygodniowa
 * („urlop w lipcu”). Strzałki obok daty załatwiają to pierwsze, ale do
 * zaznaczenia wakacji za miesiąc trzeba widzieć kalendarz i móc przeskoczyć
 * miesiąc do przodu.
 *
 * Pierwsze dotknięcie ustawia początek, drugie koniec. Dotknięcie dnia przed
 * początkiem zaczyna zaznaczanie od nowa — prościej niż tłumaczyć, że zakres
 * trzeba wskazywać w kolejności.
 */
export function DateRangeSheet({
  visible,
  initial,
  zone,
  onClose,
  onPick,
}: {
  visible: boolean;
  /** Dzień, od którego otwiera się kalendarz. */
  initial: DateTime;
  zone: string;
  onClose: () => void;
  onPick: (range: Range) => void;
}) {
  const theme = useTheme();

  const [month, setMonth] = useState(() => initial.setZone(zone).startOf('month'));
  const [from, setFrom] = useState<DateTime>(initial.setZone(zone).startOf('day'));
  const [to, setTo] = useState<DateTime | null>(null);
  /**
   * Czy użytkownik dotknął już kalendarza. Bez tego pierwsze dotknięcie
   * liczyłoby się jako koniec zakresu, bo początek jest wstępnie ustawiony
   * na oglądany dzień.
   */
  const [started, setStarted] = useState(false);

  const gridStart = month.startOf('week');
  const gridDays = Math.ceil(month.endOf('month').diff(gridStart, 'days').days);
  const today = DateTime.now().setZone(zone).startOf('day');

  function pickDay(day: DateTime) {
    const zaczynamyOdNowa = !started || to !== null || day < from;

    if (zaczynamyOdNowa) {
      setFrom(day);
      setTo(null);
      setStarted(true);
      return;
    }

    setTo(day);
  }

  function inRange(day: DateTime): boolean {
    const end = to ?? from;
    return day >= from && day <= end;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]}
      />

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: theme.colors.surfaceElevated,
          borderTopLeftRadius: theme.radius.lg,
          borderTopRightRadius: theme.radius.lg,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <IconButton
            glyph="‹"
            label={t('calendarRange.previousMonth')}
            onPress={() => setMonth(month.minus({ months: 1 }))}
          />
          <Text variant="heading" style={{ flex: 1, textAlign: 'center' }}>
            {month.setLocale('pl').toFormat('LLLL yyyy')}
          </Text>
          <IconButton
            glyph="›"
            label={t('calendarRange.nextMonth')}
            onPress={() => setMonth(month.plus({ months: 1 }))}
          />
        </View>

        <View style={{ flexDirection: 'row' }}>
          {WEEKDAY_HEADS.map((head, index) => (
            <Text
              key={`${head}-${index}`}
              variant="small"
              tone="muted"
              style={{ flex: 1, textAlign: 'center' }}
            >
              {head}
            </Text>
          ))}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {Array.from({ length: gridDays }, (_, index) => {
            const day = gridStart.plus({ days: index });
            const inMonth = day.month === month.month;
            const selected = inRange(day);
            const edge = day.hasSame(from, 'day') || (to !== null && day.hasSame(to, 'day'));

            return (
              <Pressable
                key={day.toISODate()}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={day.setLocale('pl').toFormat('d MMMM yyyy')}
                onPress={() => pickDay(day)}
                style={{
                  width: `${100 / 7}%`,
                  minHeight: theme.minTouchTarget,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.radius.md,
                  backgroundColor: edge
                    ? theme.colors.accent
                    : selected
                      ? theme.colors.accentMuted
                      : 'transparent',
                }}
              >
                <Text
                  variant={day.hasSame(today, 'day') ? 'bodyStrong' : 'body'}
                  tone={edge ? 'onAccent' : inMonth ? 'primary' : 'muted'}
                >
                  {day.day}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text tone="secondary" variant="small">
          {to === null
            ? t('calendarRange.pickEnd')
            : t('calendarRange.chosen', {
                from: from.setLocale('pl').toFormat('d LLL'),
                to: to.setLocale('pl').toFormat('d LLL'),
              })}
        </Text>

        <Button
          label={t('calendarRange.confirm')}
          onPress={() => onPick({ from, to: to ?? from })}
        />
        <Button label={t('common.cancel')} variant="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}
