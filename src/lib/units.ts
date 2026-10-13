import { KG_PER_MEAL } from './config'

/**
 * Unit handling. Impact dashboards normalise all quantities to kilograms using
 * documented per-unit equivalents (approximations, configurable in code).
 */
export const UNITS = ['kg', 'g', 'litre', 'item', 'loaf', 'portion', 'tray', 'box', 'meal'] as const
export type Unit = (typeof UNITS)[number]

export const KG_PER_UNIT: Record<Unit, number> = {
  kg: 1,
  g: 0.001,
  litre: 0.95, // most rescued liquids (soups, milk) ≈ 0.95 kg/L
  item: 0.3,
  loaf: 0.4,
  portion: 0.3,
  tray: 1.2,
  box: 0.8,
  meal: 0.4,
}

export function toKg(quantity: number, unit: string): number {
  const factor = KG_PER_UNIT[unit as Unit] ?? 0.3
  return quantity * factor
}

/** Meals-equivalent estimate. 1 meal ≈ 0.4 kg (KG_PER_MEAL), i.e. meals = kg / 0.4. */
export function mealsFromKg(kg: number): number {
  return kg / KG_PER_MEAL
}

export function formatQty(quantity: number, unit: string): string {
  const rounded = Math.round(quantity * 100) / 100
  const label = quantity === 1 ? singular(unit) : unit
  return `${rounded} ${label}`
}

function singular(unit: string): string {
  if (unit === 'kg' || unit === 'g') return unit
  return unit.replace(/(s|es)$/, '')
}

export const ALLERGENS = [
  'GLUTEN',
  'CRUSTACEANS',
  'EGGS',
  'FISH',
  'PEANUTS',
  'SOY',
  'MILK',
  'TREE_NUTS',
  'CELERY',
  'MUSTARD',
  'SESAME',
  'SULPHITES',
  'LUPIN',
  'MOLLUSCS',
] as const

export const CATEGORIES = [
  'BAKED_GOODS',
  'PRODUCE',
  'PREPARED_MEALS',
  'DAIRY',
  'PACKAGED_GROCERY',
  'BEVERAGES',
  'OTHER',
] as const

export const STORAGE_TYPES = ['AMBIENT', 'CHILLED', 'FROZEN', 'HOT'] as const

export const PROVIDER_ORG_TYPES = ['BAKERY', 'GROCERY', 'CATERER', 'RESTAURANT', 'HOUSEHOLD'] as const
export const RECIPIENT_ORG_TYPES = ['FOOD_BANK', 'CHARITY', 'SHELTER', 'COMMUNITY_KITCHEN'] as const
export const ALL_ORG_TYPES = [...PROVIDER_ORG_TYPES, ...RECIPIENT_ORG_TYPES] as const
