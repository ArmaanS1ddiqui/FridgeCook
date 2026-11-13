// Unit helpers shared by inventory, cooking and receipt scanning.

const TO_GRAMS: Record<string, number> = {
  g: 1, kg: 1000, mg: 0.001, oz: 28.3495, lb: 453.592,
};
const TO_ML: Record<string, number> = {
  ml: 1, L: 1000, cup: 236.588, tbsp: 14.787, tsp: 4.929,
};

const UNIT_ALIASES: Record<string, string> = {
  // weight
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g', gr: 'g',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  mg: 'mg',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  // volume
  ml: 'ml', millilitre: 'ml', milliliter: 'ml', millilitres: 'ml', milliliters: 'ml',
  l: 'L', lt: 'L', ltr: 'L', ltrs: 'L', litre: 'L', liter: 'L', litres: 'L', liters: 'L',
  cup: 'cup', cups: 'cup',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  // count
  pcs: 'pcs', pc: 'pcs', piece: 'pcs', pieces: 'pcs', each: 'pcs', ea: 'pcs', unit: 'pcs', units: 'pcs',
  x: 'pcs', nos: 'pcs', no: 'pcs', item: 'pcs', items: 'pcs', whole: 'pcs',
  pack: 'pcs', packs: 'pcs', packet: 'pcs', packets: 'pcs', pkt: 'pcs', pk: 'pcs',
  bottle: 'pcs', bottles: 'pcs', btl: 'pcs', can: 'pcs', cans: 'pcs', tin: 'pcs', tins: 'pcs',
  box: 'pcs', boxes: 'pcs', bag: 'pcs', bags: 'pcs', jar: 'pcs', jars: 'pcs', tub: 'pcs',
  bunch: 'pcs', bunches: 'pcs', loaf: 'pcs', loaves: 'pcs', carton: 'pcs', cartons: 'pcs',
  tray: 'pcs', clove: 'pcs', cloves: 'pcs', slice: 'pcs', slices: 'pcs', head: 'pcs', stick: 'pcs', sticks: 'pcs',
  dozen: 'dozen', dz: 'dozen', doz: 'dozen',
  '%': '%',
};

/** Map any free-text unit ("Kgs", "litre", "packet") to one of the app's units. */
export function normalizeUnit(raw: unknown): string {
  if (typeof raw !== 'string') return 'pcs';
  const trimmed = raw.trim();
  if (trimmed === 'L') return 'L';
  const key = trimmed.toLowerCase().replace(/\./g, '');
  return UNIT_ALIASES[key] || 'pcs';
}

// Units that are a fraction of an item ("2 cloves" of a garlic bulb) or have no fixed size.
const VAGUE_UNITS = new Set([
  'clove', 'cloves', 'slice', 'slices', 'stick', 'sticks', 'sprig', 'sprigs', 'pinch', 'pinches',
  'dash', 'dashes', 'handful', 'handfuls', 'leaf', 'leaves', 'stalk', 'stalks', 'drop', 'drops', 'knob',
]);

/**
 * Whether a recipe unit is something we can safely subtract from stock.
 * "pinch", "to taste", "2 cloves" or an unknown word are not: guessing would
 * turn "1 pinch of salt" into "1 whole pack of salt".
 */
export function isMeasurableUnit(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (trimmed === 'L') return true;
  const key = trimmed.toLowerCase().replace(/\./g, '');
  return !!UNIT_ALIASES[key] && !VAGUE_UNITS.has(key);
}

export type UnitType = 'weight' | 'volume' | 'count' | 'percent';

export function unitType(unit: string): UnitType {
  const u = normalizeUnit(unit);
  if (TO_GRAMS[u]) return 'weight';
  if (TO_ML[u]) return 'volume';
  if (u === '%') return 'percent';
  return 'count';
}

/** Convert between units. Returns null when the units measure different things. */
export function convertUnit(value: number, fromUnit: string, toUnit: string): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return value;
  if (TO_GRAMS[from] && TO_GRAMS[to]) return (value * TO_GRAMS[from]) / TO_GRAMS[to];
  if (TO_ML[from] && TO_ML[to]) return (value * TO_ML[from]) / TO_ML[to];
  if (from === 'dozen' && to === 'pcs') return value * 12;
  if (from === 'pcs' && to === 'dozen') return value / 12;
  return null;
}

/** Round away float noise and drop trailing zeros: 0.30000000004 -> "0.3". */
export function formatQty(n: number): string {
  if (!isFinite(n)) return '0';
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

export function formatAmount(quantity: number, unit: string): string {
  return unit === '%' ? `${formatQty(quantity)}%` : `${formatQty(quantity)} ${unit}`;
}

/**
 * Parse user-typed or AI-returned numbers. Handles "1,5", "AED 12.50", "2 x", "1,234.50".
 * Returns null when nothing numeric is present.
 */
export function parseTyped(raw: string): number | null {
  // Someone typing "1,250" on a comma-decimal keyboard means 1.25, not 1250.
  return parseNumber(raw.includes('.') ? raw : raw.replace(',', '.'));
}

export function parseNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  // Take the first number in the text, so "Dhs. 12.50" reads as 12.50 and not ".12.50".
  const token = /-?\d[\d.,]*/.exec(raw);
  if (!token) return null;
  let s = token[0].replace(/[.,]+$/, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Both present: the later one is the decimal separator.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // Only commas: "1,5" is a decimal, "1,234" is a thousands separator.
    const decimals = s.length - lastComma - 1;
    const single = s.indexOf(',') === lastComma;
    const thousands = decimals === 3 && !/^-?0,/.test(s);
    s = !single || thousands ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

/** Sensible step for +/- buttons given a unit and the amount on hand. */
export function stepFor(unit: string, quantity: number): number {
  const u = normalizeUnit(unit);
  if (u === 'g' || u === 'ml') return quantity > 500 ? 100 : quantity > 100 ? 50 : 10;
  if (u === 'kg' || u === 'L') return quantity > 2 ? 0.5 : 0.25;
  if (u === '%') return 10;
  if (u === 'pcs' || u === 'dozen') return 1;
  return 1;
}
