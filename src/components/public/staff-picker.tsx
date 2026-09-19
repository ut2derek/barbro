import { Image } from 'expo-image';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { PublicStaff } from '@/features/public-booking/queries';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

type Props = {
  staff: PublicStaff[];
  selected: string | null;
  onSelect: (staffId: string | null) => void;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Kółko z jednym fryzjerem.
 *
 * Komponent stoi POZA `StaffPicker` celowo. Zdefiniowany w środku, był przy
 * każdym renderze nową funkcją, więc React traktował go jak inny komponent
 * i montował od zera: zdjęcia mrugały, a stan przewinięcia się gubił.
 */
function Avatar({
  label,
  photoUrl,
  rating,
  isSelected,
  onPress,
}: {
  label: string;
  photoUrl: string | null;
  rating?: number | null;
  isSelected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{ alignItems: 'center', gap: theme.spacing.xxs, width: 88 }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          backgroundColor: theme.colors.surface,
          borderWidth: isSelected ? 3 : 1,
          borderColor: isSelected ? theme.colors.accent : theme.colors.border,
        }}
      >
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            accessibilityLabel={label}
          />
        ) : (
          <Text variant="bodyStrong" tone="secondary">
            {initials(label)}
          </Text>
        )}
      </View>
      <Text variant="small" style={{ textAlign: 'center' }}>
        {label}
      </Text>
      {rating ? (
        <Text variant="small" tone="secondary">
          ★ {rating.toFixed(1).replace('.', ',')}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Wybór fryzjera kółkami ze zdjęciem — „dowolny" jest pierwszy, bo najczęstszy. */
export function StaffPicker({ staff, selected, onSelect }: Props) {
  const theme = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Avatar
          label={t('publicBooking.anyStaff')}
          photoUrl={null}
          isSelected={selected === null}
          onPress={() => onSelect(null)}
        />
        {staff.map((member) => (
          <Avatar
            key={member.id}
            label={member.name}
            photoUrl={member.photoUrl}
            rating={member.rating}
            isSelected={selected === member.id}
            onPress={() => onSelect(member.id)}
          />
        ))}
      </View>
    </ScrollView>
  );
}
