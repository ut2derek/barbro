import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { useSalonSettings, useUpdateSalonSettings } from '@/features/settings/queries';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

const SLOT_STEPS = [5, 10, 15, 20, 30, 60];

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.xxs }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: theme.minTouchTarget,
          gap: theme.spacing.md,
        }}
      >
        <Text style={{ flex: 1 }}>{label}</Text>
        {children}
      </View>
      {hint ? (
        <Text variant="small" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Ustawienia salonu — decydują, jak zachowa się rezerwacja online. */
export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: salon } = useCurrentSalon();
  const { data: settings } = useSalonSettings(salon?.salonId);
  const update = useUpdateSalonSettings();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    addressLine: '',
    postalCode: '',
    city: '',
    holdMinutes: '20',
    minLeadMinutes: '120',
    bookingHorizonDays: '60',
    clientCancelLeadHours: '12',
    cancellationPolicyText: '',
  });
  const [slotStep, setSlotStep] = useState(15);
  const [autoAccept, setAutoAccept] = useState(false);
  const [onlineBooking, setOnlineBooking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setForm({
      name: settings.name,
      phone: settings.phone ?? '',
      email: settings.email ?? '',
      addressLine: settings.addressLine ?? '',
      postalCode: settings.postalCode ?? '',
      city: settings.city ?? '',
      holdMinutes: String(settings.holdMinutes),
      minLeadMinutes: String(settings.minLeadMinutes),
      bookingHorizonDays: String(settings.bookingHorizonDays),
      clientCancelLeadHours: String(settings.clientCancelLeadHours),
      cancellationPolicyText: settings.cancellationPolicyText ?? '',
    });
    setSlotStep(settings.slotStepMinutes);
    setAutoAccept(settings.autoAccept);
    setOnlineBooking(settings.onlineBookingEnabled);
  }, [settings]);

  async function save() {
    setError(null);
    setSaved(false);

    const numbers = {
      holdMinutes: Number(form.holdMinutes),
      minLeadMinutes: Number(form.minLeadMinutes),
      bookingHorizonDays: Number(form.bookingHorizonDays),
      clientCancelLeadHours: Number(form.clientCancelLeadHours),
    };

    if (!form.name.trim()) return setError(t('settings.nameRequired'));
    if (!Number.isInteger(numbers.holdMinutes) || numbers.holdMinutes < 5 || numbers.holdMinutes > 120)
      return setError(t('settings.badHold'));
    if (!Number.isInteger(numbers.minLeadMinutes) || numbers.minLeadMinutes < 0)
      return setError(t('settings.badLead'));
    if (
      !Number.isInteger(numbers.bookingHorizonDays) ||
      numbers.bookingHorizonDays < 1 ||
      numbers.bookingHorizonDays > 365
    )
      return setError(t('settings.badHorizon'));
    if (!Number.isInteger(numbers.clientCancelLeadHours) || numbers.clientCancelLeadHours < 0)
      return setError(t('settings.badCancelLead'));

    try {
      await update.mutateAsync({
        salonId: salon!.salonId,
        changes: {
          name: form.name,
          phone: form.phone || null,
          email: form.email || null,
          addressLine: form.addressLine || null,
          postalCode: form.postalCode || null,
          city: form.city || null,
          cancellationPolicyText: form.cancellationPolicyText || null,
          slotStepMinutes: slotStep,
          autoAccept,
          onlineBookingEnabled: onlineBooking,
          ...numbers,
        },
      });
      setSaved(true);
    } catch {
      setError(t('settings.saveError'));
    }
  }

  if (salon && salon.role !== 'owner') {
    return (
      <Screen>
        <Text variant="title">{t('settings.title')}</Text>
        <Text tone="secondary">{t('settings.ownerOnly')}</Text>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text variant="title">{t('settings.title')}</Text>

      <Card>
        <Text variant="heading">{t('settings.salonSection')}</Text>
        <Input label={t('settings.name')} value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
        <Input
          label={t('settings.phone')}
          value={form.phone}
          onChangeText={(phone) => setForm({ ...form, phone })}
          keyboardType="phone-pad"
        />
        <Input
          label={t('settings.email')}
          value={form.email}
          onChangeText={(email) => setForm({ ...form, email })}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Input
          label={t('settings.address')}
          value={form.addressLine}
          onChangeText={(addressLine) => setForm({ ...form, addressLine })}
        />
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <View style={{ flex: 1 }}>
            <Input
              label={t('settings.postalCode')}
              value={form.postalCode}
              onChangeText={(postalCode) => setForm({ ...form, postalCode })}
            />
          </View>
          <View style={{ flex: 2 }}>
            <Input
              label={t('settings.city')}
              value={form.city}
              onChangeText={(city) => setForm({ ...form, city })}
            />
          </View>
        </View>
      </Card>

      <Card>
        <Text variant="heading">{t('settings.bookingSection')}</Text>

        <Row label={t('settings.onlineBooking')} hint={t('settings.onlineBookingHint')}>
          <Switch value={onlineBooking} onValueChange={setOnlineBooking} />
        </Row>

        <Row label={t('settings.autoAccept')} hint={t('settings.autoAcceptHint')}>
          <Switch value={autoAccept} onValueChange={setAutoAccept} />
        </Row>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" tone="secondary">
            {t('settings.slotStep')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {SLOT_STEPS.map((step) => (
              <Chip
                key={step}
                label={`${step} min`}
                selected={slotStep === step}
                onPress={() => setSlotStep(step)}
              />
            ))}
          </View>
          <Text variant="small" tone="muted">
            {t('settings.slotStepHint')}
          </Text>
        </View>

        <Input
          label={t('settings.minLead')}
          value={form.minLeadMinutes}
          onChangeText={(minLeadMinutes) => setForm({ ...form, minLeadMinutes })}
          keyboardType="number-pad"
          hint={t('settings.minLeadHint')}
        />
        <Input
          label={t('settings.horizon')}
          value={form.bookingHorizonDays}
          onChangeText={(bookingHorizonDays) => setForm({ ...form, bookingHorizonDays })}
          keyboardType="number-pad"
          hint={t('settings.horizonHint')}
        />
        <Input
          label={t('settings.hold')}
          value={form.holdMinutes}
          onChangeText={(holdMinutes) => setForm({ ...form, holdMinutes })}
          keyboardType="number-pad"
          hint={t('settings.holdHint')}
        />
        <Input
          label={t('settings.cancelLead')}
          value={form.clientCancelLeadHours}
          onChangeText={(clientCancelLeadHours) => setForm({ ...form, clientCancelLeadHours })}
          keyboardType="number-pad"
          hint={t('settings.cancelLeadHint')}
        />
        <Input
          label={t('settings.cancellationPolicy')}
          value={form.cancellationPolicyText}
          onChangeText={(cancellationPolicyText) => setForm({ ...form, cancellationPolicyText })}
          multiline
          numberOfLines={3}
          hint={t('settings.cancellationPolicyHint')}
        />
      </Card>

      {error ? <Text tone="danger">{error}</Text> : null}
      {saved ? <Text tone="success">{t('settings.saved')}</Text> : null}

      <Button label={t('common.save')} loading={update.isPending} onPress={() => void save()} />

      <Button
        label={t('common.back')}
        variant="secondary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)'))}
      />
    </Screen>
  );
}