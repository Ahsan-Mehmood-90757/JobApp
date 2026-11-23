import { useColorScheme } from 'react-native';

const light = {
  background: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF0F3',
  border: '#E1E4E8',
  text: '#0F172A',
  textSecondary: '#5B6472',
  textMuted: '#8A93A0',
  primary: '#2563EB',
  primaryText: '#FFFFFF',
  primarySoft: '#E6EEFD',
  success: '#15803D',
  successSoft: '#E3F5E9',
  warning: '#B45309',
  warningSoft: '#FDF1E0',
  danger: '#B91C1C',
  dangerSoft: '#FCE8E8',
  overlay: 'rgba(15, 23, 42, 0.45)',
};

export type Palette = typeof light;

const dark: Palette = {
  background: '#0B0D12',
  surface: '#151922',
  surfaceMuted: '#1E2430',
  border: '#2A3140',
  text: '#F1F4F9',
  textSecondary: '#A7B0BE',
  textMuted: '#768092',
  primary: '#5B8DF6',
  primaryText: '#FFFFFF',
  primarySoft: '#1C2A48',
  success: '#4ADE80',
  successSoft: '#13291C',
  warning: '#FBBF24',
  warningSoft: '#2E2410',
  danger: '#F87171',
  dangerSoft: '#2F1616',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export function useColors(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const font = { xs: 12, sm: 13, md: 15, lg: 17, xl: 20, xxl: 26 } as const;
