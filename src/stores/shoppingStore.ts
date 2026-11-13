import { create } from 'zustand';
import { getDatabase } from '../database/schema';
import * as Crypto from 'expo-crypto';
import { convertUnit } from '../utils/units';
import { normalizeName } from '../utils/matching';

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  estimated_price: number;
  is_purchased: number;
  added_date: string;
  source: 'manual' | 'ai_recipe' | 'low_stock' | 'monthly';
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
  addFromRecipe: (ingredients: Array<{ name: string; quantity: number; unit: string; category?: string; estimated_price?: number }>, recipeId?: string, source?: ShoppingItem['source']) => Promise<void>;
}

type NewShoppingItem = { name: string; quantity: number; unit: string; category: string; estimated_price: number; source: string; recipe_id: string | null };

// Insert items, bumping the quantity of an unpurchased entry with the same name
// instead of listing the same thing twice.
async function insertOrBump(newItems: NewShoppingItem[]) {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const open = (await db.getAllAsync<ShoppingItem>('SELECT * FROM shopping_list ORDER BY added_date DESC'))
    .filter(i => !i.is_purchased)
    .map(i => ({ ...i }));

  for (const item of newItems) {
    const quantity = item.quantity > 0 ? item.quantity : 1;
    const key = normalizeName(item.name);
    const existing = key ? open.find(o => normalizeName(o.name) === key) : undefined;
    const extra = existing ? convertUnit(quantity, item.unit, existing.unit) : null;
    if (existing && extra !== null) {
      const total = Math.round((existing.quantity + extra) * 1000) / 1000;
      await db.runAsync('UPDATE shopping_list SET quantity=? WHERE id=?', [total, existing.id]);
      existing.quantity = total;
    } else {
      const id = Crypto.randomUUID();
      await db.runAsync(
        `INSERT INTO shopping_list (id, name, quantity, unit, category, estimated_price, is_purchased, added_date, source, recipe_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, item.name, quantity, item.unit, item.category, item.estimated_price, 0, now, item.source, item.recipe_id]
      );
      open.push({ ...item, id, quantity, is_purchased: 0, added_date: now } as ShoppingItem);
    }
  }
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
    await insertOrBump([item]);
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

  addFromRecipe: async (ingredients, recipeId, source = 'ai_recipe') => {
    await insertOrBump(ingredients.map(ing => ({
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category || 'Other',
      estimated_price: ing.estimated_price || 0,
      source,
      recipe_id: recipeId || null,
    })));
    await get().loadItems();
  },
}));
