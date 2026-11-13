import { create } from 'zustand';
import { getDatabase } from '../database/schema';
import * as Crypto from 'expo-crypto';
import { convertUnit } from '../utils/units';

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
  /** 1 when the item is in the freezer. Missing/0 = fridge or cupboard. */
  is_frozen?: number | null;
}

interface InventoryState {
  items: InventoryItem[];
  isLoading: boolean;
  totalValue: number;
  loadItems: () => Promise<void>;
  addItem: (item: Omit<InventoryItem, 'id' | 'added_date' | 'updated_date'>) => Promise<void>;
  updateItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  /**
   * Combine items into one. When the units can't be converted automatically (kg vs pcs),
   * `manual` must give the unit to keep and each such item's amount in that unit.
   */
  mergeItems: (itemIds: string[], newName: string, manual?: { unit: string; quantities: Record<string, number> }) => Promise<void>;
  consumeItem: (id: string, quantity: number) => Promise<void>;
  consumeItems: (consumptions: Array<{ id: string; quantity: number }>) => Promise<void>;
  addBulkItems: (items: Array<Omit<InventoryItem, 'id' | 'added_date' | 'updated_date'>>) => Promise<void>;
  deleteItems: (ids: string[]) => Promise<void>;
  setCategory: (ids: string[], category: string) => Promise<void>;
  restoreItems: (items: InventoryItem[]) => Promise<void>;
  /** Move an item into or out of the freezer and set its new use-by date. */
  setFrozen: (id: string, frozen: boolean, expiryDate: string | null) => Promise<void>;
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
    const id = Crypto.randomUUID();
    const totalPrice = item.total_price ?? (item.price_per_unit * item.quantity);
    await db.runAsync(
      `INSERT INTO inventory_items (id, name, quantity, unit, category, price_per_unit, total_price, expiry_date, added_date, updated_date, notes, is_frozen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, item.name, item.quantity, item.unit, item.category, item.price_per_unit, totalPrice, item.expiry_date || null, now, now, item.notes || null, item.is_frozen ? 1 : 0]
    );
    await get().loadItems();
  },

  updateItem: async (id, updates) => {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const item = get().items.find(i => i.id === id);
    if (!item) return;

    const updated = { ...item, ...updates, updated_date: now };
    if (updates.total_price !== undefined) {
      updated.total_price = updates.total_price;
    } else if (updates.quantity !== undefined || updates.price_per_unit !== undefined) {
      updated.total_price = (updates.price_per_unit ?? item.price_per_unit) * (updates.quantity ?? item.quantity);
    }

    await db.runAsync(
      `UPDATE inventory_items SET name=?, quantity=?, unit=?, category=?, price_per_unit=?, total_price=?, expiry_date=?, updated_date=?, notes=?, is_frozen=? WHERE id=?`,
      [updated.name, updated.quantity, updated.unit, updated.category, updated.price_per_unit, updated.total_price, updated.expiry_date, updated.updated_date, updated.notes, updated.is_frozen ? 1 : 0, id]
    );
    await get().loadItems();
  },

  deleteItem: async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM inventory_items WHERE id=?', [id]);
    await get().loadItems();
  },

  mergeItems: async (itemIds, newName, manual) => {
    const db = await getDatabase();
    const items = get().items.filter(i => itemIds.includes(i.id));
    if (items.length < 2) return;

    const baseUnit = manual?.unit || items[0].unit;
    let totalQuantity = 0;
    let totalPrice = 0;
    let usedManual = false;

    for (const item of items) {
      let converted = convertUnit(item.quantity, item.unit, baseUnit);
      if (converted === null) {
        // Never add kilograms to pieces: the caller has to say what the amount is.
        const given = manual?.quantities[item.id];
        if (!(typeof given === 'number' && given > 0)) {
          throw new Error(`Unit mismatch: ${item.name} is in ${item.unit}, which can't be converted to ${baseUnit}.`);
        }
        converted = given;
        usedManual = true;
      }
      totalQuantity += converted;
      totalPrice += item.total_price || 0;
    }
    totalQuantity = Math.round(totalQuantity * 1000) / 1000;
    const incompatible = usedManual;

    const pricePerUnit = totalQuantity > 0 ? totalPrice / totalQuantity : 0;
    const now = new Date().toISOString();
    const id = Crypto.randomUUID();

    // Find earliest expiry
    const expiries = items.map(i => i.expiry_date).filter(Boolean) as string[];
    const earliestExpiry = expiries.length > 0 ? expiries.sort()[0] : null;

    await db.runAsync(
      `INSERT INTO inventory_items (id, name, quantity, unit, category, price_per_unit, total_price, expiry_date, added_date, updated_date, notes, is_frozen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, newName, totalQuantity, baseUnit, items[0].category, pricePerUnit, totalPrice, earliestExpiry, now, now, `${incompatible ? 'Merged (units converted by hand) from: ' : 'Merged from: '}${items.map(i => `${i.name} (${i.quantity}${i.unit})`).join(', ')}`, items.every(i => i.is_frozen) ? 1 : 0]
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

    const newQuantity = Math.round((item.quantity - quantity) * 1000) / 1000;
    if (newQuantity <= 0) {
      await db.runAsync('DELETE FROM inventory_items WHERE id=?', [id]);
    } else {
      const newTotalPrice = (item.price_per_unit || 0) * newQuantity;
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
    // Add up amounts per item first: a recipe can list the same item twice.
    const totals = new Map<string, number>();
    for (const { id, quantity } of consumptions) {
      if (quantity > 0) totals.set(id, (totals.get(id) || 0) + quantity);
    }
    for (const [id, quantity] of totals) {
      const item = items.find(i => i.id === id);
      if (!item) continue;
      if (!(quantity > 0)) continue;
      const newQuantity = Math.round((item.quantity - quantity) * 1000) / 1000;
      if (newQuantity <= 0) {
        await db.runAsync('DELETE FROM inventory_items WHERE id=?', [id]);
      } else {
        const newTotalPrice = (item.price_per_unit || 0) * newQuantity;
        await db.runAsync(
          'UPDATE inventory_items SET quantity=?, total_price=?, updated_date=? WHERE id=?',
          [newQuantity, newTotalPrice, new Date().toISOString(), id]
        );
      }
    }
    await get().loadItems();
  },

  // Adds every item as its own row. Items are never merged into existing stock
  // automatically: duplicates are flagged in the fridge and merged by the user.
  addBulkItems: async (items) => {
    const db = await getDatabase();
    const now = new Date().toISOString();
    // All or nothing, so a retry after a failure can't add some items twice.
    await db.execAsync('BEGIN');
    try {
      for (const item of items) {
        const id = Crypto.randomUUID();
        const totalPrice = item.total_price ?? (item.price_per_unit * item.quantity);
        await db.runAsync(
          `INSERT INTO inventory_items (id, name, quantity, unit, category, price_per_unit, total_price, expiry_date, added_date, updated_date, notes, is_frozen)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, item.name, item.quantity, item.unit, item.category, item.price_per_unit, totalPrice, item.expiry_date || null, now, now, item.notes || null, item.is_frozen ? 1 : 0]
        );
      }
      await db.execAsync('COMMIT');
    } catch (error) {
      try { await db.execAsync('ROLLBACK'); } catch { /* no open transaction */ }
      await get().loadItems();
      throw error;
    }
    await get().loadItems();
  },

  deleteItems: async (ids) => {
    const db = await getDatabase();
    for (const id of ids) {
      await db.runAsync('DELETE FROM inventory_items WHERE id=?', [id]);
    }
    await get().loadItems();
  },

  setCategory: async (ids, category) => {
    const db = await getDatabase();
    const now = new Date().toISOString();
    for (const id of ids) {
      await db.runAsync('UPDATE inventory_items SET category=?, updated_date=? WHERE id=?', [category, now, id]);
    }
    await get().loadItems();
  },

  // Put back items exactly as they were (used by Undo).
  restoreItems: async (items) => {
    const db = await getDatabase();
    for (const item of items) {
      await db.runAsync('DELETE FROM inventory_items WHERE id=?', [item.id]);
      await db.runAsync(
        `INSERT INTO inventory_items (id, name, quantity, unit, category, price_per_unit, total_price, expiry_date, added_date, updated_date, notes, is_frozen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.id, item.name, item.quantity, item.unit, item.category, item.price_per_unit, item.total_price, item.expiry_date, item.added_date, item.updated_date, item.notes, item.is_frozen ? 1 : 0]
      );
    }
    await get().loadItems();
  },

  setFrozen: async (id, frozen, expiryDate) => {
    const db = await getDatabase();
    await db.runAsync(
      'UPDATE inventory_items SET is_frozen=?, expiry_date=?, updated_date=? WHERE id=?',
      [frozen ? 1 : 0, expiryDate, new Date().toISOString(), id]
    );
    await get().loadItems();
  },
}));
