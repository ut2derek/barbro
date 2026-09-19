import { ActivityIndicator, Pressable, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './text';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: Props) {
  const theme = useTheme();
  const isInactive = disabled || loading;

  const background = {
    primary: theme.colors.accent,
    secondary: theme.colors.surface,
    danger: theme.colors.danger,
  }[variant];

  const tone = variant === 'secondary' ? ('primary' as const) : ('onAccent' as const);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isInactive, busy: loading }}
      onPress={isInactive ? undefined : onPress}
      style={({ pressed }) => [
        {
          minHeight: theme.minTouchTarget,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderRadius: theme.radius.md,
          backgroundColor: background,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: theme.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isInactive ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? theme.colors.textPrimary : theme.colors.textOnAccent} />
      ) : (
        <Text variant="bodyStrong" tone={variant === 'danger' ? 'onAccent' : tone}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}