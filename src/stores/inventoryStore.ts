import { create } from 'zustand';
import { getDatabase } from '../database/schema';
import { v4 as uuidv4 } from 'uuid';

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  price_per_unit: number;
  total_price: number;
  expiry_date: string | null;
  added_date: string;
  updated_date: string;
  notes: string | null;
}

interface InventoryState {
  items: InventoryItem[];
  isLoading: boolean;
  totalValue: number;
  loadItems: () => Promise<void>;
  addItem: (item: Omit<InventoryItem, 'id' | 'added_date' | 'updated_date'>) => Promise<void>;
  updateItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  mergeItems: (itemIds: string[], newName: string) => Promise<void>;
  consumeItem: (id: string, quantity: number) => Promise<void>;
  consumeItems: (consumptions: Array<{ id: string; quantity: number }>) => Promise<void>;
  addBulkItems: (items: Array<Omit<InventoryItem, 'id' | 'added_date' | 'updated_date'>>) => Promise<void>;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  items: [],
  isLoading: false,
  totalValue: 0,

  loadItems: async () => {
    set({ isLoading: true });
    const db = await getDatabase();
    const rows = await db.getAllAsync<InventoryItem>(
      'SELECT * FROM inventory_items ORDER BY name ASC'
    );
    const totalValue = rows.reduce((sum, item) => sum + (item.total_price || 0), 0);
    set({ items: rows, isLoading: false, totalValue });
  },

  addItem: async (item) => {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const id = uuidv4();
    const totalPrice = item.price_per_unit * item.quantity;
    await db.runAsync(
      `INSERT INTO inventory_items (id, name, quantity, unit, category, price_per_unit, total_price, expiry_date, added_date, updated_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, item.name, item.quantity, item.unit, item.category, item.price_per_unit, totalPrice, item.expiry_date || null, now, now, item.notes || null]
    );
    await get().loadItems();
  },

  updateItem: async (id, updates) => {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const item = get().items.find(i => i.id === id);
    if (!item) return;

    const updated = { ...item, ...updates, updated_date: now };
    if (updates.quantity !== undefined || updates.price_per_unit !== undefined) {
      updated.total_price = (updates.price_per_unit ?? item.price_per_unit) * (updates.quantity ?? item.quantity);
    }

    await db.runAsync(
      `UPDATE inventory_items SET name=?, quantity=?, unit=?, category=?, price_per_unit=?, total_price=?, expiry_date=?, updated_date=?, notes=? WHERE id=?`,
      [updated.name, updated.quantity, updated.unit, updated.category, updated.price_per_unit, updated.total_price, updated.expiry_date, updated.updated_date, updated.notes, id]
    );
    await get().loadItems();
  },

  deleteItem: async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM inventory_items WHERE id=?', [id]);
    await get().loadItems();
  },

  mergeItems: async (itemIds, newName) => {
    const db = await getDatabase();
    const items = get().items.filter(i => itemIds.includes(i.id));
    if (items.length < 2) return;

    // Convert all to the same unit (use first item's unit as base)
    const baseUnit = items[0].unit;
    let totalQuantity = 0;
    let totalPrice = 0;

    for (const item of items) {
      const converted = convertUnit(item.quantity, item.unit, baseUnit);
      totalQuantity += converted;
      totalPrice += item.total_price;
    }

    const pricePerUnit = totalQuantity > 0 ? totalPrice / totalQuantity : 0;
    const now = new Date().toISOString();
    const id = uuidv4();

    // Find earliest expiry
    const expiries = items.map(i => i.expiry_date).filter(Boolean) as string[];
    const earliestExpiry = expiries.length > 0 ? expiries.sort()[0] : null;

    await db.runAsync(
      `INSERT INTO inventory_items (id, name, quantity, unit, category, price_per_unit, total_price, expiry_date, added_date, updated_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, newName, totalQuantity, baseUnit, items[0].category, pricePerUnit, totalPrice, earliestExpiry, now, now, `Merged from: ${items.map(i => `${i.name} (${i.quantity}${i.unit})`).join(', ')}`]
    );

    // Delete old items
    for (const item of items) {
      await db.runAsync('DELETE FROM inventory_items WHERE id=?', [item.id]);
    }

    await get().loadItems();
  },

  consumeItem: async (id, quantity) => {
    const db = await getDatabase();
    const item = get().items.find(i => i.id === id);
    if (!item) return;

    const newQuantity = item.quantity - quantity;
    if (newQuantity <= 0) {
      await db.runAsync('DELETE FROM inventory_items WHERE id=?', [id]);
    } else {
      const newTotalPrice = item.price_per_unit * newQuantity;
      await db.runAsync(
        'UPDATE inventory_items SET quantity=?, total_price=?, updated_date=? WHERE id=?',
        [newQuantity, newTotalPrice, new Date().toISOString(), id]
      );
    }
    await get().loadItems();
  },

  consumeItems: async (consumptions) => {
    const db = await getDatabase();
    const items = get().items;
    for (const { id, quantity } of consumptions) {
      const item = items.find(i => i.id === id);
      if (!item) continue;
      const newQuantity = item.quantity - quantity;
      if (newQuantity <= 0) {
        await db.runAsync('DELETE FROM inventory_items WHERE id=?', [id]);
      } else {
        const newTotalPrice = item.price_per_unit * newQuantity;
        await db.runAsync(
          'UPDATE inventory_items SET quantity=?, total_price=?, updated_date=? WHERE id=?',
          [newQuantity, newTotalPrice, new Date().toISOString(), id]
        );
      }
    }
    await get().loadItems();
  },

  addBulkItems: async (items) => {
    const db = await getDatabase();
    const now = new Date().toISOString();
    for (const item of items) {
      const id = uuidv4();
      const totalPrice = item.price_per_unit * item.quantity;
      await db.runAsync(
        `INSERT INTO inventory_items (id, name, quantity, unit, category, price_per_unit, total_price, expiry_date, added_date, updated_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, item.name, item.quantity, item.unit, item.category, item.price_per_unit, totalPrice, item.expiry_date || null, now, now, item.notes || null]
      );
    }
    await get().loadItems();
  },
}));

// Unit conversion helper
function convertUnit(value: number, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return value;

  const toGrams: Record<string, number> = {
    g: 1, kg: 1000, mg: 0.001, oz: 28.3495, lb: 453.592, lbs: 453.592,
  };
  const toMl: Record<string, number> = {
    ml: 1, l: 1000, L: 1000, cup: 236.588, tbsp: 14.787, tsp: 4.929, fl_oz: 29.5735,
  };

  // Weight conversions
  if (toGrams[fromUnit] && toGrams[toUnit]) {
    return (value * toGrams[fromUnit]) / toGrams[toUnit];
  }
  // Volume conversions
  if (toMl[fromUnit] && toMl[toUnit]) {
    return (value * toMl[fromUnit]) / toMl[toUnit];
  }

  // Can't convert between different types, return as-is
  return value;
}
