import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
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
import { useSalonTimezone } from '@/features/salon/use-salon-timezone';
import {
  useDeleteService,
  useSaveService,
  useServiceCategories,
  useServices,
  type ServiceCategory,
  type ServiceOption,
} from '@/features/services/queries';
import { t } from '@/i18n';
import { formatGroszForInput, formatPrice, parsePriceToGrosz } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * Ekran ładuje dane, formularz je dostaje. Formularz montuje się raz, więc
 * ponowne pobranie cennika (powrót do aplikacji, odświeżenie cache) nie
 * kasuje tego, co barber zdążył wpisać — wcześniej robił to `useEffect`.
 */
export default function ServiceFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const { data: salon } = useCurrentSalon();
  const { data: services, isPending } = useServices({ salonId: salon?.salonId });
  const { data: categories } = useServiceCategories(salon?.salonId);

  const existing = isNew ? undefined : services?.find((service) => service.id === id);

  if (!salon || (!isNew && isPending)) return <Loading />;

  return (
    <ServiceForm
      key={existing?.id ?? 'new'}
      salonId={salon.salonId}
      serviceId={isNew ? undefined : id}
      existing={existing}
      categories={categories ?? []}
    />
  );
}

function ServiceForm({
  salonId,
  serviceId,
  existing,
  categories,
}: {
  salonId: string;
  serviceId: string | undefined;
  existing: ServiceOption | undefined;
  categories: ServiceCategory[];
}) {
  const zone = useSalonTimezone();
  const theme = useTheme();
  const router = useRouter();
  const saveService = useSaveService();
  const deleteService = useDeleteService();

  const isNew = serviceId === undefined;

  const promoEndsIn = existing?.promoEndsAt
    ? String(Math.max(1, Math.ceil(DateTime.fromISO(existing.promoEndsAt).diffNow('days').days)))
    : '7';

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [duration, setDuration] = useState(String(existing?.durationMinutes ?? 45));
  const [buffer, setBuffer] = useState(String(existing?.bufferAfterMinutes ?? 0));
  const [price, setPrice] = useState(
    existing ? formatGroszForInput(existing.regularPriceGrosz) : '0,00',
  );
  const [visible, setVisible] = useState(existing?.visible ?? true);
  const [promoEnabled, setPromoEnabled] = useState(existing?.promoActive ?? false);
  const [promoPrice, setPromoPrice] = useState(
    existing?.promoActive ? formatGroszForInput(existing.priceGrosz) : '',
  );
  const [promoDays, setPromoDays] = useState(existing?.promoActive ? promoEndsIn : '7');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    setError(null);

    const priceGrosz = parsePriceToGrosz(price);
    const durationMinutes = Number(duration);
    const bufferMinutes = Number(buffer);

    if (!name.trim()) return setError(t('serviceForm.nameRequired'));
    if (priceGrosz === null) return setError(t('serviceForm.badPrice'));
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5)
      return setError(t('serviceForm.badDuration'));
    if (!Number.isInteger(bufferMinutes) || bufferMinutes < 0)
      return setError(t('serviceForm.badBuffer'));

    let promoPriceGrosz: number | null = null;
    let promoStartsAt: string | null = null;
    let promoEndsAt: string | null = null;

    if (promoEnabled) {
      promoPriceGrosz = parsePriceToGrosz(promoPrice);
      const days = Number(promoDays);

      if (promoPriceGrosz === null) return setError(t('serviceForm.badPromoPrice'));
      if (promoPriceGrosz >= priceGrosz) return setError(t('serviceForm.promoNotLower'));
      if (!Number.isInteger(days) || days < 1) return setError(t('serviceForm.badPromoDays'));

      // Promocja zaczyna się teraz, żeby historia cen miała sensowny punkt odniesienia.
      const now = DateTime.now().setZone(zone);
      promoStartsAt = now.toISO();
      promoEndsAt = now.plus({ days }).toISO();
    }

    try {
      await saveService.mutateAsync({
        salonId,
        id: serviceId,
        name,
        description,
        categoryId,
        durationMinutes,
        bufferAfterMinutes: bufferMinutes,
        priceGrosz,
        visible,
        promoPriceGrosz,
        promoStartsAt,
        promoEndsAt,
      });
      router.replace('/(app)/services');
    } catch {
      setError(t('serviceForm.saveError'));
    }
  }

  return (
    <Screen scroll>
      <Stack.Screen
        options={{ title: isNew ? t('serviceForm.newTitle') : t('serviceForm.editTitle') }}
      />

      <Input label={t('serviceForm.name')} value={name} onChangeText={setName} />
      <Input
        label={t('serviceForm.description')}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
      />

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label" tone="secondary">
          {t('serviceForm.category')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          <Chip
            label={t('services.noCategory')}
            selected={categoryId === null}
            onPress={() => setCategoryId(null)}
          />
          {categories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              selected={categoryId === category.id}
              onPress={() => setCategoryId(category.id)}
            />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <View style={{ flex: 1 }}>
          <Input
            label={t('serviceForm.duration')}
            value={duration}
            onChangeText={setDuration}
            keyboardType="number-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label={t('serviceForm.buffer')}
            value={buffer}
            onChangeText={setBuffer}
            keyboardType="number-pad"
            hint={t('serviceForm.bufferHint')}
          />
        </View>
      </View>

      <Input
        label={t('serviceForm.price')}
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: theme.minTouchTarget,
        }}
      >
        <Text>{t('serviceForm.visible')}</Text>
        <Switch value={visible} onValueChange={setVisible} accessibilityLabel={t('serviceForm.visible')} />
      </View>

      <Card>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: theme.minTouchTarget,
          }}
        >
          <Text variant="heading">{t('serviceForm.promo')}</Text>
          <Switch
            value={promoEnabled}
            onValueChange={setPromoEnabled}
            accessibilityLabel={t('serviceForm.promo')}
          />
        </View>

        {promoEnabled ? (
          <>
            <Input
              label={t('serviceForm.promoPrice')}
              value={promoPrice}
              onChangeText={setPromoPrice}
              keyboardType="decimal-pad"
            />
            <Input
              label={t('serviceForm.promoDays')}
              value={promoDays}
              onChangeText={setPromoDays}
              keyboardType="number-pad"
            />
            <Text variant="small" tone="muted">
              {t('serviceForm.promoLegalNote')}
            </Text>
            {existing?.lowestPriceBeforePromoGrosz !== null &&
            existing?.lowestPriceBeforePromoGrosz !== undefined ? (
              <Text variant="small" tone="muted">
                {t('services.lowestPrice', {
                  price: formatPrice(existing.lowestPriceBeforePromoGrosz),
                })}
              </Text>
            ) : null}
          </>
        ) : null}
      </Card>

      {error ? <Text tone="danger">{error}</Text> : null}

      <Button label={t('common.save')} loading={saveService.isPending} onPress={() => void save()} />

      {!isNew ? (
        confirmDelete ? (
          <Card style={{ borderColor: theme.colors.danger }}>
            <Text tone="secondary">{t('serviceForm.deleteWarning')}</Text>
            <Button
              label={t('serviceForm.deleteConfirm')}
              variant="danger"
              loading={deleteService.isPending}
              onPress={async () => {
                await deleteService.mutateAsync(serviceId!);
                router.replace('/(app)/services');
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
            label={t('serviceForm.delete')}
            variant="secondary"
            onPress={() => setConfirmDelete(true)}
          />
        )
      ) : null}

      <Button
        label={t('common.cancel')}
        variant="secondary"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace('/(app)/services')
        }
      />
    </Screen>
  );
}
