import { ScrollView, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

/**
 * Pigułki z kategoriami nad listą usług. Zawężają widok — nie zmieniają
 * niczego w rezerwacji, więc klient może przełączać je bez ryzyka.
 */
export function CategoryPills({
  categories,
  selected,
  onSelect,
}: {
  categories: string[];
  selected: string | null;
  onSelect: (category: string | null) => void;
}) {
  const theme = useTheme();

  // Jedna kategoria (albo żadna) nie jest wyborem — pasek byłby wtedy ozdobą.
  if (categories.length < 2) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Chip
          label={t('publicBooking.allCategories')}
          selected={selected === null}
          onPress={() => onSelect(null)}
        />
        {categories.map((category) => (
          <Chip
            key={category}
            label={category}
            selected={selected === category}
            onPress={() => onSelect(category)}
          />
        ))}
      </View>
    </ScrollView>
  );
}
