import { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, FlatList } from 'react-native';
import { Text, Card, Button, Chip, ActivityIndicator, IconButton, Divider, useTheme, Portal, Modal, TextInput } from 'react-native-paper';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useInventoryStore } from '../src/stores/inventoryStore';
import { useProfileStore } from '../src/stores/profileStore';
import { useRecipeStore } from '../src/stores/recipeStore';
import { useShoppingStore } from '../src/stores/shoppingStore';
import { useCookingStore } from '../src/stores/cookingStore';
import { getRecipeSuggestions, AIRecipeSuggestion } from '../src/services/aiService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { preflightCheck } from '../src/hooks/usePreflightCheck';
import { useSettingsStore } from '../src/stores/settingsStore';

export default function AICookScreen() {
  const theme = useTheme();
  const { mode } = useLocalSearchParams<{ mode: 'inventory' | 'extras' }>();
  const { items: inventory, loadItems, consumeItem, addItem } = useInventoryStore();
  const { profile, loadProfile } = useProfileStore();
  const { saveRecipe } = useRecipeStore();
  const { addFromRecipe } = useShoppingStore();
  const { addCookingEntry } = useCookingStore();
  const { recalculateFromHistory } = useProfileStore();
  const router = useRouter();
  const { currency } = useSettingsStore();

  const [difficulty, setDifficulty] = useState(5);
  const [servings, setServings] = useState(2);
  const [suggestions, setSuggestions] = useState<AIRecipeSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<AIRecipeSuggestion | null>(null);
  const [boughtItems, setBoughtItems] = useState<Record<string, boolean>>({});
  const [buyModalVisible, setBuyModalVisible] = useState(false);
  const [buyingIngredient, setBuyingIngredient] = useState<AIRecipeSuggestion['ingredients'][0] | null>(null);
  const [buyQuantity, setBuyQuantity] = useState('');

  const allowExtras = mode === 'extras';
  const title = allowExtras ? 'AI Cook + Extras' : 'AI Cook';

  useEffect(() => {
    loadItems();
    loadProfile();
  }, []);

  const fetchSuggestions = async () => {
    const ready = await preflightCheck();
    if (!ready) return;

    if (inventory.length === 0) {
      Alert.alert('Empty Fridge', 'Add some items to your fridge first!');
      return;
    }

    setIsLoading(true);
    setSuggestions([]);
    setSelectedRecipe(null);

    try {
      const results = await getRecipeSuggestions({
        inventory: inventory.map(i => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          category: i.category,
        })),
        difficulty,
        allowExtras,
        tasteProfile: profile ? {
          cuisine_preferences: profile.cuisine_preferences,
          protein_preferences: profile.protein_preferences,
          spice_tolerance: profile.spice_tolerance,
          complexity_preference: profile.complexity_preference,
          dietary_restrictions: profile.dietary_restrictions,
          allergies: profile.allergies,
        } : undefined,
        servings,
      });
      setSuggestions(results);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to get suggestions. Check your API key in Profile.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectRecipe = (recipe: AIRecipeSuggestion) => {
    setSelectedRecipe(recipe);
    setBoughtItems({});
  };

  const handleBuyItem = (ingredient: AIRecipeSuggestion['ingredients'][0]) => {
    const needed = ingredient.quantity;
    const inStock = ingredient.inInventory;
    const toBuy = Math.max(0, needed - inStock);
    if (toBuy <= 0) return;

    setBuyingIngredient(ingredient);
    setBuyQuantity(toBuy.toString());
    setBuyModalVisible(true);
  };

  const confirmBuyItem = async () => {
    if (!buyingIngredient) return;
    const boughtQty = parseFloat(buyQuantity) || 0;
    if (boughtQty <= 0) {
      setBuyModalVisible(false);
      return;
    }

    const needed = buyingIngredient.quantity;
    const inStock = buyingIngredient.inInventory;
    const toBuy = Math.max(0, needed - inStock);
    const usedForRecipe = Math.min(boughtQty, toBuy);
    const excess = boughtQty - usedForRecipe;

    if (excess > 0) {
      await addItem({
        name: buyingIngredient.name,
        quantity: excess,
        unit: buyingIngredient.unit,
        category: 'Other',
        price_per_unit: 0,
        total_price: 0,
        expiry_date: null,
        notes: 'Excess from recipe purchase',
      });
    }

    setBoughtItems(prev => ({ ...prev, [buyingIngredient.name]: true }));
    setBuyModalVisible(false);
    setBuyingIngredient(null);
  };

  const handleCookRecipe = async () => {
    if (!selectedRecipe) return;

    // Check all unavailable items are bought
    const unbought = selectedRecipe.ingredients.filter(i => !i.available && !boughtItems[i.name]);
    if (unbought.length > 0) {
      Alert.alert('Missing Items', `You still need: ${unbought.map(i => i.name).join(', ')}`);
      return;
    }

    // Consume inventory items
    for (const ing of selectedRecipe.ingredients) {
      if (ing.available) {
        const inventoryItem = inventory.find(i => i.name.toLowerCase() === ing.name.toLowerCase());
        if (inventoryItem) {
          await consumeItem(inventoryItem.id, Math.min(ing.quantity, inventoryItem.quantity));
        }
      }
    }

    // Save recipe
    const recipeId = await saveRecipe({
      name: selectedRecipe.name,
      description: selectedRecipe.description,
      difficulty: selectedRecipe.difficulty,
      prep_time_minutes: selectedRecipe.prep_time_minutes,
      cook_time_minutes: selectedRecipe.cook_time_minutes,
      servings: selectedRecipe.servings,
      ingredients: JSON.stringify(selectedRecipe.ingredients),
      steps: JSON.stringify(selectedRecipe.steps),
      cuisine: selectedRecipe.cuisine,
      tags: null,
      source: 'ai',
      is_favorite: 0,
    });

    // Navigate to recipe detail for step-by-step
    router.replace(`/recipe-detail?id=${recipeId}&cooking=true`);
  };

  const addUnavailableToShoppingList = () => {
    if (!selectedRecipe) return;
    const unavailable = selectedRecipe.ingredients.filter(i => !i.available);
    if (unavailable.length === 0) return;

    addFromRecipe(unavailable.map(i => ({
      name: i.name,
      quantity: i.quantity - i.inInventory,
      unit: i.unit,
    })));
    Alert.alert('Added', `${unavailable.length} items added to shopping list`);
  };

  return (
    <>
      <Stack.Screen options={{
        headerShown: true,
        title,
        headerStyle: { backgroundColor: allowExtras ? theme.colors.tertiary : theme.colors.secondary },
        headerTintColor: allowExtras ? theme.colors.onTertiary : theme.colors.onSecondary,
      }} />
      <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.content}>
        {!selectedRecipe ? (
          <>
            {/* Difficulty Slider */}
            <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
              <Card.Content>
                <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Difficulty Level</Text>
                <View style={styles.sliderRow}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                    <Chip
                      key={i}
                      selected={difficulty === i}
                      onPress={() => setDifficulty(i)}
                      compact
                      style={[styles.diffChip, difficulty === i && { backgroundColor: theme.colors.primaryContainer }]}
                      textStyle={difficulty === i ? { color: theme.colors.primary, fontWeight: '700' } : undefined}
                    >
                      {i}
                    </Chip>
                  ))}
                </View>
                <Text variant="bodySmall" style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
                  {difficulty <= 3 ? 'Easy — Quick & simple recipes' :
                   difficulty <= 6 ? 'Medium — Some skill required' :
                   'Hard — Complex, time-intensive dishes'}
                </Text>
              </Card.Content>
            </Card>

            {/* Servings */}
            <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
              <Card.Content>
                <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Servings</Text>
                <View style={styles.servingsRow}>
                  <IconButton icon="minus" onPress={() => setServings(Math.max(1, servings - 1))} />
                  <Text variant="headlineMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>{servings}</Text>
                  <IconButton icon="plus" onPress={() => setServings(Math.min(20, servings + 1))} />
                </View>
              </Card.Content>
            </Card>

            {/* Inventory Summary */}
            <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
              <Card.Content>
                <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                  Your Inventory ({inventory.length} items)
                </Text>
                <View style={styles.chipRow}>
                  {inventory.slice(0, 10).map(item => (
                    <Chip key={item.id} compact style={[styles.invChip, { backgroundColor: theme.colors.surfaceVariant }]}>
                      {item.name} ({item.quantity}{item.unit})
                    </Chip>
                  ))}
                  {inventory.length > 10 && (
                    <Chip compact style={[styles.invChip, { backgroundColor: theme.colors.surfaceVariant }]}>+{inventory.length - 10} more</Chip>
                  )}
                </View>
              </Card.Content>
            </Card>

            <Button
              mode="contained"
              onPress={fetchSuggestions}
              loading={isLoading}
              disabled={isLoading}
              style={styles.suggestButton}
              icon="robot"
            >
              {isLoading ? 'Finding Recipes...' : 'Get AI Suggestions'}
            </Button>

            {/* Results */}
            {suggestions.map((recipe, index) => (
              <Card
                key={index}
                style={[styles.recipeCard, { backgroundColor: theme.colors.surface, borderLeftColor: theme.colors.primary }]}
                onPress={() => handleSelectRecipe(recipe)}
              >
                <Card.Content>
                  <View style={styles.recipeHeader}>
                    <View style={{ flex: 1 }}>
                      <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>{recipe.name}</Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{recipe.cuisine}</Text>
                    </View>
                    <View style={[styles.matchBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                      <Text style={[styles.matchText, { color: theme.colors.primary }]}>{recipe.match_score}%</Text>
                    </View>
                  </View>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginVertical: 8 }}>
                    {recipe.description}
                  </Text>
                  <View style={styles.metaRow}>
                    <Chip compact icon="clock-outline">{recipe.prep_time_minutes + recipe.cook_time_minutes} min</Chip>
                    <Chip compact icon="signal">Lvl {recipe.difficulty}</Chip>
                    <Chip compact icon="currency-usd">{currency}{recipe.estimated_cost.toFixed(2)}</Chip>
                  </View>
                  {recipe.ingredients.some(i => !i.available) && (
                    <View style={[styles.missingRow, { backgroundColor: theme.colors.tertiaryContainer }]}>
                      <MaterialCommunityIcons name="cart-plus" size={16} color={theme.colors.tertiary} />
                      <Text variant="bodySmall" style={{ color: theme.colors.tertiary, marginLeft: 4 }}>
                        Needs: {recipe.ingredients.filter(i => !i.available).map(i => i.name).join(', ')}
                      </Text>
                    </View>
                  )}
                </Card.Content>
              </Card>
            ))}
          </>
        ) : (
          <>
            {/* Selected Recipe Detail */}
            <Button mode="text" onPress={() => setSelectedRecipe(null)} icon="arrow-left" style={{ alignSelf: 'flex-start' }}>
              Back to suggestions
            </Button>

            <Text variant="headlineSmall" style={[styles.recipeTitleLarge, { color: theme.colors.onSurface }]}>{selectedRecipe.name}</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>{selectedRecipe.description}</Text>

            <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
              <Card.Content>
                <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Ingredients</Text>
                {selectedRecipe.ingredients.map((ing, i) => (
                  <View key={i} style={[styles.ingredientRow, { borderBottomColor: theme.colors.outlineVariant }]}>
                    <MaterialCommunityIcons
                      name={ing.available ? 'check-circle' : boughtItems[ing.name] ? 'check-circle' : 'alert-circle'}
                      size={20}
                      color={ing.available || boughtItems[ing.name] ? theme.colors.primary : theme.colors.tertiary}
                    />
                    <Text variant="bodyMedium" style={[styles.ingredientText, { flex: 1, color: theme.colors.onSurface }]}>
                      {ing.name} — {ing.quantity} {ing.unit}
                    </Text>
                    {!ing.available && !boughtItems[ing.name] && (
                      <Button mode="outlined" compact onPress={() => handleBuyItem(ing)}>
                        Bought
                      </Button>
                    )}
                    {boughtItems[ing.name] && (
                      <Chip compact style={{ backgroundColor: theme.colors.primaryContainer }}>Bought</Chip>
                    )}
                  </View>
                ))}

                {selectedRecipe.ingredients.some(i => !i.available) && (
                  <Button
                    mode="text"
                    icon="cart-plus"
                    onPress={addUnavailableToShoppingList}
                    style={{ marginTop: 8 }}
                  >
                    Add missing to Shopping List
                  </Button>
                )}
              </Card.Content>
            </Card>

            <Button
              mode="contained"
              onPress={handleCookRecipe}
              style={styles.cookButton}
              icon="pot-steam"
            >
              Start Cooking!
            </Button>
          </>
        )}
      </ScrollView>
      <Portal>
        <Modal
          visible={buyModalVisible}
          onDismiss={() => setBuyModalVisible(false)}
          contentContainerStyle={{
            backgroundColor: theme.colors.surface,
            margin: 20,
            padding: 24,
            borderRadius: 16,
          }}
        >
          <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface, marginBottom: 12 }}>
            Bought Quantity
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
            How many {buyingIngredient?.unit} of {buyingIngredient?.name} did you buy?
          </Text>
          <TextInput
            label="Quantity"
            value={buyQuantity}
            onChangeText={setBuyQuantity}
            keyboardType="numeric"
            mode="outlined"
            style={{ marginBottom: 16 }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
            <Button mode="outlined" onPress={() => setBuyModalVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={confirmBuyItem}>Confirm</Button>
          </View>
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  card: { marginBottom: 12, borderRadius: 16, elevation: 1 },
  sectionTitle: { fontWeight: '700', marginBottom: 12 },
  sliderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  diffChip: { minWidth: 40 },
  hint: { marginTop: 8, fontStyle: 'italic' },
  servingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  invChip: {},
  suggestButton: { marginVertical: 16, borderRadius: 12 },
  recipeCard: { marginBottom: 12, borderRadius: 16, borderLeftWidth: 4, elevation: 1 },
  recipeHeader: { flexDirection: 'row', alignItems: 'center' },
  matchBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  matchText: { fontWeight: '700', fontSize: 13 },
  metaRow: { flexDirection: 'row', gap: 6 },
  missingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, padding: 8, borderRadius: 8 },
  recipeTitleLarge: { fontWeight: '700', marginBottom: 4 },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8, borderBottomWidth: 1 },
  ingredientText: { marginLeft: 4 },
  cookButton: { marginTop: 16, borderRadius: 12 },
});
