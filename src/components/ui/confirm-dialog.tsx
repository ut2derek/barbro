import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

/**
 * PYTANIE PRZED NIEODWRACALNYM
 *
 * Jedno okno dla wszystkich „czy na pewno”. Dotąd każdy ekran pytał inaczej:
 * raz przyciskiem, który po pierwszym dotknięciu zmieniał napis, raz polem do
 * przepisania słowa. Przycisk zmieniający napis jest zdradliwy — przy dwóch
 * szybkich dotknięciach kasuje bez pytania.
 *
 * Akcja niszcząca jest po prawej i na czerwono, wycofanie po lewej. Dotknięcie
 * tła zamyka okno bez robienia czegokolwiek, bo to najczęstszy odruch, gdy
 * okno wyskoczy przez pomyłkę.
 */
export function ConfirmDialog({
  visible,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  /** Co się stanie i czego nie da się cofnąć. */
  description?: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: 'center', padding: theme.spacing.lg }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          onPress={onCancel}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]}
        />

        <View
          style={{
            backgroundColor: theme.colors.surfaceElevated,
            borderRadius: theme.radius.xl,
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
            width: '100%',
            maxWidth: 420,
            alignSelf: 'center',
          }}
        >
          <Text variant="heading">{title}</Text>

          {description ? <Text tone="secondary">{description}</Text> : null}

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Button
              label={t('common.cancel')}
              variant="secondary"
              style={{ flex: 1 }}
              onPress={onCancel}
            />
            <Button
              label={confirmLabel}
              variant="danger"
              style={{ flex: 1 }}
              loading={busy}
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
