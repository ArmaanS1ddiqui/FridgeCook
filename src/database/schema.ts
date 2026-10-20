import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// On native, we use expo-sqlite. On web, we use an AsyncStorage-backed shim.
// This keeps the same interface for all stores.

export interface Database {
  getAllAsync<T>(sql: string, params?: any[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: any[]): Promise<T | null>;
  runAsync(sql: string, params?: any[]): Promise<void>;
  execAsync(sql: string): Promise<void>;
}

// ─── Web: AsyncStorage-backed JSON store ───────────────────────────────

type TableData = Record<string, any[]>; // tableName -> rows

class WebDatabase implements Database {
  private data: TableData = {};
  private loaded = false;

  private async load() {
    if (this.loaded) return;
    const raw = await AsyncStorage.getItem('fridgeapp_db');
    this.data = raw ? JSON.parse(raw) : {};
    this.loaded = true;
  }

  private async save() {
    await AsyncStorage.setItem('fridgeapp_db', JSON.stringify(this.data));
  }

  private ensureTable(name: string) {
    if (!this.data[name]) this.data[name] = [];
  }

  async execAsync(_sql: string): Promise<void> {
    await this.load();
    // Tables are created lazily on first access
    const tables = [
      'inventory_items', 'cooking_history', 'cooking_history_items',
      'saved_recipes', 'taste_profile', 'shopping_list',
    ];
    for (const t of tables) this.ensureTable(t);
    await this.save();
  }

  async getAllAsync<T>(sql: string, params?: any[]): Promise<T[]> {
    await this.load();
    const { table, where, orderBy } = this.parseSql(sql, params);
    let rows = [...(this.data[table] || [])];
    if (where) rows = rows.filter(where);
    if (orderBy) rows.sort(orderBy);
    return rows as T[];
  }

  async getFirstAsync<T>(sql: string, params?: any[]): Promise<T | null> {
    const rows = await this.getAllAsync<T>(sql, params);
    return rows[0] || null;
  }

  async runAsync(sql: string, params?: any[]): Promise<void> {
    await this.load();
    const sqlLower = sql.trim().toLowerCase();

    if (sqlLower.startsWith('insert')) {
      const table = this.extractTable(sql, 'insert');
      this.ensureTable(table);
      const columns = this.extractColumns(sql);
      const row: Record<string, any> = {};
      columns.forEach((col, i) => {
        row[col] = params?.[i] ?? null;
      });
      this.data[table].push(row);
    } else if (sqlLower.startsWith('update')) {
      const table = this.extractTable(sql, 'update');
      this.ensureTable(table);
      const { setClauses, whereValue } = this.parseUpdate(sql, params);
      this.data[table] = this.data[table].map(row => {
        if (whereValue && row.id === whereValue) {
          return { ...row, ...setClauses };
        }
        return row;
      });
    } else if (sqlLower.startsWith('delete')) {
      const table = this.extractTable(sql, 'delete');
      this.ensureTable(table);
      if (params && params.length > 0) {
        const whereCol = this.extractWhereColumn(sql);
        this.data[table] = this.data[table].filter(row => row[whereCol] !== params[0]);
      } else if (sql.toLowerCase().includes('where is_purchased=1')) {
        this.data[table] = this.data[table].filter(row => !row.is_purchased);
      } else if (!sqlLower.includes('where')) {
        // Bare DELETE without WHERE — clear entire table
        this.data[table] = [];
      }
    }

    await this.save();
  }

  private parseSql(sql: string, params?: any[]) {
    const sqlLower = sql.toLowerCase();
    let table = '';

    const fromMatch = sqlLower.match(/from\s+(\w+)/);
    if (fromMatch) table = fromMatch[1];

    let where: ((row: any) => boolean) | null = null;
    if (sqlLower.includes('where') && params && params.length > 0) {
      const whereCol = this.extractWhereColumn(sql);
      const whereVal = params[0];
      where = (row: any) => row[whereCol] === whereVal;
    }

    let orderBy: ((a: any, b: any) => number) | null = null;
    const orderMatch = sqlLower.match(/order\s+by\s+(\w+)\s*(asc|desc)?/);
    if (orderMatch) {
      const col = orderMatch[1];
      const desc = orderMatch[2] === 'desc';
      orderBy = (a: any, b: any) => {
        const va = a[col] ?? '';
        const vb = b[col] ?? '';
        if (va < vb) return desc ? 1 : -1;
        if (va > vb) return desc ? -1 : 1;
        return 0;
      };
    }

    return { table, where, orderBy };
  }

  private extractTable(sql: string, type: 'insert' | 'update' | 'delete'): string {
    const sqlLower = sql.toLowerCase();
    if (type === 'insert') {
      const m = sqlLower.match(/into\s+(\w+)/);
      return m ? m[1] : '';
    } else if (type === 'update') {
      const m = sqlLower.match(/update\s+(\w+)/);
      return m ? m[1] : '';
    } else {
      const m = sqlLower.match(/from\s+(\w+)/);
      return m ? m[1] : '';
    }
  }

  private extractColumns(sql: string): string[] {
    const match = sql.match(/\(([^)]+)\)\s*VALUES/i);
    if (!match) return [];
    return match[1].split(',').map(c => c.trim());
  }

  private extractWhereColumn(sql: string): string {
    const match = sql.toLowerCase().match(/where\s+(\w+)\s*=/);
    return match ? match[1] : 'id';
  }

  private parseUpdate(sql: string, params?: any[]): { setClauses: Record<string, any>; whereValue: any } {
    const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
    const setClauses: Record<string, any> = {};
    let whereValue: any = null;

    if (setMatch && params) {
      const parts = setMatch[1].split(',').map(s => s.trim());
      parts.forEach((part, i) => {
        const colMatch = part.match(/(\w+)\s*=/);
        if (colMatch && i < params.length - 1) {
          setClauses[colMatch[1]] = params[i];
        }
      });
      whereValue = params[params.length - 1];
    }

    return { setClauses, whereValue };
  }
}

// ─── Native: Real SQLite ───────────────────────────────────────────────

let db: Database | null = null;

export async function getDatabase(): Promise<Database> {
  if (db) return db;

  if (Platform.OS === 'web') {
    db = new WebDatabase();
    await db.execAsync('');
    return db;
  }

  // Dynamic import so web bundler never touches expo-sqlite
  const SQLite = await import('expo-sqlite');
  const nativeDb = await SQLite.openDatabaseAsync('fridgeapp.db');
  await nativeDb.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'pcs',
      category TEXT NOT NULL DEFAULT 'Other',
      price_per_unit REAL DEFAULT 0,
      total_price REAL DEFAULT 0,
      expiry_date TEXT,
      added_date TEXT NOT NULL,
      updated_date TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS cooking_history (
      id TEXT PRIMARY KEY,
      dish_name TEXT NOT NULL,
      cook_date TEXT NOT NULL,
      cook_type TEXT NOT NULL DEFAULT 'manual',
      total_cost REAL DEFAULT 0,
      servings INTEGER DEFAULT 1,
      rating_taste REAL DEFAULT 0,
      rating_effort REAL DEFAULT 0,
      rating_would_make_again REAL DEFAULT 0,
      rating_spice_level REAL DEFAULT 0,
      notes TEXT,
      recipe_id TEXT,
      FOREIGN KEY (recipe_id) REFERENCES saved_recipes(id)
    );

    CREATE TABLE IF NOT EXISTS cooking_history_items (
      id TEXT PRIMARY KEY,
      cooking_history_id TEXT NOT NULL,
      inventory_item_name TEXT NOT NULL,
      quantity_used REAL NOT NULL,
      unit TEXT NOT NULL,
      cost REAL DEFAULT 0,
      FOREIGN KEY (cooking_history_id) REFERENCES cooking_history(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS saved_recipes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      difficulty INTEGER DEFAULT 1,
      prep_time_minutes INTEGER DEFAULT 0,
      cook_time_minutes INTEGER DEFAULT 0,
      servings INTEGER DEFAULT 1,
      ingredients TEXT NOT NULL,
      steps TEXT NOT NULL,
      cuisine TEXT,
      tags TEXT,
      source TEXT DEFAULT 'ai',
      created_date TEXT NOT NULL,
      is_favorite INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS taste_profile (
      id TEXT PRIMARY KEY DEFAULT 'main',
      cuisine_preferences TEXT DEFAULT '{}',
      protein_preferences TEXT DEFAULT '{}',
      spice_tolerance REAL DEFAULT 5,
      complexity_preference REAL DEFAULT 5,
      flavor_profiles TEXT DEFAULT '{}',
      dietary_restrictions TEXT DEFAULT '[]',
      allergies TEXT DEFAULT '[]',
      total_meals_cooked INTEGER DEFAULT 0,
      updated_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shopping_list (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      quantity REAL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT 'pcs',
      category TEXT DEFAULT 'Other',
      estimated_price REAL DEFAULT 0,
      is_purchased INTEGER DEFAULT 0,
      added_date TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      recipe_id TEXT
    );
  `);

  // Wrap native db to match our interface
  db = {
    getAllAsync: <T>(sql: string, params?: any[]) => nativeDb.getAllAsync<T>(sql, params || []),
    getFirstAsync: <T>(sql: string, params?: any[]) => nativeDb.getFirstAsync<T>(sql, params || []),
    runAsync: async (sql: string, params?: any[]) => { await nativeDb.runAsync(sql, params || []); },
    execAsync: (sql: string) => nativeDb.execAsync(sql),
  };

  return db;
}
