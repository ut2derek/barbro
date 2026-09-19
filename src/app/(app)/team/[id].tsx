import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import {
  useSaveStaff,
  useSetStaffServiceOverride,
  useStaffServices,
  useTeam,
  useToggleStaffService,
  type StaffServiceAssignment,
  type TeamMember,
} from '@/features/team/queries';
import { t } from '@/i18n';
import { formatGroszForInput, formatPrice } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * Nadpisanie ceny może być puste (= bierzemy cenę z cennika), więc pusty tekst
 * i tekst nieprawidłowy to dwie różne odpowiedzi: `null` i `NaN`.
 */
function parseOverridePrice(value: string): number | null {
  const normalized = value.replace(',', '.').trim();
  if (normalized === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  return Math.round(Number(normalized) * 100);
}

/**
 * Ekran ładuje dane, formularz je dostaje. Formularz montuje się raz, więc
 * ponowne pobranie składu zespołu nie kasuje wpisanych zmian — wcześniej
 * robiły to dwa `useEffect`.
 */
export default function TeamMemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const { data: salon } = useCurrentSalon();
  const { data: team, isPending } = useTeam(salon?.salonId);
  const { data: assignments, isPending: assignmentsPending } = useStaffServices({
    salonId: salon?.salonId,
    staffId: isNew ? undefined : id,
  });

  const existing = isNew ? undefined : team?.find((member) => member.id === id);

  if (!salon || (!isNew && (isPending || assignmentsPending))) return <Loading />;

  return (
    <TeamMemberForm
      key={existing?.id ?? 'new'}
      salonId={salon.salonId}
      staffId={isNew ? undefined : id}
      existing={existing}
      assignments={assignments ?? []}
      teamSize={team?.length ?? 0}
    />
  );
}

function TeamMemberForm({
  salonId,
  staffId,
  existing,
  assignments,
  teamSize,
}: {
  salonId: string;
  staffId: string | undefined;
  existing: TeamMember | undefined;
  assignments: StaffServiceAssignment[];
  teamSize: number;
}) {
  const theme = useTheme();
  const router = useRouter();
  const saveStaff = useSaveStaff();
  const toggleService = useToggleStaffService();
  const setOverride = useSetStaffServiceOverride();

  const isNew = staffId === undefined;

  const [displayName, setDisplayName] = useState(existing?.displayName ?? '');
  const [bio, setBio] = useState(existing?.bio ?? '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { price: string; duration: string }>>(
    () =>
      Object.fromEntries(
        assignments.map((assignment) => [
          assignment.serviceId,
          {
            price:
              assignment.priceOverrideGrosz !== null
                ? formatGroszForInput(assignment.priceOverrideGrosz)
                : '',
            duration:
              assignment.durationOverrideMinutes !== null
                ? String(assignment.durationOverrideMinutes)
                : '',
          },
        ]),
      ),
  );

  async function save() {
    setError(null);

    if (!displayName.trim()) {
      setError(t('teamForm.nameRequired'));
      return;
    }

    try {
      const savedId = await saveStaff.mutateAsync({
        salonId,
        id: staffId,
        displayName,
        bio,
        active,
        sortOrder: isNew ? teamSize + 1 : undefined,
      });

      if (isNew) {
        router.replace(`/(app)/team/${savedId}`);
      } else {
        router.replace('/(app)/team');
      }
    } catch {
      setError(t('teamForm.saveError'));
    }
  }

  async function saveOverride(serviceId: string) {
    const values = overrides[serviceId];
    const priceGrosz = parseOverridePrice(values?.price ?? '');
    const durationText = (values?.duration ?? '').trim();
    const durationMinutes = durationText === '' ? null : Number(durationText);

    if (Number.isNaN(priceGrosz)) return setError(t('teamForm.badPrice'));
    if (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes < 5))
      return setError(t('teamForm.badDuration'));

    setError(null);
    await setOverride.mutateAsync({ staffId: staffId!, serviceId, priceGrosz, durationMinutes });
  }

  return (
    <Screen scroll>
      <Stack.Screen
        options={{ title: isNew ? t('teamForm.newTitle') : t('teamForm.editTitle') }}
      />

      <Input label={t('teamForm.name')} value={displayName} onChangeText={setDisplayName} />
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

          {assignments.map((assignment) => (
            <Card key={assignment.serviceId}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: assignment.assigned }}
                onPress={() =>
                  toggleService.mutate({
                    salonId,
                    staffId: staffId!,
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
                      salonId,
                      staffId: staffId!,
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
