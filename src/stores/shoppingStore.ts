import { create } from 'zustand';
import { getDatabase } from '../database/schema';
import { v4 as uuidv4 } from 'uuid';

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  estimated_price: number;
  is_purchased: number;
  added_date: string;
  source: 'manual' | 'ai_recipe' | 'low_stock';
  recipe_id: string | null;
}

interface ShoppingState {
  items: ShoppingItem[];
  isLoading: boolean;
  loadItems: () => Promise<void>;
  addItem: (item: Omit<ShoppingItem, 'id' | 'added_date' | 'is_purchased'>) => Promise<void>;
  togglePurchased: (id: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  clearPurchased: () => Promise<void>;
  addFromRecipe: (ingredients: Array<{ name: string; quantity: number; unit: string; category?: string; estimated_price?: number }>, recipeId?: string) => Promise<void>;
}

export const useShoppingStore = create<ShoppingState>((set, get) => ({
  items: [],
  isLoading: false,

  loadItems: async () => {
    set({ isLoading: true });
    const db = await getDatabase();
    const rows = await db.getAllAsync<ShoppingItem>(
      'SELECT * FROM shopping_list ORDER BY is_purchased ASC, added_date DESC'
    );
    set({ items: rows, isLoading: false });
  },

  addItem: async (item) => {
    const db = await getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO shopping_list (id, name, quantity, unit, category, estimated_price, is_purchased, added_date, source, recipe_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, item.name, item.quantity, item.unit, item.category, item.estimated_price, 0, now, item.source, item.recipe_id]
    );
    await get().loadItems();
  },

  togglePurchased: async (id) => {
    const db = await getDatabase();
    const item = get().items.find(i => i.id === id);
    if (!item) return;
    await db.runAsync(
      'UPDATE shopping_list SET is_purchased=? WHERE id=?',
      [item.is_purchased ? 0 : 1, id]
    );
    await get().loadItems();
  },

  deleteItem: async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM shopping_list WHERE id=?', [id]);
    await get().loadItems();
  },

  clearPurchased: async () => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM shopping_list WHERE is_purchased=1');
    await get().loadItems();
  },

  addFromRecipe: async (ingredients, recipeId) => {
    const db = await getDatabase();
    const now = new Date().toISOString();
    for (const ing of ingredients) {
      const id = uuidv4();
      await db.runAsync(
        `INSERT INTO shopping_list (id, name, quantity, unit, category, estimated_price, is_purchased, added_date, source, recipe_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, ing.name, ing.quantity, ing.unit, ing.category || 'Other', ing.estimated_price || 0, 0, now, 'ai_recipe', recipeId || null]
      );
    }
    await get().loadItems();
  },
}));
