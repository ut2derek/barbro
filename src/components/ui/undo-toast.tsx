import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { t } from '@/i18n';
import { useTheme } from '@/theme';

import { Text } from './text';

/** Ile czasu użytkownik ma na wycofanie akcji, zanim poleci do serwera. */
const UNDO_WINDOW_MS = 5000;

type PendingAction = {
  message: string;
  commit: () => void | Promise<void>;
  undo?: () => void;
};

type UndoApi = {
  /**
   * Wykonuje akcję z opóźnieniem, dając chwilę na „Cofnij”.
   * Nic nie leci do serwera, dopóki okno na cofnięcie się nie zamknie —
   * dzięki temu cofnięcie nie wymaga odwracania zmiany w bazie.
   */
  runWithUndo: (action: PendingAction) => void;
};

const UndoContext = createContext<UndoApi | null>(null);

export function UndoProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<PendingAction | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const commitNow = useCallback(() => {
    const action = pendingRef.current;
    clearTimer();
    pendingRef.current = null;
    setPending(null);
    void action?.commit();
  }, [clearTimer]);

  const runWithUndo = useCallback(
    (action: PendingAction) => {
      // Kolejna akcja zamyka poprzednią — nie kolejkujemy cofnięć.
      if (pendingRef.current) commitNow();

      pendingRef.current = action;
      setPending(action);
      timerRef.current = setTimeout(commitNow, UNDO_WINDOW_MS);
    },
    [commitNow],
  );

  const undo = useCallback(() => {
    const action = pendingRef.current;
    clearTimer();
    pendingRef.current = null;
    setPending(null);
    action?.undo?.();
  }, [clearTimer]);

  // Wyjście z ekranu nie może zgubić akcji — dokańczamy ją przy odmontowaniu.
  useEffect(() => () => clearTimer(), [clearTimer]);

  return (
    <UndoContext value={{ runWithUndo }}>
      {children}

      {pending ? (
        <View
          style={{
            position: 'absolute',
            left: theme.spacing.lg,
            right: theme.spacing.lg,
            bottom: theme.spacing.xxxl + theme.spacing.lg,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.md,
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.accent,
          }}
        >
          <Text tone="onAccent" style={{ flex: 1 }}>
            {pending.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={undo}
            style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}
          >
            <Text tone="onAccent" variant="bodyStrong">
              {t('common.undo')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </UndoContext>
  );
}

export function useUndo(): UndoApi {
  const value = use(UndoContext);
  if (!value) throw new Error('useUndo musi być użyte wewnątrz UndoProvider');
  return value;
}
