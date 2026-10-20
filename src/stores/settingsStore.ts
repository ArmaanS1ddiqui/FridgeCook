import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AIModel {
  id: string;
  name: string;
  provider: 'gemini';
}

export const AVAILABLE_MODELS: AIModel[] = [
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', provider: 'gemini' },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', provider: 'gemini' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', provider: 'gemini' },
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
  selectedModel: 'gemini-3.8-flash',
  currency: '$',
  isLoaded: false,

  loadSettings: async () => {
    try {
      const [themeMode, selectedModel, currency] = await Promise.all([
        AsyncStorage.getItem('theme_mode'),
        AsyncStorage.getItem('selected_model'),
        AsyncStorage.getItem('currency'),
      ]);
      // Migrate stale model IDs to current ones
      const validModels = AVAILABLE_MODELS.map(m => m.id);
      const resolvedModel = (selectedModel && validModels.includes(selectedModel))
        ? selectedModel
        : 'gemini-3.8-flash';
      if (resolvedModel !== selectedModel) {
        await AsyncStorage.setItem('selected_model', resolvedModel);
      }
      set({
        themeMode: (themeMode as ThemeMode) || 'dark',
        selectedModel: resolvedModel,
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
