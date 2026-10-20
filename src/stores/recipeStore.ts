import { create } from 'zustand';
import { getDatabase } from '../database/schema';
import * as Crypto from 'expo-crypto';

export interface SavedRecipe {
  id: string;
  name: string;
  description: string | null;
  difficulty: number;
  prep_time_minutes: number;
  cook_time_minutes: number;
  servings: number;
  ingredients: string; // JSON string
  steps: string; // JSON string
  cuisine: string | null;
  tags: string | null; // JSON string
  source: 'ai' | 'manual';
  created_date: string;
  is_favorite: number;
}

export interface RecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
  available: boolean;
  inInventory: number;
}

export interface RecipeStep {
  step: number;
  instruction: string;
  duration_minutes?: number;
  needs_timer?: boolean;
}

interface RecipeState {
  recipes: SavedRecipe[];
  isLoading: boolean;
  loadRecipes: () => Promise<void>;
  saveRecipe: (recipe: Omit<SavedRecipe, 'id' | 'created_date'>) => Promise<string>;
  deleteRecipe: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
}

export const useRecipeStore = create<RecipeState>((set, get) => ({
  recipes: [],
  isLoading: false,

  loadRecipes: async () => {
    set({ isLoading: true });
    const db = await getDatabase();
    const rows = await db.getAllAsync<SavedRecipe>(
      'SELECT * FROM saved_recipes ORDER BY created_date DESC'
    );
    set({ recipes: rows, isLoading: false });
  },

  saveRecipe: async (recipe) => {
    const db = await getDatabase();
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO saved_recipes (id, name, description, difficulty, prep_time_minutes, cook_time_minutes, servings, ingredients, steps, cuisine, tags, source, created_date, is_favorite)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, recipe.name, recipe.description, recipe.difficulty, recipe.prep_time_minutes, recipe.cook_time_minutes, recipe.servings, recipe.ingredients, recipe.steps, recipe.cuisine, recipe.tags, recipe.source, now, recipe.is_favorite]
    );
    await get().loadRecipes();
    return id;
  },

  deleteRecipe: async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM saved_recipes WHERE id=?', [id]);
    await get().loadRecipes();
  },

  toggleFavorite: async (id) => {
    const db = await getDatabase();
    const recipe = get().recipes.find(r => r.id === id);
    if (!recipe) return;
    await db.runAsync(
      'UPDATE saved_recipes SET is_favorite=? WHERE id=?',
      [recipe.is_favorite ? 0 : 1, id]
    );
    await get().loadRecipes();
  },
}));
