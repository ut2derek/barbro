import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StaffAvatar } from '@/components/staff/staff-avatar';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import {
  useSaveStaff,
  useSetStaffServiceOverride,
  useStaffServices,
  useTeam,
  useToggleStaffService,
} from '@/features/team/queries';
import { t } from '@/i18n';
import { useRecordChange } from '@/lib/use-synced-form';
import { formatPrice } from '@/lib/format';
import { useTheme } from '@/theme';

function toGrosz(value: string): number | null {
  const normalized = value.replace(',', '.').trim();
  if (normalized === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  return Math.round(Number(normalized) * 100);
}

/** Stopnie spotykane najczęściej; salon może wpisać własny. */
const TITLE_SUGGESTIONS = ['Master', 'Barber', 'Stylista', 'Praktykant'];

export default function TeamMemberScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const { data: salon } = useCurrentSalon();
  const { data: team } = useTeam(salon?.salonId);
  const { data: assignments } = useStaffServices({
    salonId: salon?.salonId,
    staffId: isNew ? undefined : id,
  });

  const saveStaff = useSaveStaff();
  const toggleService = useToggleStaffService();
  const setOverride = useSetStaffServiceOverride();

  const existing = isNew ? undefined : team?.find((member) => member.id === id);

  const [displayName, setDisplayName] = useState('');
  const [staffTitle, setStaffTitle] = useState('');
  const [bio, setBio] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { price: string; duration: string }>>({});

  // Dane pracownika wpisujemy w pola raz, przy wejściu na jego kartę.
  useRecordChange(existing?.id, () => {
    if (!existing) return;
    setDisplayName(existing.displayName);
    setStaffTitle(existing.title ?? '');
    setBio(existing.bio ?? '');
    setActive(existing.active);
  });

  // Odstępstwa cenowe przeliczamy, gdy zmieni się zestaw przypisanych usług.
  useRecordChange(assignments && existing ? `${existing.id}:${assignments.length}` : undefined, () => {
    if (!assignments) return;
    setOverrides(
      Object.fromEntries(
        assignments.map((assignment) => [
          assignment.serviceId,
          {
            price:
              assignment.priceOverrideGrosz !== null
                ? (assignment.priceOverrideGrosz / 100).toFixed(2).replace('.', ',')
                : '',
            duration:
              assignment.durationOverrideMinutes !== null
                ? String(assignment.durationOverrideMinutes)
                : '',
          },
        ]),
      ),
    );
  });

  async function save() {
    setError(null);

    if (!displayName.trim()) {
      setError(t('teamForm.nameRequired'));
      return;
    }

    try {
      const staffId = await saveStaff.mutateAsync({
        salonId: salon!.salonId,
        id: isNew ? undefined : id,
        displayName,
        title: staffTitle,
        bio,
        active,
        sortOrder: isNew ? (team?.length ?? 0) + 1 : undefined,
      });

      if (isNew) {
        router.replace(`/(app)/team/${staffId}`);
      } else {
        router.replace('/(app)/team');
      }
    } catch {
      setError(t('teamForm.saveError'));
    }
  }

  async function saveOverride(serviceId: string) {
    const values = overrides[serviceId];
    const priceGrosz = toGrosz(values?.price ?? '');
    const durationText = (values?.duration ?? '').trim();
    const durationMinutes = durationText === '' ? null : Number(durationText);

    if (Number.isNaN(priceGrosz)) return setError(t('teamForm.badPrice'));
    if (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes < 5))
      return setError(t('teamForm.badDuration'));

    setError(null);
    await setOverride.mutateAsync({ staffId: id, serviceId, priceGrosz, durationMinutes });
  }

  return (
    <Screen scroll>
      <Text variant="title">{isNew ? t('teamForm.newTitle') : t('teamForm.editTitle')}</Text>

      {/* Podgląd kółka, które zobaczy klient. Bez zdjęcia pokazuje inicjały —
          od razu widać, że puste miejsce to nie błąd. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <StaffAvatar
          name={displayName || t('teamForm.name')}
          photoUrl={existing?.photoUrl ?? null}
          size={64}
        />
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <Text variant="bodyStrong">{displayName || t('teamForm.newTitle')}</Text>
          {staffTitle.trim() ? (
            <Text variant="small" tone="secondary">
              {staffTitle.trim()}
            </Text>
          ) : null}
        </View>
      </View>

      <Input label={t('teamForm.name')} value={displayName} onChangeText={setDisplayName} />

      <Input
        label={t('teamForm.title')}
        value={staffTitle}
        onChangeText={setStaffTitle}
        placeholder={t('teamForm.titlePlaceholder')}
        hint={t('teamForm.titleHint')}
      />

      {/* Skróty do najczęstszych stopni — wpisać własny nadal można. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          {TITLE_SUGGESTIONS.map((suggestion) => (
            <Chip
              key={suggestion}
              label={suggestion}
              selected={staffTitle.trim() === suggestion}
              onPress={() => setStaffTitle(staffTitle.trim() === suggestion ? '' : suggestion)}
            />
          ))}
        </View>
      </ScrollView>
      <Input
        label={t('teamForm.bio')}
        value={bio}
        onChangeText={setBio}
        multiline
        numberOfLines={3}
        hint={t('teamForm.bioHint')}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: theme.minTouchTarget,
        }}
      >
        <Text style={{ flex: 1 }}>{t('teamForm.active')}</Text>
        <Switch value={active} onValueChange={setActive} />
      </View>
      <Text variant="small" tone="muted">
        {t('teamForm.activeHint')}
      </Text>

      {error ? <Text tone="danger">{error}</Text> : null}

      <Button label={t('common.save')} loading={saveStaff.isPending} onPress={() => void save()} />

      {!isNew ? (
        <>
          <Text variant="heading">{t('teamForm.servicesTitle')}</Text>
          <Text variant="small" tone="muted">
            {t('teamForm.servicesHint')}
          </Text>

          {(assignments ?? []).map((assignment) => (
            <Card key={assignment.serviceId}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: assignment.assigned }}
                onPress={() =>
                  toggleService.mutate({
                    salonId: salon!.salonId,
                    staffId: id,
                    serviceId: assignment.serviceId,
                    assign: !assignment.assigned,
                  })
                }
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  minHeight: theme.minTouchTarget,
                  gap: theme.spacing.sm,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{assignment.serviceName}</Text>
                  <Text variant="small" tone="muted">
                    {formatPrice(assignment.basePriceGrosz)} · {assignment.baseDurationMinutes} min
                  </Text>
                </View>
                <Switch
                  value={assignment.assigned}
                  onValueChange={(assign) =>
                    toggleService.mutate({
                      salonId: salon!.salonId,
                      staffId: id,
                      serviceId: assignment.serviceId,
                      assign,
                    })
                  }
                />
              </Pressable>

              {assignment.assigned ? (
                <>
                  <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                    <View style={{ flex: 1 }}>
                      <Input
                        label={t('teamForm.priceOverride')}
                        value={overrides[assignment.serviceId]?.price ?? ''}
                        onChangeText={(price) =>
                          setOverrides({
                            ...overrides,
                            [assignment.serviceId]: {
                              price,
                              duration: overrides[assignment.serviceId]?.duration ?? '',
                            },
                          })
                        }
                        keyboardType="decimal-pad"
                        placeholder={t('teamForm.asInPricing')}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Input
                        label={t('teamForm.durationOverride')}
                        value={overrides[assignment.serviceId]?.duration ?? ''}
                        onChangeText={(duration) =>
                          setOverrides({
                            ...overrides,
                            [assignment.serviceId]: {
                              price: overrides[assignment.serviceId]?.price ?? '',
                              duration,
                            },
                          })
                        }
                        keyboardType="number-pad"
                        placeholder={t('teamForm.asInPricing')}
                      />
                    </View>
                  </View>
                  <Button
                    label={t('teamForm.saveOverride')}
                    variant="secondary"
                    loading={setOverride.isPending}
                    onPress={() => void saveOverride(assignment.serviceId)}
                  />
                </>
              ) : null}
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}