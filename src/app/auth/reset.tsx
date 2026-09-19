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

/**
 * Ekran otwierany z linku w mailu. Supabase wymienia token z adresu na sesję,
 * więc w tym miejscu wystarczy ustawić nowe hasło.
 */
export default function ResetPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, updatePassword } = useAuth();

  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setError(null);

    if (password.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    if (password !== repeat) {
      setError(t('auth.passwordsDiffer'));
      return;
    }

    setBusy(true);
    try {
      await updatePassword(password);
      router.replace('/(app)');
    } catch {
      setError(t('auth.resetFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.xl }}>
        <Text variant="title">{t('auth.newPasswordTitle')}</Text>

        {!session ? (
          <>
            <Text tone="danger">{t('auth.resetLinkExpired')}</Text>
            <Button label={t('auth.backToLogin')} onPress={() => router.replace('/(auth)/login')} />
          </>
        ) : (
          <>
            <Input
              label={t('auth.newPassword')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              hint={t('auth.passwordHint')}
            />
            <Input
              label={t('auth.repeatPassword')}
              value={repeat}
              onChangeText={setRepeat}
              secureTextEntry
              autoCapitalize="none"
            />

            {error ? <Text tone="danger">{error}</Text> : null}

            <Button label={t('auth.savePassword')} onPress={handleSave} loading={busy} />
          </>
        )}
      </View>
    </Screen>
  );
}
