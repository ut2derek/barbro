import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme, type TypographyVariant } from '@/theme';

type Props = RNTextProps & {
  variant?: TypographyVariant;
  tone?: 'primary' | 'secondary' | 'muted' | 'accent' | 'danger' | 'warning' | 'success' | 'onAccent';
};

export function Text({ variant = 'body', tone = 'primary', style, ...rest }: Props) {
  const theme = useTheme();

  const color = {
    primary: theme.colors.textPrimary,
    secondary: theme.colors.textSecondary,
    muted: theme.colors.textMuted,
    accent: theme.colors.accent,
    danger: theme.colors.danger,
    warning: theme.colors.warning,
    success: theme.colors.success,
    onAccent: theme.colors.textOnAccent,
  }[tone];

  return <RNText style={[theme.typography[variant], { color }, style]} {...rest} />;
}