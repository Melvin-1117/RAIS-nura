export const theme = {
  // Core backgrounds — near-black like Sonix
  background: '#09090B',
  surface: '#111115',
  card: '#18181C',
  cardHover: '#1F1F25',
  border: 'rgba(255, 255, 255, 0.07)',
  borderLight: 'rgba(255, 255, 255, 0.12)',

  // Text — Sonix uses high-contrast white/gray hierarchy
  textPrimary: '#FFFFFF',
  textSecondary: '#A1A1AA',
  textMuted: '#52525B',
  textAccent: '#6366F1',

  // Accent — Sonix blue-to-indigo gradient
  accent: '#6366F1',
  accentBlue: '#3B82F6',
  accentCyan: '#06B6D4',
  accentGreen: '#10B981',
  accentPink: '#EC4899',

  // Semantic
  success: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',
  info: '#6366F1',

  // Gradient text / CTAs — Sonix style
  gradients: {
    accent: ['#6366F1', '#8B5CF6'] as const,
    accentText: ['#6366F1', '#06B6D4'] as const,
    button: ['#6366F1', '#4F46E5'] as const,
    danger: ['#EF4444', '#DC2626'] as const,
    live: ['#EF4444', '#F97316'] as const,
    subtle: ['#18181C', '#111115'] as const,
  },

  // Radius — Sonix uses large radii
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    pill: 999,
  },

  // Typography weights
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
  },

  // Spacing
  spacing: {
    xs: 4,
    sm: 8,
    md: 14,
    lg: 20,
    xl: 28,
  },
};

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
