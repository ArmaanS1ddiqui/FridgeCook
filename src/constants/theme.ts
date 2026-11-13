import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

export { CATEGORIES, UNITS, COMMON_UNITS, CATEGORY_ICONS, CATEGORY_COLORS } from './catalog';

// Amber used for "use soon" warnings in both themes.
export const WARNING_COLOR = '#F5A524';
// Darker amber for light backgrounds, where the bright one is unreadable as text.
export const WARNING_COLOR_LIGHT = '#A86400';

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1E8E4E',
    onPrimary: '#FFFFFF',
    primaryContainer: '#D5F2E0',
    onPrimaryContainer: '#0B3D21',
    secondary: '#D97F00',
    onSecondary: '#FFFFFF',
    secondaryContainer: '#FFE8C7',
    onSecondaryContainer: '#4A2B00',
    tertiary: '#1F78D1',
    onTertiary: '#FFFFFF',
    tertiaryContainer: '#D8EAFB',
    onTertiaryContainer: '#0A2F54',
    error: '#D64545',
    onError: '#FFFFFF',
    errorContainer: '#FBDCDC',
    onErrorContainer: '#5C1414',
    background: '#F4F6F3',
    onBackground: '#151A17',
    surface: '#FFFFFF',
    onSurface: '#151A17',
    surfaceVariant: '#ECF0EB',
    onSurfaceVariant: '#5E6964',
    // outline = input/button borders (needs to be visible); outlineVariant = card borders and dividers.
    outline: '#8D9991',
    outlineVariant: '#D3DAD3',
    inverseSurface: '#232A26',
    inverseOnSurface: '#F1F4F1',
    inversePrimary: '#7BDCA0',
    backdrop: 'rgba(10, 16, 13, 0.45)',
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level0: 'transparent',
      level1: '#FFFFFF',
      level2: '#FFFFFF',
      level3: '#FFFFFF',
      level4: '#F7F9F6',
      level5: '#F1F4F0',
    },
  },
  roundness: 14,
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#5AD68B',
    onPrimary: '#05301A',
    primaryContainer: '#153D29',
    onPrimaryContainer: '#B9F3D0',
    secondary: '#FFB454',
    onSecondary: '#3D2500',
    secondaryContainer: '#4A3312',
    onSecondaryContainer: '#FFE1B5',
    tertiary: '#6EB7FF',
    onTertiary: '#06284A',
    tertiaryContainer: '#143450',
    onTertiaryContainer: '#CDE5FF',
    error: '#FF7373',
    onError: '#4A0D0D',
    errorContainer: '#4B1A1A',
    onErrorContainer: '#FFD3D3',
    background: '#0E1311',
    onBackground: '#E9EEEA',
    surface: '#171D1A',
    onSurface: '#E9EEEA',
    surfaceVariant: '#222A26',
    onSurfaceVariant: '#A3AFA8',
    outline: '#5B6A61',
    outlineVariant: '#323D37',
    inverseSurface: '#E9EEEA',
    inverseOnSurface: '#1A211D',
    inversePrimary: '#1E8E4E',
    backdrop: 'rgba(0, 0, 0, 0.6)',
    elevation: {
      ...MD3DarkTheme.colors.elevation,
      level0: 'transparent',
      level1: '#171D1A',
      level2: '#1C2320',
      level3: '#212925',
      level4: '#252E2A',
      level5: '#2A332F',
    },
  },
  roundness: 14,
};

export type AppTheme = typeof lightTheme;
