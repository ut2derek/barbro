import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './text';

export function Loading({ label }: { label?: string }) {
  const theme = useTheme();

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.md,
        backgroundColor: theme.colors.background,
      }}
    >
      <ActivityIndicator color={theme.colors.textSecondary} />
      {label ? (
        <Text tone="secondary" variant="small">
          {label}
        </Text>
      ) : null}
    </View>
  );
}
