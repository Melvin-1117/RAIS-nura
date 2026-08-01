/**
 * Nura Audio Intelligence — Design System
 * Derived from the Stitch-generated Material Design 3 palette.
 */

// ── Material Design 3 Named Colors (Dark Mode) ─────────────────────────────
export const colors = {
  // Primary
  primary: '#c0c1ff',
  onPrimary: '#1000a9',
  primaryContainer: '#8083ff',
  onPrimaryContainer: '#0d0096',
  inversePrimary: '#494bd6',
  primaryFixed: '#e1e0ff',
  primaryFixedDim: '#c0c1ff',
  onPrimaryFixed: '#07006c',
  onPrimaryFixedVariant: '#2f2ebe',

  // Secondary
  secondary: '#4cd7f6',
  onSecondary: '#003640',
  secondaryContainer: '#03b5d3',
  onSecondaryContainer: '#00424e',
  secondaryFixed: '#acedff',
  secondaryFixedDim: '#4cd7f6',
  onSecondaryFixed: '#001f26',
  onSecondaryFixedVariant: '#004e5c',

  // Tertiary
  tertiary: '#4edea3',
  onTertiary: '#003824',
  tertiaryContainer: '#00885d',
  onTertiaryContainer: '#000703',
  tertiaryFixed: '#6ffbbe',
  tertiaryFixedDim: '#4edea3',
  onTertiaryFixed: '#002113',
  onTertiaryFixedVariant: '#005236',

  // Error
  error: '#ffb4ab',
  onError: '#690005',
  errorContainer: '#93000a',
  onErrorContainer: '#ffdad6',

  // Surface hierarchy
  background: '#09090B',
  onBackground: '#e5e1e4',
  surface: '#131315',
  surfaceDim: '#131315',
  surfaceBright: '#39393b',
  surfaceContainerLowest: '#0e0e10',
  surfaceContainerLow: '#1c1b1d',
  surfaceContainer: '#201f22',
  surfaceContainerHigh: '#2a2a2c',
  surfaceContainerHighest: '#353437',
  onSurface: '#e5e1e4',
  onSurfaceVariant: '#c7c4d7',
  surfaceVariant: '#353437',
  surfaceTint: '#c0c1ff',
  inverseSurface: '#e5e1e4',
  inverseOnSurface: '#313032',

  // Outline
  outline: '#908fa0',
  outlineVariant: '#464554',

  // Convenience aliases
  white: '#FFFFFF',
  border: 'rgba(255, 255, 255, 0.07)',
  borderLight: 'rgba(255, 255, 255, 0.12)',
  borderHover: 'rgba(255, 255, 255, 0.15)',
  card: '#18181C',
  cardHover: '#1F1F25',

  // Semantic
  success: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',
  info: '#6366F1',
} as const;

// ── Accent Shortcuts (for feature cards, gradients) ─────────────────────────
export const accents = {
  indigo: '#6366F1',
  purple: '#8B5CF6',
  cyan: '#06B6D4',
  blue: '#3B82F6',
  green: '#10B981',
  pink: '#EC4899',
  orange: '#F59E0B',
  red: '#EF4444',
} as const;

// ── Gradients ───────────────────────────────────────────────────────────────
export const gradients = {
  button: ['#6366F1', '#4F46E5'] as const,
  accent: ['#6366F1', '#8B5CF6'] as const,
  accentText: ['#6366F1', '#06B6D4'] as const,
  danger: ['#EF4444', '#DC2626'] as const,
  live: ['#EF4444', '#F97316'] as const,
  subtle: ['#18181C', '#111115'] as const,
} as const;

// ── Typography Scale (from Stitch design system) ────────────────────────────
export const typography = {
  displayLg: { fontSize: 48, lineHeight: 56, fontWeight: '800' as const, letterSpacing: -0.96 },
  headlineXl: { fontSize: 32, lineHeight: 40, fontWeight: '700' as const, letterSpacing: -0.32 },
  headlineXlMobile: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  headlineLg: { fontSize: 24, lineHeight: 32, fontWeight: '700' as const },
  headlineMd: { fontSize: 20, lineHeight: 28, fontWeight: '600' as const },
  bodyLg: { fontSize: 18, lineHeight: 28, fontWeight: '400' as const },
  bodyMd: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodySm: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  labelMd: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const, letterSpacing: 0.6 },
} as const;

// ── Spacing (4px grid) ──────────────────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 48,
  gutter: 24,
  marginMobile: 16,
} as const;

// ── Radius ──────────────────────────────────────────────────────────────────
export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  pill: 9999,
} as const;

// ── Glass-panel style (reusable) ────────────────────────────────────────────
export const glassPanel = {
  backgroundColor: 'rgba(24, 24, 28, 0.7)',
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.xl,
} as const;

export const cardSurface = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.xl,
} as const;

// ── Legacy `theme` export (backwards-compat for existing components) ────────
export const theme = {
  background: colors.background,
  surface: colors.surface,
  card: colors.card,
  cardHover: colors.cardHover,
  border: colors.border,
  borderLight: colors.borderLight,

  textPrimary: colors.white,
  textSecondary: '#A1A1AA',
  textMuted: '#52525B',
  textAccent: accents.indigo,

  accent: accents.indigo,
  accentBlue: accents.blue,
  accentCyan: accents.cyan,
  accentGreen: accents.green,
  accentPink: accents.pink,

  success: colors.success,
  danger: colors.danger,
  warning: colors.warning,
  info: colors.info,

  gradients,

  radius: {
    sm: radius.sm,
    md: radius.md,
    lg: radius.xl,
    xl: radius.xxl,
    pill: radius.pill,
  },

  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
  },

  spacing,
};

// ── Speaker color palette ───────────────────────────────────────────────────
export const speakerPalette = [
  '#6366F1',
  '#06B6D4',
  '#10B981',
  '#F59E0B',
  '#EC4899',
  '#8B5CF6',
  '#3B82F6',
  '#EF4444',
];

export const categoryEmojis: Record<string, string> = {
  Natural: '🌿',
  Artificial: '⚙️',
  'Human Activity': '🤧',
  Music: '🎵',
  Animal: '🐾',
};
