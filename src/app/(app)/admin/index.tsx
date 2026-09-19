import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import {
  useCreateSalon,
  useIsAppAdmin,
  useSalonOverview,
  useSetSalonActive,
  type CreatedSalon,
} from '@/features/admin/queries';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

/** Panel właściciela produktu: zakładanie salonów i podgląd ruchu. */
export default function AdminScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: isAdmin, isPending: checking } = useIsAppAdmin();
  const { data: salons } = useSalonOverview(isAdmin === true);

  const createSalon = useCreateSalon();
  const setActive = useSetSalonActive();

  const [form, setForm] = useState({ salonName: '', ownerEmail: '', ownerName: '', city: '' });
  const [created, setCreated] = useState<CreatedSalon | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (checking) {
    return (
      <Screen>
        <Text tone="muted">{t('common.loading')}</Text>
      </Screen>
    );
  }

  if (!isAdmin) {
    return (
      <Screen>
        <Text variant="title">{t('admin.title')}</Text>
        <Text tone="secondary">{t('admin.noAccess')}</Text>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  async function create() {
    setError(null);
    setCreated(null);

    if (!form.salonName.trim() || !form.ownerEmail.trim()) {
      setError(t('admin.formRequired'));
      return;
    }

    try {
      const result = await createSalon.mutateAsync(form);
      setCreated(result);
      setForm({ salonName: '', ownerEmail: '', ownerName: '', city: '' });
    } catch {
      setError(t('admin.createError'));
    }
  }

  return (
    <Screen scroll>
      <Text variant="title">{t('admin.title')}</Text>
      <Text tone="secondary">{t('admin.description')}</Text>

      {(salons ?? []).map((salon) => (
        <Card key={salon.salonId}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: theme.spacing.sm,
            }}
          >
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {salon.name}
            </Text>
            <Badge
              label={salon.active ? t('admin.activeSalon') : t('admin.inactiveSalon')}
              tone={salon.active ? 'success' : 'muted'}
            />
          </View>

          <Text variant="small" tone="muted">
            {salon.city ?? t('admin.noCity')} · {salon.slug}
          </Text>

          <Text variant="small" tone="secondary">
            {t('admin.stats', {
              staff: salon.staffCount,
              recent: salon.bookingsLast30Days,
              upcoming: salon.upcomingBookings,
            })}
          </Text>

          {salon.ownerCount === 0 ? (
            <Text variant="small" tone="danger">
              {t('admin.noOwner')}
            </Text>
          ) : null}

          <Button
            label={salon.active ? t('admin.disable') : t('admin.enable')}
            variant="secondary"
            loading={setActive.isPending}
            onPress={() => setActive.mutate({ salonId: salon.salonId, active: !salon.active })}
          />
        </Card>
      ))}

      <Card>
        <Text variant="heading">{t('admin.newSalon')}</Text>
        <Input
          label={t('admin.salonName')}
          value={form.salonName}
          onChangeText={(salonName) => setForm({ ...form, salonName })}
        />
        <Input
          label={t('admin.city')}
          value={form.city}
          onChangeText={(city) => setForm({ ...form, city })}
        />
        <Input
          label={t('admin.ownerName')}
          value={form.ownerName}
          onChangeText={(ownerName) => setForm({ ...form, ownerName })}
        />
        <Input
          label={t('admin.ownerEmail')}
          value={form.ownerEmail}
          onChangeText={(ownerEmail) => setForm({ ...form, ownerEmail })}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        {error ? <Text tone="danger">{error}</Text> : null}

        <Button
          label={t('admin.create')}
          loading={createSalon.isPending}
          onPress={() => void create()}
        />
      </Card>

      {created ? (
        <Card style={{ borderColor: theme.colors.success }}>
          <Text variant="heading" tone="success">
            {t('admin.createdTitle')}
          </Text>
          {created.temporaryPassword ? (
            <>
              <Text tone="secondary">{t('admin.temporaryPassword')}</Text>
              <Text variant="title" selectable>
                {created.temporaryPassword}
              </Text>
              <Text variant="small" tone="muted">
                {t('admin.temporaryPasswordNote')}
              </Text>
            </>
          ) : (
            <Text tone="secondary">{t('admin.existingAccount')}</Text>
          )}
        </Card>
      ) : null}

      <Button
        label={t('common.back')}
        variant="secondary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)'))}
      />
    </Screen>
  );
}