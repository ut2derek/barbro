import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { ChosenAddons, PublicAddon } from '@/features/public-booking/queries';
import { t } from '@/i18n';
import { formatPrice } from '@/lib/format';
import { useTheme } from '@/theme';

type Props = {
  visible: boolean;
  serviceName: string;
  addons: PublicAddon[];
  chosen: ChosenAddons;
  onChange: (chosen: ChosenAddons) => void;
  onClose: () => void;
  onContinue: () => void;
};

/**
 * Krok „dodatki”: drobne usługi doczepiane do wybranej. Każdy dodatek ma
 * własną cenę i czas, a licznik pozwala wziąć go więcej niż raz, jeśli salon
 * na to pozwala.
 */
export function AddonsSheet({
  visible,
  serviceName,
  addons,
  chosen,
  onChange,
  onClose,
  onContinue,
}: Props) {
  const theme = useTheme();

  function setQuantity(addon: PublicAddon, quantity: number) {
    const next = { ...chosen };
    const clamped = Math.min(Math.max(quantity, 0), addon.maxQuantity);

    if (clamped === 0) delete next[addon.id];
    else next[addon.id] = clamped;

    onChange(next);
  }

  const total = addons.reduce(
    (sum, addon) => sum + (chosen[addon.id] ?? 0) * addon.priceGrosz,
    0,
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]}
        />

        <View
          style={{
            backgroundColor: theme.colors.surfaceElevated,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            paddingTop: theme.spacing.lg,
            maxHeight: '85%',
          }}
        >
          <View style={{ paddingHorizontal: theme.spacing.lg, gap: theme.spacing.xxs }}>
            <Text variant="title">{t('addons.title')}</Text>
            <Text tone="secondary">{serviceName}</Text>
          </View>

          <ScrollView
            contentContainerStyle={{
              padding: theme.spacing.lg,
              gap: theme.spacing.lg,
            }}
          >
            {addons.map((addon) => {
              const quantity = chosen[addon.id] ?? 0;

              return (
                <View
                  key={addon.id}
                  style={{
                    gap: theme.spacing.sm,
                    paddingBottom: theme.spacing.lg,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                    <View style={{ flex: 1, gap: theme.spacing.xxs }}>
                      <Text variant="bodyStrong">{addon.name}</Text>
                      {addon.description ? (
                        <Text variant="small" tone="secondary">
                          {addon.description}
                        </Text>
                      ) : null}
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="bodyStrong">{formatPrice(addon.priceGrosz)}</Text>
                      {addon.durationMinutes > 0 ? (
                        <Text variant="small" tone="muted">
                          +{addon.durationMinutes} min
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      alignSelf: 'flex-end',
                      gap: theme.spacing.md,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.md,
                      paddingHorizontal: theme.spacing.sm,
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('addons.decrease', { name: addon.name })}
                      disabled={quantity === 0}
                      onPress={() => setQuantity(addon, quantity - 1)}
                      style={{
                        width: theme.minTouchTarget,
                        height: theme.minTouchTarget,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: quantity === 0 ? 0.4 : 1,
                      }}
                    >
                      <Text variant="heading">−</Text>
                    </Pressable>

                    <Text variant="bodyStrong">{quantity}</Text>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('addons.increase', { name: addon.name })}
                      disabled={quantity >= addon.maxQuantity}
                      onPress={() => setQuantity(addon, quantity + 1)}
                      style={{
                        width: theme.minTouchTarget,
                        height: theme.minTouchTarget,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: quantity >= addon.maxQuantity ? 0.4 : 1,
                      }}
                    >
                      <Text variant="heading">+</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View
            style={{
              padding: theme.spacing.lg,
              paddingBottom: theme.spacing.xxl,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              gap: theme.spacing.sm,
            }}
          >
            {total > 0 ? (
              <Text tone="secondary">{t('addons.total', { price: formatPrice(total) })}</Text>
            ) : null}
            <Button label={t('addons.continue')} onPress={onContinue} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
