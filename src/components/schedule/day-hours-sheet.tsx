import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import type { TimeWindow } from '@/features/schedule/queries';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

export type DraftWindow = { from: string; to: string };

/** „9:00" i „09:00" to ta sama godzina — baza chce jednego zapisu. */
function normalize(value: string): string | null {
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

/**
 * EDYCJA JEDNEGO DNIA GRAFIKU
 *
 * Lista dni na ekranie pokazuje tylko godziny — cała edycja siedzi tutaj,
 * bo siedem rozwiniętych formularzy naraz nie mieściło się na ekranie.
 *
 * Kilka okien w jednym dniu to przerwa (9–13 i 14–18). Pusta lista to dzień
 * wolny — dlatego zamknięcie dnia i zapis to ta sama operacja, tylko z zerem
 * okien, i nie da się zapisać czegoś pośredniego.
 */
export function DayHoursSheet({
  visible,
  title,
  windows,
  closeDayLabel,
  saving,
  saveError,
  onClose,
  onSave,
}: {
  visible: boolean;
  /** Nazwa dnia w nagłówku, np. „Poniedziałek". */
  title: string;
  windows: TimeWindow[];
  /** „Zamknij salon w ten dzień" albo „Ustaw dzień wolny" — zależnie od grafiku. */
  closeDayLabel: string;
  saving: boolean;
  /** Błąd zapisu z serwera. Arkusz zostaje otwarty, żeby nie stracić wpisanych godzin. */
  saveError: string | null;
  onClose: () => void;
  onSave: (windows: DraftWindow[]) => void;
}) {
  const theme = useTheme();

  const [draft, setDraft] = useState<DraftWindow[]>(() =>
    windows.length > 0
      ? windows.map((window) => ({ from: window.from, to: window.to }))
      : [{ from: '09:00', to: '17:00' }],
  );
  const [error, setError] = useState<string | null>(null);

  function update(index: number, patch: Partial<DraftWindow>) {
    setDraft(draft.map((window, i) => (i === index ? { ...window, ...patch } : window)));
    setError(null);
  }

  function submit() {
    const normalized: DraftWindow[] = [];

    for (const window of draft) {
      const from = normalize(window.from);
      const to = normalize(window.to);

      if (!from || !to) return setError(t('schedule.badTime'));
      if (to <= from) return setError(t('schedule.badRange'));

      normalized.push({ from, to });
    }

    setError(null);
    onSave(normalized);
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text variant="heading">{title}</Text>

      <ScrollView
        contentContainerStyle={{ gap: theme.spacing.md }}
        keyboardShouldPersistTaps="handled"
      >
        {draft.map((window, index) => (
          <View
            key={index}
            style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.md }}
          >
            <View style={{ flex: 1 }}>
              <Input
                label={t('schedule.from')}
                value={window.from}
                onChangeText={(value) => update(index, { from: value })}
                placeholder="09:00"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label={t('schedule.to')}
                value={window.to}
                onChangeText={(value) => update(index, { to: value })}
                placeholder="17:00"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            {draft.length > 1 ? (
              <IconButton
                glyph="×"
                label={t('schedule.removeWindow')}
                onPress={() => {
                  setDraft(draft.filter((_, i) => i !== index));
                  setError(null);
                }}
              />
            ) : null}
          </View>
        ))}

        <Button
          label={t('schedule.addWindow')}
          variant="secondary"
          onPress={() => setDraft([...draft, { from: '09:00', to: '17:00' }])}
        />

        <Text tone="muted" variant="small">
          {t('schedule.windowsHint')}
        </Text>
      </ScrollView>

      {error ?? saveError ? (
        <Text tone="danger" variant="small">
          {error ?? saveError}
        </Text>
      ) : null}

      <Button label={t('common.save')} loading={saving} onPress={submit} />
      <Button label={closeDayLabel} variant="danger" disabled={saving} onPress={() => onSave([])} />
      <Button label={t('common.cancel')} variant="secondary" onPress={onClose} />
    </Sheet>
  );
}
