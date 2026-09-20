import { Image } from 'expo-image';
import { View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/**
 * Inicjały z imienia i nazwiska: „Marek Kowalski” → „MK”, „Kasia” → „K”.
 * Dwie litery wystarczą — trzy robią się nieczytelne w małym kółku.
 */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * AVATAR FRYZJERA
 *
 * Zdjęcie, a gdy go nie ma — inicjały w kółku. Pusty placeholder wyglądałby
 * jak błąd wczytywania; inicjały wyglądają na decyzję i od pierwszego dnia
 * pozwalają odróżnić ludzi od siebie.
 *
 * Jeden komponent na całą aplikację: to samo kółko widzi barber na liście
 * zespołu i klient przy wyborze fryzjera.
 */
export function StaffAvatar({
  name,
  photoUrl,
  size = 48,
  highlighted = false,
  style,
}: {
  name: string;
  photoUrl: string | null;
  size?: number;
  /** Zaznaczony fryzjer dostaje obwódkę w kolorze akcentu. */
  highlighted?: boolean;
  style?: ViewStyle;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          backgroundColor: theme.colors.surface,
          borderWidth: highlighted ? 3 : 1,
          borderColor: highlighted ? theme.colors.accent : theme.colors.border,
        },
        style,
      ]}
    >
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          accessibilityLabel={name}
        />
      ) : (
        <Text
          variant="bodyStrong"
          tone="secondary"
          // Litery skalują się z kółkiem — inaczej w dużym avatarze wyglądałyby
          // na zgubione, a w małym nie mieściłyby się wcale.
          style={{ fontSize: Math.round(size * 0.36), lineHeight: Math.round(size * 0.44) }}
        >
          {initials(name)}
        </Text>
      )}
    </View>
  );
}
