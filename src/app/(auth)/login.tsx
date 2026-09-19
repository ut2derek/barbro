import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/env';
import { useTheme } from '@/theme';

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    setError(null);

    if (!email.trim() || !password) {
      setError(t('auth.fillBoth'));
      return;
    }

    setBusy(true);
    try {
      await signIn(email, password);
    } catch {
      // Celowo nie zdradzamy, czy to zły mail, czy złe hasło.
      setError(t('auth.invalidCredentials'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ gap: theme.spacing.xl }}
      >
        <View style={{ gap: theme.spacing.xs, paddingTop: theme.spacing.xxl }}>
          <Text variant="display">{t('common.appName')}</Text>
          <Text tone="secondary">{t('auth.subtitle')}</Text>
        </View>

        <View style={{ gap: theme.spacing.lg }}>
          <Input
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="adres@salon.pl"
          />

          <Input
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={handleSignIn}
            returnKeyType="go"
          />

          {error ? <Text tone="danger">{error}</Text> : null}

          <Button label={t('auth.signIn')} onPress={handleSignIn} loading={busy} />

          <Button
            label={t('auth.forgotPassword')}
            variant="secondary"
            onPress={() => router.push('/(auth)/forgot-password')}
          />
        </View>

        {!isSupabaseConfigured ? (
          <Text tone="danger" variant="small">
            {t('setup.supabaseMissing')}
          </Text>
        ) : null}

        <Text tone="muted" variant="small">
          {t('auth.invitationOnly')}
        </Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}