// StudyMate AI — Redesigned Design System Colors
// Premium, focused, calm aesthetic — Linear/Vercel Dark inspired
// Surface-based elevation, no shadows, electric violet accent

export const Colors = {
  dark: {
    // ── Surfaces — dark with subtle cool tint ──
    background:   '#09090C',   // near-black, page bg
    surface1:     'rgba(17,17,23,0.65)',   // default card/panel bg (translucent)
    surface2:     'rgba(23,23,31,0.75)',   // elevated card, hover (translucent)
    surface3:     '#1E1E28',   // modals, bottom sheets, dropdowns
    surface4:     '#252530',   // active selected state bg

    // ── Borders — ultra-subtle ──
    borderSubtle:  'rgba(255,255,255,0.055)',
    borderMedium:  'rgba(255,255,255,0.10)',
    borderStrong:  'rgba(255,255,255,0.18)',

    // ── Text hierarchy — four levels ──
    textPrimary:   '#F1F0F5',
    textSecondary: '#9896A8',
    textTertiary:  '#5D5B6E',
    textInverse:   '#09090C',

    // ── Primary accent — electric violet ──
    accent:       '#7C5CFC',
    accentHover:  '#8F72FD',
    accentMuted:  'rgba(124,92,252,0.15)',
    accentBorder: 'rgba(124,92,252,0.35)',

    // ── Semantic / status ──
    success: '#22C55E',
    warning: '#F59E0B',
    danger:  '#EF4444',
    info:    '#3B8EF3',

    // ── Gamification ──
    xpGold:      '#F5A623',
    streakFlame: '#FF6B35',
    levelStar:   '#D4AF37',

    // ── Tab bar ──
    tabBar:       'rgba(17,17,23,0.92)',
    tabBarBorder: 'rgba(255,255,255,0.055)',
    tabActive:    '#7C5CFC',
    tabInactive:  '#5D5B6E',

    // ── Legacy compat aliases (for gradual migration) ──
    // These map old token names to new ones so screens still compile
    // Remove after Phase 6 completion
    background_compat: '#09090C',
    surface: '#111117',
    surfaceDim: '#09090C',
    surfaceContainer: '#17171F',
    surfaceContainerHigh: '#1E1E28',
    surfaceContainerLow: '#111117',
    text: '#F1F0F5',
    textSecondary_compat: '#9896A8',
    textTertiary_compat: '#5D5B6E',
    textInverse_compat: '#09090C',
    primary: '#7C5CFC',
    primaryContainer: 'rgba(124,92,252,0.15)',
    onPrimary: '#09090C',
    onPrimaryContainer: '#F1F0F5',
    primaryFixed: '#7C5CFC',
    primaryFixedDim: '#8F72FD',
    secondary: '#F5A623',
    secondaryContainer: 'rgba(245,166,35,0.15)',
    onSecondary: '#09090C',
    onSecondaryContainer: '#F5A623',
    secondaryFixed: '#F5A623',
    tertiary: '#22C55E',
    tertiaryContainer: 'rgba(34,197,94,0.15)',
    onTertiary: '#09090C',
    onTertiaryContainer: '#22C55E',
    tertiaryFixed: '#22C55E',
    error: '#EF4444',
    errorContainer: 'rgba(239,68,68,0.15)',
    successContainer: 'rgba(34,197,94,0.15)',
    warningContainer: 'rgba(245,158,11,0.15)',
    outline: '#5D5B6E',
    outlineVariant: 'rgba(255,255,255,0.10)',
    border: 'rgba(255,255,255,0.055)',
    inverseSurface: '#F1F0F5',
    inverseOnSurface: '#09090C',
    surfaceTint: '#7C5CFC',
  },

  light: {
    // ── Surfaces — cool off-white ──
    background:   '#F3F3F8',   // page bg — NOT pure white
    surface1:     'rgba(255,255,255,0.75)',   // cards — pops against bg (translucent)
    surface2:     'rgba(248,248,252,0.82)',   // elevated card, hover (translucent) state
    surface3:     '#EEEEF5',   // modals, nav, bottom sheets
    surface4:     '#E4E4EE',   // active selected

    // ── Borders — rgba(17,17,40, n) ──
    borderSubtle:  'rgba(17,17,40,0.07)',
    borderMedium:  'rgba(17,17,40,0.12)',
    borderStrong:  'rgba(17,17,40,0.20)',

    // ── Text ──
    textPrimary:   '#111128',
    textSecondary: '#4B4B6A',
    textTertiary:  '#8A8AA8',
    textInverse:   '#FFFFFF',

    // ── Accent (same hue, adjusted muted/border opacities) ──
    accent:       '#7C5CFC',
    accentHover:  '#8F72FD',
    accentMuted:  'rgba(124,92,252,0.08)',
    accentBorder: 'rgba(124,92,252,0.22)',

    // ── Semantic / status ──
    success: '#22C55E',
    warning: '#F59E0B',
    danger:  '#EF4444',
    info:    '#3B8EF3',

    // ── Gamification ──
    xpGold:      '#F5A623',
    streakFlame: '#FF6B35',
    levelStar:   '#D4AF37',

    // ── Tab bar ──
    tabBar:       'rgba(255,255,255,0.95)',
    tabBarBorder: 'rgba(17,17,40,0.07)',
    tabActive:    '#7C5CFC',
    tabInactive:  '#8A8AA8',

    // ── Legacy compat aliases ──
    background_compat: '#F3F3F8',
    surface: '#FFFFFF',
    surfaceDim: '#F3F3F8',
    surfaceContainer: '#F8F8FC',
    surfaceContainerHigh: '#EEEEF5',
    surfaceContainerLow: '#FFFFFF',
    text: '#111128',
    textSecondary_compat: '#4B4B6A',
    textTertiary_compat: '#8A8AA8',
    textInverse_compat: '#FFFFFF',
    primary: '#7C5CFC',
    primaryContainer: 'rgba(124,92,252,0.08)',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#111128',
    primaryFixed: '#7C5CFC',
    primaryFixedDim: '#8F72FD',
    secondary: '#F5A623',
    secondaryContainer: 'rgba(245,166,35,0.08)',
    onSecondary: '#FFFFFF',
    onSecondaryContainer: '#D48A0E',
    secondaryFixed: '#F5A623',
    tertiary: '#22C55E',
    tertiaryContainer: 'rgba(34,197,94,0.08)',
    onTertiary: '#FFFFFF',
    onTertiaryContainer: '#2E9A6C',
    tertiaryFixed: '#22C55E',
    error: '#EF4444',
    errorContainer: 'rgba(239,68,68,0.08)',
    successContainer: 'rgba(34,197,94,0.08)',
    warningContainer: 'rgba(245,158,11,0.08)',
    outline: '#8A8AA8',
    outlineVariant: 'rgba(17,17,40,0.12)',
    border: 'rgba(17,17,40,0.07)',
    inverseSurface: '#111128',
    inverseOnSurface: '#F3F3F8',
    surfaceTint: '#7C5CFC',
  },
};

// Subject accent colors — dual variants for light/dark backgrounds
// Dark variants for dark mode, light variants (~20% darker HSL) for light mode
export const SubjectColors: Record<string, { dark: string; light: string }> = {
  'Physics':              { dark: '#4F8EF7', light: '#2070E8' },
  'Chemistry':            { dark: '#F5A623', light: '#D48A0E' },
  'Mathematics':          { dark: '#F06292', light: '#D44470' },
  'Biology':              { dark: '#4DB88A', light: '#2E9A6C' },
  'Computer Applications': { dark: '#26C6DA', light: '#1A9BAE' },
  'History & Civics':     { dark: '#FF8A50', light: '#E06A30' },
  'English':              { dark: '#B06FFF', light: '#8A4EDB' },
  'Geography':            { dark: '#69D09A', light: '#44B07A' },
};

// Grade badge colors
export const GradeColors = {
  'A+': '#22C55E',
  'A': '#22C55E',
  'B': '#3B8EF3',
  'C': '#F59E0B',
  'F': '#EF4444',
};

// Performance dot colors
export const PerformanceDotColors = {
  excellent: '#22C55E',   // >75%
  good: '#F59E0B',        // 50-75%
  weak: '#EF4444',        // <50%
  unattempted: '#5D5B6E', // not attempted
};

// Typography scale — strict, no deviations
// fontFamily values reference the loaded Google Font names
export const Typography = {
  heroTitle:      { fontSize: 28, fontWeight: '600' as const, lineHeight: 33.6 },
  pageTitle:      { fontSize: 22, fontWeight: '600' as const, lineHeight: 27.5 },
  sectionHeading: { fontSize: 16, fontWeight: '600' as const, lineHeight: 20.8 },
  cardTitle:      { fontSize: 15, fontWeight: '500' as const, lineHeight: 21 },
  body:           { fontSize: 14, fontWeight: '400' as const, lineHeight: 22.4 },
  label:          { fontSize: 12, fontWeight: '500' as const, lineHeight: 16.8 },
  micro:          { fontSize: 11, fontWeight: '400' as const, lineHeight: 16.5 },
  sectionDivider: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.88 },
  statValue:      { fontSize: 32, fontWeight: '600' as const },
};

// Spacing grid — 8px base unit
export const Spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  base: 16,
  lg:  20,
  xl:  24,
  xxl: 32,
  xxxl: 40,
  pageHorizontal: 20,
  sectionGap: 24,
  cardPadding: 16,
  cardPaddingLg: 20,
  cardGap: 10,
  iconLabelGap: 8,
  chipPaddingH: 14,
  chipPaddingV: 6,
  inputPaddingH: 14,
  inputPaddingV: 12,
  bottomNavHeight: 64,
  bottomNavIconSize: 22,
  bottomNavLabelSize: 11,
};

// Border radii — consistent
export const Radii = {
  card: 14,
  chip: 20,
  input: 12,
  button: 12,
  bottomSheet: 20,
};
