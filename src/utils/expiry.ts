// Expiry dates are stored as local calendar days ("YYYY-MM-DD").
// Everything here works in whole local days so an item that expires today
// is "today", not "expired since midnight UTC".

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse "YYYY-MM-DD" (or an ISO timestamp) as a local date at midnight. */
export function parseDateStr(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

export function addDays(days: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return toDateStr(d);
}

/** Whole days from today until the date. 0 = today, negative = past. null = no date. */
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = parseDateStr(dateStr);
  if (!d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export type ExpiryStatus = 'none' | 'expired' | 'soon' | 'ok';

/** "soon" means today through 3 days from now. */
export function expiryStatus(dateStr: string | null | undefined): ExpiryStatus {
  const days = daysUntil(dateStr);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= 3) return 'soon';
  return 'ok';
}

export function expiryLabel(dateStr: string | null | undefined): string {
  const days = daysUntil(dateStr);
  if (days === null) return '';
  if (days < -1) return `Expired ${-days}d ago`;
  if (days === -1) return 'Expired yesterday';
  if (days === 0) return 'Use today';
  if (days === 1) return '1 day left';
  if (days < 14) return `${days} days left`;
  if (days < 60) return `${Math.round(days / 7)} wks left`;
  return `${Math.round(days / 30)} mo left`;
}

export function formatDate(dateStr: string): string {
  const d = parseDateStr(dateStr);
  if (!d) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** How long food keeps in the freezer at good quality, in days. */
const FREEZER_LIFE: Record<string, number> = {
  Protein: 180,   // raw meat, poultry, fish: about 6 months
  Vegetable: 240,
  Fruit: 240,
  Dairy: 90,
  Grain: 90,      // bread, cooked rice
  Frozen: 180,
};

export function freezerDays(category: string): number {
  return FREEZER_LIFE[category] ?? 120;
}

/** Once thawed in the fridge, use within this many days. */
export const THAWED_DAYS = 2;

/** Typical refrigerated shelf life in days. null = shelf-stable, don't guess. */
export const TYPICAL_SHELF_LIFE: Record<string, number | null> = {
  Protein: 3,
  Dairy: 7,
  Vegetable: 7,
  Fruit: 7,
  Grain: null,
  Spice: null,
  Beverage: null,
  Snack: null,
  Condiment: null,
  Frozen: 90,
  Other: null,
};
