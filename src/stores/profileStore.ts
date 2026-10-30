import { create } from 'zustand';
import { getDatabase } from '../database/schema';

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  try { return json ? JSON.parse(json) : fallback; } catch { return fallback; }
}

export interface TasteProfile {
  id: string;
  cuisine_preferences: Record<string, number>; // e.g. { "Italian": 8.5, "Chinese": 7.2 }
  protein_preferences: Record<string, number>; // e.g. { "Chicken": 9, "Beef": 7 }
  spice_tolerance: number; // 1-10
  complexity_preference: number; // 1-10
  flavor_profiles: Record<string, number>; // { "sweet": 6, "savory": 8, "umami": 9, "sour": 4, "bitter": 3 }
  dietary_restrictions: string[];
  allergies: string[];
  total_meals_cooked: number;
  updated_date: string;
}

interface ProfileState {
  profile: TasteProfile | null;
  isLoading: boolean;
  loadProfile: () => Promise<void>;
  updateProfile: (updates: Partial<TasteProfile>) => Promise<void>;
  recalculateFromHistory: () => Promise<void>;
}

const DEFAULT_PROFILE: Omit<TasteProfile, 'id' | 'updated_date'> = {
  cuisine_preferences: {},
  protein_preferences: {},
  spice_tolerance: 5,
  complexity_preference: 5,
  flavor_profiles: { sweet: 5, savory: 5, umami: 5, sour: 5, bitter: 5 },
  dietary_restrictions: [],
  allergies: [],
  total_meals_cooked: 0,
};

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  isLoading: false,

  loadProfile: async () => {
    set({ isLoading: true });
    const db = await getDatabase();
    const row = await db.getFirstAsync<any>('SELECT * FROM taste_profile WHERE id=?', ['main']);

    if (row) {
      const profile: TasteProfile = {
        id: row.id,
        cuisine_preferences: safeParse(row.cuisine_preferences, {}),
        protein_preferences: safeParse(row.protein_preferences, {}),
        spice_tolerance: row.spice_tolerance,
        complexity_preference: row.complexity_preference,
        flavor_profiles: safeParse(row.flavor_profiles, { sweet: 5, savory: 5, umami: 5, sour: 5, bitter: 5 }),
        dietary_restrictions: safeParse(row.dietary_restrictions, []),
        allergies: safeParse(row.allergies, []),
        total_meals_cooked: row.total_meals_cooked,
        updated_date: row.updated_date,
      };
      set({ profile, isLoading: false });
    } else {
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO taste_profile (id, cuisine_preferences, protein_preferences, spice_tolerance, complexity_preference, flavor_profiles, dietary_restrictions, allergies, total_meals_cooked, updated_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['main', '{}', '{}', 5, 5, JSON.stringify(DEFAULT_PROFILE.flavor_profiles), '[]', '[]', 0, now]
      );
      set({
        profile: { id: 'main', ...DEFAULT_PROFILE, updated_date: now },
        isLoading: false,
      });
    }
  },

  updateProfile: async (updates) => {
    const db = await getDatabase();
    const current = get().profile;
    if (!current) return;

    const now = new Date().toISOString();
    const merged = { ...current, ...updates, updated_date: now };

    await db.runAsync(
      `UPDATE taste_profile SET cuisine_preferences=?, protein_preferences=?, spice_tolerance=?, complexity_preference=?, flavor_profiles=?, dietary_restrictions=?, allergies=?, total_meals_cooked=?, updated_date=? WHERE id=?`,
      [
        JSON.stringify(merged.cuisine_preferences),
        JSON.stringify(merged.protein_preferences),
        merged.spice_tolerance,
        merged.complexity_preference,
        JSON.stringify(merged.flavor_profiles),
        JSON.stringify(merged.dietary_restrictions),
        JSON.stringify(merged.allergies),
        merged.total_meals_cooked,
        now,
        'main',
      ]
    );
    set({ profile: merged });
  },

  recalculateFromHistory: async () => {
    const db = await getDatabase();
    const history = await db.getAllAsync<any>(
      'SELECT * FROM cooking_history ORDER BY cook_date DESC LIMIT 50'
    );

    const countResult = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM cooking_history');
    const totalCount = countResult?.count || history.length;

    if (history.length === 0) return;

    const current = get().profile;
    if (!current) return;

    // Weighted averages (recent meals weigh more via exponential decay)
    let totalSpice = 0;
    let totalEffort = 0;
    let totalTaste = 0;
    let totalAgain = 0;
    let weightSum = 0;

    history.forEach((meal: any, index: number) => {
      const weight = Math.pow(0.95, index); // Exponential decay — recent meals matter more
      totalSpice += (meal.rating_spice_level || 0) * weight;
      totalEffort += (meal.rating_effort || 0) * weight;
      totalTaste += (meal.rating_taste || 0) * weight;
      totalAgain += (meal.rating_would_make_again || 0) * weight;
      weightSum += weight;
    });

    const avgSpice = weightSum > 0 ? totalSpice / weightSum : 5;
    const avgEffort = weightSum > 0 ? totalEffort / weightSum : 5;

    // Build protein preferences from ingredients
    const proteinScores: Record<string, { totalTaste: number; totalAgain: number; count: number }> = {};
    // Build cuisine preferences from linked recipes
    const cuisineScores: Record<string, { totalTaste: number; totalAgain: number; count: number }> = {};
    // Flavor profile signals
    const flavorSignals = { sweet: 0, savory: 0, umami: 0, sour: 0, bitter: 0 };
    let flavorCount = 0;

    const proteins = ['chicken', 'beef', 'pork', 'fish', 'shrimp', 'lamb', 'tofu', 'egg', 'turkey', 'salmon', 'tuna', 'mutton', 'prawn', 'duck', 'goat', 'veal', 'crab', 'lobster'];
    // Ingredient → flavor mapping for profile building
    const flavorMap: Record<string, keyof typeof flavorSignals> = {
      sugar: 'sweet', honey: 'sweet', chocolate: 'sweet', maple: 'sweet', fruit: 'sweet', banana: 'sweet', mango: 'sweet',
      soy: 'umami', mushroom: 'umami', parmesan: 'umami', tomato: 'umami', miso: 'umami', anchovy: 'umami',
      lemon: 'sour', lime: 'sour', vinegar: 'sour', yogurt: 'sour', tamarind: 'sour',
      coffee: 'bitter', cocoa: 'bitter', kale: 'bitter', arugula: 'bitter',
      salt: 'savory', butter: 'savory', cheese: 'savory', bacon: 'savory', garlic: 'savory', onion: 'savory',
    };

    for (const meal of history) {
      const taste = meal.rating_taste || 0;
      const again = meal.rating_would_make_again || 0;

      // Get ingredients
      const ingredients = await db.getAllAsync<any>(
        'SELECT * FROM cooking_history_items WHERE cooking_history_id=?',
        [meal.id]
      );

      for (const ing of ingredients) {
        const name = ing.inventory_item_name.toLowerCase();

        // Detect proteins
        for (const protein of proteins) {
          if (name.includes(protein)) {
            if (!proteinScores[protein]) proteinScores[protein] = { totalTaste: 0, totalAgain: 0, count: 0 };
            proteinScores[protein].totalTaste += taste;
            proteinScores[protein].totalAgain += again;
            proteinScores[protein].count += 1;
          }
        }

        // Detect flavor signals
        for (const [keyword, flavor] of Object.entries(flavorMap)) {
          if (name.includes(keyword)) {
            flavorSignals[flavor] += taste; // Weight by how much they liked the dish
            flavorCount += 1;
          }
        }
      }

      // Get cuisine from linked recipe
      if (meal.recipe_id) {
        const recipe = await db.getFirstAsync<any>(
          'SELECT cuisine FROM saved_recipes WHERE id=?',
          [meal.recipe_id]
        );
        if (recipe?.cuisine) {
          const cuisine = recipe.cuisine;
          if (!cuisineScores[cuisine]) cuisineScores[cuisine] = { totalTaste: 0, totalAgain: 0, count: 0 };
          cuisineScores[cuisine].totalTaste += taste;
          cuisineScores[cuisine].totalAgain += again;
          cuisineScores[cuisine].count += 1;
        }
      }
    }

    // Compute protein preferences (weighted score: 60% taste + 40% would-make-again)
    const proteinPrefs: Record<string, number> = {};
    for (const [protein, scores] of Object.entries(proteinScores)) {
      const avgT = scores.totalTaste / scores.count;
      const avgA = scores.totalAgain / scores.count;
      proteinPrefs[protein] = Math.round((avgT * 0.6 + avgA * 0.4) * 10) / 10;
    }

    // Compute cuisine preferences
    const cuisinePrefs: Record<string, number> = {};
    for (const [cuisine, scores] of Object.entries(cuisineScores)) {
      const avgT = scores.totalTaste / scores.count;
      const avgA = scores.totalAgain / scores.count;
      cuisinePrefs[cuisine] = Math.round((avgT * 0.6 + avgA * 0.4) * 10) / 10;
    }

    // Normalize flavor profiles to 1-10 scale
    const flavorProfiles: Record<string, number> = { ...current.flavor_profiles };
    if (flavorCount > 0) {
      const maxSignal = Math.max(...Object.values(flavorSignals), 1);
      for (const [flavor, signal] of Object.entries(flavorSignals)) {
        if (signal > 0) {
          // Blend existing preference with new signal (70% new, 30% existing)
          const normalized = Math.round(((signal / maxSignal) * 10) * 10) / 10;
          const existing = flavorProfiles[flavor] || 5;
          flavorProfiles[flavor] = Math.round((normalized * 0.7 + existing * 0.3) * 10) / 10;
        }
      }
    }

    await get().updateProfile({
      spice_tolerance: Math.round(avgSpice * 10) / 10,
      complexity_preference: Math.round(avgEffort * 10) / 10,
      protein_preferences: { ...current.protein_preferences, ...proteinPrefs },
      cuisine_preferences: { ...current.cuisine_preferences, ...cuisinePrefs },
      flavor_profiles: flavorProfiles,
      total_meals_cooked: totalCount,
    });
  },
}));
