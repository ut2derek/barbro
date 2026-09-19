import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useClientSearch } from '@/features/clients/queries';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

/** Baza klientów salonu — szukanie po imieniu, telefonie albo mailu. */
export default function ClientsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: salon } = useCurrentSalon();

  const [query, setQuery] = useState('');
  const { data: clients, isPending, refetch, isRefetching } = useClientSearch({
    salonId: salon?.salonId,
    query,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.lg,
          gap: theme.spacing.md,
          width: '100%',
          maxWidth: 560,
          alignSelf: 'center',
        }}
      >
        <Text variant="display">{t('clients.title')}</Text>
        <Input
          label={t('clients.search')}
          value={query}
          onChangeText={setQuery}
          placeholder={t('clients.searchPlaceholder')}
          autoCapitalize="none"
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.sm,
          width: '100%',
          maxWidth: 560,
          alignSelf: 'center',
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        {isPending ? (
          <Text tone="muted">{t('common.loading')}</Text>
        ) : (clients ?? []).length === 0 ? (
          <Card>
            <Text variant="heading">{t('clients.emptyTitle')}</Text>
            <Text tone="secondary">
              {query.trim() ? t('clients.emptySearch') : t('clients.emptyDescription')}
            </Text>
          </Card>
        ) : (
          (clients ?? []).map((client) => (
            <Pressable
              key={client.id}
              accessibilityRole="button"
              onPress={() => router.push(`/(app)/clients/${client.id}`)}
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
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                }}
              >
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {client.name}
                </Text>
                {client.blocked ? <Badge label={t('clients.blocked')} tone="danger" /> : null}
                {client.noShowCount > 0 ? (
                  <Badge
                    label={t('clients.noShows', { count: client.noShowCount })}
                    tone="warning"
                  />
                ) : null}
              </View>
              <Text variant="small" tone="muted">
                {client.phone}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}