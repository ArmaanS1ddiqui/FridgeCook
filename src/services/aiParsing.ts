// Pure parsing + validation of AI responses. No network, no React Native —
// so it can be unit-tested with plain Node.

import { normalizeCategory, Category } from '../constants/catalog';
import { normalizeUnit, parseNumber } from '../utils/units';
import { TYPICAL_SHELF_LIFE } from '../utils/expiry';
import { planConsumption, StockItem } from '../utils/matching';

// ─── JSON extraction ───────────────────────────────────────────────────

/** Close any brackets left open by a response that was cut off mid-way. */
function repairTruncated(text: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastSafe = -1; // index just after the last complete value inside a container
  let safeStack: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') {
      stack.pop();
      lastSafe = i + 1;
      safeStack = [...stack];
    }
  }
  if (lastSafe === -1) return null;
  const closers = safeStack.reverse().map(c => (c === '{' ? '}' : ']')).join('');
  return text.slice(0, lastSafe).replace(/,\s*$/, '') + closers;
}

/**
 * Pull a JSON value out of a model response, tolerating markdown fences,
 * prose before/after, trailing commas and truncated output.
 */
export function extractJson(text: string): unknown {
  if (typeof text !== 'string') throw new Error('Empty response');
  let s = text.replace(/^﻿/, '').trim();
  s = s.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```\s*$/m, '').trim();

  const attempts: string[] = [s];
  const start = s.search(/[\[{]/);
  if (start > -1) {
    const open = s[start];
    const end = s.lastIndexOf(open === '[' ? ']' : '}');
    if (end > start) attempts.push(s.slice(start, end + 1));
    attempts.push(s.slice(start));
  }

  for (const candidate of attempts) {
    for (const variant of [candidate, candidate.replace(/,(\s*[}\]])/g, '$1')]) {
      try { return JSON.parse(variant); } catch { /* try next */ }
    }
  }
  for (const candidate of attempts.slice(1)) {
    const repaired = repairTruncated(candidate);
    if (repaired) {
      try { return JSON.parse(repaired); } catch { /* give up below */ }
    }
  }
  throw new Error('Response was not valid JSON');
}

// ─── Small coercion helpers ────────────────────────────────────────────

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function num(v: unknown, fallback: number): number {
  const n = parseNumber(v);
  return n === null ? fallback : n;
}

function titleCase(s: string): string {
  // Receipts are usually ALL CAPS; make them readable without touching mixed-case names.
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_, a, b) => a + b.toUpperCase());
}

// ─── Receipts ──────────────────────────────────────────────────────────

export interface ReceiptItem {
  name: string;
  quantity: number;
  unit: string;
  price: number;
  category: Category;
  /** Estimated days the item keeps once bought. null = shelf-stable. */
  shelfLifeDays: number | null;
}

export interface ParsedReceipt {
  store: string | null;
  date: string | null;
  /** Grand total printed on the receipt, if it could be read. */
  total: number | null;
  items: ReceiptItem[];
}

// Whole-name match only, so "Total 0% Greek Yoghurt" or "Tender Coconut Water" are kept.
const NON_ITEM = /^(sub\s*-?total|total|grand total|net total|total amount|vat|vat \d+%?|tax|change|cash|card|visa|mastercard|balance|balance due|discount|savings|rounding|tender|amount due|points|loyalty points|loyalty)[\s:.\-]*$/i;

export function sanitizeReceipt(raw: unknown): ParsedReceipt {
  let obj: any = raw;
  if (Array.isArray(raw)) obj = { items: raw };
  if (!obj || typeof obj !== 'object') throw new Error('Unexpected receipt format');

  const list: unknown[] = Array.isArray(obj.items) ? obj.items
    : Array.isArray(obj.products) ? obj.products
    : Array.isArray(obj.line_items) ? obj.line_items
    : [];

  const items: ReceiptItem[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as any;
    const name = titleCase(str(e.name ?? e.item ?? e.description));
    if (!name || NON_ITEM.test(name)) continue;

    let quantity = num(e.quantity ?? e.qty, 1);
    if (!(quantity > 0)) quantity = 1;
    const unit = normalizeUnit(e.unit);
    // Counted things come in whole numbers.
    if ((unit === 'pcs' || unit === 'dozen') && quantity !== Math.round(quantity)) {
      quantity = Math.max(1, Math.round(quantity));
    }

    let price = num(e.price ?? e.total_price ?? e.total ?? e.amount, 0);
    if (!(price >= 0)) price = 0;

    const category = normalizeCategory(e.category);
    // An explicit null (or a very long life) means "shelf-stable": don't invent a date for
    // canned tuna just because it is Protein. Only guess when the model gave nothing usable.
    const shelfProvided = 'shelf_life_days' in e || 'shelfLifeDays' in e;
    const shelfValue = 'shelf_life_days' in e ? e.shelf_life_days : e.shelfLifeDays;
    const rawShelf = parseNumber(shelfValue);
    const shelfLifeDays = rawShelf !== null && rawShelf >= 1
      ? (rawShelf <= 365 ? Math.round(rawShelf) : null)
      : shelfProvided && shelfValue === null
        ? null
        : TYPICAL_SHELF_LIFE[category] ?? null;

    items.push({
      name,
      quantity: Math.round(quantity * 1000) / 1000,
      unit,
      price: Math.round(price * 100) / 100,
      category,
      shelfLifeDays,
    });
  }

  const total = parseNumber(obj.total ?? obj.grand_total);
  const dateStr = str(obj.date);
  return {
    store: str(obj.store ?? obj.merchant) || null,
    date: /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : null,
    total: total !== null && total > 0 ? Math.round(total * 100) / 100 : null,
    items,
  };
}

// ─── Recipes ───────────────────────────────────────────────────────────

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
  calories_percent?: number;
  protein_percent?: number;
  match_score: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Validate recipes and recompute ingredient availability from the real
 * inventory instead of trusting the model's "available" flags.
 */
export function sanitizeRecipes(raw: unknown, inventory: StockItem[], fallbackServings = 2): AIRecipeSuggestion[] {
  let list: unknown = raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as any;
    list = o.recipes ?? o.suggestions ?? o.results ?? [raw];
  }
  if (!Array.isArray(list)) throw new Error('Unexpected recipe format');

  const recipes: AIRecipeSuggestion[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const r = entry as any;
    const name = str(r.name ?? r.title);
    if (!name) continue;

    const rawIngredients: any[] = Array.isArray(r.ingredients) ? r.ingredients : [];
    const needs = rawIngredients
      .filter(i => i && typeof i === 'object' && str(i.name))
      .map(i => {
        const q = num(i.quantity, 1);
        return { name: str(i.name), quantity: q > 0 ? q : 1, unit: str(i.unit, 'pcs') };
      });
    if (needs.length === 0) continue;

    const plan = planConsumption(needs, inventory);
    const ingredients = plan.map(line => {
      const { ingredient } = line;
      if (line.status === 'missing') return { ...ingredient, available: false, inInventory: 0 };
      if (line.status === 'unit_mismatch') {
        // We have it but can't compare amounts (e.g. "2 pcs" vs "1 kg") — assume enough.
        return { ...ingredient, available: true, inInventory: ingredient.quantity };
      }
      const onHand = Math.round((line.onHand ?? 0) * 100) / 100;
      return { ...ingredient, available: line.status === 'ok', inInventory: onHand };
    });

    const rawSteps: any[] = Array.isArray(r.steps) ? r.steps : Array.isArray(r.instructions) ? r.instructions : [];
    const steps = rawSteps
      .map((s, idx) => {
        const instruction = typeof s === 'string' ? s.trim() : str(s?.instruction ?? s?.text ?? s?.description);
        if (!instruction) return null;
        const duration = typeof s === 'object' ? parseNumber(s?.duration_minutes) : null;
        return {
          step: idx + 1,
          instruction,
          duration_minutes: duration !== null && duration > 0 ? Math.round(duration) : undefined,
          needs_timer: typeof s === 'object' ? s?.needs_timer === true : false,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((s, idx) => ({ ...s, step: idx + 1 }));
    if (steps.length === 0) continue;

    const servings = Math.max(1, Math.round(num(r.servings, fallbackServings)));
    const pct = (v: unknown) => {
      const n = parseNumber(v);
      return n !== null && n > 0 ? Math.round(n) : undefined;
    };

    recipes.push({
      name,
      description: str(r.description),
      difficulty: clamp(Math.round(num(r.difficulty, 5)), 1, 10),
      prep_time_minutes: Math.max(0, Math.round(num(r.prep_time_minutes, 0))),
      cook_time_minutes: Math.max(0, Math.round(num(r.cook_time_minutes, 0))),
      servings,
      cuisine: str(r.cuisine),
      ingredients,
      steps,
      estimated_cost: Math.max(0, num(r.estimated_cost, 0)),
      calories: Math.max(0, Math.round(num(r.calories, 0))),
      protein_grams: Math.max(0, Math.round(num(r.protein_grams, 0))),
      calories_percent: pct(r.calories_percent),
      protein_percent: pct(r.protein_percent),
      match_score: clamp(Math.round(num(r.match_score, 0)), 0, 100),
    });
  }
  return recipes.sort((a, b) => b.match_score - a.match_score);
}

// ─── Monthly shopping list ─────────────────────────────────────────────

export interface MonthlyListItem {
  name: string;
  quantity: number;
  unit: string;
  category: Category;
  estimated_price: number;
  reason: string;
}

export function sanitizeMonthlyList(raw: unknown): MonthlyListItem[] {
  let list: unknown = raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as any;
    list = o.items ?? o.list ?? o.shopping_list;
  }
  if (!Array.isArray(list)) throw new Error('Unexpected list format');
  const items: MonthlyListItem[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as any;
    const name = str(e.name);
    if (!name) continue;
    const quantity = num(e.quantity, 1);
    items.push({
      name,
      quantity: quantity > 0 ? quantity : 1,
      unit: normalizeUnit(e.unit),
      category: normalizeCategory(e.category),
      estimated_price: Math.max(0, num(e.estimated_price ?? e.price, 0)),
      reason: str(e.reason),
    });
  }
  return items;
}

// ─── Error messages ────────────────────────────────────────────────────

export function isModelUnavailable(error: unknown): boolean {
  const msg = String((error as any)?.message || error || '').toLowerCase();
  const status = (error as any)?.status;
  return status === 404
    || /\[404\b/.test(msg)
    || msg.includes('is not found for api version')
    || msg.includes('is not supported for generatecontent')
    || msg.includes('no longer available')
    || msg.includes('has been deprecated');
}

export function isTransient(error: unknown): boolean {
  const msg = String((error as any)?.message || error || '').toLowerCase();
  const status = (error as any)?.status;
  return status === 503 || status === 500 || /\[50[03]\b/.test(msg) || msg.includes('overloaded') || msg.includes('unavailable');
}

/** Turn SDK / network errors into something a person can act on. */
export function friendlyAIError(error: unknown, action = 'reach the AI'): string {
  const raw = String((error as any)?.message || error || '');
  const msg = raw.toLowerCase();
  const status = (error as any)?.status;

  if (msg.includes('api key not set')) return raw;
  if (msg.includes('api key not valid') || msg.includes('api_key_invalid') || msg.includes('permission_denied') || status === 403 || /\[40[13]\b/.test(msg)) {
    return 'Your Gemini API key was rejected. Check it in Settings → App Settings.';
  }
  if (status === 429 || /\[429\b/.test(msg) || msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('rate limit')) {
    return 'Gemini rate limit reached. Wait a minute and try again, or pick a lighter model in Settings.';
  }
  if (isModelUnavailable(error)) {
    return 'The selected AI model is not available for your API key. Pick another model in Settings → App Settings.';
  }
  if (isTransient(error)) return 'Gemini is busy right now. Please try again in a moment.';
  if (msg.includes('network request failed') || msg.includes('failed to fetch') || msg.includes('timeout') || msg.includes('timed out') || msg.includes('abort')) {
    return `Couldn't ${action} — the connection dropped or timed out. Check your internet and try again.`;
  }
  if (msg.includes('safety') || msg.includes('blocked') || msg.includes('recitation')) {
    return 'The AI declined to process this request. Try again or rephrase.';
  }
  if (msg.includes('not valid json') || msg.includes('unexpected') || msg.includes('empty response')) {
    return 'The AI sent back something unreadable. Please try again.';
  }
  return raw || `Couldn't ${action}. Please try again.`;
}
