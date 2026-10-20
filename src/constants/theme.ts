import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

export const CATEGORIES = [
  'Protein', 'Dairy', 'Vegetable', 'Fruit', 'Grain',
  'Spice', 'Beverage', 'Snack', 'Condiment', 'Frozen', 'Other',
] as const;

export const UNITS = [
  'pcs', 'g', 'kg', 'mg', 'ml', 'L', 'cup', 'tbsp', 'tsp', 'oz', 'lb', 'dozen', '%',
] as const;

export const CATEGORY_ICONS: Record<string, string> = {
  Protein: 'food-drumstick',
  Dairy: 'cheese',
  Vegetable: 'carrot',
  Fruit: 'fruit-cherries',
  Grain: 'bread-slice',
  Spice: 'shaker',
  Beverage: 'cup',
  Snack: 'cookie',
  Condiment: 'bottle-soda',
  Frozen: 'snowflake',
  Other: 'package-variant',
};

export const CATEGORY_COLORS: Record<string, string> = {
  Protein: '#EF5350',
  Dairy: '#FFA726',
  Vegetable: '#66BB6A',
  Fruit: '#EC407A',
  Grain: '#D4A574',
  Spice: '#FF7043',
  Beverage: '#42A5F5',
  Snack: '#AB47BC',
  Condiment: '#26A69A',
  Frozen: '#26C6DA',
  Other: '#78909C',
};

const sharedColors = {
  primary: '#4CAF50',
  secondary: '#FF9800',
  tertiary: '#2196F3',
  error: '#EF5350',
};

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...sharedColors,
    primaryContainer: '#C8E6C9',
    secondaryContainer: '#FFE0B2',
    tertiaryContainer: '#BBDEFB',
    surface: '#FFFFFF',
    surfaceVariant: '#F5F5F5',
    background: '#F8F9FA',
    onSurface: '#1A1A1A',
    onSurfaceVariant: '#666666',
    onBackground: '#1A1A1A',
    outline: '#E0E0E0',
    errorContainer: '#FFCDD2',
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level0: 'transparent',
      level1: '#FFFFFF',
      level2: '#F5F5F5',
      level3: '#EEEEEE',
      level4: '#E0E0E0',
      level5: '#D6D6D6',
    },
  },
  roundness: 16,
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...sharedColors,
    primaryContainer: '#1B5E20',
    secondaryContainer: '#E65100',
    tertiaryContainer: '#0D47A1',
    surface: '#1E1E1E',
    surfaceVariant: '#2A2A2A',
    background: '#121212',
    onSurface: '#E8E8E8',
    onSurfaceVariant: '#AAAAAA',
    onBackground: '#E8E8E8',
    outline: '#333333',
    errorContainer: '#B71C1C',
    elevation: {
      ...MD3DarkTheme.colors.elevation,
      level0: 'transparent',
      level1: '#1E1E1E',
      level2: '#232323',
      level3: '#282828',
      level4: '#2E2E2E',
      level5: '#333333',
    },
  },
  roundness: 16,
};

export type AppTheme = typeof lightTheme;
