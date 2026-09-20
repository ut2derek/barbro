import type { ReactNode } from 'react';
import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './text';

type Props = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string;
  /** Znak przed polem — lupka w wyszukiwarce, ikona przy polu daty. */
  icon?: ReactNode;
};

export function Input({ label, error, hint, icon, style, ...rest }: Props) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          minHeight: theme.minTouchTarget,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: error
            ? theme.colors.danger
            : focused
              ? theme.colors.borderStrong
              : theme.colors.border,
          backgroundColor: theme.colors.surfaceElevated,
        }}
      >
        {icon}

        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={theme.colors.textMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            theme.typography.body,
            {
              flex: 1,
              paddingVertical: theme.spacing.sm,
              color: theme.colors.textPrimary,
              // Pole samo nie rysuje już ramki — robi to wiersz wokół niego,
              // żeby ikona leżała w środku pola, a nie obok.
              outlineWidth: 0,
            },
            style,
          ]}
          {...rest}
        />
      </View>

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