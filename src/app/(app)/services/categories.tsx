import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import {
  useDeleteCategory,
  useSaveCategory,
  useServiceCategories,
} from '@/features/services/queries';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

/** Kategorie porządkują cennik — „Strzyżenie”, „Broda”, „Koloryzacja”. */
export default function CategoriesScreen() {
  const theme = useTheme();
  const { data: salon } = useCurrentSalon();
  const { data: categories } = useServiceCategories(salon?.salonId);

  const saveCategory = useSaveCategory();
  const deleteCategory = useDeleteCategory();

  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<Record<string, string>>({});

  return (
    <Screen scroll>
      <Text variant="title">{t('categories.title')}</Text>
      <Text tone="secondary">{t('categories.description')}</Text>

      {(categories ?? []).map((category, index) => (
        <Card key={category.id}>
          <Input
            label={t('categories.name')}
            value={editing[category.id] ?? category.name}
            onChangeText={(value) => setEditing({ ...editing, [category.id]: value })}
          />
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Button
              label={t('common.save')}
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() =>
                void saveCategory.mutateAsync({
                  salonId: salon!.salonId,
                  id: category.id,
                  name: editing[category.id] ?? category.name,
                  sortOrder: category.sortOrder,
                })
              }
            />
            <Button
              label={t('categories.remove')}
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => void deleteCategory.mutateAsync(category.id)}
            />
          </View>
          <Text variant="small" tone="muted">
            {t('categories.position', { position: index + 1 })}
          </Text>
        </Card>
      ))}

      <Card>
        <Text variant="heading">{t('categories.addTitle')}</Text>
        <Input label={t('categories.name')} value={newName} onChangeText={setNewName} />
        <Button
          label={t('categories.add')}
          loading={saveCategory.isPending}
          disabled={newName.trim().length === 0}
          onPress={async () => {
            await saveCategory.mutateAsync({
              salonId: salon!.salonId,
              name: newName,
              sortOrder: (categories?.length ?? 0) + 1,
            });
            setNewName('');
          }}
        />
      </Card>

      <Text variant="small" tone="muted">
        {t('categories.deleteNote')}
      </Text>
    </Screen>
  );
}