import { Pressable } from 'react-native';

import { Text } from './text';
import { useTheme } from '@/theme';

/**
 * Kwadratowy przycisk ze znakiem — strzałki nawigacji, powrót, zamknięcie.
 * Zawsze co najmniej 44 px, bo taki jest najmniejszy sensowny cel dotyku.
 *
 * Ten sam kawałek stylu powtarzał się w kalendarzu, wyborze miesiąca
 * i nagłówkach kroków rezerwacji — pięć kopii tego samego.
 */
export function IconButton({
  glyph,
  label,
  onPress,
}: {
  /** Znak na przycisku, np. „‹". */
  glyph: string;
  /** Opis dla czytnika ekranu — „Poprzedni dzień", nie „‹". */
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: theme.minTouchTarget,
        height: theme.minTouchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
      }}
    >
      <Text variant="heading">{glyph}</Text>
    </Pressable>
  );
}