import { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { Text, Card, Button, TextInput, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { useSettingsStore, DUBAI_SUPERMARKETS } from '../src/stores/settingsStore';
import { useInventoryStore } from '../src/stores/inventoryStore';
import { useCookingStore } from '../src/stores/cookingStore';
import { useProfileStore } from '../src/stores/profileStore';
import { useShoppingStore } from '../src/stores/shoppingStore';
import { generateMonthlyShoppingList } from '../src/services/aiService';
import { preflightCheck } from '../src/hooks/usePreflightCheck';

export default function MonthlyShoppingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { currency, supermarket, healthProfile } = useSettingsStore();
  const { items: inventory } = useInventoryStore();
  const { history } = useCookingStore();
  const { profile } = useProfileStore();
  const { addFromRecipe } = useShoppingStore();

  useFocusEffect(useCallback(() => {
    useInventoryStore.getState().loadItems();
    useCookingStore.getState().loadHistory();
    useProfileStore.getState().loadProfile();
  }, []));

  const [budget, setBudget] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedList, setGeneratedList] = useState<Array<{
    name: string; quantity: number; unit: string; category: string;
    estimated_price: number; reason: string; selected: boolean;
  }>>([]);

  const supermarketName = DUBAI_SUPERMARKETS.find(s => s.id === supermarket)?.name || supermarket;

  const handleGenerate = async () => {
    const ready = await preflightCheck();
    if (!ready) return;

    const b = parseFloat(budget);
    if (!b || b <= 0) {
      Alert.alert('Budget Required', 'Please enter your monthly budget');
      return;
    }

    setIsGenerating(true);
    setGeneratedList([]);

    try {
      // Build cooking frequency with actual ingredients from DB
      const { getHistoryWithIngredients } = useCookingStore.getState();
      const dishFrequency: Record<string, { count: number; ingredients: Set<string>; sampleId: string }> = {};

      // First pass: count frequencies (no DB calls)
      for (const meal of history) {
        if (!dishFrequency[meal.dish_name]) {
          dishFrequency[meal.dish_name] = { count: 0, ingredients: new Set(), sampleId: meal.id };
        }
        dishFrequency[meal.dish_name].count += 1;
      }

      // Only fetch ingredients for top 30 dishes (avoid N+1)
      const topDishes = Object.entries(dishFrequency)
        .sort(([, a], [, b]) => b.count - a.count)
        .slice(0, 30);

      for (const [, data] of topDishes) {
        try {
          const details = await getHistoryWithIngredients(data.sampleId);
          if (details?.ingredients) {
            for (const ing of details.ingredients) {
              data.ingredients.add(ing.inventory_item_name);
            }
          }
        } catch { /* skip failed fetch */ }
      }

      const cookingHistory = Object.entries(dishFrequency)
        .map(([name, data]) => ({
          dish_name: name,
          ingredients: Array.from(data.ingredients),
          frequency: data.count,
        }))
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 30); // Limit to top 30 dishes (FIX for prompt length)

      const items = await generateMonthlyShoppingList({
        cookingHistory,
        currentInventory: inventory.map(i => ({
          name: i.name, quantity: i.quantity, unit: i.unit, category: i.category,
        })),
        tasteProfile: profile ? {
          cuisine_preferences: profile.cuisine_preferences,
          protein_preferences: profile.protein_preferences,
          spice_tolerance: profile.spice_tolerance,
          dietary_restrictions: profile.dietary_restrictions,
          allergies: profile.allergies,
        } : undefined,
        budget: b,
        currency,
        supermarket: supermarketName,
        servingsPerDay: healthProfile ? 3 : 2,
      });

      setGeneratedList(items.map(i => ({ ...i, selected: true })));

      // Check if AI exceeded budget
      const aiTotal = items.reduce((sum: number, i: any) => sum + i.estimated_price * (i.quantity || 1), 0);
      if (aiTotal > b * 1.1) { // 10% tolerance
        Alert.alert('Over Budget', `The AI suggested ${currency}${aiTotal.toFixed(2)} which exceeds your ${currency}${b} budget. Deselect items to fit your budget.`);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to generate list');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleItem = (index: number) => {
    setGeneratedList(prev => prev.map((item, i) =>
      i === index ? { ...item, selected: !item.selected } : item
    ));
  };

  const totalCost = generatedList
    .filter(i => i.selected)
    .reduce((sum, i) => sum + i.estimated_price * i.quantity, 0);

  const handleAddToShoppingList = async () => {
    const selected = generatedList.filter(i => i.selected);
    if (selected.length === 0) {
      Alert.alert('No Items', 'Select at least one item');
      return;
    }

    await addFromRecipe(selected.map(i => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      category: i.category,
      estimated_price: i.estimated_price,
    })));

    Alert.alert('Added!', `${selected.length} items added to your shopping list`, [
      { text: 'View Shopping List', onPress: () => router.replace('/shopping-list') },
      { text: 'OK' },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Monthly Shopping List',
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Budget Input */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface, marginBottom: 8 }}>
              Monthly Budget
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
              AI will generate a shopping list based on what you regularly cook, your taste profile, and budget
            </Text>
            <TextInput
              label={`Budget (${currency})`}
              value={budget}
              onChangeText={setBudget}
              keyboardType="numeric"
              mode="outlined"
              style={{ marginBottom: 8 }}
              placeholder="e.g. 1500"
            />
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Shopping at: {supermarketName} • {history.length} past meals analyzed
            </Text>
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          onPress={handleGenerate}
          loading={isGenerating}
          disabled={isGenerating}
          icon="robot"
          style={[styles.generateBtn, { backgroundColor: theme.colors.primary }]}
          contentStyle={{ paddingVertical: 6 }}
        >
          {isGenerating ? 'Generating...' : 'Generate Monthly List'}
        </Button>

        {/* Results */}
        {generatedList.length > 0 && (
          <>
            <View style={[styles.summaryRow, { backgroundColor: theme.colors.primaryContainer }]}>
              <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.primary }}>
                {generatedList.filter(i => i.selected).length} items • {currency}{totalCost.toFixed(2)}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.primary }}>
                Budget: {currency}{budget} ({Math.round((totalCost / (parseFloat(budget) || 1)) * 100)}% used)
              </Text>
            </View>

            {generatedList.map((item, index) => (
              <Card
                key={index}
                style={[styles.itemCard, { backgroundColor: theme.colors.surface }, !item.selected && { opacity: 0.5 }]}
                onPress={() => toggleItem(index)}
              >
                <Card.Content style={styles.itemContent}>
                  <MaterialCommunityIcons
                    name={item.selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={22}
                    color={item.selected ? theme.colors.primary : theme.colors.onSurfaceVariant}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text variant="bodyMedium" style={{ fontWeight: '600', color: theme.colors.onSurface }}>
                      {item.name}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {item.quantity} {item.unit} • {item.category} • {currency}{item.estimated_price.toFixed(2)}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.tertiary, fontStyle: 'italic', marginTop: 2 }}>
                      {item.reason}
                    </Text>
                  </View>
                </Card.Content>
              </Card>
            ))}

            <Button
              mode="contained"
              onPress={handleAddToShoppingList}
              icon="cart-plus"
              style={[styles.addBtn, { backgroundColor: theme.colors.primary }]}
              contentStyle={{ paddingVertical: 6 }}
            >
              Add {generatedList.filter(i => i.selected).length} Items to Shopping List
            </Button>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  card: { marginBottom: 16, borderRadius: 16 },
  generateBtn: { marginBottom: 16, borderRadius: 12 },
  summaryRow: { padding: 14, borderRadius: 12, marginBottom: 12, flexDirection: 'column', gap: 4 },
  itemCard: { marginBottom: 8, borderRadius: 12 },
  itemContent: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4 },
  addBtn: { marginTop: 12, borderRadius: 12 },
});
