import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import {
  useDeleteAddon,
  useSaveAddon,
  useServiceAddons,
  useServices,
  type ServiceAddon,
  type ServiceOption,
} from '@/features/services/queries';
import { t } from '@/i18n';
import { formatGroszForInput, parsePriceToGrosz } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * Ekran ładuje dane, formularz je dostaje. Rozdzielone celowo:
 * formularz montuje się raz, z kluczem opartym o identyfikator dodatku,
 * więc ponowne pobranie tych samych danych nie kasuje tego, co barber
 * zdążył wpisać. Wcześniej robił to `useEffect` i wpisane zmiany znikały
 * po powrocie do aplikacji.
 */
export default function AddonFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const { data: salon } = useCurrentSalon();
  const { data: addons, isPending } = useServiceAddons(salon?.salonId);
  const { data: services } = useServices({ salonId: salon?.salonId });

  const existing = isNew ? undefined : addons?.find((addon) => addon.id === id);

  if (!salon || (!isNew && isPending)) return <Loading />;

  return (
    <AddonForm
      key={existing?.id ?? 'new'}
      salonId={salon.salonId}
      addonId={isNew ? undefined : id}
      existing={existing}
      services={services ?? []}
      addonsCount={addons?.length ?? 0}
    />
  );
}

function AddonForm({
  salonId,
  addonId,
  existing,
  services,
  addonsCount,
}: {
  salonId: string;
  addonId: string | undefined;
  existing: ServiceAddon | undefined;
  services: ServiceOption[];
  addonsCount: number;
}) {
  const theme = useTheme();
  const router = useRouter();
  const saveAddon = useSaveAddon();
  const deleteAddon = useDeleteAddon();

  const isNew = addonId === undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [serviceId, setServiceId] = useState<string | null>(existing?.serviceId ?? null);
  const [price, setPrice] = useState(
    existing ? formatGroszForInput(existing.priceGrosz) : '0,00',
  );
  const [duration, setDuration] = useState(String(existing?.durationMinutes ?? 10));
  const [maxQuantity, setMaxQuantity] = useState(String(existing?.maxQuantity ?? 1));
  const [active, setActive] = useState(existing?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    setError(null);

    const priceGrosz = parsePriceToGrosz(price);
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
        salonId,
        id: addonId,
        serviceId,
        name,
        description,
        priceGrosz,
        durationMinutes,
        maxQuantity: quantity,
        active,
        sortOrder: isNew ? addonsCount + 1 : undefined,
      });
      router.replace('/(app)/addons');
    } catch {
      setError(t('addonsAdmin.saveError'));
    }
  }

  return (
    <Screen scroll>
      <Stack.Screen
        options={{ title: isNew ? t('addonsAdmin.newTitle') : t('addonsAdmin.editTitle') }}
      />

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
          {services.map((service) => (
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
                await deleteAddon.mutateAsync(addonId!);
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
