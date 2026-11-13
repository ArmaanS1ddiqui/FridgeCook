import { useState, useEffect, useMemo, useRef } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { Text, Card, Button, Chip, IconButton, Divider, useTheme, ProgressBar, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useRecipeStore, RecipeIngredient, RecipeStep } from '../src/stores/recipeStore';
import { useCookingStore } from '../src/stores/cookingStore';
import { useProfileStore } from '../src/stores/profileStore';
import { useInventoryStore } from '../src/stores/inventoryStore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useShoppingStore } from '../src/stores/shoppingStore';
import { planConsumption } from '../src/utils/matching';
import { expiryStatus } from '../src/utils/expiry';
import { formatAmount, formatQty } from '../src/utils/units';
import { useWarningColor } from '../src/components/ui';

function StepTimer({ minutes }: { minutes: number }) {
  const theme = useTheme();
  const [secondsLeft, setSecondsLeft] = useState((minutes || 0) * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  // Count against the clock, not ticks, so the timer stays right when the
  // screen sleeps or the app is in the background.
  const endsAt = useRef(0);

  useEffect(() => {
    if (!isRunning) return;
    const tick = () => {
      const left = Math.max(0, Math.round((endsAt.current - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        setIsRunning(false);
        setIsFinished(true);
        Alert.alert('Timer done', 'This step is complete.');
      }
    };
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [isRunning]);

  const start = () => {
    endsAt.current = Date.now() + secondsLeft * 1000;
    setIsRunning(true);
  };

  if (!minutes || minutes <= 0) return null;

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
        <Button mode="contained" compact onPress={start} buttonColor={theme.colors.primary}>
          {secondsLeft < minutes * 60 ? 'Resume' : 'Start'}
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
  const { id, cooking, costData: costDataParam, totalCost: totalCostParam, cookType } = useLocalSearchParams<{ id: string; cooking?: string; costData?: string; totalCost?: string; cookType?: string }>();
  const { recipes, loadRecipes, isLoading: recipesLoading } = useRecipeStore();
  const { addCookingEntry } = useCookingStore();
  const { recalculateFromHistory } = useProfileStore();
  const inventory = useInventoryStore(state => state.items);
  const WARNING_COLOR = useWarningColor();
  const router = useRouter();

  // Cooking can start from AI Cook (stock already deducted) or from here.
  const [isCooking, setIsCooking] = useState(cooking === 'true');
  const [isStarting, setIsStarting] = useState(false);
  const [localCost, setLocalCost] = useState<{ total: number; byName: Record<string, number> } | null>(null);

  const [currentStep, setCurrentStep] = useState(0);
  const [ratingTaste, setRatingTaste] = useState(0);
  const [ratingEffort, setRatingEffort] = useState(0);
  const [ratingAgain, setRatingAgain] = useState(0);
  const [ratingSpice, setRatingSpice] = useState(0);
  const [showRating, setShowRating] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  useEffect(() => {
    loadRecipes();
    useInventoryStore.getState().loadItems();
  }, []);

  const recipe = recipes.find(r => r.id === id);

  const { ingredients, steps } = useMemo(() => {
    let parsedIngredients: any[] = [];
    let parsedSteps: RecipeStep[] = [];
    try { parsedIngredients = JSON.parse(recipe?.ingredients || '[]'); } catch {}
    try { parsedSteps = JSON.parse(recipe?.steps || '[]'); } catch {}
    return {
      // Older saved recipes can hold loose data; coerce it before doing maths with it.
      ingredients: (Array.isArray(parsedIngredients) ? parsedIngredients : [])
        .filter(i => i && typeof i.name === 'string' && i.name.trim())
        .map(i => ({ ...i, quantity: Number(i.quantity) || 0, unit: String(i.unit || 'pcs') })) as RecipeIngredient[],
      steps: Array.isArray(parsedSteps) ? parsedSteps : [],
    };
  }, [recipe?.ingredients, recipe?.steps]);

  // What cooking this would take from the fridge right now.
  const plan = useMemo(
    () => planConsumption(ingredients, inventory.filter(i => expiryStatus(i.expiry_date) !== 'expired')),
    [ingredients, inventory],
  );
  const missing = plan.filter(line => line.status === 'missing' || line.status === 'short');

  if (recipesLoading && !recipe) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <Stack.Screen options={{ headerShown: true, title: 'Loading...', headerStyle: { backgroundColor: theme.colors.surface }, headerTintColor: theme.colors.onSurface }} />
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ headerShown: true, title: 'Recipe' }} />
        <Text style={{ padding: 20, color: theme.colors.onSurface }}>Recipe not found</Text>
      </View>
    );
  }

  const totalTime = recipe.prep_time_minutes + recipe.cook_time_minutes;

  const addMissingToShoppingList = async () => {
    await useShoppingStore.getState().addFromRecipe(missing.map(line => {
      const short = line.ingredient.quantity - (line.onHand ?? 0);
      return {
        name: line.ingredient.name,
        quantity: short > 0 ? Math.round(short * 100) / 100 : line.ingredient.quantity,
        unit: line.ingredient.unit,
      };
    }), recipe.id);
    Alert.alert('Added', `${missing.length} item${missing.length === 1 ? '' : 's'} added to your shopping list`);
  };

  const startCooking = async (skipMissingCheck = false) => {
    if (isStarting) return;
    if (missing.length > 0 && !skipMissingCheck) {
      Alert.alert(
        'Missing ingredients',
        `You don't have enough of: ${missing.map(l => l.ingredient.name).join(', ')}.`,
        [
          { text: 'Go back', style: 'cancel' },
          { text: 'Add to shopping list', onPress: addMissingToShoppingList },
          { text: 'Cook anyway', onPress: () => startCooking(true) },
        ],
      );
      return;
    }
    setIsStarting(true);
    try {
      const byName: Record<string, number> = {};
      let total = 0;
      for (const line of plan) {
        byName[line.ingredient.name] = line.cost;
        total += line.cost;
      }
      const consumptions = plan
        .filter(line => line.item && line.deduct > 0)
        .map(line => ({ id: line.item!.id, quantity: line.deduct }));
      if (consumptions.length > 0) {
        await useInventoryStore.getState().consumeItems(consumptions);
      }
      setLocalCost({ total: Math.round(total * 100) / 100, byName });
      const notDeducted = plan.filter(line => line.status === 'unit_mismatch');
      if (notDeducted.length > 0) {
        Alert.alert(
          'Check these amounts',
          `Couldn't work out how much to deduct for: ${notDeducted.map(l => `${l.ingredient.name} (recipe uses ${formatAmount(l.ingredient.quantity, l.ingredient.unit)}, fridge has ${formatAmount(l.item!.quantity, l.item!.unit)})`).join('; ')}. Update them in your fridge after cooking.`,
        );
      }
      setCurrentStep(0);
      setIsCooking(true);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not start cooking');
    } finally {
      setIsStarting(false);
    }
  };

  const handleFinishCooking = async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    try {
      if (ratingTaste === 0) {
        Alert.alert('Rate Your Dish', 'Please rate the taste before saving');
        return;
      }

      // Costs were worked out when the ingredients were taken from the fridge:
      // either here (cookbook) or in AI Cook, which passes them along.
      let totalCost = localCost?.total ?? 0;
      let parsedCostData: Record<string, number> = localCost?.byName ?? {};
      if (!localCost) {
        if (totalCostParam) totalCost = parseFloat(totalCostParam) || 0;
        if (costDataParam) {
          try { parsedCostData = JSON.parse(costDataParam); } catch {
            try { parsedCostData = JSON.parse(decodeURIComponent(costDataParam)); } catch {}
          }
        }
      }

      await addCookingEntry(
        {
          dish_name: recipe.name,
          cook_type: (cookType as 'manual' | 'ai_inventory' | 'ai_extras') || 'ai_inventory',
          total_cost: totalCost,
          servings: recipe.servings,
          rating_taste: ratingTaste,
          rating_effort: ratingEffort,
          rating_would_make_again: ratingAgain,
          rating_spice_level: ratingSpice,
          notes: null,
          recipe_id: recipe.id,
        },
        ingredients.map(i => ({
          inventory_item_name: i.name,
          quantity_used: i.quantity,
          unit: i.unit,
          cost: parsedCostData[i.name] || 0,
        }))
      );

      await recalculateFromHistory();
      Alert.alert('Dish Complete!', `"${recipe.name}" has been logged!`, [
        { text: 'OK', onPress: () => router.replace('/cooking-history') },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to finish cooking');
    } finally {
      setIsFinishing(false);
    }
  };

  const StarSelector = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => (
    <View style={styles.ratingSection}>
      <Text variant="bodyMedium" style={{ fontWeight: '600', color: theme.colors.onSurfaceVariant }}>{label}</Text>
      <View style={{ flexDirection: 'row' }}>
        {[1, 2, 3, 4, 5].map(i => (
          <IconButton
            key={i}
            icon={i <= value ? 'star' : 'star-outline'}
            iconColor={i <= value ? '#FFB300' : theme.colors.onSurfaceVariant}
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
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
          headerShadowVisible: false,
        }}
      />
      <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.content}>
        {/* Header Info */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="contained">
          <Card.Content>
            <Text variant="headlineSmall" style={{ fontWeight: '700', color: theme.colors.onSurface }}>{recipe.name}</Text>
            {!!recipe.description && (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>{recipe.description}</Text>
            )}
            <View style={styles.metaRow}>
              <Chip compact icon="clock-outline">{totalTime} min</Chip>
              <Chip compact icon="silverware-fork-knife">{recipe.servings} servings</Chip>
              <Chip compact icon="signal">Lvl {recipe.difficulty}/10</Chip>
              {!!recipe.cuisine && <Chip compact icon="earth">{recipe.cuisine}</Chip>}
            </View>
          </Card.Content>
        </Card>

        {/* Ingredients */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="contained">
          <Card.Content>
            <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Ingredients</Text>
            {ingredients.map((ing, i) => {
              const line = plan[i];
              const status = line?.status;
              const showStatus = !isCooking && !!status;
              const icon = status === 'ok' ? 'check-circle' : status === 'unit_mismatch' ? 'check-circle-outline' : status === 'short' ? 'alert-circle' : 'close-circle-outline';
              const color = status === 'ok' || status === 'unit_mismatch' ? theme.colors.primary : status === 'short' ? WARNING_COLOR : theme.colors.error;
              return (
                <View key={i} style={[styles.ingredientRow, { borderBottomColor: theme.colors.outlineVariant }]}>
                  <MaterialCommunityIcons
                    name={(showStatus ? icon : 'circle-small') as any}
                    size={showStatus ? 18 : 24}
                    color={showStatus ? color : theme.colors.primary}
                    style={{ width: 26 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>{ing.name}</Text>
                    {showStatus && status === 'short' ? (
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Only {formatQty(line.onHand ?? 0)} {ing.unit} in fridge
                      </Text>
                    ) : null}
                    {showStatus && status === 'missing' ? (
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Not in fridge</Text>
                    ) : null}
                  </View>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    {formatAmount(Number(ing.quantity) || 0, ing.unit)}
                  </Text>
                </View>
              );
            })}
            {!isCooking && missing.length > 0 ? (
              <Button mode="text" icon="cart-plus" onPress={addMissingToShoppingList} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                Add {missing.length} missing to shopping list
              </Button>
            ) : null}
          </Card.Content>
        </Card>

        {/* Steps */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="contained">
          <Card.Content>
            <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Steps</Text>
            {steps.map((s, i) => (
              <View key={i} style={[
                styles.stepRow,
                { borderBottomColor: theme.colors.outlineVariant },
                isCooking && i === currentStep && { backgroundColor: theme.colors.primaryContainer, borderRadius: 8, paddingHorizontal: 8, marginHorizontal: -8 },
              ]}>
                <View style={[
                  styles.stepNumber,
                  { backgroundColor: theme.colors.surfaceVariant },
                  isCooking && i === currentStep && { backgroundColor: theme.colors.primary },
                ]}>
                  <Text style={[
                    styles.stepNumberText,
                    { color: theme.colors.onSurfaceVariant },
                    isCooking && i === currentStep && { color: theme.colors.onPrimary },
                  ]}>
                    {s.step}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>{s.instruction}</Text>
                  {(s.duration_minutes ?? 0) > 0 && (
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                      ~{s.duration_minutes} min
                    </Text>
                  )}
                  {(s.needs_timer === true || (s.duration_minutes ?? 0) > 0) && (
                    <StepTimer minutes={s.duration_minutes || 1} />
                  )}
                </View>
              </View>
            ))}
          </Card.Content>
        </Card>

        {/* Start cooking (when opened from the cookbook) */}
        {!isCooking && !showRating && steps.length > 0 && (
          <Button
            mode="contained"
            icon="pot-steam"
            onPress={() => startCooking()}
            loading={isStarting}
            disabled={isStarting}
            style={{ borderRadius: 16, marginTop: 4 }}
            contentStyle={{ paddingVertical: 8 }}
            labelStyle={{ fontSize: 16, fontWeight: '700' }}
          >
            Cook this now
          </Button>
        )}

        {/* Cooking Controls */}
        {isCooking && !showRating && (
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
          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="contained">
            <Card.Content>
              <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Rate This Dish</Text>
              <StarSelector value={ratingTaste} onChange={setRatingTaste} label="Taste" />
              <StarSelector value={ratingEffort} onChange={setRatingEffort} label="Effort vs Result" />
              <StarSelector value={ratingAgain} onChange={setRatingAgain} label="Would Make Again" />
              <StarSelector value={ratingSpice} onChange={setRatingSpice} label="Spice Level" />
              <Button mode="contained" onPress={handleFinishCooking} style={{ marginTop: 12 }} disabled={isFinishing} loading={isFinishing}>
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
  card: { marginBottom: 12, borderRadius: 20 },
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
