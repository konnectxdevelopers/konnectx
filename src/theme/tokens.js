import { Platform } from 'react-native';

/**
 * KonnectX design tokens — single source of truth for colour, type,
 * spacing, radii, elevation and motion. Every screen and component
 * should consume these values instead of hard-coded numbers.
 */

const systemFont = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  web: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  default: 'System',
});

const mediumFont = Platform.select({
  ios: 'System',
  android: 'sans-serif-medium',
  web: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  default: 'System',
});

export const colors = {
  // Brand
  primary: '#0B3B2E',
  primaryDark: '#072A20',
  primaryLight: '#14523F',
  primarySoft: '#EAF2EF',
  primaryMuted: '#D6E5DF',
  primaryInk: '#06261D',

  // Action
  cta: '#FF6B2C',
  ctaDark: '#E5571A',
  ctaSoft: '#FFF0E8',
  ctaMuted: '#FFD8C4',
  ctaInk: '#8A2F08',

  // Canvas & surfaces (60%)
  background: '#F6F7F5',
  canvas: '#F6F7F5',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5F3',
  surfaceTonal: '#EDF2EF',
  surfaceRaised: '#FFFFFF',
  // Older cards referenced surfaceAlt; keep it as a real token so image
  // placeholders never fall back to a transparent background.
  surfaceAlt: '#EEF2F0',
  surfaceInverse: '#0B3B2E',

  // Ink (30% structure)
  text: '#101917',
  textSecondary: '#49554F',
  muted: '#6B7772',
  subtle: '#98A29D',
  inverse: '#FFFFFF',
  ink: '#101917',

  // Lines
  border: '#E3E8E5',
  borderStrong: '#C9D3CE',
  borderSubtle: '#EEF2F0',
  divider: '#EEF2F0',

  // Feedback
  success: '#12805C',
  successSoft: '#E7F6EF',
  successBorder: '#BFE8D6',
  warning: '#A65B08',
  warningSoft: '#FFF6E5',
  warningBorder: '#F8E0B4',
  danger: '#D32F2F',
  dangerSoft: '#FEF1F1',
  dangerBorder: '#F8D3D3',
  info: '#1F5FBF',
  infoSoft: '#EFF5FF',
  infoBorder: '#CFE0FB',
  star: '#F2A93B',
  gold: '#C79A4B',

  // Utility
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(9, 22, 18, 0.55)',
  overlaySoft: 'rgba(9, 22, 18, 0.16)',
  transparent: 'transparent',

  // Legacy aliases kept so older modules keep rendering correctly.
  accent: '#EAF2EF',
  paleMint: '#EAF2EF',
  paleBlue: '#F1F5F3',
  forest: '#0B3B2E',
  teal: '#0B3B2E',
  ctaLime: '#A3E636',
};

export const typography = {
  fontFamily: systemFont,
  fontFamilyMedium: mediumFont,
  sizes: {
    micro: 10,
    caption: 12,
    footnote: 13,
    body: 15,
    bodyLg: 16,
    subtitle: 18,
    title: 23,
    h2: 26,
    h1: 30,
    display: 34,
  },
  weights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    heavy: '800',
  },
  lineHeights: {
    micro: 14,
    caption: 17,
    footnote: 19,
    body: 22,
    bodyLg: 24,
    subtitle: 25,
    title: 30,
    h2: 33,
    h1: 37,
    display: 41,
  },
  tracking: {
    tight: -0.6,
    snug: -0.3,
    normal: 0,
    wide: 0.6,
    caps: 1.4,
  },
  variants: {
    display: {
      fontSize: 34,
      lineHeight: 41,
      fontWeight: '800',
      letterSpacing: -0.9,
    },
    h1: {
      fontSize: 30,
      lineHeight: 37,
      fontWeight: '700',
      letterSpacing: -0.7,
    },
    h2: {
      fontSize: 26,
      lineHeight: 33,
      fontWeight: '700',
      letterSpacing: -0.5,
    },
    h3: {
      fontSize: 21,
      lineHeight: 28,
      fontWeight: '700',
      letterSpacing: -0.35,
    },
    h4: {
      fontSize: 17,
      lineHeight: 23,
      fontWeight: '700',
      letterSpacing: -0.15,
    },
    title: {
      fontSize: 23,
      lineHeight: 30,
      fontWeight: '700',
      letterSpacing: -0.4,
    },
    subtitle: {
      fontSize: 18,
      lineHeight: 25,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    headline: {
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '700',
      letterSpacing: -0.1,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '400',
      letterSpacing: 0,
    },
    bodyStrong: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '600',
      letterSpacing: 0,
    },
    footnote: {
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '400',
      letterSpacing: 0,
    },
    caption: {
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '500',
      letterSpacing: 0,
    },
    label: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      letterSpacing: 0,
    },
    overline: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '700',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    micro: {
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '600',
      letterSpacing: 0.1,
    },
  },
};

export const spacing = {
  micro: 2,
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radii = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 26,
  round: 30,
  pill: 999,
  // Alias used by older screens.
  full: 999,
};

export const shadows = {
  none: {},
  soft: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
    },
    android: { elevation: 1 },
    default: {},
  }),
  card: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
    },
    android: { elevation: 2 },
    default: {},
  }),
  // Size aliases used by marketplace cards.
  sm: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
    },
    android: { elevation: 1 },
    default: {},
  }),
  md: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.07,
      shadowRadius: 16,
    },
    android: { elevation: 2 },
    default: {},
  }),
  lg: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.1,
      shadowRadius: 24,
    },
    android: { elevation: 5 },
    default: {},
  }),
  raised: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.09,
      shadowRadius: 24,
    },
    android: { elevation: 5 },
    default: {},
  }),
  floating: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.14,
      shadowRadius: 30,
    },
    android: { elevation: 9 },
    default: {},
  }),
  brand: Platform.select({
    ios: {
      shadowColor: '#0B3B2E',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.22,
      shadowRadius: 22,
    },
    android: { elevation: 6 },
    default: {},
  }),
  cta: Platform.select({
    ios: {
      shadowColor: '#FF6B2C',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.28,
      shadowRadius: 18,
    },
    android: { elevation: 5 },
    default: {},
  }),
};

export const layout = {
  screenPadding: 20,
  screenPaddingCompact: 16,
  contentMaxWidth: 560,
  tabBarHeight: 66,
  tabBarSpace: 104,
  headerHeight: 56,
  inputHeight: 52,
  buttonHeight: 52,
  cardRadius: 18,
  imageAspect: 16 / 10,
  thumbAspect: 1,
};

export const motion = {
  fast: 140,
  base: 220,
  slow: 340,
  spring: { damping: 18, stiffness: 220, mass: 0.8 },
};

export const gradients = {
  forest: ['#072A20', '#0B3B2E', '#14523F'],
  forestScrim: ['rgba(7, 42, 32, 0.08)', 'rgba(7, 42, 32, 0.94)'],
  forestHorizontal: ['#0B3B2E', '#14523F'],
  citrus: ['#FF874E', '#E5571A'],
  mist: ['#FFFFFF', '#EAF2EF'],
  aurora: ['#0B3B2E', '#155A45', '#2E7D64'],
  amber: ['#FFB259', '#F08A24'],
  glass: ['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.04)'],
  cardScrim: ['rgba(7,42,32,0)', 'rgba(7,42,32,0.78)'],
  imagePlaceholder: ['#EAF2EF', '#D6E5DF'],
};

export const theme = {
  colors,
  typography,
  spacing,
  radii,
  shadows,
  layout,
  motion,
  gradients,
};

export default theme;
