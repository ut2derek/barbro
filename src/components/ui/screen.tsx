import type { ReactNode, RefObject } from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  /**
   * Krawędzie, przy których odsuwamy treść od wyciętego obszaru ekranu.
   * Domyślnie tylko dół: ekrany otwierane z zakładek mają systemowy nagłówek,
   * który sam odsuwa treść od góry — drugi margines robiłby pustą przerwę.
   * Ekrany bez nagłówka (logowanie, strona rezerwacji) podają też „top”.
   */
  edges?: readonly Edge[];
  /**
   * Uchwyt do przewijania treści z ekranu — np. skok do sekcji po dotknięciu
   * odnośnika. Działa tylko razem z `scroll`.
   */
  scrollRef?: RefObject<ScrollView | null>;
};

/** Maksymalna szerokość treści — na telefonie bez znaczenia, na dużym ekranie ratuje czytelność. */
const MAX_CONTENT_WIDTH = 560;

/** Bezpieczny obszar + tło ekranu. Każdy ekran zaczyna się od tego komponentu. */
export function Screen({ children, scroll = false, style, edges = ['bottom'], scrollRef }: Props) {
  const theme = useTheme();

  const content: ViewStyle = {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={edges}>
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[{ flexGrow: 1 }, content, style]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, content, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}