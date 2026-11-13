import { useInventoryStore } from '../stores/inventoryStore';
import { useShoppingStore } from '../stores/shoppingStore';
import { useRecipeStore } from '../stores/recipeStore';
import { useCookingStore } from '../stores/cookingStore';
import { useProfileStore } from '../stores/profileStore';
import { useSettingsStore } from '../stores/settingsStore';

/** Re-read everything from storage, e.g. after a backup was restored. */
export async function reloadAllStores(): Promise<void> {
  await Promise.all([
    useSettingsStore.getState().loadSettings(),
    useInventoryStore.getState().loadItems(),
    useShoppingStore.getState().loadItems(),
    useRecipeStore.getState().loadRecipes(),
    useCookingStore.getState().loadHistory(),
    useProfileStore.getState().loadProfile(),
  ]);
}
