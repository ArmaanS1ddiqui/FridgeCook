import { GoogleGenerativeAI } from '@google/generative-ai';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_KEY_STORAGE = 'gemini_api_key';

let genAI: GoogleGenerativeAI | null = null;

export async function setApiKey(key: string) {
  const cleaned = key.replace(/[\n\r\s]+/g, '');
  await AsyncStorage.setItem(API_KEY_STORAGE, cleaned);
  genAI = new GoogleGenerativeAI(cleaned);
}

export async function getApiKey(): Promise<string | null> {
  const key = await AsyncStorage.getItem(API_KEY_STORAGE);
  return key ? key.replace(/[\n\r\s]+/g, '') : null;
}

export async function removeApiKey() {
  await AsyncStorage.removeItem(API_KEY_STORAGE);
  genAI = null;
}

async function getAI(): Promise<GoogleGenerativeAI> {
  if (genAI) return genAI;
  const key = await getApiKey();
  if (!key) throw new Error('API key not set. Go to Settings to add your Gemini API key.');
  genAI = new GoogleGenerativeAI(key);
  return genAI;
}

async function getSelectedModel(): Promise<string> {
  const model = await AsyncStorage.getItem('selected_model');
  return model || 'gemini-3.8-flash';
}

// Test API connection and return model info
export async function testApiConnection(): Promise<{
  success: boolean;
  model: string;
  message: string;
}> {
  try {
    const ai = await getAI();
    const modelId = await getSelectedModel();
    const model = ai.getGenerativeModel({ model: modelId });
    const result = await model.generateContent('Reply with exactly: "Connection successful" and nothing else.');
    const text = result.response.text();
    return {
      success: true,
      model: modelId,
      message: `Connected to ${modelId}. Response: "${text.trim()}"`,
    };
  } catch (error: any) {
    return {
      success: false,
      model: await getSelectedModel(),
      message: error.message || 'Connection failed',
    };
  }
}

export interface AIRecipeSuggestion {
  name: string;
  description: string;
  difficulty: number;
  prep_time_minutes: number;
  cook_time_minutes: number;
  servings: number;
  cuisine: string;
  ingredients: Array<{
    name: string;
    quantity: number;
    unit: string;
    available: boolean;
    inInventory: number;
  }>;
  steps: Array<{
    step: number;
    instruction: string;
    duration_minutes?: number;
    needs_timer?: boolean;
  }>;
  estimated_cost: number;
  calories: number;
  protein_grams: number;
  calories_percent?: number; // % of daily needs
  protein_percent?: number; // % of daily needs
  match_score: number;
}

export async function getRecipeSuggestions(params: {
  inventory: Array<{ name: string; quantity: number; unit: string; category: string }>;
  difficulty: number;
  allowExtras: boolean;
  tasteProfile?: {
    cuisine_preferences: Record<string, number>;
    protein_preferences: Record<string, number>;
    spice_tolerance: number;
    complexity_preference: number;
    dietary_restrictions: string[];
    allergies: string[];
  };
  servings?: number;
  appliances?: string[];
  supermarket?: string;
  currency?: string;
  dailyCalories?: number;
  dailyProtein?: number;
  goalType?: string;
}): Promise<AIRecipeSuggestion[]> {
  const ai = await getAI();
  const modelId = await getSelectedModel();
  const model = ai.getGenerativeModel({ model: modelId });

  const inventoryList = params.inventory
    .map(i => `- ${i.name}: ${i.quantity} ${i.unit} (${i.category})`)
    .join('\n');

  const profileContext = params.tasteProfile
    ? `
User Taste Profile:
- Preferred cuisines: ${JSON.stringify(params.tasteProfile.cuisine_preferences)}
- Preferred proteins: ${JSON.stringify(params.tasteProfile.protein_preferences)}
- Spice tolerance: ${params.tasteProfile.spice_tolerance}/10
- Complexity preference: ${params.tasteProfile.complexity_preference}/10
- Dietary restrictions: ${params.tasteProfile.dietary_restrictions.join(', ') || 'None'}
- Allergies: ${params.tasteProfile.allergies.join(', ') || 'None'}
`
    : '';

  const appliancesContext = params.appliances && params.appliances.length > 0
    ? `\nAvailable Kitchen Appliances: ${params.appliances.join(', ')}\nIMPORTANT: Only suggest recipes that can be made using THESE appliances. Do not suggest recipes requiring equipment the user doesn't have.`
    : '';

  const supermarketContext = params.supermarket
    ? `\nUser shops at: ${params.supermarket} (Dubai, UAE). Consider locally available ingredients and Middle Eastern cuisine options.`
    : '';

  const currencySymbol = params.currency || '$';

  const nutritionContext = (params.dailyCalories && params.dailyProtein)
    ? `\nUser's daily nutritional needs: ${params.dailyCalories} calories, ${params.dailyProtein}g protein.
${params.goalType === 'high_protein' ? 'User prefers HIGH PROTEIN recipes. Prioritize protein-rich dishes.' : ''}
For each recipe, calculate approximate calories and protein, and what percentage of daily needs this dish fulfills.`
    : '';

  const prompt = `You are a chef AI. Suggest 3-5 recipes based on the available ingredients.

Available Ingredients:
${inventoryList}

Difficulty Level: ${params.difficulty}/10
Servings: ${params.servings || 2}
${params.allowExtras ? 'IMPORTANT: You MUST suggest recipes that require 1-4 ADDITIONAL ingredients NOT in the user\'s inventory. Every recipe MUST have at least one ingredient where "available" is false. The goal is to inspire the user to buy a few extra things to make something special. Do NOT suggest recipes that can be made entirely from existing inventory — that is the other mode.' : 'ONLY use ingredients from the available inventory. Do not suggest any recipe requiring ingredients not listed above.'}
${profileContext}
${appliancesContext}
${supermarketContext}
${nutritionContext}

Return ONLY valid JSON array with this structure (no markdown, no code blocks):
[
  {
    "name": "Recipe Name",
    "description": "Brief description",
    "difficulty": 1-10,
    "prep_time_minutes": number,
    "cook_time_minutes": number,
    "servings": number,
    "cuisine": "Cuisine Type",
    "ingredients": [
      { "name": "Ingredient", "quantity": number, "unit": "g/ml/pcs/etc", "available": true/false, "inInventory": number }
    ],
    "steps": [
      { "step": 1, "instruction": "Step description", "duration_minutes": number, "needs_timer": true/false }
    ],
    "estimated_cost": number,
    "calories": number,
    "protein_grams": number,
    "calories_percent": number,
    "protein_percent": number,
    "match_score": 0-100
  }
]

IMPORTANT:
- All costs must be in ${currencySymbol} (the user's selected currency)
- "estimated_cost" must be a number in ${currencySymbol}
- "calories" is the total calories for the entire recipe (all servings)
- "protein_grams" is the total protein in grams for the entire recipe
- "calories_percent" is what percentage of the user's daily ${params.dailyCalories || 2000} calorie need this recipe fulfills (per serving)
- "protein_percent" is what percentage of the user's daily ${params.dailyProtein || 50}g protein need this recipe fulfills (per serving)
- For each ingredient, set "available" to true if it's in the inventory, false if it needs to be purchased. Set "inInventory" to the quantity available (0 if not available).
- For each step, set "needs_timer" to true if the step involves waiting (boiling, baking, marinating, resting, simmering, etc.) and false for active work (chopping, mixing, plating).
- Sort recipes by match_score descending (best matches first).`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    const recipes = JSON.parse(cleaned);
    // Validate extras mode: each recipe must have at least one unavailable ingredient
    if (params.allowExtras && Array.isArray(recipes)) {
      const filtered = recipes.filter((r: any) =>
        r.ingredients?.some((i: any) => i.available === false)
      );
      if (filtered.length === 0) throw new Error('No recipes with extra ingredients found. Try adjusting difficulty or servings.');
      return filtered;
    }
    return recipes;
  } catch {
    throw new Error('Failed to parse AI response. Please try again.');
  }
}

export async function parseGroceryReceipt(base64Image: string, mimeType: string = 'image/jpeg'): Promise<Array<{
  name: string;
  quantity: number;
  unit: string;
  price: number;
  category: string;
}>> {
  const ai = await getAI();
  const modelId = await getSelectedModel();
  const model = ai.getGenerativeModel({ model: modelId });

  const prompt = `Analyze this grocery receipt/bill image. Extract all food items with their quantities and prices.

Return ONLY valid JSON array (no markdown, no code blocks):
[
  {
    "name": "Item Name (clean, readable name)",
    "quantity": number,
    "unit": "kg/g/L/ml/pcs",
    "price": total_price_number,
    "category": "Protein/Dairy/Vegetable/Fruit/Grain/Spice/Beverage/Snack/Condiment/Frozen/Other"
  }
]

Rules:
- Convert abbreviated names to full readable names
- If quantity isn't clear, default to 1 pcs
- Price should be the total price for that line item
- Price must be a plain number (no currency symbols), use period as decimal separator
- SKIP subtotals, totals, tax, VAT, discounts, bag fees, and loyalty points
- For weighted items, calculate total line price
- If receipt is non-English, translate item names to English
- Categorize each item appropriately
- Skip non-food items`;

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType: mimeType,
        data: base64Image,
      },
    },
  ]);

  const text = result.response.text();
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    const raw = JSON.parse(cleaned);
    if (!Array.isArray(raw)) throw new Error('Invalid response');
    return raw.map((item: any) => ({
      name: typeof item.name === 'string' ? item.name.trim() : 'Unknown Item',
      quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
      unit: typeof item.unit === 'string' ? item.unit : 'pcs',
      price: typeof item.price === 'number' && item.price >= 0 ? item.price : 0,
      category: typeof item.category === 'string' ? item.category : 'Other',
    }));
  } catch {
    throw new Error('Failed to parse receipt. Please try again or add items manually.');
  }
}

export async function generateMonthlyShoppingList(params: {
  cookingHistory: Array<{ dish_name: string; ingredients: string[]; frequency: number }>;
  currentInventory: Array<{ name: string; quantity: number; unit: string; category: string }>;
  tasteProfile?: {
    cuisine_preferences: Record<string, number>;
    protein_preferences: Record<string, number>;
    spice_tolerance: number;
    dietary_restrictions: string[];
    allergies: string[];
  };
  budget: number;
  currency: string;
  supermarket?: string;
  servingsPerDay?: number;
}): Promise<Array<{
  name: string;
  quantity: number;
  unit: string;
  category: string;
  estimated_price: number;
  reason: string;
}>> {
  const ai = await getAI();
  const modelId = await getSelectedModel();
  const model = ai.getGenerativeModel({ model: modelId });

  const historyContext = params.cookingHistory.length > 0
    ? `Dishes the user regularly cooks (with frequency per month):\n${params.cookingHistory.map(h => `- ${h.dish_name} (${h.frequency}x/month): uses ${h.ingredients.join(', ')}`).join('\n')}`
    : 'No cooking history yet — suggest a balanced starter grocery list.';

  const inventoryContext = params.currentInventory.length > 0
    ? `Currently in fridge (don't re-buy these unless running low):\n${params.currentInventory.map(i => `- ${i.name}: ${i.quantity} ${i.unit}`).join('\n')}`
    : 'Fridge is empty.';

  const profileContext = params.tasteProfile
    ? `Taste preferences:
- Preferred cuisines: ${JSON.stringify(params.tasteProfile.cuisine_preferences)}
- Preferred proteins: ${JSON.stringify(params.tasteProfile.protein_preferences)}
- Spice tolerance: ${params.tasteProfile.spice_tolerance}/10
- Dietary restrictions: ${params.tasteProfile.dietary_restrictions.join(', ') || 'None'}
- Allergies: ${params.tasteProfile.allergies.join(', ') || 'None'}`
    : '';

  const prompt = `You are a grocery shopping assistant. Generate a MONTHLY shopping list for a household.

${historyContext}

${inventoryContext}

${profileContext}

Budget: ${params.currency}${params.budget} per month
Servings per day: ${params.servingsPerDay || 2}
${params.supermarket ? `Supermarket: ${params.supermarket} (Dubai, UAE). Use prices typical for this store.` : ''}

Generate a comprehensive monthly shopping list that includes:
1. Ingredients needed to cook the user's regular dishes for the month
2. Staple items (oil, salt, spices, rice, bread, etc.) that may run out
3. 5-8 ready-to-eat SNACKS suited to the user's taste (chips, nuts, yogurt, fruits, cookies, etc.)
4. Fresh produce that needs weekly restocking (estimate 4 weeks)

Rules:
- Stay within the budget of ${params.currency}${params.budget}
- Don't include items already well-stocked in the fridge
- Prices must be realistic for Dubai supermarkets in ${params.currency}
- Include a "reason" for each item (e.g., "For your regular Chicken Biryani", "Weekly fresh produce", "Snack")
- Categories: Protein, Dairy, Vegetable, Fruit, Grain, Spice, Beverage, Snack, Condiment, Frozen, Other
- NEVER include items that conflict with the user's dietary restrictions or contain their allergens
- "estimated_price" is the price PER UNIT (not total)

Return ONLY valid JSON array (no markdown, no code blocks):
[
  {
    "name": "Item Name",
    "quantity": number,
    "unit": "kg/g/L/ml/pcs/pack",
    "category": "Category",
    "estimated_price": price_per_unit_in_${params.currency},
    "reason": "Why this item is needed"
  }
]

The total cost (sum of estimated_price * quantity for each item) MUST NOT exceed ${params.currency}${params.budget}.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    const items = JSON.parse(cleaned);
    if (!Array.isArray(items)) throw new Error('Invalid response');
    return items.map(item => ({
      name: typeof item.name === 'string' ? item.name : 'Unknown',
      quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
      unit: typeof item.unit === 'string' ? item.unit : 'pcs',
      category: typeof item.category === 'string' ? item.category : 'Other',
      estimated_price: typeof item.estimated_price === 'number' ? item.estimated_price : 0,
      reason: typeof item.reason === 'string' ? item.reason : '',
    }));
  } catch {
    throw new Error('Failed to generate shopping list. Please try again.');
  }
}
