import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import type { BookingStatus } from '@/features/bookings/queries';
import { statusLabel, statusTone } from '@/features/bookings/status';
import { useClientBookings, type ClientListItem } from '@/features/clients/queries';
import { t } from '@/i18n';
import { formatCompactDate, formatDayAndTime, formatFullDate, formatPrice } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * KAFELEK KLIENTA NA LIŚCIE
 *
 * Dwie daty, dwie różne potrzeby:
 *
 * - **najbliższa wizyta** — „kiedy go zobaczę”. Barber szuka tego wzrokiem,
 *   więc leży w prawym górnym rogu, wyróżniona, zawsze widoczna;
 * - **ostatnia wizyta** — historia. Sama data mówi mało („był 20 września”,
 *   ale na czym?), więc jest przyciskiem: po rozwinięciu pokazuje wizyty
 *   z usługami, fryzjerem i kwotą.
 *
 * Historię pobieramy dopiero po rozwinięciu. Inaczej wejście na listę
 * ściągałoby wizyty wszystkich klientów naraz, żeby pokazać jedną linijkę.
 */
export function ClientRow({ client, zone, onOpen }: {
  client: ClientListItem;
  zone: string;
  onOpen: () => void;
}) {
  const theme = useTheme();
  const [historyOpen, setHistoryOpen] = useState(false);

  const history = useClientBookings(historyOpen ? client.id : undefined);
  const visits = history.data ?? [];

  return (
    <View
      style={{
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        gap: theme.spacing.xs,
      }}
    >
      {/* Klikalna jest sama wizytówka klienta. Przycisk historii leży poniżej,
          poza nią — przycisk w przycisku to nieprawidłowy układ. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={client.name}
        onPress={onOpen}
        style={({ pressed }) => ({ gap: theme.spacing.xxs, opacity: pressed ? 0.85 : 1 })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0, gap: theme.spacing.xxs }}>
            <Text variant="bodyStrong">{client.name}</Text>
            <Text variant="small" tone="muted">
              {client.phone}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end', flexShrink: 0, gap: theme.spacing.xxs }}>
            {client.nextVisitAt ? (
              <View
                style={{
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: theme.spacing.xxs,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.accentMuted,
                  alignItems: 'flex-end',
                }}
              >
                <Text variant="small" tone="muted">
                  {t('clients.nextVisit')}
                </Text>
                <Text variant="bodyStrong">{formatCompactDate(client.nextVisitAt, zone)}</Text>
              </View>
            ) : (
              <Text variant="small" tone="muted">
                {t('clients.noNextVisit')}
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: theme.spacing.xxs }}>
              {client.blocked ? <Badge label={t('clients.blocked')} tone="danger" /> : null}
              {client.noShowCount > 0 ? (
                <Badge label={t('clients.noShows', { count: client.noShowCount })} tone="warning" />
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>

      {client.lastVisitAt ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: historyOpen }}
          onPress={() => setHistoryOpen((open) => !open)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
            minHeight: theme.minTouchTarget,
          }}
        >
          <Ionicons
            name={historyOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={theme.colors.textMuted}
          />
          <Text variant="small" tone="muted">
            {historyOpen
              ? t('clients.historyHide')
              : t('clients.historyShow', { date: formatFullDate(client.lastVisitAt, zone) })}
          </Text>
        </Pressable>
      ) : (
        <Text variant="small" tone="muted">
          {t('clients.neverVisited')}
        </Text>
      )}

      {historyOpen ? (
        <View style={{ gap: theme.spacing.xs, paddingLeft: theme.spacing.lg }}>
          {history.isPending ? (
            <Text variant="small" tone="muted">
              {t('clients.historyLoading')}
            </Text>
          ) : visits.length === 0 ? (
            <Text variant="small" tone="muted">
              {t('clients.historyEmpty')}
            </Text>
          ) : (
            visits.map((visit) => (
              <View key={visit.id} style={{ gap: 2 }}>
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
                >
                  <Text variant="small" style={{ flex: 1 }}>
                    {formatDayAndTime(visit.startsAt, visit.endsAt, zone).day}{' '}
                    <Text variant="small" tone="muted">
                      {formatDayAndTime(visit.startsAt, visit.endsAt, zone).time}
                    </Text>
                  </Text>
                  <Badge
                    label={statusLabel(visit.status as BookingStatus)}
                    tone={statusTone(visit.status as BookingStatus)}
                  />
                </View>
                <Text variant="small" tone="muted">
                  {visit.services.join(' + ')} · {visit.staffName} ·{' '}
                  {formatPrice(visit.totalPriceGrosz)}
                </Text>
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
