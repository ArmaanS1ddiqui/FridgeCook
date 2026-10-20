import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { getDatabase } from '../database/schema';
import { Alert } from 'react-native';

export async function exportBackup(): Promise<void> {
  try {
    const db = await getDatabase();

    const inventory = await db.getAllAsync('SELECT * FROM inventory_items');
    const cookingHistory = await db.getAllAsync('SELECT * FROM cooking_history');
    const cookingHistoryItems = await db.getAllAsync('SELECT * FROM cooking_history_items');
    const savedRecipes = await db.getAllAsync('SELECT * FROM saved_recipes');
    const tasteProfile = await db.getAllAsync('SELECT * FROM taste_profile');
    const shoppingList = await db.getAllAsync('SELECT * FROM shopping_list');

    const backup = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      data: {
        inventory_items: inventory,
        cooking_history: cookingHistory,
        cooking_history_items: cookingHistoryItems,
        saved_recipes: savedRecipes,
        taste_profile: tasteProfile,
        shopping_list: shoppingList,
      },
    };

    const json = JSON.stringify(backup, null, 2);
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
    const backup = JSON.parse(content);

    if (!backup.data) {
      Alert.alert('Invalid Backup', 'This file is not a valid FridgeCook backup');
      return false;
    }

    const db = await getDatabase();

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
        'INSERT INTO inventory_items (id, name, quantity, unit, category, price_per_unit, total_price, expiry_date, added_date, updated_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [item.id, item.name, item.quantity, item.unit, item.category, item.price_per_unit, item.total_price, item.expiry_date, item.added_date, item.updated_date, item.notes]
      );
    }

    // Restore cooking history
    for (const item of (backup.data.cooking_history || [])) {
      await db.runAsync(
        'INSERT INTO cooking_history (id, dish_name, cook_date, cook_type, total_cost, servings, rating_taste, rating_effort, rating_would_make_again, rating_spice_level, notes, recipe_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [item.id, item.dish_name, item.cook_date, item.cook_type, item.total_cost, item.servings, item.rating_taste, item.rating_effort, item.rating_would_make_again, item.rating_spice_level, item.notes, item.recipe_id]
      );
    }

    // Restore cooking history items
    for (const item of (backup.data.cooking_history_items || [])) {
      await db.runAsync(
        'INSERT INTO cooking_history_items (id, cooking_history_id, inventory_item_name, quantity_used, unit, cost) VALUES (?, ?, ?, ?, ?, ?)',
        [item.id, item.cooking_history_id, item.inventory_item_name, item.quantity_used, item.unit, item.cost]
      );
    }

    // Restore saved recipes
    for (const item of (backup.data.saved_recipes || [])) {
      await db.runAsync(
        'INSERT INTO saved_recipes (id, name, description, difficulty, prep_time_minutes, cook_time_minutes, servings, ingredients, steps, cuisine, tags, source, created_date, is_favorite) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [item.id, item.name, item.description, item.difficulty, item.prep_time_minutes, item.cook_time_minutes, item.servings, item.ingredients, item.steps, item.cuisine, item.tags, item.source, item.created_date, item.is_favorite]
      );
    }

    // Restore taste profile
    for (const item of (backup.data.taste_profile || [])) {
      await db.runAsync(
        'INSERT INTO taste_profile (id, cuisine_preferences, protein_preferences, spice_tolerance, complexity_preference, flavor_profiles, dietary_restrictions, allergies, total_meals_cooked, updated_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [item.id, item.cuisine_preferences, item.protein_preferences, item.spice_tolerance, item.complexity_preference, item.flavor_profiles, item.dietary_restrictions, item.allergies, item.total_meals_cooked, item.updated_date]
      );
    }

    // Restore shopping list
    for (const item of (backup.data.shopping_list || [])) {
      await db.runAsync(
        'INSERT INTO shopping_list (id, name, quantity, unit, category, estimated_price, is_purchased, added_date, source, recipe_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [item.id, item.name, item.quantity, item.unit, item.category, item.estimated_price, item.is_purchased, item.added_date, item.source, item.recipe_id]
      );
    }

    return true;
  } catch (error: any) {
    Alert.alert('Import Failed', error.message || 'Failed to import backup');
    return false;
  }
}
