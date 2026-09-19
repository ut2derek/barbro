import { Image } from 'expo-image';
import { View } from 'react-native';

import { Stars } from '@/components/ui/stars';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

const COVER_HEIGHT = 160;
const AVATAR_SIZE = 96;

/** Dwie pierwsze litery nazwy — zastępują logo, dopóki salon go nie wgra. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

type Props = {
  name: string;
  address: string;
  logoUrl: string | null;
  coverUrl: string | null;
  brandColor: string | null;
  /** Średnia ocen salonu; puste, gdy nie ma jeszcze opinii. */
  rating?: number | null;
  reviewsCount?: number;
};

/**
 * Nagłówek strony rezerwacji: okładka, logo w kółku na jej krawędzi, pod spodem
 * nazwa i adres. Bez wgranych grafik pokazujemy kolor salonu i inicjały —
 * strona ma wyglądać kompletnie od pierwszego dnia, jeszcze przed zdjęciami.
 */
export function SalonHeader({
  name,
  address,
  logoUrl,
  coverUrl,
  brandColor,
  rating = null,
  reviewsCount = 0,
}: Props) {
  const theme = useTheme();
  const accent = brandColor ?? theme.colors.accentMuted;

  return (
    <View style={{ alignItems: 'center', marginBottom: theme.spacing.md }}>
      <View
        style={{
          width: '100%',
          height: COVER_HEIGHT,
          backgroundColor: accent,
          borderRadius: theme.radius.lg,
          overflow: 'hidden',
        }}
      >
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            accessibilityLabel={name}
            transition={200}
          />
        ) : null}
      </View>

      <View
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: AVATAR_SIZE / 2,
          marginTop: -AVATAR_SIZE / 2,
          borderWidth: 4,
          borderColor: theme.colors.background,
          backgroundColor: theme.colors.surfaceElevated,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {logoUrl ? (
          <Image
            source={{ uri: logoUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            accessibilityLabel={name}
            transition={200}
          />
        ) : (
          <Text variant="title">{initials(name)}</Text>
        )}
      </View>

      <View style={{ alignItems: 'center', gap: theme.spacing.xxs, marginTop: theme.spacing.sm }}>
        <Text variant="display" style={{ textAlign: 'center' }}>
          {name}
        </Text>
        {address ? (
          <Text tone="secondary" style={{ textAlign: 'center' }}>
            {address}
          </Text>
        ) : null}
        {reviewsCount > 0 ? <Stars value={rating} count={reviewsCount} /> : null}
      </View>
    </View>
  );
}