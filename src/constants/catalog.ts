// Plain data shared by UI and parsing code (no React Native imports).

export const CATEGORIES = [
  'Protein', 'Dairy', 'Vegetable', 'Fruit', 'Grain',
  'Spice', 'Beverage', 'Snack', 'Condiment', 'Frozen', 'Other',
] as const;

export type Category = typeof CATEGORIES[number];

export const UNITS = [
  'pcs', 'g', 'kg', 'mg', 'ml', 'L', 'cup', 'tbsp', 'tsp', 'oz', 'lb', 'dozen', '%',
] as const;

/** The units people actually pick; the rest sit behind "More". */
export const COMMON_UNITS = ['pcs', 'g', 'kg', 'ml', 'L', 'dozen'] as const;

export const CATEGORY_ICONS: Record<string, string> = {
  Protein: 'food-drumstick',
  Dairy: 'cheese',
  Vegetable: 'carrot',
  Fruit: 'food-apple',
  Grain: 'bread-slice',
  Spice: 'shaker',
  Beverage: 'cup',
  Snack: 'cookie',
  Condiment: 'bottle-tonic',
  Frozen: 'snowflake',
  Other: 'package-variant',
};

export const CATEGORY_COLORS: Record<string, string> = {
  Protein: '#EF6461',
  Dairy: '#F2B441',
  Vegetable: '#5FBF6B',
  Fruit: '#EC5F8E',
  Grain: '#C99A5B',
  Spice: '#F2794B',
  Beverage: '#4AA3F0',
  Snack: '#A869D6',
  Condiment: '#2FB3A3',
  Frozen: '#3CC3DB',
  Other: '#8496A3',
};

const CATEGORY_ALIASES: Record<string, Category> = {
  protein: 'Protein', proteins: 'Protein', meat: 'Protein', meats: 'Protein', poultry: 'Protein',
  fish: 'Protein', seafood: 'Protein', egg: 'Protein', eggs: 'Protein', chicken: 'Protein',
  dairy: 'Dairy', milk: 'Dairy', cheese: 'Dairy',
  vegetable: 'Vegetable', vegetables: 'Vegetable', veg: 'Vegetable', veggies: 'Vegetable', produce: 'Vegetable', herbs: 'Vegetable',
  fruit: 'Fruit', fruits: 'Fruit',
  grain: 'Grain', grains: 'Grain', bakery: 'Grain', bread: 'Grain', pasta: 'Grain', rice: 'Grain', cereal: 'Grain', cereals: 'Grain',
  spice: 'Spice', spices: 'Spice', seasoning: 'Spice', seasonings: 'Spice',
  beverage: 'Beverage', beverages: 'Beverage', drink: 'Beverage', drinks: 'Beverage', juice: 'Beverage',
  snack: 'Snack', snacks: 'Snack', confectionery: 'Snack', sweets: 'Snack', chocolate: 'Snack',
  condiment: 'Condiment', condiments: 'Condiment', sauce: 'Condiment', sauces: 'Condiment', oil: 'Condiment', oils: 'Condiment',
  frozen: 'Frozen', 'frozen food': 'Frozen', 'frozen foods': 'Frozen',
  other: 'Other', others: 'Other', misc: 'Other', pantry: 'Other', canned: 'Other',
};

export function normalizeCategory(raw: unknown): Category {
  if (typeof raw !== 'string') return 'Other';
  const key = raw.trim().toLowerCase();
  if (CATEGORY_ALIASES[key]) return CATEGORY_ALIASES[key];
  const first = key.split(/[\s/&,]+/)[0];
  return CATEGORY_ALIASES[first] || 'Other';
}
