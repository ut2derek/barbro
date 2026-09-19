import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { sendPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSend() {
    setError(null);
    setBusy(true);
    try {
      await sendPasswordReset(email, Linking.createURL('/auth/reset'));
      // Zawsze ten sam komunikat — nie zdradzamy, czy taki mail istnieje.
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.xl }}>
        <Text variant="title">{t('auth.resetTitle')}</Text>

        {sent ? (
          <>
            <Text tone="secondary">{t('auth.resetSent')}</Text>
            <Button label={t('auth.backToLogin')} onPress={() => router.replace('/(auth)/login')} />
          </>
        ) : (
          <>
            <Text tone="secondary">{t('auth.resetDescription')}</Text>

            <Input
              label={t('auth.email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="adres@salon.pl"
            />

            {error ? <Text tone="danger">{error}</Text> : null}

            <Button label={t('auth.sendResetLink')} onPress={handleSend} loading={busy} />
            <Button
              label={t('common.cancel')}
              variant="secondary"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/login'))}
            />
          </>
        )}
      </View>
    </Screen>
  );
}
