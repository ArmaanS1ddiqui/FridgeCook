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

export interface Supermarket {
  id: string;
  name: string;
  available: boolean; // false = "Coming Soon"
}

export const DUBAI_SUPERMARKETS: Supermarket[] = [
  { id: 'carrefour', name: 'Carrefour', available: true },
  { id: 'lulu', name: 'Lulu Hypermarket', available: false },
  { id: 'spinneys', name: 'Spinneys', available: false },
  { id: 'choithrams', name: 'Choithrams', available: false },
  { id: 'waitrose', name: 'Waitrose', available: false },
  { id: 'union_coop', name: 'Union Coop', available: false },
  { id: 'al_maya', name: 'Al Maya', available: false },
  { id: 'grandiose', name: 'Grandiose', available: false },
  { id: 'west_zone', name: 'West Zone', available: false },
  { id: 'viva', name: 'Viva Supermarket', available: false },
  { id: 'nesto', name: 'Nesto', available: false },
  { id: 'geant', name: 'Géant', available: false },
  { id: 'kibsons', name: 'Kibsons (Online)', available: false },
];

export interface KitchenAppliance {
  id: string;
  name: string;
  icon: string;
}

export const KITCHEN_APPLIANCES: KitchenAppliance[] = [
  { id: 'stove', name: 'Stove/Hob', icon: 'stove' },
  { id: 'oven', name: 'Oven', icon: 'toaster-oven' },
  { id: 'microwave', name: 'Microwave', icon: 'microwave' },
  { id: 'air_fryer', name: 'Air Fryer', icon: 'fan' },
  { id: 'blender', name: 'Blender/Mixer', icon: 'blender' },
  { id: 'grinder', name: 'Grinder', icon: 'food-variant' },
  { id: 'toaster', name: 'Toaster', icon: 'toaster' },
  { id: 'rice_cooker', name: 'Rice Cooker', icon: 'rice' },
  { id: 'slow_cooker', name: 'Slow Cooker', icon: 'pot-steam-outline' },
  { id: 'pressure_cooker', name: 'Pressure Cooker', icon: 'pot' },
  { id: 'grill', name: 'Grill/BBQ', icon: 'grill-outline' },
  { id: 'food_processor', name: 'Food Processor', icon: 'food-processor' },
  { id: 'kettle', name: 'Electric Kettle', icon: 'kettle-outline' },
  { id: 'sandwich_maker', name: 'Sandwich Maker', icon: 'bread-slice-outline' },
  { id: 'waffle_maker', name: 'Waffle Iron', icon: 'waffle' },
  { id: 'deep_fryer', name: 'Deep Fryer', icon: 'french-fries' },
  { id: 'hand_mixer', name: 'Hand Mixer', icon: 'mixer' },
  { id: 'induction', name: 'Induction Cooktop', icon: 'lightning-bolt' },
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
  supermarket: string;
  appliances: string[];
  setSupermarket: (id: string) => Promise<void>;
  setAppliances: (ids: string[]) => Promise<void>;
  toggleAppliance: (id: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  themeMode: 'dark',
  selectedModel: 'gemini-3.8-flash',
  currency: '$',
  supermarket: 'carrefour',
  appliances: ['stove', 'microwave'],
  isLoaded: false,

  loadSettings: async () => {
    try {
      const [themeMode, selectedModel, currency, supermarket, appliances] = await Promise.all([
        AsyncStorage.getItem('theme_mode'),
        AsyncStorage.getItem('selected_model'),
        AsyncStorage.getItem('currency'),
        AsyncStorage.getItem('supermarket'),
        AsyncStorage.getItem('appliances'),
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
        supermarket: supermarket || 'carrefour',
        appliances: (() => { try { return appliances ? JSON.parse(appliances) : ['stove', 'microwave']; } catch { return ['stove', 'microwave']; } })(),
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

  setSupermarket: async (id) => {
    await AsyncStorage.setItem('supermarket', id);
    set({ supermarket: id });
  },

  setAppliances: async (ids) => {
    await AsyncStorage.setItem('appliances', JSON.stringify(ids));
    set({ appliances: ids });
  },

  toggleAppliance: async (id) => {
    const current = useSettingsStore.getState().appliances;
    const updated = current.includes(id)
      ? current.filter(a => a !== id)
      : [...current, id];
    await AsyncStorage.setItem('appliances', JSON.stringify(updated));
    set({ appliances: updated });
  },
}));
