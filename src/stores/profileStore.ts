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

    // Calculate weighted averages (recent meals weigh more)
    let totalSpice = 0;
    let totalEffort = 0;
    let weightSum = 0;

    history.forEach((meal: any, index: number) => {
      const weight = Math.max(1, history.length - index); // More recent = higher weight
      totalSpice += meal.rating_spice_level * weight;
      totalEffort += meal.rating_effort * weight;
      weightSum += weight;
    });

    const avgSpice = weightSum > 0 ? totalSpice / weightSum : 5;
    const avgEffort = weightSum > 0 ? totalEffort / weightSum : 5;

    // Update cuisine preferences from history
    const cuisineScores: Record<string, { total: number; count: number }> = {};
    const proteinScores: Record<string, { total: number; count: number }> = {};

    for (const meal of history) {
      // Get ingredients for this meal
      const ingredients = await db.getAllAsync<any>(
        'SELECT * FROM cooking_history_items WHERE cooking_history_id=?',
        [meal.id]
      );

      for (const ing of ingredients) {
        const name = ing.inventory_item_name.toLowerCase();
        // Detect proteins
        const proteins = ['chicken', 'beef', 'pork', 'fish', 'shrimp', 'lamb', 'tofu', 'egg', 'turkey', 'salmon', 'tuna', 'mutton'];
        for (const protein of proteins) {
          if (name.includes(protein)) {
            if (!proteinScores[protein]) proteinScores[protein] = { total: 0, count: 0 };
            proteinScores[protein].total += meal.rating_taste;
            proteinScores[protein].count += 1;
          }
        }
      }
    }

    const proteinPrefs: Record<string, number> = {};
    for (const [protein, scores] of Object.entries(proteinScores)) {
      proteinPrefs[protein] = Math.round((scores.total / scores.count) * 10) / 10;
    }

    await get().updateProfile({
      spice_tolerance: Math.round(avgSpice * 10) / 10,
      complexity_preference: Math.round(avgEffort * 10) / 10,
      protein_preferences: { ...current.protein_preferences, ...proteinPrefs },
      total_meals_cooked: totalCount,
    });
  },
}));
