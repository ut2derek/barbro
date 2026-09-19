import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

/** Nagłówek kroku ze strzałką powrotu — ten sam w kroku terminu i danych. */
export function StepHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('publicBooking.back')}
        onPress={onBack}
        style={{
          width: theme.minTouchTarget,
          height: theme.minTouchTarget,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surface,
        }}
      >
        <Text variant="heading">‹</Text>
      </Pressable>
      <Text variant="title" style={{ flex: 1 }}>
        {title}
      </Text>
    </View>
  );
}
