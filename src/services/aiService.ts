import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  extractJson, sanitizeReceipt, sanitizeRecipes, sanitizeMonthlyList,
  friendlyAIError, isModelUnavailable, isTransient,
  ParsedReceipt, AIRecipeSuggestion, MonthlyListItem,
} from './aiParsing';
import { StockItem } from '../utils/matching';

export type { AIRecipeSuggestion, ParsedReceipt, ReceiptItem, MonthlyListItem } from './aiParsing';

const API_KEY_STORAGE = 'gemini_api_key';
const DEFAULT_MODEL = 'gemini-3.8-flash';
// Tried in order when the selected model is rejected by the API.
const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-pro-preview'];

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
  return model || DEFAULT_MODEL;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface GenerateOptions {
  json?: boolean;
  temperature?: number;
  timeoutMs?: number;
}

/**
 * One place for every Gemini call: JSON mode, a timeout, one retry when the
 * service is busy, and fallback to another model when the chosen one is gone.
 */
async function generate(parts: Array<string | Part>, options: GenerateOptions = {}): Promise<{ text: string; model: string }> {
  const ai = await getAI();
  const selected = await getSelectedModel();
  const candidates = [selected, ...FALLBACK_MODELS.filter(m => m !== selected)];

  let lastError: unknown = null;
  for (const modelId of candidates) {
    const model = ai.getGenerativeModel(
      {
        model: modelId,
        generationConfig: {
          ...(options.json ? { responseMimeType: 'application/json' } : {}),
          ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        },
      },
      { timeout: options.timeoutMs ?? 90000 },
    );

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await model.generateContent(parts);
        const text = result.response.text();
        if (!text || !text.trim()) throw new Error('Empty response from the AI');
        return { text, model: modelId };
      } catch (error) {
        lastError = error;
        if (attempt === 0 && isTransient(error)) {
          await sleep(1500);
          continue;
        }
        break;
      }
    }
    if (!isModelUnavailable(lastError)) break;
  }
  throw lastError;
}

/** Ask for JSON and parse it; if the reply is unreadable, ask once more. */
async function generateJson<T>(parts: Array<string | Part>, parse: (raw: unknown) => T, options: GenerateOptions = {}): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text } = await generate(parts, { ...options, json: true });
    try {
      return parse(extractJson(text));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// Test API connection and return model info
export async function testApiConnection(): Promise<{
  success: boolean;
  model: string;
  message: string;
}> {
  const selected = await getSelectedModel();
  try {
    const { text, model } = await generate(['Reply with exactly: "Connection successful" and nothing else.'], { timeoutMs: 30000 });
    const note = model !== selected ? ` (${selected} was unavailable, so ${model} answered instead)` : '';
    return {
      success: true,
      model,
      message: `Connected to ${model}${note}. Response: "${text.trim()}"`,
    };
  } catch (error: any) {
    return {
      success: false,
      model: selected,
      message: friendlyAIError(error, 'connect'),
    };
  }
}

export async function getRecipeSuggestions(params: {
  inventory: Array<StockItem & { category: string; daysLeft?: number | null; frozen?: boolean }>;
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
  /** Item names the user specifically wants used up. */
  focusItems?: string[];
}): Promise<AIRecipeSuggestion[]> {
  const inventoryList = params.inventory
    .map(i => {
      const expiry = i.daysLeft === null || i.daysLeft === undefined ? ''
        : i.daysLeft < 0 ? ' — PAST its expiry date, do not use'
        : i.daysLeft === 0 ? ' — expires TODAY'
        : i.daysLeft <= 3 ? ` — expires in ${i.daysLeft} day${i.daysLeft === 1 ? '' : 's'}`
        : '';
      return `- ${i.name}: ${i.quantity} ${i.unit} (${i.category}${i.frozen ? ', FROZEN' : ''})${expiry}`;
    })
    .join('\n');

  const hasExpiring = params.inventory.some(i => i.daysLeft !== null && i.daysLeft !== undefined && i.daysLeft >= 0 && i.daysLeft <= 3);

  const profileContext = params.tasteProfile
    ? `
User Taste Profile:
- Preferred cuisines: ${JSON.stringify(params.tasteProfile.cuisine_preferences)}
- Preferred proteins: ${JSON.stringify(params.tasteProfile.protein_preferences)}
- Spice tolerance: ${params.tasteProfile.spice_tolerance}/10
- Complexity preference: ${params.tasteProfile.complexity_preference}/10
- Dietary restrictions: ${params.tasteProfile.dietary_restrictions.join(', ') || 'None'}
- Allergies: ${params.tasteProfile.allergies.join(', ') || 'None'}
NEVER include anything that conflicts with the dietary restrictions or contains the allergens.
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

  const focusContext = params.focusItems && params.focusItems.length > 0
    ? `\nUSE-IT-UP MODE: The user wants to use up these items before they go bad: ${params.focusItems.join(', ')}. Every recipe MUST use at least one of them, and the best matches should use several.`
    : hasExpiring
      ? '\nSome items are marked as expiring soon. Prefer recipes that use those up, and rank them higher.'
      : '';

  const prompt = `You are a chef AI. Suggest 3-5 recipes based on the available ingredients.

Available Ingredients:
${inventoryList}

Difficulty Level: ${params.difficulty}/10
Servings: ${params.servings || 2}
${params.allowExtras ? 'IMPORTANT: You MUST suggest recipes that require 1-4 ADDITIONAL ingredients NOT in the user\'s inventory. Every recipe MUST have at least one ingredient where "available" is false. The goal is to inspire the user to buy a few extra things to make something special. Do NOT suggest recipes that can be made entirely from existing inventory — that is the other mode.' : 'ONLY use ingredients from the available inventory. Do not suggest any recipe requiring ingredients not listed above. Never use more of an ingredient than the quantity listed.'}
${focusContext}
${profileContext}
${appliancesContext}
${supermarketContext}
${nutritionContext}

Return ONLY a valid JSON array with this structure:
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
      { "name": "Ingredient", "quantity": number, "unit": "g/ml/pcs/etc", "available": true/false }
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
- For every ingredient that comes from the inventory, copy its "name" EXACTLY as written in the list above, and give the quantity in the SAME unit the inventory uses for it (if the inventory says "Chicken Breast: 1 kg", write {"name": "Chicken Breast", "quantity": 0.4, "unit": "kg"}).
- Quantities are for the whole recipe (all ${params.servings || 2} servings).
- All costs must be in ${currencySymbol} (the user's selected currency). "estimated_cost" must be a plain number.
- "calories" is the total calories for the entire recipe (all servings)
- "protein_grams" is the total protein in grams for the entire recipe
- "calories_percent" is what percentage of the user's daily ${params.dailyCalories || 2000} calorie need this recipe fulfills (per serving)
- "protein_percent" is what percentage of the user's daily ${params.dailyProtein || 50}g protein need this recipe fulfills (per serving)
- Write the steps for someone who has never made this dish. Each step must be specific enough to follow without guessing:
  - Name the ingredients used in that step and how much of each ("add the 300 g diced chicken", not "add the chicken").
  - Say what state each ingredient is in when it goes in: raw or already cooked, rinsed, soaked, drained, peeled, at room temperature. Never write "add the rice" without saying whether it is uncooked or cooked.
  - Assume every inventory item is RAW / uncooked unless its name says otherwise ("Cooked Rice", "Leftover ..."). If a recipe needs something cooked first (rice, pasta, lentils, potatoes), include that as its own step with the amount of water and the time.
  - Give the heat level (low / medium / high or an oven temperature in °C), the time, and how to tell it is done ("until the rice is tender and the water is absorbed").
  - Include the liquid needed (water, stock) with an amount, and put all chopping and prep in the early steps.
  - One action per step. Do not write vague steps like "cook everything together" or "simmer with rice".
- Items marked FROZEN are in the freezer: the first step that uses one must say how to thaw it (or that it can be cooked from frozen), and the thawing time must be counted in prep_time_minutes.
- Water, salt and black pepper may be used without being in the inventory; list them as ingredients only if a specific amount matters.
- For each step, set "needs_timer" to true if the step involves waiting (boiling, baking, marinating, resting, simmering, etc.) and false for active work (chopping, mixing, plating).
- Sort recipes by match_score descending (best matches first).`;

  try {
    const recipes = await generateJson(
      [prompt],
      raw => sanitizeRecipes(raw, params.inventory, params.servings || 2),
    );
    if (recipes.length === 0) throw new Error('The AI returned no usable recipes. Please try again.');
    if (params.allowExtras) {
      const withExtras = recipes.filter(r => r.ingredients.some(i => !i.available));
      // If the model ignored the "extras" instruction, showing its recipes still beats an error.
      return withExtras.length > 0 ? withExtras : recipes;
    }
    return recipes;
  } catch (error) {
    throw new Error(friendlyAIError(error, 'get recipes'));
  }
}

export async function parseGroceryReceipt(base64Image: string, mimeType: string = 'image/jpeg'): Promise<ParsedReceipt> {
  const prompt = `You are reading a photo of a grocery receipt (likely from a UAE supermarket such as Carrefour, Lulu, Spinneys or Union Coop; lines may be in English, Arabic, or both).

Extract every FOOD or DRINK line item and return ONLY this JSON object:
{
  "store": "Store name or null",
  "date": "YYYY-MM-DD or null",
  "total": grand_total_number_or_null,
  "items": [
    {
      "name": "Clean readable English name",
      "quantity": number,
      "unit": "kg | g | L | ml | pcs",
      "price": line_total_number,
      "category": "Protein | Dairy | Vegetable | Fruit | Grain | Spice | Beverage | Snack | Condiment | Frozen | Other",
      "shelf_life_days": number_or_null
    }
  ]
}

Rules:
- Read the receipt top to bottom and include EVERY food/drink item. Do not stop early and do not invent items that are not printed.
- "name": expand abbreviations into a normal product name ("CHKN BRST BNLS" -> "Boneless Chicken Breast", "AL AIN MLK FF 1L" -> "Al Ain Full Fat Milk"). Translate Arabic to English. Keep the brand if printed. Do not include the size in the name.
- "quantity" and "unit":
  - Loose weighed items (e.g. "0.456 kg x 12.50"): quantity is the weight, unit is "kg".
  - Packaged items bought N times (e.g. "2 x 3.50" or "QTY 2"): quantity is N, unit is "pcs".
  - A single packaged item: quantity 1, unit "pcs" — even if the pack size (500g, 1L) is printed in its name.
  - If unclear, use quantity 1 and unit "pcs".
- "price": the TOTAL paid for that line after any discount printed for it, as a plain number with a period as the decimal separator and no currency symbol. If a line shows both a unit price and a line total, use the line total.
- "shelf_life_days": realistic days the item stays good after purchase when stored properly (fresh chicken 2, fresh fish 2, minced meat 2, milk 7, yogurt 14, eggs 28, leafy greens 5, tomatoes 7, bananas 5, apples 21, bread 5, hard cheese 30, frozen food 90). Use null for shelf-stable items (rice, pasta, canned food, spices, oil, sauces, snacks, soft drinks, water).
- SKIP: subtotal, total, VAT/tax lines, change, payment/card lines, loyalty points, bag charges, delivery fees, and all non-food items (cleaning, toiletries, etc.).
- "total": the grand total printed on the receipt (including VAT), or null if not visible.
- If the image is not a receipt or no items are readable, return {"store": null, "date": null, "total": null, "items": []}.`;

  try {
    return await generateJson(
      [prompt, { inlineData: { mimeType, data: base64Image } }],
      sanitizeReceipt,
      { temperature: 0.1, timeoutMs: 120000 },
    );
  } catch (error) {
    throw new Error(friendlyAIError(error, 'read the receipt'));
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
}): Promise<MonthlyListItem[]> {
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

Return ONLY a valid JSON array:
[
  {
    "name": "Item Name",
    "quantity": number,
    "unit": "kg/g/L/ml/pcs",
    "category": "Category",
    "estimated_price": price_per_unit_in_${params.currency},
    "reason": "Why this item is needed"
  }
]

The total cost (sum of estimated_price * quantity for each item) MUST NOT exceed ${params.currency}${params.budget}.`;

  try {
    const items = await generateJson([prompt], sanitizeMonthlyList);
    if (items.length === 0) throw new Error('The AI returned an empty list. Please try again.');
    return items;
  } catch (error) {
    throw new Error(friendlyAIError(error, 'generate the list'));
  }
}
