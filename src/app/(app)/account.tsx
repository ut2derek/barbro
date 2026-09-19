import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

/**
 * Ekran konta. Usunięcie konta z poziomu aplikacji jest wymogiem App Store —
 * bez niego aplikacja nie przechodzi recenzji.
 */
export default function AccountScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, signOut, deleteAccount } = useAuth();

  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmationPhrase = t('account.deletePhrase');
  const canDelete = confirmation.trim().toUpperCase() === confirmationPhrase;

  async function handleDelete() {
    setError(null);
    setBusy(true);
    try {
      await deleteAccount();
      // Po usunięciu konta wracamy na ekran logowania.
      router.replace('/(auth)/login');
      if (Platform.OS !== 'web') {
        Alert.alert(t('account.deletedTitle'), t('account.deletedMessage'));
      }
    } catch {
      setError(t('account.deleteError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title">{t('account.title')}</Text>
        <Text tone="secondary">{user?.email}</Text>
      </View>

      <Button label={t('account.signOut')} variant="secondary" onPress={() => void signOut()} />

      <Card style={{ borderColor: theme.colors.danger, gap: theme.spacing.md }}>
        <Text variant="heading" tone="danger">
          {t('account.deleteTitle')}
        </Text>
        <Text tone="secondary">{t('account.deleteDescription')}</Text>
        <Text tone="secondary" variant="small">
          {t('account.deleteConsequences')}
        </Text>

        <Input
          label={t('account.deleteConfirmLabel', { phrase: confirmationPhrase })}
          value={confirmation}
          onChangeText={setConfirmation}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={confirmationPhrase}
        />

        {error ? <Text tone="danger">{error}</Text> : null}

        <Button
          label={t('account.deleteButton')}
          variant="danger"
          disabled={!canDelete}
          loading={busy}
          onPress={handleDelete}
        />
      </Card>

      <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}