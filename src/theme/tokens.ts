/**
 * JEDYNE miejsce z wartościami wyglądu.
 * Docelowy design podmienia się tutaj — ekrany nie znają żadnych konkretnych
 * kolorów, rozmiarów ani odstępów.
 *
 * Kontrast tekstu do tła spełnia WCAG AA (min. 4.5:1 dla tekstu, 3:1 dla dużego).
 */

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** Minimalny rozmiar elementu dotykowego — wymóg dostępności. */
export const minTouchTarget = 44;

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '500' },
  small: { fontSize: 13, lineHeight: 17, fontWeight: '400' },
  mono: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Role kolorów. Ekrany używają wyłącznie tych nazw, nigdy wartości HEX. */
export type ColorRoles = {
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnAccent: string;
  accent: string;
  accentMuted: string;
  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
  danger: string;
  dangerMuted: string;
  overlay: string;
};

const lightColors: ColorRoles = {
  background: '#FFFFFF',
  surface: '#F5F5F7',
  surfaceElevated: '#FFFFFF',
  border: '#E3E3E8',
  borderStrong: '#C7C7CF',
  textPrimary: '#16161A',
  textSecondary: '#55555F',
  textMuted: '#767680',
  textOnAccent: '#FFFFFF',
  accent: '#1F1F23',
  accentMuted: '#EDEDF0',
  success: '#0F7A4A',
  successMuted: '#E4F4EC',
  warning: '#8A5A00',
  warningMuted: '#FBF0DC',
  danger: '#B3261E',
  dangerMuted: '#FBE9E7',
  overlay: 'rgba(0, 0, 0, 0.45)',
};

const darkColors: ColorRoles = {
  background: '#101013',
  surface: '#1A1A1F',
  surfaceElevated: '#232329',
  border: '#2E2E36',
  borderStrong: '#45454F',
  textPrimary: '#F4F4F6',
  textSecondary: '#B4B4BE',
  textMuted: '#8C8C97',
  textOnAccent: '#16161A',
  accent: '#F4F4F6',
  accentMuted: '#2A2A31',
  success: '#5BD69B',
  successMuted: '#13301F',
  warning: '#F0B860',
  warningMuted: '#33260E',
  danger: '#F2837B',
  dangerMuted: '#3A1815',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const colorSchemes = { light: lightColors, dark: darkColors } as const;
export type ColorSchemeName = keyof typeof colorSchemes;

export type Theme = {
  name: ColorSchemeName;
  colors: ColorRoles;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  minTouchTarget: number;
};

export function buildTheme(name: ColorSchemeName): Theme {
  return {
    name,
    colors: colorSchemes[name],
    spacing,
    radius,
    typography,
    minTouchTarget,
  };
}