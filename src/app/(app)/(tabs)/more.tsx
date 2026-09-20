import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useIsAppAdmin } from '@/features/admin/queries';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

type Entry = {
  key: string;
  label: string;
  description: string;
  href: string;
  ownerOnly?: boolean;
};

const ENTRIES: Entry[] = [
  {
    key: 'services',
    label: 'more.services',
    description: 'more.servicesDescription',
    href: '/(app)/services',
  },
  {
    key: 'schedule',
    label: 'more.schedule',
    description: 'more.scheduleDescription',
    href: '/(app)/schedule',
  },
  {
    key: 'reviews',
    label: 'more.reviews',
    description: 'more.reviewsDescription',
    href: '/(app)/reviews',
  },
  {
    key: 'team',
    label: 'more.team',
    description: 'more.teamDescription',
    href: '/(app)/team',
    ownerOnly: true,
  },
  {
    key: 'settings',
    label: 'more.settings',
    description: 'more.settingsDescription',
    href: '/(app)/settings',
    ownerOnly: true,
  },
  {
    key: 'account',
    label: 'more.account',
    description: 'more.accountDescription',
    href: '/(app)/account',
  },
];

/** Konta z danych testowych — tylko w trybie deweloperskim. */
const TEST_ACCOUNTS = [
  { email: 'wlasciciel@barbro.test', labelKey: 'auth.testOwner' },
  { email: 'pracownik@barbro.test', labelKey: 'auth.testStaff' },
  { email: 'admin@barbro.test', labelKey: 'auth.testAdmin' },
] as const;

/** Kafelek działu. Trzy miejsca używały tego samego bloku stylu. */
function Tile({
  label,
  description,
  onPress,
  highlighted,
}: {
  label: string;
  description: string;
  onPress: () => void;
  highlighted?: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.minTouchTarget,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: highlighted ? theme.colors.borderStrong : theme.colors.border,
        backgroundColor: highlighted ? theme.colors.accentMuted : theme.colors.surface,
        gap: theme.spacing.xxs,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text variant="bodyStrong">{label}</Text>
      <Text variant="small" tone="muted">
        {description}
      </Text>
    </Pressable>
  );
}

/** Rzadziej używane działy. Codzienna praca dzieje się w pozostałych zakładkach. */
export default function MoreScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, signIn, signOut } = useAuth();
  const [switching, setSwitching] = useState(false);
  const { data: salon } = useCurrentSalon();
  const { data: isAppAdmin } = useIsAppAdmin();

  const isOwner = salon?.role === 'owner';
  const visible = ENTRIES.filter((entry) => !entry.ownerOnly || isOwner);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
          width: '100%',
          maxWidth: 560,
          alignSelf: 'center',
        }}
      >
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="display">{t('navigation.more')}</Text>
          <Text tone="secondary">{salon?.salonName ?? user?.email}</Text>
        </View>

        {visible.map((entry) => (
          <Tile
            key={entry.key}
            label={t(entry.label as 'more.services')}
            description={t(entry.description as 'more.servicesDescription')}
            onPress={() => router.push(entry.href as '/(app)/services')}
          />
        ))}

        {/*
          Podgląd tego, co zobaczy klient — ta sama strona rezerwacji, która
          trafi jako moduł na stronę salonu. Nie wymaga logowania, więc
          wchodzimy wprost pod adres salonu.
        */}
        {salon ? (
          <Tile
            label={t('more.clientPreview')}
            description={t('more.clientPreviewDescription')}
            onPress={() => router.push(`/rezerwacja/${salon.salonSlug}`)}
          />
        ) : null}

        {isAppAdmin ? (
          <Tile
            label={t('admin.title')}
            description={t('more.adminDescription')}
            onPress={() => router.push('/(app)/admin')}
            highlighted
          />
        ) : null}

        <Button label={t('account.signOut')} variant="secondary" onPress={() => void signOut()} />

        {__DEV__ ? (
          <Card>
            <Text variant="heading">{t('more.switchAccount')}</Text>
            <Text variant="small" tone="muted">
              {t('more.switchAccountHint')}
            </Text>
            {TEST_ACCOUNTS.filter((account) => account.email !== user?.email).map((account) => (
              <Button
                key={account.email}
                label={t(account.labelKey as 'auth.testOwner')}
                variant="secondary"
                loading={switching}
                onPress={async () => {
                  setSwitching(true);
                  try {
                    await signOut();
                    await signIn(account.email, 'haslo123');
                  } finally {
                    setSwitching(false);
                  }
                }}
              />
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
