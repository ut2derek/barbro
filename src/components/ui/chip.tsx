import { Pressable } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './text';

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        // Bez tego chip w poziomym pasku rozciąga się na całą jego wysokość,
        // a zaokrąglenie „pill” zamienia go wtedy w wielkie koło.
        alignSelf: 'flex-start',
        minHeight: theme.minTouchTarget,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radius.pill,
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
}