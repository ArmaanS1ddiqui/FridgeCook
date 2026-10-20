import { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { Text, Card, Button, Chip, IconButton, Divider, useTheme, ProgressBar } from 'react-native-paper';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useRecipeStore, RecipeIngredient, RecipeStep } from '../src/stores/recipeStore';
import { useCookingStore } from '../src/stores/cookingStore';
import { useProfileStore } from '../src/stores/profileStore';
import { useInventoryStore } from '../src/stores/inventoryStore';
import { MaterialCommunityIcons } from '@expo/vector-icons';

function StepTimer({ minutes }: { minutes: number }) {
  if (!minutes || minutes <= 0) return null;
  const theme = useTheme();
  const [secondsLeft, setSecondsLeft] = useState(minutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRunning && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) {
            setIsRunning(false);
            setIsFinished(true);
            Alert.alert('Timer Done!', 'This step is complete.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, secondsLeft]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const reset = () => {
    setSecondsLeft(minutes * 60);
    setIsRunning(false);
    setIsFinished(false);
  };

  const progress = 1 - secondsLeft / (minutes * 60);

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isFinished ? theme.colors.primaryContainer : theme.colors.surfaceVariant,
      borderRadius: 12,
      padding: 10,
      marginTop: 8,
      gap: 10,
    }}>
      <MaterialCommunityIcons
        name={isFinished ? 'check-circle' : 'timer-outline'}
        size={22}
        color={isFinished ? theme.colors.primary : theme.colors.onSurfaceVariant}
      />
      <Text style={{
        fontSize: 20,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
        color: isFinished ? theme.colors.primary : theme.colors.onSurface,
        minWidth: 60,
      }}>
        {formatTime(secondsLeft)}
      </Text>
      <View style={{ flex: 1 }}>
        <ProgressBar
          progress={progress}
          color={isFinished ? theme.colors.primary : theme.colors.secondary}
          style={{ height: 4, borderRadius: 2 }}
        />
      </View>
      {!isRunning && !isFinished && (
        <Button mode="contained" compact onPress={() => setIsRunning(true)} buttonColor={theme.colors.primary}>
          Start
        </Button>
      )}
      {isRunning && (
        <Button mode="outlined" compact onPress={() => setIsRunning(false)}>
          Pause
        </Button>
      )}
      {(isFinished || (!isRunning && secondsLeft < minutes * 60)) && (
        <Button mode="text" compact onPress={reset}>
          Reset
        </Button>
      )}
    </View>
  );
}

export default function RecipeDetailScreen() {
  const theme = useTheme();
  const { id, cooking } = useLocalSearchParams<{ id: string; cooking?: string }>();
  const { recipes, loadRecipes } = useRecipeStore();
  const { addCookingEntry } = useCookingStore();
  const { recalculateFromHistory } = useProfileStore();
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState(0);
  const [ratingTaste, setRatingTaste] = useState(0);
  const [ratingEffort, setRatingEffort] = useState(0);
  const [ratingAgain, setRatingAgain] = useState(0);
  const [ratingSpice, setRatingSpice] = useState(0);
  const [showRating, setShowRating] = useState(false);

  useEffect(() => { loadRecipes(); }, []);

  const recipe = recipes.find(r => r.id === id);

  if (!recipe) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ headerShown: true, title: 'Recipe' }} />
        <Text style={{ padding: 20, color: theme.colors.onSurface }}>Recipe not found</Text>
      </View>
    );
  }

  let ingredients: RecipeIngredient[] = [];
  let steps: RecipeStep[] = [];
  try { ingredients = JSON.parse(recipe.ingredients); } catch {}
  try { steps = JSON.parse(recipe.steps); } catch {}

  const totalTime = recipe.prep_time_minutes + recipe.cook_time_minutes;

  const handleFinishCooking = async () => {
    // Calculate cost from inventory
    const inventoryItems = useInventoryStore.getState().items;
    let totalCost = 0;
    const ingredientsWithCost = ingredients.map(i => {
      const invItem = inventoryItems.find(inv => inv.name.toLowerCase() === i.name.toLowerCase());
      const cost = invItem ? invItem.price_per_unit * i.quantity : 0;
      totalCost += cost;
      return { ...i, cost };
    });

    await addCookingEntry(
      {
        dish_name: recipe.name,
        cook_type: 'ai_inventory',
        total_cost: totalCost,
        servings: recipe.servings,
        rating_taste: ratingTaste,
        rating_effort: ratingEffort,
        rating_would_make_again: ratingAgain,
        rating_spice_level: ratingSpice,
        notes: null,
        recipe_id: recipe.id,
      },
      ingredientsWithCost.map(i => ({
        inventory_item_name: i.name,
        quantity_used: i.quantity,
        unit: i.unit,
        cost: i.cost,
      }))
    );

    await recalculateFromHistory();
    Alert.alert('Dish Complete!', `"${recipe.name}" has been logged!`, [
      { text: 'OK', onPress: () => router.replace('/cooking-history') },
    ]);
  };

  const StarSelector = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => (
    <View style={styles.ratingSection}>
      <Text variant="bodyMedium" style={{ fontWeight: '600', color: theme.colors.onSurfaceVariant }}>{label}</Text>
      <View style={{ flexDirection: 'row' }}>
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
      <Stack.Screen
        options={{
          headerShown: true,
          title: recipe.name,
          headerStyle: { backgroundColor: theme.colors.primary },
          headerTintColor: theme.colors.onPrimary,
        }}
      />
      <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.content}>
        {/* Header Info */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <Text variant="headlineSmall" style={{ fontWeight: '700', color: theme.colors.onSurface }}>{recipe.name}</Text>
            {recipe.description && (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>{recipe.description}</Text>
            )}
            <View style={styles.metaRow}>
              <Chip compact icon="clock-outline">{totalTime} min</Chip>
              <Chip compact icon="silverware-fork-knife">{recipe.servings} servings</Chip>
              <Chip compact icon="signal">Lvl {recipe.difficulty}/10</Chip>
              {recipe.cuisine && <Chip compact icon="earth">{recipe.cuisine}</Chip>}
            </View>
          </Card.Content>
        </Card>

        {/* Ingredients */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Ingredients</Text>
            {ingredients.map((ing, i) => (
              <View key={i} style={[styles.ingredientRow, { borderBottomColor: theme.colors.outlineVariant }]}>
                <MaterialCommunityIcons name="circle-small" size={24} color={theme.colors.primary} />
                <Text variant="bodyMedium" style={{ flex: 1, color: theme.colors.onSurface }}>
                  {ing.name}
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  {ing.quantity} {ing.unit}
                </Text>
              </View>
            ))}
          </Card.Content>
        </Card>

        {/* Steps */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Steps</Text>
            {steps.map((s, i) => (
              <View key={i} style={[
                styles.stepRow,
                { borderBottomColor: theme.colors.outlineVariant },
                cooking === 'true' && i === currentStep && { backgroundColor: theme.colors.primaryContainer, borderRadius: 8, paddingHorizontal: 8, marginHorizontal: -8 },
              ]}>
                <View style={[
                  styles.stepNumber,
                  { backgroundColor: theme.colors.surfaceVariant },
                  cooking === 'true' && i === currentStep && { backgroundColor: theme.colors.primary },
                ]}>
                  <Text style={[
                    styles.stepNumberText,
                    { color: theme.colors.onSurfaceVariant },
                    cooking === 'true' && i === currentStep && { color: theme.colors.onPrimary },
                  ]}>
                    {s.step}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>{s.instruction}</Text>
                  {s.duration_minutes && (
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                      ~{s.duration_minutes} min
                    </Text>
                  )}
                  {(s.needs_timer || (s.duration_minutes && s.duration_minutes > 0)) && (
                    <StepTimer minutes={s.duration_minutes || 1} />
                  )}
                </View>
              </View>
            ))}
          </Card.Content>
        </Card>

        {/* Cooking Controls */}
        {cooking === 'true' && !showRating && (
          <View style={styles.cookingControls}>
            <View style={styles.stepNav}>
              <Button
                mode="outlined"
                onPress={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
              >
                Previous
              </Button>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>Step {currentStep + 1}/{steps.length}</Text>
              {currentStep < steps.length - 1 ? (
                <Button mode="contained" onPress={() => setCurrentStep(currentStep + 1)}>
                  Next
                </Button>
              ) : (
                <Button mode="contained" onPress={() => setShowRating(true)} buttonColor={theme.colors.tertiary} textColor={theme.colors.onTertiary}>
                  Done!
                </Button>
              )}
            </View>
          </View>
        )}

        {/* Rating */}
        {showRating && (
          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Content>
              <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Rate This Dish</Text>
              <StarSelector value={ratingTaste} onChange={setRatingTaste} label="Taste" />
              <StarSelector value={ratingEffort} onChange={setRatingEffort} label="Effort vs Result" />
              <StarSelector value={ratingAgain} onChange={setRatingAgain} label="Would Make Again" />
              <StarSelector value={ratingSpice} onChange={setRatingSpice} label="Spice Level" />
              <Button mode="contained" onPress={handleFinishCooking} style={{ marginTop: 12 }}>
                Log & Finish
              </Button>
            </Card.Content>
          </Card>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  card: { marginBottom: 12, borderRadius: 16, elevation: 1 },
  sectionTitle: { fontWeight: '700', marginBottom: 12 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1 },
  stepRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1 },
  stepNumber: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  stepNumberText: { fontWeight: '700', fontSize: 13 },
  cookingControls: { marginTop: 8 },
  stepNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ratingSection: { marginBottom: 12 },
});
