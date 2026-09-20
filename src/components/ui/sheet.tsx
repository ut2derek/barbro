import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { t } from '@/i18n';
import { useTheme } from '@/theme';

import { MAX_CONTENT_WIDTH } from './screen';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /**
   * `false`, gdy arkusz sam rozkłada treść — na przykład ma własną listę do
   * przewijania i przyklejoną stopkę (dodatki do wizyty).
   */
  padded?: boolean;
  style?: ViewStyle;
};

/**
 * ARKUSZ WYJEŻDŻAJĄCY Z DOŁU
 *
 * Jedno miejsce z wyglądem wszystkich arkuszy: przyciemnione tło, zaokrąglona
 * góra, dotknięcie obok zamyka.
 *
 * Najważniejsze jest ograniczenie szerokości. Aplikacja jest pisana pod telefon,
 * ale chodzi też w przeglądarce — bez tego arkusz na laptopie rozciągał się na
 * dwa tysiące pikseli, cena uciekała na prawy skraj ekranu i trzeba było wodzić
 * wzrokiem przez pół monitora. Treść trzyma się tej samej szerokości co ekrany
 * (`MAX_CONTENT_WIDTH`) i stoi na środku.
 */
export function Sheet({ visible, onClose, children, padded = true, style }: Props) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]}
        />

        <View
          style={[
            {
              width: '100%',
              maxWidth: MAX_CONTENT_WIDTH,
              maxHeight: '85%',
              backgroundColor: theme.colors.surfaceElevated,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
            },
            padded
              ? {
                  padding: theme.spacing.lg,
                  paddingBottom: theme.spacing.xxl,
                  gap: theme.spacing.md,
                }
              : null,
            style,
          ]}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}
