import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { getDatabase } from '../database/schema';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// App preferences saved alongside the data. The Gemini API key is deliberately
// left out: a backup file gets shared around and should not carry a secret.
const SETTINGS_KEYS = ['theme_mode', 'selected_model', 'currency', 'supermarket', 'appliances', 'health_profile'];

/** Everything in the app as a backup document. Shared by manual export and automatic backups. */
export async function buildBackup(): Promise<{ json: string; fingerprint: string; rowCount: number }> {
  const db = await getDatabase();

  const inventory = await db.getAllAsync('SELECT * FROM inventory_items');
  const cookingHistory = await db.getAllAsync('SELECT * FROM cooking_history');
  const cookingHistoryItems = await db.getAllAsync('SELECT * FROM cooking_history_items');
  const savedRecipes = await db.getAllAsync('SELECT * FROM saved_recipes');
  const tasteProfile = await db.getAllAsync('SELECT * FROM taste_profile');
  const shoppingList = await db.getAllAsync('SELECT * FROM shopping_list');

  const settings: Record<string, string> = {};
  for (const [key, value] of await AsyncStorage.multiGet(SETTINGS_KEYS)) {
    if (value !== null) settings[key] = value;
  }

  const data = {
    inventory_items: inventory,
    cooking_history: cookingHistory,
    cooking_history_items: cookingHistoryItems,
    saved_recipes: savedRecipes,
    taste_profile: tasteProfile,
    shopping_list: shoppingList,
  };

  // Format notes: `data` has had the same tables and columns since v1.0, so files
  // move freely between app versions. `settings` was added in 1.1 and is optional;
  // older versions of the app ignore it.
  const backup = {
    version: '1.1.0',
    settings,
    exportDate: new Date().toISOString(),
    data,
  };

  // Cheap content fingerprint (ignores the export date) so unchanged data isn't rewritten.
  const content = JSON.stringify({ settings, data });
  let hash = 0;
  for (let i = 0; i < content.length; i++) hash = (hash * 31 + content.charCodeAt(i)) | 0;

  return {
    json: JSON.stringify(backup, null, 2),
    fingerprint: `${content.length}:${hash}`,
    rowCount: inventory.length + cookingHistory.length + savedRecipes.length + shoppingList.length,
  };
}

export async function exportBackup(): Promise<void> {
  try {
    const { json } = await buildBackup();
    const fileName = `fridgecook-backup-${new Date().toISOString().split('T')[0]}.json`;
    const filePath = `${FileSystem.documentDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, json);

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(filePath, {
        mimeType: 'application/json',
        dialogTitle: 'Export FridgeCook Backup',
      });
    } else {
      Alert.alert('Exported', `Backup saved to ${filePath}`);
    }
  } catch (error: any) {
    Alert.alert('Export Failed', error.message || 'Failed to export backup');
  }
}

export async function importBackup(): Promise<boolean> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
    });

    if (result.canceled || !result.assets?.[0]) return false;

    const fileUri = result.assets[0].uri;
    const content = await FileSystem.readAsStringAsync(fileUri);
    return await restoreBackupContent(content);
  } catch (error: any) {
    Alert.alert('Import Failed', error.message || 'Failed to import backup');
    return false;
  }
}

/** Replace all app data with the contents of a backup file. Shows an alert and returns false if it can't. */
export async function restoreBackupContent(content: string): Promise<boolean> {
  try {
    const backup = JSON.parse(content);

    if (!backup.data || typeof backup.data !== 'object') {
      Alert.alert('Invalid Backup', 'This file is not a valid FridgeCook backup');
      return false;
    }
    // Validate expected tables exist
    const expectedTables = ['inventory_items', 'cooking_history', 'saved_recipes'];
    const hasData = expectedTables.some(t => Array.isArray(backup.data[t]) && backup.data[t].length > 0);
    if (!hasData) {
      Alert.alert('Empty Backup', 'This backup file contains no data to restore');
      return false;
    }

    const db = await getDatabase();

    // One transaction: if anything fails, the existing data is left untouched.
    await db.execAsync('BEGIN');
    try {
    // Clear existing data
    await db.runAsync('DELETE FROM cooking_history_items');
    await db.runAsync('DELETE FROM cooking_history');
    await db.runAsync('DELETE FROM inventory_items');
    await db.runAsync('DELETE FROM saved_recipes');
    await db.runAsync('DELETE FROM shopping_list');
    await db.runAsync('DELETE FROM taste_profile');

    // Restore inventory
    for (const item of (backup.data.inventory_items || [])) {
      await db.runAsync(
        'INSERT INTO inventory_items (id, name, quantity, unit, category, price_per_unit, total_price, expiry_date, added_date, updated_date, notes, is_frozen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [item.id ?? null, item.name ?? null, item.quantity ?? null, item.unit ?? null, item.category ?? null, item.price_per_unit ?? null, item.total_price ?? null, item.expiry_date ?? null, item.added_date ?? null, item.updated_date ?? null, item.notes ?? null, item.is_frozen ? 1 : 0]
      );
    }

    // Restore saved recipes first: cooking history rows reference them
    for (const item of (backup.data.saved_recipes || [])) {
      await db.runAsync(
        'INSERT INTO saved_recipes (id, name, description, difficulty, prep_time_minutes, cook_time_minutes, servings, ingredients, steps, cuisine, tags, source, created_date, is_favorite) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [item.id ?? null, item.name ?? null, item.description ?? null, item.difficulty ?? null, item.prep_time_minutes ?? null, item.cook_time_minutes ?? null, item.servings ?? null, item.ingredients ?? null, item.steps ?? null, item.cuisine ?? null, item.tags ?? null, item.source ?? null, item.created_date ?? null, item.is_favorite ?? null]
      );
    }

    // Restore cooking history
    for (const item of (backup.data.cooking_history || [])) {
      await db.runAsync(
        'INSERT INTO cooking_history (id, dish_name, cook_date, cook_type, total_cost, servings, rating_taste, rating_effort, rating_would_make_again, rating_spice_level, notes, recipe_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [item.id ?? null, item.dish_name ?? null, item.cook_date ?? null, item.cook_type ?? null, item.total_cost ?? null, item.servings ?? null, item.rating_taste ?? null, item.rating_effort ?? null, item.rating_would_make_again ?? null, item.rating_spice_level ?? null, item.notes ?? null, item.recipe_id ?? null]
      );
    }

    // Restore cooking history items
    for (const item of (backup.data.cooking_history_items || [])) {
      await db.runAsync(
        'INSERT INTO cooking_history_items (id, cooking_history_id, inventory_item_name, quantity_used, unit, cost) VALUES (?, ?, ?, ?, ?, ?)',
        [item.id ?? null, item.cooking_history_id ?? null, item.inventory_item_name ?? null, item.quantity_used ?? null, item.unit ?? null, item.cost ?? null]
      );
    }

    // Restore taste profile
    for (const item of (backup.data.taste_profile || [])) {
      await db.runAsync(
        'INSERT INTO taste_profile (id, cuisine_preferences, protein_preferences, spice_tolerance, complexity_preference, flavor_profiles, dietary_restrictions, allergies, total_meals_cooked, updated_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [item.id ?? null, item.cuisine_preferences ?? null, item.protein_preferences ?? null, item.spice_tolerance ?? null, item.complexity_preference ?? null, item.flavor_profiles ?? null, item.dietary_restrictions ?? null, item.allergies ?? null, item.total_meals_cooked ?? null, item.updated_date ?? null]
      );
    }

    // Restore shopping list
    for (const item of (backup.data.shopping_list || [])) {
      await db.runAsync(
        'INSERT INTO shopping_list (id, name, quantity, unit, category, estimated_price, is_purchased, added_date, source, recipe_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [item.id ?? null, item.name ?? null, item.quantity ?? null, item.unit ?? null, item.category ?? null, item.estimated_price ?? null, item.is_purchased ?? null, item.added_date ?? null, item.source ?? null, item.recipe_id ?? null]
      );
    }

      await db.execAsync('COMMIT');
    } catch (error) {
      try { await db.execAsync('ROLLBACK'); } catch { /* no open transaction */ }
      throw error;
    }

    // Preferences are optional (absent in backups made by older versions).
    if (backup.settings && typeof backup.settings === 'object') {
      const pairs = SETTINGS_KEYS
        .filter(key => typeof backup.settings[key] === 'string')
        .map(key => [key, backup.settings[key]] as [string, string]);
      if (pairs.length > 0) await AsyncStorage.multiSet(pairs);
    }

    return true;
  } catch (error: any) {
    Alert.alert('Import Failed', error.message || 'Failed to import backup');
    return false;
  }
}
