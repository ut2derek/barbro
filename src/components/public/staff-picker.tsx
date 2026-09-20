import { Pressable, ScrollView, View } from 'react-native';

import { StaffAvatar } from '@/components/staff/staff-avatar';

import { Text } from '@/components/ui/text';
import type { PublicStaff } from '@/features/public-booking/queries';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

type Props = {
  staff: PublicStaff[];
  selected: string | null;
  onSelect: (staffId: string | null) => void;
};

function Avatar({
  label,
  title,
  photoUrl,
  isSelected,
  onPress,
}: {
  label: string;
  title?: string | null;
  photoUrl: string | null;
  isSelected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={title ? `${label}, ${title}` : label}
      onPress={onPress}
      style={{ alignItems: 'center', gap: theme.spacing.xxs, width: 88 }}
    >
      <StaffAvatar name={label} photoUrl={photoUrl} size={64} highlighted={isSelected} />

      <Text variant="small" style={{ textAlign: 'center' }}>
        {label}
      </Text>

      {/* Stopień pod imieniem: klient wybierający fryzjera po raz pierwszy
          nie zna nikogo z zespołu — to jedyna wskazówka, jaką ma. */}
      {title ? (
        <Text variant="small" tone="muted" style={{ textAlign: 'center' }}>
          {title}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Wybór fryzjera kółkami ze zdjęciem — „dowolny” jest pierwszy, bo najczęstszy. */
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
            title={member.title}
            photoUrl={member.photoUrl}
            isSelected={selected === member.id}
            onPress={() => onSelect(member.id)}
          />
        ))}
      </View>
    </ScrollView>
  );
}