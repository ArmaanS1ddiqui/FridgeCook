import { convertUnit, isMeasurableUnit } from './units';

// Matching recipe / receipt names against what is in the fridge.

const STOP_WORDS = new Set([
  'fresh', 'organic', 'large', 'small', 'medium', 'whole', 'raw', 'the', 'of', 'a', 'and',
  'pack', 'packet', 'pcs', 'pc', 'kg', 'g', 'ml', 'l',
]);

// Words that describe a variety or preparation of the same product, so
// "boneless chicken breast" is still chicken breast — unlike "coconut milk" vs milk.
const MODIFIERS = new Set([
  'red', 'white', 'brown', 'green', 'yellow', 'black', 'boneless', 'skinless', 'full', 'fat', 'low', 'lowfat',
  'skimmed', 'skim', 'semi', 'unsalted', 'salted', 'extra', 'virgin', 'ground', 'dried', 'frozen', 'chopped',
  'sliced', 'diced', 'minced', 'cooked', 'ripe', 'baby', 'plain', 'free', 'range', 'lean', 'cherry', 'plum',
  'roma', 'basmati', 'jasmine', 'long', 'grain', 'greek', 'natural', 'light', 'dark', 'mild', 'mature',
  'grated', 'shredded', 'crushed', 'canned', 'tinned', 'loose', 'local', 'imported', 'premium', 'classic',
]);

function singular(word: string): string {
  if (/(ea|oa|l)ves$/.test(word)) return word.slice(0, -3) + 'f'; // leaves, loaves, halves (but not olives)
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 4 && word.endsWith('ie')) return word.slice(0, -2) + 'y';
  if (word.length > 4 && word.endsWith('oes')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** "Fresh Tomatoes (500g)" -> "tomato" */
export function normalizeName(name: string): string {
  return tokens(name).join(' ');
}

function tokens(name: string): string[] {
  return (name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9؀-ۿ\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t && !STOP_WORDS.has(t) && !/^\d+$/.test(t))
    .map(singular);
}

interface Named { id: string; name: string }

/**
 * Find the inventory item a name refers to.
 * Exact (normalised) match first; otherwise the item whose words are all contained in the
 * query or vice versa ("chicken breast" <-> "boneless chicken breast"), preferring the closest length.
 */
export function findMatch<T extends Named>(name: string, items: T[]): T | null {
  const target = tokens(name);
  if (target.length === 0) return null;
  const targetKey = target.join(' ');

  let best: T | null = null;
  let bestScore = 0;
  for (const item of items) {
    const cand = tokens(item.name);
    if (cand.length === 0) continue;
    if (cand.join(' ') === targetKey) return item;

    const candSet = new Set(cand);
    const targetSet = new Set(target);
    const shared = cand.filter(t => targetSet.has(t)).length;
    const candInTarget = shared === candSet.size;
    const targetInCand = target.every(t => candSet.has(t));
    if (!candInTarget && !targetInCand) continue;

    // Require the head noun (last word) of the shorter name to be present, so
    // "olive oil" never matches "olive" and "chicken stock" never matches "chicken".
    const shorter = cand.length <= target.length ? cand : target;
    const longer = cand.length <= target.length ? target : cand;
    if (longer[longer.length - 1] !== shorter[shorter.length - 1]) continue;
    // Every extra word must be a harmless descriptor; "coconut milk" is not milk.
    const shorterSet = new Set(shorter);
    if (!longer.every(t => shorterSet.has(t) || MODIFIERS.has(t))) continue;

    const score = shared / Math.max(cand.length, target.length);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

export interface StockItem extends Named {
  quantity: number;
  unit: string;
  price_per_unit: number;
}

export interface IngredientNeed {
  name: string;
  quantity: number;
  unit: string;
}

export interface ConsumptionLine {
  ingredient: IngredientNeed;
  item: StockItem | null;
  /** Amount to deduct, expressed in the inventory item's unit. 0 when nothing can be deducted. */
  deduct: number;
  /** How much of the ingredient is on hand, in the recipe's unit. null when units can't be compared. */
  onHand: number | null;
  cost: number;
  status: 'ok' | 'short' | 'missing' | 'unit_mismatch';
}

/**
 * Work out what cooking a recipe takes out of the fridge.
 * Quantities are converted into each inventory item's own unit, so 200 g of a
 * recipe never wipes out an item stored as 1 kg.
 */
export function planConsumption(ingredients: IngredientNeed[], inventory: StockItem[]): ConsumptionLine[] {
  // Track what earlier lines already claimed, in case a recipe lists an item twice.
  const remaining = new Map<string, number>();
  return ingredients.map(ingredient => {
    const item = findMatch(ingredient.name, inventory);
    if (!item) return { ingredient, item: null, deduct: 0, onHand: 0, cost: 0, status: 'missing' as const };

    const left = remaining.has(item.id) ? remaining.get(item.id)! : item.quantity;
    const quantity = Number(ingredient.quantity);
    const needed = isMeasurableUnit(ingredient.unit) && isFinite(quantity) && quantity > 0
      ? convertUnit(quantity, ingredient.unit, item.unit)
      : null;
    if (needed === null) {
      return { ingredient, item, deduct: 0, onHand: null, cost: 0, status: 'unit_mismatch' as const };
    }
    const deduct = Math.max(0, Math.min(needed, left));
    remaining.set(item.id, left - deduct);
    const onHand = convertUnit(left, item.unit, ingredient.unit);
    return {
      ingredient,
      item,
      deduct,
      onHand,
      cost: (item.price_per_unit || 0) * deduct,
      status: needed <= left * 1.001 ? ('ok' as const) : ('short' as const),
    };
  });
}
