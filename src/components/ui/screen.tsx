import type { ReactNode } from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
};

/** Maksymalna szerokość treści — na telefonie bez znaczenia, na dużym ekranie ratuje czytelność. */
const MAX_CONTENT_WIDTH = 560;

/** Bezpieczny obszar + tło ekranu. Każdy ekran zaczyna się od tego komponentu. */
export function Screen({ children, scroll = false, style }: Props) {
  const theme = useTheme();

  const content: ViewStyle = {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      edges={['top', 'bottom']}
    >
      {scroll ? (
        <ScrollView
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
