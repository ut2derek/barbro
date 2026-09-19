import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './text';

type Props = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string;
};

export function Input({ label, error, hint, style, ...rest }: Props) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>

      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.textMuted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          theme.typography.body,
          {
            minHeight: theme.minTouchTarget,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: error
              ? theme.colors.danger
              : focused
                ? theme.colors.borderStrong
                : theme.colors.border,
            backgroundColor: theme.colors.surfaceElevated,
            color: theme.colors.textPrimary,
          },
          style,
        ]}
        {...rest}
      />

      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
