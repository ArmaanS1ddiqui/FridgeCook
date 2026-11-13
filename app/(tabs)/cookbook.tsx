import { useCallback, useMemo, useState } from 'react';
import { View, FlatList, StyleSheet, Alert } from 'react-native';
import { Text, IconButton, Searchbar, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useRecipeStore, SavedRecipe } from '../../src/stores/recipeStore';
import { useInventoryStore } from '../../src/stores/inventoryStore';
import { planConsumption } from '../../src/utils/matching';
import { expiryStatus } from '../../src/utils/expiry';
import { ChoiceChips, EmptyState, PressableScale } from '../../src/components/ui';

type Filter = 'all' | 'favorites' | 'ready';

export default function CookbookScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { recipes, loadRecipes, toggleFavorite, deleteRecipe } = useRecipeStore();
  const inventory = useInventoryStore(s => s.items);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useFocusEffect(useCallback(() => {
    loadRecipes();
    useInventoryStore.getState().loadItems();
  }, []));

  // How many ingredients of each recipe are missing from the fridge right now.
  const missingCount = useMemo(() => {
    const usable = inventory.filter(i => expiryStatus(i.expiry_date) !== 'expired');
    const result: Record<string, { missing: number; total: number }> = {};
    for (const recipe of recipes) {
      let ingredients: any[] = [];
      try { ingredients = JSON.parse(recipe.ingredients); } catch {}
      if (!Array.isArray(ingredients)) ingredients = [];
      const plan = planConsumption(
        ingredients.filter(i => i && typeof i.name === 'string').map(i => ({ name: i.name, quantity: Number(i.quantity) || 0, unit: String(i.unit || 'pcs') })),
        usable,
      );
      result[recipe.id] = {
        missing: plan.filter(l => l.status === 'missing' || l.status === 'short').length,
        total: plan.length,
      };
    }
    return result;
  }, [recipes, inventory]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return recipes
      .filter(r => !query || r.name.toLowerCase().includes(query) || (r.cuisine || '').toLowerCase().includes(query))
      .filter(r => filter === 'all' || (filter === 'favorites' ? !!r.is_favorite : missingCount[r.id]?.total > 0 && missingCount[r.id]?.missing === 0))
      .sort((a, b) => (b.is_favorite ? 1 : 0) - (a.is_favorite ? 1 : 0));
  }, [recipes, search, filter, missingCount]);

  const confirmDelete = (recipe: SavedRecipe) => {
    Alert.alert('Delete recipe', `Remove “${recipe.name}” from your cookbook?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRecipe(recipe.id) },
    ]);
  };

  const renderItem = ({ item }: { item: SavedRecipe }) => {
    const stock = missingCount[item.id];
    const ready = stock && stock.total > 0 && stock.missing === 0;
    return (
      <PressableScale
        onPress={() => router.push(`/recipe-detail?id=${item.id}`)}
        onLongPress={() => confirmDelete(item)}
        scaleTo={0.98}
        style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700' }} numberOfLines={2}>{item.name}</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
              {[item.cuisine, `${item.prep_time_minutes + item.cook_time_minutes} min`, `${item.servings} serving${item.servings === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <IconButton
            icon={item.is_favorite ? 'heart' : 'heart-outline'}
            iconColor={item.is_favorite ? theme.colors.error : theme.colors.onSurfaceVariant}
            size={22}
            style={{ margin: 0 }}
            onPress={() => toggleFavorite(item.id)}
            accessibilityLabel={item.is_favorite ? 'Remove from favourites' : 'Add to favourites'}
          />
        </View>
        {item.description ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6, lineHeight: 18 }} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
        {stock && stock.total > 0 ? (
          <View style={[styles.stockPill, { backgroundColor: ready ? theme.colors.primaryContainer : theme.colors.surfaceVariant }]}>
            <MaterialCommunityIcons
              name={ready ? 'check-circle' : 'cart-outline'}
              size={14}
              color={ready ? theme.colors.primary : theme.colors.onSurfaceVariant}
            />
            <Text style={{ fontSize: 12, fontWeight: '700', marginLeft: 5, color: ready ? theme.colors.primary : theme.colors.onSurfaceVariant }}>
              {ready ? 'You have everything' : `Missing ${stock.missing} of ${stock.total} ingredients`}
            </Text>
          </View>
        ) : null}
      </PressableScale>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={visible}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        ListHeaderComponent={recipes.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            <Searchbar
              placeholder="Search recipes"
              value={search}
              onChangeText={setSearch}
              elevation={0}
              style={[styles.searchbar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}
              inputStyle={{ fontSize: 15, minHeight: 0 }}
            />
            <ChoiceChips<Filter>
              options={[
                { value: 'all', label: `All ${recipes.length}` },
                { value: 'ready', label: 'Can cook now' },
                { value: 'favorites', label: 'Favourites' },
              ]}
              value={filter}
              onChange={setFilter}
            />
          </View>
        ) : undefined}
        ListEmptyComponent={
          recipes.length === 0 ? (
            <EmptyState
              icon="book-open-variant"
              title="Your cookbook is empty"
              subtitle="Recipes you cook with the AI are saved here so you can make them again."
              actionLabel="Find something to cook"
              onAction={() => router.push('/ai-cook?mode=inventory')}
            />
          ) : (
            <EmptyState
              icon="magnify"
              title="No recipes here"
              subtitle={filter === 'ready' ? "Nothing can be made from what's in the fridge right now." : 'Try a different search or filter.'}
              actionLabel="Show all"
              onAction={() => { setSearch(''); setFilter('all'); }}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, paddingBottom: 40 },
  searchbar: { borderWidth: 1, borderRadius: 14, height: 48, marginBottom: 10 },
  card: { borderRadius: 20, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  stockPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 10 },
});
