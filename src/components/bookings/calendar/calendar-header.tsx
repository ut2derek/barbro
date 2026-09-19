import { Pressable, ScrollView, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

export type CalendarMode = 'day' | 'week' | 'month';

export type StaffChip = { id: string; display_name: string };

/** Górna część kalendarza: tryb widoku, nawigacja po datach, wybór fryzjera. */
export function CalendarHeader({
  mode,
  onModeChange,
  title,
  isToday,
  onShift,
  onOpenMonthPicker,
  onBackToToday,
  staff,
  staffId,
  onStaffChange,
}: {
  mode: CalendarMode;
  onModeChange: (mode: CalendarMode) => void;
  title: string;
  isToday: boolean;
  onShift: (direction: 1 | -1) => void;
  onOpenMonthPicker: () => void;
  onBackToToday: () => void;
  /** Pusta lista = nie pokazujemy wyboru (pracownik albo salon jednoosobowy). */
  staff: StaffChip[];
  staffId: string | null;
  onStaffChange: (staffId: string | null) => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.lg,
        gap: theme.spacing.md,
        width: '100%',
        maxWidth: 560,
        alignSelf: 'center',
      }}
    >
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Chip
          label={t('calendar.modeDay')}
          selected={mode === 'day'}
          onPress={() => onModeChange('day')}
        />
        <Chip
          label={t('calendar.modeWeek')}
          selected={mode === 'week'}
          onPress={() => onModeChange('week')}
        />
        <Chip
          label={t('calendar.modeMonth')}
          selected={mode === 'month'}
          onPress={() => onModeChange('month')}
        />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <IconButton glyph="‹" label={t('calendar.previous')} onPress={() => onShift(-1)} />

        <View style={{ flex: 1, alignItems: 'center' }}>
          {/* Nagłówek jest przyciskiem — otwiera wybór miesiąca i roku. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('calendar.pickMonth')}
            onPress={onOpenMonthPicker}
            style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}
          >
            <Text variant="heading">{title} ⌄</Text>
          </Pressable>

          {isToday && mode === 'day' ? (
            <Text variant="small" tone="muted">
              {t('calendar.today')}
            </Text>
          ) : (
            <Pressable accessibilityRole="button" onPress={onBackToToday}>
              <Text variant="small" tone="accent">
                {t('calendar.backToToday')}
              </Text>
            </Pressable>
          )}
        </View>

        <IconButton glyph="›" label={t('calendar.next')} onPress={() => onShift(1)} />
      </View>

      {staff.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Chip
              label={t('calendar.allStaff')}
              selected={staffId === null}
              onPress={() => onStaffChange(null)}
            />
            {staff.map((member) => (
              <Chip
                key={member.id}
                label={member.display_name}
                selected={staffId === member.id}
                onPress={() => onStaffChange(member.id)}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}
