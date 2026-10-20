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

  const prompt = `You are a chef AI. Suggest 3-5 recipes based on the available ingredients.

Available Ingredients:
${inventoryList}

Difficulty Level: ${params.difficulty}/10
Servings: ${params.servings || 2}
${params.allowExtras ? 'You MAY suggest recipes that need a few additional ingredients not in inventory, but prefer recipes using mostly available ingredients.' : 'ONLY use ingredients from the available inventory. Do not suggest any recipe requiring ingredients not listed above.'}
${profileContext}

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
    "match_score": 0-100
  }
]

For each ingredient, set "available" to true if it's in the inventory, false if it needs to be purchased. Set "inInventory" to the quantity available (0 if not available).
For each step, set "needs_timer" to true if the step involves waiting (boiling, baking, marinating, resting, simmering, etc.) and false for active work (chopping, mixing, plating).
Sort recipes by match_score descending (best matches first).`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Failed to parse AI response. Please try again.');
  }
}

export async function parseGroceryReceipt(base64Image: string): Promise<Array<{
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
    "category": "Protein/Dairy/Vegetable/Fruit/Grain/Spice/Beverage/Snack/Condiment/Other"
  }
]

Rules:
- Convert abbreviated names to full readable names
- If quantity isn't clear, default to 1 pcs
- Price should be the total price for that line item
- Categorize each item appropriately
- Skip non-food items`;

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Image,
      },
    },
  ]);

  const text = result.response.text();
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Failed to parse receipt. Please try again or add items manually.');
  }
}
