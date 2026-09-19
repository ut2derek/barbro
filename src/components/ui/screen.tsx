import type { ReactNode } from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
};

/** Bezpieczny obszar + tło ekranu. Każdy ekran zaczyna się od tego komponentu. */
export function Screen({ children, scroll = false, style }: Props) {
  const theme = useTheme();
  const content: ViewStyle = { flex: 1, padding: theme.spacing.lg, gap: theme.spacing.lg };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      {scroll ? (
        <ScrollView contentContainerStyle={[content, style]}>{children}</ScrollView>
      ) : (
        <View style={[content, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}
