import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/env';
import { useTheme } from '@/theme';

/**
 * Konta z danych testowych (supabase/seed.sql). Panel pokazuje się wyłącznie
 * w trybie deweloperskim — w wersji dla sklepów tego kodu nie ma, bo __DEV__
 * jest wtedy fałszem i cały blok wypada przy budowaniu.
 */
const TEST_ACCOUNTS = [
  { email: 'wlasciciel@barbro.test', labelKey: 'auth.testOwner' },
  { email: 'pracownik@barbro.test', labelKey: 'auth.testStaff' },
  { email: 'admin@barbro.test', labelKey: 'auth.testAdmin' },
] as const;

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
    <Screen scroll edges={['top', 'bottom']}>
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

        {__DEV__ ? (
          <Card>
            <Text variant="heading">{t('auth.testAccounts')}</Text>
            <Text variant="small" tone="muted">
              {t('auth.testAccountsHint')}
            </Text>
            {TEST_ACCOUNTS.map((account) => (
              <Button
                key={account.email}
                label={t(account.labelKey as 'auth.testOwner')}
                variant="secondary"
                disabled={busy}
                onPress={async () => {
                  setError(null);
                  setBusy(true);
                  try {
                    await signIn(account.email, 'haslo123');
                  } catch {
                    setError(t('auth.testAccountsMissing'));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ))}

            {/* Strona rezerwacji nie wymaga logowania — wchodzimy wprost. */}
            <Button
              label={t('auth.testClientBooking')}
              variant="secondary"
              onPress={() => router.push('/rezerwacja/barbershop-kowalski')}
            />
          </Card>
        ) : null}

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
