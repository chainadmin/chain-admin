// Mirrors the web admin dark-mode tokens defined in client/src/index.css (.dark)
// Web tokens (HSL):
//   --background: 0 0% 0%        -> #000000
//   --card:       228 9.8% 10%   -> #171a1d
//   --primary:    203.77 87.6% 52.55% -> sky-500 #0ea5e9
//   --accent-foreground = primary
//   --border:     210 5.26% 14.90%
//   --font-sans:  Open Sans, sans-serif
//   --radius:     1.3rem (~21px)
export const colors = {
  bg: '#000000',
  bgElevated: '#0b0d10',
  card: '#171a1d',
  cardElevated: '#1d2125',
  cardBorder: 'rgba(255,255,255,0.10)',
  cardBorderStrong: 'rgba(255,255,255,0.18)',

  text: '#ffffff',
  textMuted: 'rgba(229,231,235,0.78)',
  textSubtle: 'rgba(229,231,235,0.55)',

  // Sidebar primary (web admin accent) — sky-500
  primary: '#0ea5e9',
  primaryDark: '#0284c7',
  accent: '#6366f1',

  success: '#10b981',
  warning: '#f59e0b',
  danger: '#f43f5e',
  info: '#38bdf8',

  statusActive: '#10b981',
  statusOverdue: '#f43f5e',
  statusSettled: '#94a3b8',
  statusInactive: '#94a3b8',
  statusClosed: '#64748b',
  statusRecalled: '#f59e0b',

  inputBg: 'rgba(255,255,255,0.06)',
  inputBorder: 'rgba(255,255,255,0.15)',

  overlay: 'rgba(0,0,0,0.6)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// --radius: 1.3rem ≈ 21px
export const radius = {
  sm: 10,
  md: 14,
  lg: 21,
  xl: 24,
  pill: 9999,
} as const;

// Web admin --font-sans is "Open Sans".
export const fontFamily = {
  sans: 'OpenSans',
  sansFallback: 'System',
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  h2: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 18, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text },
  bodyMuted: { fontSize: 14, fontWeight: '400' as const, color: colors.textMuted },
  small: { fontSize: 12, fontWeight: '400' as const, color: colors.textSubtle },
  label: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
} as const;

export function statusColor(status?: string | null): string {
  switch ((status || '').toLowerCase()) {
    case 'active':
      return colors.statusActive;
    case 'overdue':
      return colors.statusOverdue;
    case 'settled':
      return colors.statusSettled;
    case 'inactive':
      return colors.statusInactive;
    case 'closed':
      return colors.statusClosed;
    case 'recalled':
      return colors.statusRecalled;
    default:
      return colors.textMuted;
  }
}
