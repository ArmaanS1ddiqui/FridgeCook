import { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Alert, FlatList } from 'react-native';
import { Text, Card, Button, Chip, ActivityIndicator, IconButton, Divider, useTheme, Portal, Modal, TextInput } from 'react-native-paper';
import { useLocalSearchParams, Stack, useRouter, useFocusEffect } from 'expo-router';
import { useInventoryStore } from '../src/stores/inventoryStore';
import { useProfileStore } from '../src/stores/profileStore';
import { useRecipeStore } from '../src/stores/recipeStore';
import { useShoppingStore } from '../src/stores/shoppingStore';
import { useCookingStore } from '../src/stores/cookingStore';
import { getRecipeSuggestions, AIRecipeSuggestion } from '../src/services/aiService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { preflightCheck } from '../src/hooks/usePreflightCheck';
import { useSettingsStore, KITCHEN_APPLIANCES, DUBAI_SUPERMARKETS, calculateDailyNeeds } from '../src/stores/settingsStore';
import { daysUntil, expiryStatus } from '../src/utils/expiry';
import { planConsumption } from '../src/utils/matching';
import { formatAmount, formatQty } from '../src/utils/units';
import { ChoiceChips } from '../src/components/ui';

export default function AICookScreen() {
  const theme = useTheme();
  const { mode, useUp } = useLocalSearchParams<{ mode: 'inventory' | 'extras'; useUp?: string }>();
  const { items: inventory, loadItems, addBulkItems } = useInventoryStore();
  const { profile, loadProfile } = useProfileStore();
  const { saveRecipe } = useRecipeStore();
  const { addFromRecipe } = useShoppingStore();
  const { addCookingEntry } = useCookingStore();
  const { recalculateFromHistory } = useProfileStore();
  const router = useRouter();
  const { currency, appliances: userAppliances, supermarket: userSupermarket, healthProfile } = useSettingsStore();

  const [difficulty, setDifficulty] = useState(5);
  const [servings, setServings] = useState(2);
  const [suggestions, setSuggestions] = useState<AIRecipeSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<AIRecipeSuggestion | null>(null);
  const [boughtItems, setBoughtItems] = useState<Record<string, boolean>>({});
  const [buyModalVisible, setBuyModalVisible] = useState(false);
  const [buyingIngredient, setBuyingIngredient] = useState<AIRecipeSuggestion['ingredients'][0] | null>(null);
  const [buyQuantity, setBuyQuantity] = useState('');
  const [isCooking, setIsCooking] = useState(false);

  const allowExtras = mode === 'extras';
  const useUpMode = useUp === '1';
  const title = useUpMode ? 'Use It Up' : allowExtras ? 'AI Cook + Extras' : 'AI Cook';
  // Never cook with food that is past its date.
  const usable = inventory.filter(i => expiryStatus(i.expiry_date) !== 'expired');
  const expiringSoon = usable.filter(i => expiryStatus(i.expiry_date) === 'soon');

  useFocusEffect(useCallback(() => {
    loadItems();
    loadProfile();
  }, []));

  const fetchSuggestions = async () => {
    const ready = await preflightCheck();
    if (!ready) return;

    if (usable.length === 0) {
      Alert.alert('Nothing to cook with', inventory.length === 0 ? 'Add some items to your fridge first.' : 'Everything in your fridge is past its expiry date.');
      return;
    }

    setIsLoading(true);
    setSuggestions([]);
    setSelectedRecipe(null);

    try {
      const dailyNeeds = healthProfile ? calculateDailyNeeds(healthProfile) : null;

      const results = await getRecipeSuggestions({
        inventory: usable.map(i => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          category: i.category,
          price_per_unit: i.price_per_unit,
          daysLeft: daysUntil(i.expiry_date),
          frozen: !!i.is_frozen,
        })),
        focusItems: useUpMode ? expiringSoon.map(i => i.name) : undefined,
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
        appliances: userAppliances.map(id => KITCHEN_APPLIANCES.find(a => a.id === id)?.name || id),
        supermarket: DUBAI_SUPERMARKETS.find(s => s.id === userSupermarket)?.name || userSupermarket,
        currency,
        dailyCalories: dailyNeeds?.calories,
        dailyProtein: dailyNeeds?.protein,
        goalType: healthProfile?.goalType,
      });
      setSuggestions(results);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to get suggestions. Check your API key in Settings.');
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

    // Put everything that was bought into the fridge; cooking then deducts what
    // the recipe uses, so leftovers stay behind and nothing is counted twice.
    await addBulkItems([{
      name: buyingIngredient.name,
      quantity: boughtQty,
      unit: buyingIngredient.unit,
      category: 'Other',
      price_per_unit: 0,
      total_price: 0,
      expiry_date: null,
      notes: 'Bought for a recipe',
    }]);

    setBoughtItems(prev => ({ ...prev, [buyingIngredient.name]: true }));
    setBuyModalVisible(false);
    setBuyingIngredient(null);
  };

  const handleCookRecipe = async (skipMissingCheck = false) => {
    if (isCooking) return;
    if (!selectedRecipe) return;

    // Warn about items that are neither in the fridge nor marked as bought,
    // but let the user carry on (they may have it, or be happy to skip it).
    const unbought = selectedRecipe.ingredients.filter(i => !i.available && !boughtItems[i.name]);
    if (unbought.length > 0 && !skipMissingCheck) {
      Alert.alert(
        'Missing ingredients',
        `You don't have enough of: ${unbought.map(i => i.name).join(', ')}.`,
        [
          { text: 'Go back', style: 'cancel' },
          { text: 'Cook anyway', onPress: () => handleCookRecipe(true) },
        ],
      );
      return;
    }
    setIsCooking(true);
    try {
      // Save the recipe first: if this fails, nothing has been taken from the fridge yet.
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

      // Work out what comes out of the fridge, converting each recipe amount
      // into the unit the item is stored in (200 g of a 1 kg pack = 0.2 kg).
      const fresh = useInventoryStore.getState().items.filter(i => expiryStatus(i.expiry_date) !== 'expired');
      const plan = planConsumption(selectedRecipe.ingredients, fresh);
      const costData: Record<string, number> = {};
      let totalRecipeCost = 0;
      for (const line of plan) {
        costData[line.ingredient.name] = line.cost;
        totalRecipeCost += line.cost;
      }

      const consumptions = plan
        .filter(line => line.item && line.deduct > 0)
        .map(line => ({ id: line.item!.id, quantity: line.deduct }));
      if (consumptions.length > 0) {
        const { consumeItems } = useInventoryStore.getState();
        await consumeItems(consumptions);
      }

      const notDeducted = plan.filter(line => line.status === 'unit_mismatch');
      if (notDeducted.length > 0) {
        Alert.alert(
          'Check these amounts',
          `Couldn't work out how much to deduct for: ${notDeducted.map(l => `${l.ingredient.name} (recipe uses ${formatAmount(l.ingredient.quantity, l.ingredient.unit)}, fridge has ${formatAmount(l.item!.quantity, l.item!.unit)})`).join('; ')}. Update them in your fridge after cooking.`,
        );
      }

      // Navigate to recipe detail for step-by-step
      router.replace(`/recipe-detail?id=${recipeId}&cooking=true&costData=${encodeURIComponent(JSON.stringify(costData))}&totalCost=${Math.round(totalRecipeCost * 100) / 100}&cookType=${allowExtras ? 'ai_extras' : 'ai_inventory'}`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to cook');
    } finally {
      setIsCooking(false);
    }
  };

  const addUnavailableToShoppingList = async () => {
    if (!selectedRecipe) return;
    const unavailable = selectedRecipe.ingredients.filter(i => !i.available && !boughtItems[i.name]);
    if (unavailable.length === 0) return;

    await addFromRecipe(unavailable.map(i => {
      const missing = i.quantity - i.inInventory;
      return { name: i.name, quantity: missing > 0 ? Math.round(missing * 100) / 100 : i.quantity, unit: i.unit };
    }));
    Alert.alert('Added', `${unavailable.length} item${unavailable.length === 1 ? '' : 's'} added to your shopping list`);
  };

  return (
    <>
      <Stack.Screen options={{
        headerShown: true,
        title,
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.onSurface,
        headerShadowVisible: false,
      }} />
      <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!selectedRecipe ? (
          <>
            {useUpMode && expiringSoon.length > 0 ? (
              <View style={[styles.useUpBanner, { backgroundColor: theme.colors.secondaryContainer }]}>
                <MaterialCommunityIcons name="timer-sand" size={20} color={theme.colors.secondary} />
                <Text variant="bodyMedium" style={{ flex: 1, marginLeft: 10, color: theme.colors.onSecondaryContainer, lineHeight: 20 }}>
                  Recipes will use up: <Text style={{ fontWeight: '700', color: theme.colors.onSecondaryContainer }}>{expiringSoon.map(i => i.name).join(', ')}</Text>
                </Text>
              </View>
            ) : null}

            {/* Difficulty */}
            <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="contained">
              <Card.Content>
                <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>How much effort?</Text>
                <ChoiceChips
                  options={[
                    { value: 2, label: 'Quick & easy' },
                    { value: 5, label: 'Some skill' },
                    { value: 8, label: 'Go all out' },
                  ]}
                  value={difficulty <= 3 ? 2 : difficulty <= 6 ? 5 : 8}
                  onChange={setDifficulty}
                />
              </Card.Content>
            </Card>

            {/* Servings */}
            <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="contained">
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
            <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="contained">
              <Card.Content>
                <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                  Cooking from {usable.length} item{usable.length === 1 ? '' : 's'}
                </Text>
                <View style={styles.chipRow}>
                  {usable.slice(0, 10).map(item => (
                    <Chip key={item.id} compact style={[styles.invChip, { backgroundColor: theme.colors.surfaceVariant }]}>
                      {item.name} ({formatAmount(item.quantity, item.unit)})
                    </Chip>
                  ))}
                  {usable.length > 10 && (
                    <Chip compact style={[styles.invChip, { backgroundColor: theme.colors.surfaceVariant }]}>+{usable.length - 10} more</Chip>
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
              contentStyle={{ paddingVertical: 8 }}
              labelStyle={{ fontSize: 16, fontWeight: '700' }}
              icon="creation"
            >
              {isLoading ? 'Finding recipes…' : suggestions.length > 0 ? 'Suggest different recipes' : 'Suggest recipes'}
            </Button>

            {/* Results */}
            {suggestions.map((recipe, index) => (
              <Card
                key={index}
                style={[styles.recipeCard, { backgroundColor: theme.colors.surface }]}
                mode="contained"
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
                    <Chip compact icon="cash">{currency}{recipe.estimated_cost.toFixed(2)}</Chip>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    <Chip compact icon="fire">{recipe.servings ? Math.round(recipe.calories / recipe.servings) : recipe.calories} cal/serving</Chip>
                    <Chip compact icon="arm-flex">{recipe.servings ? Math.round(recipe.protein_grams / recipe.servings) : recipe.protein_grams}g protein/serving</Chip>
                  </View>
                  {(recipe.calories_percent || recipe.protein_percent) && (
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, fontStyle: 'italic' }}>
                      Per serving: {recipe.calories_percent}% daily calories • {recipe.protein_percent}% daily protein
                    </Text>
                  )}
                  {!healthProfile && (recipe.calories_percent || recipe.protein_percent) && (
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}>
                      Based on general 2000 cal diet
                    </Text>
                  )}
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

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              <Chip compact icon="fire">{selectedRecipe.servings ? Math.round(selectedRecipe.calories / selectedRecipe.servings) : selectedRecipe.calories} cal/serving</Chip>
              <Chip compact icon="arm-flex">{selectedRecipe.servings ? Math.round(selectedRecipe.protein_grams / selectedRecipe.servings) : selectedRecipe.protein_grams}g protein/serving</Chip>
            </View>
            {(selectedRecipe.calories_percent || selectedRecipe.protein_percent) && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12, fontStyle: 'italic' }}>
                Per serving: {selectedRecipe.calories_percent}% daily calories • {selectedRecipe.protein_percent}% daily protein
              </Text>
            )}
            {!healthProfile && (selectedRecipe.calories_percent || selectedRecipe.protein_percent) && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}>
                Based on general 2000 cal diet
              </Text>
            )}

            <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="contained">
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
                      {ing.name} — {formatQty(ing.quantity)} {ing.unit}
                      {!ing.available && ing.inInventory > 0 ? ` (have ${formatQty(ing.inInventory)})` : ''}
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
              onPress={() => handleCookRecipe()}
              style={styles.cookButton}
              contentStyle={{ paddingVertical: 8 }}
              labelStyle={{ fontSize: 16, fontWeight: '700' }}
              icon="pot-steam"
              disabled={isCooking}
              loading={isCooking}
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
            onChangeText={v => setBuyQuantity(v.replace(',', '.').replace(/[^\d.]/g, ''))}
            keyboardType="decimal-pad"
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
  card: { marginBottom: 12, borderRadius: 20 },
  useUpBanner: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, marginBottom: 12 },
  sectionTitle: { fontWeight: '700', marginBottom: 12 },
  sliderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  diffChip: { minWidth: 40 },
  hint: { marginTop: 8, fontStyle: 'italic' },
  servingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  invChip: {},
  suggestButton: { marginVertical: 12, borderRadius: 16 },
  recipeCard: { marginBottom: 12, borderRadius: 20 },
  recipeHeader: { flexDirection: 'row', alignItems: 'center' },
  matchBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  matchText: { fontWeight: '700', fontSize: 13 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  missingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, padding: 8, borderRadius: 8 },
  recipeTitleLarge: { fontWeight: '700', marginBottom: 4 },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8, borderBottomWidth: 1 },
  ingredientText: { marginLeft: 4 },
  cookButton: { marginTop: 16, borderRadius: 16 },
});
