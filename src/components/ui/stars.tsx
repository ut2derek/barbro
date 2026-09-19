import { Pressable, View } from 'react-native';

import { t } from '@/i18n';
import { useTheme } from '@/theme';

import { Text } from './text';

type Props = {
  /** Ocena 1–5. Null = brak oceny. */
  value: number | null;
  /** Podany = gwiazdki można klikać. */
  onChange?: (value: number) => void;
  size?: 'small' | 'large';
  count?: number | null;
};

/**
 * Gwiazdki — do pokazywania średniej i do wystawiania oceny.
 * Docelowy design podmieni znak gwiazdki na ikonę; kształt pozostaje ten sam.
 */
export function Stars({ value, onChange, size = 'small', count }: Props) {
  const theme = useTheme();
  const filled = Math.round(value ?? 0);
  const starSize = size === 'large' ? 32 : 16;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= filled;
        const glyph = (
          <Text
            style={{
              fontSize: starSize,
              lineHeight: starSize * 1.2,
              color: active ? theme.colors.warning : theme.colors.border,
            }}
          >
            ★
          </Text>
        );

        if (!onChange) return <View key={star}>{glyph}</View>;

        return (
          <Pressable
            key={star}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t('reviews.starLabel', { count: star })}
            onPress={() => onChange(star)}
            style={{
              minWidth: size === 'large' ? theme.minTouchTarget : starSize,
              minHeight: size === 'large' ? theme.minTouchTarget : starSize,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {glyph}
          </Pressable>
        );
      })}

      {value !== null ? (
        <Text variant="small" tone="secondary" style={{ marginLeft: theme.spacing.xxs }}>
          {value.toFixed(1).replace('.', ',')}
          {count !== null && count !== undefined ? ` (${count})` : ''}
        </Text>
      ) : null}
    </View>
  );
}