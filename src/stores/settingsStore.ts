import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AIModel {
  id: string;
  name: string;
  provider: 'gemini';
}

export const AVAILABLE_MODELS: AIModel[] = [
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'gemini' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', provider: 'gemini' },
  { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash', provider: 'gemini' },
  { id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro', provider: 'gemini' },
];

export const CURRENCIES = [
  { symbol: '$', name: 'USD' },
  { symbol: '€', name: 'EUR' },
  { symbol: '£', name: 'GBP' },
  { symbol: '₹', name: 'INR' },
  { symbol: '¥', name: 'JPY' },
  { symbol: 'A$', name: 'AUD' },
  { symbol: 'C$', name: 'CAD' },
  { symbol: 'Rs', name: 'PKR' },
  { symbol: 'د.إ', name: 'AED' },
  { symbol: 'R', name: 'ZAR' },
];

interface SettingsState {
  themeMode: ThemeMode;
  selectedModel: string;
  currency: string;
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setSelectedModel: (modelId: string) => Promise<void>;
  setCurrency: (currency: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  themeMode: 'dark',
  selectedModel: 'gemini-2.0-flash',
  currency: '$',
  isLoaded: false,

  loadSettings: async () => {
    try {
      const [themeMode, selectedModel, currency] = await Promise.all([
        AsyncStorage.getItem('theme_mode'),
        AsyncStorage.getItem('selected_model'),
        AsyncStorage.getItem('currency'),
      ]);
      set({
        themeMode: (themeMode as ThemeMode) || 'dark',
        selectedModel: selectedModel || 'gemini-2.0-flash',
        currency: currency || '$',
        isLoaded: true,
      });
    } catch {
      set({ isLoaded: true });
    }
  },

  setThemeMode: async (mode) => {
    await AsyncStorage.setItem('theme_mode', mode);
    set({ themeMode: mode });
  },

  setSelectedModel: async (modelId) => {
    await AsyncStorage.setItem('selected_model', modelId);
    set({ selectedModel: modelId });
  },

  setCurrency: async (currency) => {
    await AsyncStorage.setItem('currency', currency);
    set({ currency });
  },
}));
