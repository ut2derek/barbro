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

/** Wybór fryzjera kółkami ze zdjęciem — „dowolny” jest pierwszy, bo najczęstszy. */
export function StaffPicker({ staff, selected, onSelect }: Props) {
  const theme = useTheme();

  function Avatar({
    label,
    photoUrl,
    isSelected,
    onPress,
  }: {
    label: string;
    photoUrl: string | null;
    isSelected: boolean;
    onPress: () => void;
  }) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
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
      </Pressable>
    );
  }

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
            isSelected={selected === member.id}
            onPress={() => onSelect(member.id)}
          />
        ))}
      </View>
    </ScrollView>
  );
}