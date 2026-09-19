import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import {
  useDeleteAddon,
  useSaveAddon,
  useServiceAddons,
  useServices,
} from '@/features/services/queries';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

/** Kwoty wpisujemy w złotych, w bazie żyją w groszach. */
function toGrosz(value: string): number | null {
  const normalized = value.replace(',', '.').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

export default function AddonFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const { data: salon } = useCurrentSalon();
  const { data: addons } = useServiceAddons(salon?.salonId);
  const { data: services } = useServices({ salonId: salon?.salonId });
  const saveAddon = useSaveAddon();
  const deleteAddon = useDeleteAddon();

  const existing = isNew ? undefined : addons?.find((addon) => addon.id === id);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [price, setPrice] = useState('0,00');
  const [duration, setDuration] = useState('10');
  const [maxQuantity, setMaxQuantity] = useState('1');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setDescription(existing.description ?? '');
    setServiceId(existing.serviceId);
    setPrice((existing.priceGrosz / 100).toFixed(2).replace('.', ','));
    setDuration(String(existing.durationMinutes));
    setMaxQuantity(String(existing.maxQuantity));
    setActive(existing.active);
  }, [existing]);

  async function save() {
    setError(null);

    const priceGrosz = toGrosz(price);
    const durationMinutes = Number(duration);
    const quantity = Number(maxQuantity);

    if (!name.trim()) return setError(t('addonsAdmin.nameRequired'));
    if (priceGrosz === null) return setError(t('addonsAdmin.badPrice'));
    if (!Number.isInteger(durationMinutes) || durationMinutes < 0 || durationMinutes > 240)
      return setError(t('addonsAdmin.badDuration'));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10)
      return setError(t('addonsAdmin.badQuantity'));

    try {
      await saveAddon.mutateAsync({
        salonId: salon!.salonId,
        id: isNew ? undefined : id,
        serviceId,
        name,
        description,
        priceGrosz,
        durationMinutes,
        maxQuantity: quantity,
        active,
        sortOrder: isNew ? (addons?.length ?? 0) + 1 : undefined,
      });
      router.replace('/(app)/addons');
    } catch {
      setError(t('addonsAdmin.saveError'));
    }
  }

  return (
    <Screen scroll>
      <Text variant="title">
        {isNew ? t('addonsAdmin.newTitle') : t('addonsAdmin.editTitle')}
      </Text>

      <Input label={t('addonsAdmin.name')} value={name} onChangeText={setName} />
      <Input
        label={t('addonsAdmin.description')}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={2}
        hint={t('addonsAdmin.descriptionHint')}
      />

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label" tone="secondary">
          {t('addonsAdmin.attachedTo')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          <Chip
            label={t('addonsAdmin.everyService')}
            selected={serviceId === null}
            onPress={() => setServiceId(null)}
          />
          {(services ?? []).map((service) => (
            <Chip
              key={service.id}
              label={service.name}
              selected={serviceId === service.id}
              onPress={() => setServiceId(service.id)}
            />
          ))}
        </View>
        <Text variant="small" tone="muted">
          {t('addonsAdmin.attachedHint')}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <View style={{ flex: 1 }}>
          <Input
            label={t('addonsAdmin.price')}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label={t('addonsAdmin.duration')}
            value={duration}
            onChangeText={setDuration}
            keyboardType="number-pad"
            hint={t('addonsAdmin.durationHint')}
          />
        </View>
      </View>

      <Input
        label={t('addonsAdmin.maxQuantityField')}
        value={maxQuantity}
        onChangeText={setMaxQuantity}
        keyboardType="number-pad"
        hint={t('addonsAdmin.maxQuantityHint')}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: theme.minTouchTarget,
        }}
      >
        <Text style={{ flex: 1 }}>{t('addonsAdmin.active')}</Text>
        <Switch value={active} onValueChange={setActive} />
      </View>

      {error ? <Text tone="danger">{error}</Text> : null}

      <Button label={t('common.save')} loading={saveAddon.isPending} onPress={() => void save()} />

      {!isNew ? (
        confirmDelete ? (
          <Card style={{ borderColor: theme.colors.danger }}>
            <Text tone="secondary">{t('addonsAdmin.deleteWarning')}</Text>
            <Button
              label={t('addonsAdmin.deleteConfirm')}
              variant="danger"
              loading={deleteAddon.isPending}
              onPress={async () => {
                await deleteAddon.mutateAsync(id);
                router.replace('/(app)/addons');
              }}
            />
            <Button
              label={t('common.cancel')}
              variant="secondary"
              onPress={() => setConfirmDelete(false)}
            />
          </Card>
        ) : (
          <Button
            label={t('addonsAdmin.delete')}
            variant="secondary"
            onPress={() => setConfirmDelete(true)}
          />
        )
      ) : null}

      <Button
        label={t('common.cancel')}
        variant="secondary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)/addons'))}
      />
    </Screen>
  );
}
