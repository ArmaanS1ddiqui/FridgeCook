import { create } from 'zustand';
import { getDatabase } from '../database/schema';
import { v4 as uuidv4 } from 'uuid';

export interface CookingHistoryItem {
  id: string;
  dish_name: string;
  cook_date: string;
  cook_type: 'manual' | 'ai_inventory' | 'ai_extras';
  total_cost: number;
  servings: number;
  rating_taste: number;
  rating_effort: number;
  rating_would_make_again: number;
  rating_spice_level: number;
  notes: string | null;
  recipe_id: string | null;
}

export interface CookingIngredient {
  id: string;
  cooking_history_id: string;
  inventory_item_name: string;
  quantity_used: number;
  unit: string;
  cost: number;
}

interface CookingState {
  history: CookingHistoryItem[];
  isLoading: boolean;
  loadHistory: () => Promise<void>;
  addCookingEntry: (
    entry: Omit<CookingHistoryItem, 'id' | 'cook_date'>,
    ingredients: Array<{ inventory_item_name: string; quantity_used: number; unit: string; cost: number }>
  ) => Promise<string>;
  getHistoryWithIngredients: (id: string) => Promise<{ entry: CookingHistoryItem; ingredients: CookingIngredient[] } | null>;
  deleteEntry: (id: string) => Promise<void>;
}

export const useCookingStore = create<CookingState>((set, get) => ({
  history: [],
  isLoading: false,

  loadHistory: async () => {
    set({ isLoading: true });
    const db = await getDatabase();
    const rows = await db.getAllAsync<CookingHistoryItem>(
      'SELECT * FROM cooking_history ORDER BY cook_date DESC'
    );
    set({ history: rows, isLoading: false });
  },

  addCookingEntry: async (entry, ingredients) => {
    const db = await getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO cooking_history (id, dish_name, cook_date, cook_type, total_cost, servings, rating_taste, rating_effort, rating_would_make_again, rating_spice_level, notes, recipe_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, entry.dish_name, now, entry.cook_type, entry.total_cost, entry.servings, entry.rating_taste, entry.rating_effort, entry.rating_would_make_again, entry.rating_spice_level, entry.notes, entry.recipe_id]
    );

    for (const ing of ingredients) {
      await db.runAsync(
        `INSERT INTO cooking_history_items (id, cooking_history_id, inventory_item_name, quantity_used, unit, cost)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, ing.inventory_item_name, ing.quantity_used, ing.unit, ing.cost]
      );
    }

    await get().loadHistory();
    return id;
  },

  getHistoryWithIngredients: async (id) => {
    const db = await getDatabase();
    const entry = await db.getFirstAsync<CookingHistoryItem>(
      'SELECT * FROM cooking_history WHERE id=?', [id]
    );
    if (!entry) return null;
    const ingredients = await db.getAllAsync<CookingIngredient>(
      'SELECT * FROM cooking_history_items WHERE cooking_history_id=?', [id]
    );
    return { entry, ingredients };
  },

  deleteEntry: async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM cooking_history_items WHERE cooking_history_id=?', [id]);
    await db.runAsync('DELETE FROM cooking_history WHERE id=?', [id]);
    await get().loadHistory();
  },
}));
