import { createContext, use, type ReactNode } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { buildTheme, type ColorSchemeName, type Theme } from './tokens';

export * from './tokens';

const ThemeContext = createContext<Theme>(buildTheme('light'));

type Props = {
  children: ReactNode;
  /** Wymuszenie trybu — na razie nieużywane, przyda się przy ustawieniu w aplikacji. */
  override?: ColorSchemeName;
};

export function AppThemeProvider({ children, override }: Props) {
  const scheme = useColorScheme();
  const name: ColorSchemeName = override ?? (scheme === 'dark' ? 'dark' : 'light');

  return <ThemeContext value={buildTheme(name)}>{children}</ThemeContext>;
}

export function useTheme(): Theme {
  return use(ThemeContext);
}
