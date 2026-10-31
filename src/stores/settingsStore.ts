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
  { id: 'lulu', name: 'Lulu Hypermarket', available: true },
  { id: 'spinneys', name: 'Spinneys', available: true },
  { id: 'choithrams', name: 'Choithrams', available: true },
  { id: 'waitrose', name: 'Waitrose', available: true },
  { id: 'union_coop', name: 'Union Coop', available: true },
  { id: 'al_maya', name: 'Al Maya', available: true },
  { id: 'grandiose', name: 'Grandiose', available: true },
  { id: 'west_zone', name: 'West Zone', available: true },
  { id: 'viva', name: 'Viva Supermarket', available: true },
  { id: 'nesto', name: 'Nesto', available: true },
  { id: 'geant', name: 'Géant', available: true },
  { id: 'kibsons', name: 'Kibsons (Online)', available: true },
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

export interface UserHealthProfile {
  weight: number; // kg
  height: number; // cm
  age: number;
  gender: 'male' | 'female';
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goalType: 'maintain' | 'lose' | 'gain' | 'high_protein';
}

export const ACTIVITY_LEVELS = [
  { id: 'sedentary', name: 'Sedentary', desc: 'Little to no exercise', multiplier: 1.2 },
  { id: 'light', name: 'Lightly Active', desc: '1-3 days/week', multiplier: 1.375 },
  { id: 'moderate', name: 'Moderately Active', desc: '3-5 days/week', multiplier: 1.55 },
  { id: 'active', name: 'Active', desc: '6-7 days/week', multiplier: 1.725 },
  { id: 'very_active', name: 'Very Active', desc: 'Intense daily exercise', multiplier: 1.9 },
];

export function calculateDailyNeeds(profile: UserHealthProfile) {
  // Mifflin-St Jeor equation
  let bmr: number;
  if (profile.gender === 'male') {
    bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5;
  } else {
    bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 161;
  }

  const activity = ACTIVITY_LEVELS.find(a => a.id === profile.activityLevel);
  const tdee = bmr * (activity?.multiplier || 1.2);

  let calories = tdee;
  if (profile.goalType === 'lose') calories = tdee - 500;
  if (profile.goalType === 'gain') calories = tdee + 500;

  // Protein: 0.8g/kg for sedentary, up to 2g/kg for high protein
  let proteinPerKg = 0.8;
  if (profile.activityLevel === 'light') proteinPerKg = 1.0;
  if (profile.activityLevel === 'moderate') proteinPerKg = 1.2;
  if (profile.activityLevel === 'active') proteinPerKg = 1.6;
  if (profile.activityLevel === 'very_active') proteinPerKg = 1.8;
  if (profile.goalType === 'high_protein') proteinPerKg = Math.max(proteinPerKg, 2.0);

  return {
    calories: Math.round(calories),
    protein: Math.round(profile.weight * proteinPerKg),
  };
}

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
  healthProfile: UserHealthProfile | null;
  setSupermarket: (id: string) => Promise<void>;
  setAppliances: (ids: string[]) => Promise<void>;
  toggleAppliance: (id: string) => Promise<void>;
  setHealthProfile: (profile: UserHealthProfile) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  themeMode: 'dark',
  selectedModel: 'gemini-3.8-flash',
  currency: '$',
  supermarket: 'carrefour',
  appliances: ['stove', 'microwave'],
  healthProfile: null,
  isLoaded: false,

  loadSettings: async () => {
    try {
      const [themeMode, selectedModel, currency, supermarket, appliances, healthProfile] = await Promise.all([
        AsyncStorage.getItem('theme_mode'),
        AsyncStorage.getItem('selected_model'),
        AsyncStorage.getItem('currency'),
        AsyncStorage.getItem('supermarket'),
        AsyncStorage.getItem('appliances'),
        AsyncStorage.getItem('health_profile'),
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
        healthProfile: (() => { try { return healthProfile ? JSON.parse(healthProfile) : null; } catch { return null; } })(),
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

  setHealthProfile: async (profile) => {
    await AsyncStorage.setItem('health_profile', JSON.stringify(profile));
    set({ healthProfile: profile });
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
