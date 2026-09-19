import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

/** Rzadziej używane działy. Codzienna praca dzieje się w pozostałych zakładkach. */
export default function MoreScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
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
          <Pressable
            key={entry.key}
            accessibilityRole="link"
            onPress={() => router.push(entry.href as '/(app)/services')}
            style={({ pressed }) => ({
              minHeight: theme.minTouchTarget,
              padding: theme.spacing.lg,
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              gap: theme.spacing.xxs,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text variant="bodyStrong">{t(entry.label as 'more.services')}</Text>
            <Text variant="small" tone="muted">
              {t(entry.description as 'more.servicesDescription')}
            </Text>
          </Pressable>
        ))}

        {isAppAdmin ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/(app)/admin')}
            style={({ pressed }) => ({
              minHeight: theme.minTouchTarget,
              padding: theme.spacing.lg,
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: theme.colors.borderStrong,
              backgroundColor: theme.colors.accentMuted,
              gap: theme.spacing.xxs,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text variant="bodyStrong">{t('admin.title')}</Text>
            <Text variant="small" tone="muted">
              {t('more.adminDescription')}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
