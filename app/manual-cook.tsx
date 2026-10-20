import { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { Text, Card, Button, TextInput, Chip, IconButton, Divider, useTheme } from 'react-native-paper';
import { useInventoryStore, InventoryItem } from '../src/stores/inventoryStore';
import { useCookingStore } from '../src/stores/cookingStore';
import { useProfileStore } from '../src/stores/profileStore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useSettingsStore } from '../src/stores/settingsStore';

interface SelectedIngredient {
  item: InventoryItem;
  quantityUsed: number;
}

export default function ManualCookScreen() {
  const theme = useTheme();
  const { items, loadItems } = useInventoryStore();
  const { addCookingEntry } = useCookingStore();
  const { recalculateFromHistory } = useProfileStore();
  const router = useRouter();
  const { currency } = useSettingsStore();

  const [step, setStep] = useState<'ingredients' | 'details' | 'rating'>('ingredients');
  const [selectedIngredients, setSelectedIngredients] = useState<SelectedIngredient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dishName, setDishName] = useState('');
  const [servings, setServings] = useState('1');
  const [notes, setNotes] = useState('');
  const [ratingTaste, setRatingTaste] = useState(0);
  const [ratingEffort, setRatingEffort] = useState(0);
  const [ratingAgain, setRatingAgain] = useState(0);
  const [ratingSpice, setRatingSpice] = useState(0);

  useEffect(() => {
    loadItems();
  }, []);

  const filteredItems = items.filter(i =>
    i.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
    !selectedIngredients.find(s => s.item.id === i.id)
  );

  const addIngredient = (item: InventoryItem) => {
    setSelectedIngredients(prev => [...prev, { item, quantityUsed: item.quantity }]);
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    setSelectedIngredients(prev => prev.map(s =>
      s.item.id === itemId ? { ...s, quantityUsed: Math.max(0, Math.min(quantity, s.item.quantity)) } : s
    ));
  };

  const removeIngredient = (itemId: string) => {
    setSelectedIngredients(prev => prev.filter(s => s.item.id !== itemId));
  };

  const totalCost = selectedIngredients.reduce((sum, s) => {
    return sum + (s.item.price_per_unit * s.quantityUsed);
  }, 0);

  const handleCook = async () => {
    if (!dishName.trim()) {
      Alert.alert('Error', 'Please enter a dish name');
      return;
    }
    if (selectedIngredients.length === 0) {
      Alert.alert('Error', 'Please select at least one ingredient');
      return;
    }

    // Consume ingredients from inventory (batch to avoid N+1 reloads)
    const { consumeItems } = useInventoryStore.getState();
    await consumeItems(selectedIngredients.map(sel => ({ id: sel.item.id, quantity: sel.quantityUsed })));

    // Add cooking entry
    await addCookingEntry(
      {
        dish_name: dishName.trim(),
        cook_type: 'manual',
        total_cost: totalCost,
        servings: parseInt(servings) || 1,
        rating_taste: ratingTaste,
        rating_effort: ratingEffort,
        rating_would_make_again: ratingAgain,
        rating_spice_level: ratingSpice,
        notes: notes || null,
        recipe_id: null,
      },
      selectedIngredients.map(s => ({
        inventory_item_name: s.item.name,
        quantity_used: s.quantityUsed,
        unit: s.item.unit,
        cost: s.item.price_per_unit * s.quantityUsed,
      }))
    );

    // Recalculate taste profile
    await recalculateFromHistory();

    Alert.alert('Dish Cooked!', `"${dishName}" has been logged.\nCost: ${currency}${totalCost.toFixed(2)}`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  const StarSelector = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => (
    <View style={styles.ratingSection}>
      <Text variant="bodyMedium" style={[styles.ratingLabel, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map(i => (
          <IconButton
            key={i}
            icon={i <= value ? 'star' : 'star-outline'}
            iconColor={i <= value ? '#FFB300' : theme.colors.outlineVariant}
            size={32}
            onPress={() => onChange(i)}
          />
        ))}
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Manual Cook', headerStyle: { backgroundColor: theme.colors.primary }, headerTintColor: theme.colors.onPrimary }} />
      <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.content}>
        {/* Progress indicator */}
        <View style={styles.progressRow}>
          {['ingredients', 'details', 'rating'].map((s, i) => (
            <View key={s} style={styles.progressItem}>
              <View style={[
                styles.progressDot,
                { backgroundColor: theme.colors.outlineVariant },
                step === s && { backgroundColor: theme.colors.primary, width: 16, height: 16, borderRadius: 8 },
                ['ingredients', 'details', 'rating'].indexOf(step) > i && { backgroundColor: theme.colors.inversePrimary },
              ]} />
              <Text variant="bodySmall" style={step === s ? { color: theme.colors.primary, fontSize: 11, fontWeight: '700' } : { color: theme.colors.onSurfaceVariant, fontSize: 11 }}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </View>
          ))}
        </View>

        {step === 'ingredients' && (
          <>
            <Text variant="titleLarge" style={[styles.stepTitle, { color: theme.colors.onSurface }]}>Select Ingredients</Text>

            {selectedIngredients.length > 0 && (
              <Card style={[styles.selectedCard, { backgroundColor: theme.colors.primaryContainer }]}>
                <Card.Content>
                  <Text variant="titleSmall" style={{ marginBottom: 8, color: theme.colors.onPrimaryContainer }}>Selected ({selectedIngredients.length})</Text>
                  {selectedIngredients.map(sel => (
                    <View key={sel.item.id} style={styles.selectedRow}>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyMedium" style={{ fontWeight: '600', color: theme.colors.onPrimaryContainer }}>{sel.item.name}</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          Available: {sel.item.quantity} {sel.item.unit}
                        </Text>
                      </View>
                      <TextInput
                        value={sel.quantityUsed.toString()}
                        onChangeText={v => updateQuantity(sel.item.id, parseFloat(v) || 0)}
                        keyboardType="numeric"
                        mode="outlined"
                        dense
                        style={styles.qtyInput}
                      />
                      <Text variant="bodySmall" style={{ marginHorizontal: 4, color: theme.colors.onSurface }}>{sel.item.unit}</Text>
                      <IconButton icon="close" size={18} onPress={() => removeIngredient(sel.item.id)} />
                    </View>
                  ))}
                  <Divider style={{ marginVertical: 8 }} />
                  <Text variant="titleSmall" style={{ color: theme.colors.primary }}>
                    Estimated Cost: {currency}{totalCost.toFixed(2)}
                  </Text>
                </Card.Content>
              </Card>
            )}

            <TextInput
              label="Search ingredients..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              mode="outlined"
              style={styles.searchInput}
              left={<TextInput.Icon icon="magnify" />}
            />

            {filteredItems.map(item => (
              <Card key={item.id} style={[styles.ingredientCard, { backgroundColor: theme.colors.surface }]} onPress={() => addIngredient(item)}>
                <Card.Content style={styles.ingredientContent}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" style={{ fontWeight: '600', color: theme.colors.onSurface }}>{item.name}</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {item.quantity} {item.unit} • {item.category}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="plus-circle" size={28} color={theme.colors.primary} />
                </Card.Content>
              </Card>
            ))}

            <Button
              mode="contained"
              onPress={() => setStep('details')}
              disabled={selectedIngredients.length === 0}
              style={styles.nextButton}
            >
              Next: Dish Details
            </Button>
          </>
        )}

        {step === 'details' && (
          <>
            <Text variant="titleLarge" style={[styles.stepTitle, { color: theme.colors.onSurface }]}>Dish Details</Text>

            <TextInput
              label="Dish Name"
              value={dishName}
              onChangeText={setDishName}
              mode="outlined"
              style={styles.input}
            />

            <TextInput
              label="Servings"
              value={servings}
              onChangeText={setServings}
              keyboardType="numeric"
              mode="outlined"
              style={styles.input}
            />

            <TextInput
              label="Notes (optional)"
              value={notes}
              onChangeText={setNotes}
              mode="outlined"
              multiline
              numberOfLines={3}
              style={styles.input}
            />

            <Card style={[styles.costCard, { backgroundColor: theme.colors.primaryContainer }]}>
              <Card.Content style={{ alignItems: 'center' }}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onPrimaryContainer }}>Total Cost</Text>
                <Text variant="headlineMedium" style={{ fontWeight: '700', color: theme.colors.primary }}>
                  {currency}{totalCost.toFixed(2)}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {currency}{(totalCost / (parseInt(servings) || 1)).toFixed(2)} per serving
                </Text>
              </Card.Content>
            </Card>

            <View style={styles.navButtons}>
              <Button mode="outlined" onPress={() => setStep('ingredients')}>Back</Button>
              <Button mode="contained" onPress={() => setStep('rating')} disabled={!dishName.trim()}>
                Next: Rate Dish
              </Button>
            </View>
          </>
        )}

        {step === 'rating' && (
          <>
            <Text variant="titleLarge" style={[styles.stepTitle, { color: theme.colors.onSurface }]}>Rate Your Dish</Text>

            <Card style={[styles.ratingCard, { backgroundColor: theme.colors.surface }]}>
              <Card.Content>
                <StarSelector value={ratingTaste} onChange={setRatingTaste} label="Taste" />
                <StarSelector value={ratingEffort} onChange={setRatingEffort} label="Effort vs Result" />
                <StarSelector value={ratingAgain} onChange={setRatingAgain} label="Would Make Again" />
                <StarSelector value={ratingSpice} onChange={setRatingSpice} label="Spice Level" />
              </Card.Content>
            </Card>

            <View style={styles.navButtons}>
              <Button mode="outlined" onPress={() => setStep('details')}>Back</Button>
              <Button mode="contained" onPress={handleCook}>
                Cook!
              </Button>
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  progressRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginBottom: 20 },
  progressItem: { alignItems: 'center' },
  progressDot: { width: 12, height: 12, borderRadius: 6, marginBottom: 4 },
  stepTitle: { fontWeight: '700', marginBottom: 16 },
  selectedCard: { marginBottom: 16, borderRadius: 16, elevation: 1 },
  selectedRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  qtyInput: { width: 70, textAlign: 'center' },
  searchInput: { marginBottom: 12 },
  ingredientCard: { marginBottom: 6, borderRadius: 16, elevation: 1 },
  ingredientContent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  nextButton: { marginTop: 16, borderRadius: 12 },
  input: { marginBottom: 12 },
  costCard: { marginVertical: 12, borderRadius: 16, elevation: 1 },
  navButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  ratingCard: { marginBottom: 16, borderRadius: 16, elevation: 1 },
  ratingSection: { marginBottom: 16 },
  ratingLabel: { fontWeight: '600', marginBottom: 4 },
  starsRow: { flexDirection: 'row' },
});
