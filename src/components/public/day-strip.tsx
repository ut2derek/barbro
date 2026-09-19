import type { DateTime } from 'luxon';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

type Props = {
  from: DateTime;
  days: number;
  selected: DateTime;
  onSelect: (day: DateTime) => void;
};

/**
 * Pasek dni do przewijania w bok — szybszy na telefonie niż pełny kalendarz,
 * a do dalszych terminów służy wybór miesiąca nad nim.
 */
export function DayStrip({ from, days, selected, onSelect }: Props) {
  const theme = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {Array.from({ length: days }, (_, index) => from.plus({ days: index })).map((day) => {
          const isSelected = day.hasSame(selected, 'day');

          return (
            <Pressable
              key={day.toISODate()}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={day.setLocale('pl').toLocaleString({
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
              onPress={() => onSelect(day)}
              style={{ alignItems: 'center', gap: theme.spacing.xxs, width: 56 }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSelected ? theme.colors.accent : theme.colors.surface,
                  borderWidth: 1,
                  borderColor: isSelected ? theme.colors.accent : theme.colors.border,
                }}
              >
                <Text variant="bodyStrong" tone={isSelected ? 'onAccent' : 'primary'}>
                  {day.day}
                </Text>
              </View>
              <Text variant="small" tone={isSelected ? 'primary' : 'muted'}>
                {day.setLocale('pl').toFormat('ccc')}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}