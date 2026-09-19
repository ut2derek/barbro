import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './text';

export type BadgeTone = 'neutral' | 'warning' | 'success' | 'danger' | 'muted';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const theme = useTheme();

  const { background, color } = {
    neutral: { background: theme.colors.accentMuted, color: theme.colors.textPrimary },
    warning: { background: theme.colors.warningMuted, color: theme.colors.warning },
    success: { background: theme.colors.successMuted, color: theme.colors.success },
    danger: { background: theme.colors.dangerMuted, color: theme.colors.danger },
    muted: { background: theme.colors.surface, color: theme.colors.textMuted },
  }[tone];

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: background,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xxs,
        borderRadius: theme.radius.pill,
      }}
    >
      <Text variant="small" style={{ color, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}
