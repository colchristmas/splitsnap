import type { Category, Charge, Item, Receipt } from './types'

// Starter lists. Ids are stable so keyword rules and learned choices survive
// renames; categories the user adds get random ids.
export const DEFAULT_CATEGORIES: Category[] = [
  ...[
    ['r:groceries', 'Groceries'],
    ['r:dining', 'Dining out'],
    ['r:takeout', 'Takeout & delivery'],
    ['r:coffee', 'Coffee & drinks'],
    ['r:household', 'Household & pharmacy'],
    ['r:travel', 'Travel & transport'],
    ['r:fun', 'Entertainment'],
    ['r:other', 'Other'],
  ].map(([id, name], order): Category => ({ id, kind: 'receipt', name, order })),
  ...[
    ['i:produce', 'Produce'],
    ['i:meat', 'Meat & seafood'],
    ['i:dairy', 'Dairy & eggs'],
    ['i:bakery', 'Bakery'],
    ['i:pantry', 'Pantry'],
    ['i:frozen', 'Frozen'],
    ['i:snacks', 'Snacks & sweets'],
    ['i:drinks', 'Drinks'],
    ['i:alcohol', 'Alcohol'],
    ['i:meals', 'Meals'],
    ['i:household', 'Household'],
    ['i:personal', 'Personal care'],
    ['i:other', 'Other'],
  ].map(([id, name], order): Category => ({ id, kind: 'item', name, order })),
]

const ITEM_RULES: Record<string, string[]> = {
  'i:produce': ['apple', 'banana', 'orange', 'lemon', 'lime', 'avocado', 'tomato', 'potato', 'onion', 'garlic', 'lettuce', 'spinach', 'kale', 'arugula', 'carrot', 'celery', 'cucumber', 'bell pepper', 'broccoli', 'cauliflower', 'berry', 'berries', 'strawberry', 'strawberries', 'blueberry', 'blueberries', 'raspberry', 'raspberries', 'grape', 'melon', 'watermelon', 'mango', 'pineapple', 'peach', 'peaches', 'pear', 'plum', 'cherry', 'cherries', 'cilantro', 'parsley', 'basil', 'mint', 'ginger', 'mushroom', 'zucchini', 'squash', 'corn', 'salad', 'greens', 'scallion', 'jalapeno', 'produce', 'fruit', 'veggie', 'vegetable', 'clementine', 'kiwi'],
  'i:meat': ['chicken', 'beef', 'pork', 'steak', 'bacon', 'sausage', 'ham', 'turkey', 'lamb', 'salmon', 'shrimp', 'fish', 'cod', 'tilapia', 'ground beef', 'meatball', 'chorizo', 'prosciutto', 'salami', 'pepperoni', 'deli', 'thigh', 'breast', 'wing', 'drumstick', 'seafood', 'crab', 'lobster', 'scallop'],
  'i:dairy': ['chocolate milk', 'fairlife', 'milk', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'feta', 'brie', 'yogurt', 'yoghurt', 'butter', 'cream', 'sour cream', 'cream cheese', 'egg', 'half and half', 'creamer', 'cottage cheese', 'kefir', 'ghee'],
  'i:bakery': ['bread', 'bagel', 'baguette', 'croissant', 'muffin', 'bun', 'tortilla', 'pita', 'sourdough', 'brioche', 'donut', 'doughnut', 'loaf', 'bakery', 'naan'],
  'i:pantry': ['rice', 'pasta', 'spaghetti', 'penne', 'noodle', 'flour', 'sugar', 'salt', 'black pepper', 'oil', 'olive oil', 'vinegar', 'sauce', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'salsa', 'soup', 'broth', 'stock', 'beans', 'lentil', 'chickpea', 'cereal', 'oats', 'oatmeal', 'granola', 'peanut butter', 'jam', 'jelly', 'honey', 'syrup', 'spice', 'seasoning', 'canned', 'coffee beans', 'ground coffee', 'tea bags', 'quinoa', 'couscous', 'ramen', 'basmati', 'jasmine rice'],
  'i:frozen': ['frozen', 'ice cream', 'haagen dazs', 'ben jerry', 'gelato', 'sorbet', 'popsicle', 'ice pop'],
  'i:snacks': ['oreo', 'doritos', 'cheetos', 'pringles', 'chips', 'crisps', 'cracker', 'pretzel', 'popcorn', 'cookie', 'candy', 'chocolate', 'gum', 'nuts', 'almonds', 'cashew', 'pistachio', 'trail mix', 'granola bar', 'protein bar', 'cake', 'brownie', 'tiramisu', 'cheesecake', 'dessert', 'pie', 'cupcake', 'snack', 'gummy', 'gummies'],
  'i:drinks': ['water', 'soda', 'cola', 'coke', 'pepsi', 'sprite', 'juice', 'lemonade', 'tea', 'iced tea', 'coffee', 'latte', 'espresso', 'cappuccino', 'americano', 'mocha', 'macchiato', 'kombucha', 'smoothie', 'seltzer', 'sparkling water', 'ginger ale', 'root beer', 'energy drink', 'gatorade', 'drink', 'beverage', 'boba', 'chai', 'oat milk', 'almond milk'],
  'i:alcohol': ['beer', 'wine', 'ipa', 'lager', 'ale', 'stout', 'pilsner', 'cider', 'vodka', 'whiskey', 'whisky', 'bourbon', 'tequila', 'rum', 'gin', 'margarita', 'mojito', 'cocktail', 'sangria', 'prosecco', 'champagne', 'hard seltzer', 'sake', 'mimosa', 'merlot', 'cabernet', 'pinot', 'chardonnay', 'sauvignon', 'riesling', 'negroni', 'spritz', 'martini'],
  'i:meals': ['pizza', 'burger', 'sandwich', 'wrap', 'burrito', 'taco', 'bowl', 'sushi', 'entree', 'appetizer', 'combo', 'meal', 'platter', 'fries', 'curry', 'pad thai', 'dumpling', 'quesadilla', 'nachos', 'kebab', 'gyro', 'poke'],
  'i:household': ['bounty', 'charmin', 'kleenex', 'clorox', 'lysol', 'paper towel', 'toilet paper', 'tissue', 'napkin', 'foil', 'plastic wrap', 'trash bag', 'garbage bag', 'sponge', 'detergent', 'dish soap', 'bleach', 'cleaner', 'wipes', 'laundry', 'dryer sheet', 'light bulb', 'battery', 'batteries', 'candle', 'ziploc', 'storage bag', 'dishwasher', 'paper plate', 'cups'],
  'i:personal': ['shampoo', 'conditioner', 'toothpaste', 'toothbrush', 'floss', 'deodorant', 'lotion', 'sunscreen', 'razor', 'shaving', 'body wash', 'hand soap', 'soap', 'vitamin', 'medicine', 'ibuprofen', 'tylenol', 'advil', 'bandage', 'tampon', 'makeup', 'cosmetic', 'mouthwash'],
}

const RECEIPT_RULES: Record<string, string[]> = {
  'r:groceries': ['market', 'grocery', 'groceries', 'supermarket', 'foods', 'trader joe', 'whole foods', 'star market', 'stop shop', 'shaws', 'hannaford', 'safeway', 'kroger', 'aldi', 'lidl', 'costco', 'wegmans', 'publix', 'h mart', 'instacart', 'fresh'],
  'r:dining': ['restaurant', 'grill', 'kitchen', 'bistro', 'diner', 'tavern', 'pub', 'bar', 'pizzeria', 'trattoria', 'sushi', 'taqueria', 'eatery', 'steakhouse', 'brasserie', 'cantina', 'plate', 'table', 'server'],
  'r:takeout': ['doordash', 'uber eats', 'grubhub', 'postmates', 'seamless', 'delivery', 'takeout', 'take out', 'to go'],
  'r:coffee': ['coffee', 'cafe', 'espresso', 'starbucks', 'dunkin', 'tea house', 'boba', 'roasters'],
  'r:household': ['cvs', 'walgreens', 'rite aid', 'pharmacy', 'target', 'walmart', 'home depot', 'lowes', 'ikea', 'hardware', 'dollar'],
  'r:travel': ['gas', 'fuel', 'shell', 'exxon', 'mobil', 'chevron', 'airline', 'airport', 'hotel', 'taxi', 'uber', 'lyft', 'parking', 'transit', 'mbta', 'amtrak'],
  'r:fun': ['cinema', 'theater', 'theatre', 'movie', 'amc', 'museum', 'bowling', 'tickets', 'concert', 'arcade'],
}

const GROCERY_ITEM_TYPES = new Set(['i:produce', 'i:meat', 'i:dairy', 'i:bakery', 'i:pantry', 'i:frozen', 'i:snacks', 'i:drinks', 'i:alcohol'])
const HOUSEHOLD_ITEM_TYPES = new Set(['i:household', 'i:personal'])
// At a restaurant, everything that isn't clearly a drink or dessert is a meal.
const RESTAURANT_RULES = ['i:alcohol', 'i:drinks', 'i:snacks']
const RESTAURANT_RECEIPTS = new Set(['r:dining', 'r:takeout'])

export interface CategoryMemory {
  /** Learned choices keyed by categoryKey(item name). */
  item: Map<string, string>
  /** Learned choices keyed by categoryKey(store name). */
  receipt: Map<string, string>
}

export const emptyMemory = (): CategoryMemory => ({ item: new Map(), receipt: new Map() })

/** Bump when the rules change, so saved receipts get re-guessed (manual picks are kept). */
export const CATEGORY_RULES_VERSION = 2

// Receipt printers abbreviate to fit: "FAIRLIF 2%CHC MLK", "BNLS CHKN BRST".
const ABBREVIATIONS: Record<string, string> = {
  mlk: 'milk', chc: 'chocolate', choc: 'chocolate', cho: 'chocolate', chcl: 'chocolate', chkn: 'chicken', chk: 'chicken',
  chck: 'chicken', chik: 'chicken', ckn: 'chicken', bnls: 'boneless', brst: 'breast', grnd: 'ground', bf: 'beef',
  trky: 'turkey', saus: 'sausage', ssg: 'sausage', bcn: 'bacon', chs: 'cheese', chz: 'cheese', ched: 'cheddar',
  mozz: 'mozzarella', parm: 'parmesan', yog: 'yogurt', ygrt: 'yogurt', yogrt: 'yogurt', yghrt: 'yogurt', btr: 'butter',
  crm: 'cream', frz: 'frozen', frzn: 'frozen', hgdz: 'ice cream', ckie: 'cookie', cki: 'cookie', crkr: 'cracker',
  chp: 'chips', chps: 'chips', tmto: 'tomato', bnna: 'banana', bna: 'banana', appl: 'apple', apl: 'apple', avoc: 'avocado',
  avcd: 'avocado', strwb: 'strawberry', strw: 'strawberry', blbry: 'blueberry', lttc: 'lettuce', spnch: 'spinach',
  onin: 'onion', grlc: 'garlic', ptto: 'potato', ppr: 'paper', twl: 'towel', twls: 'towels', tlt: 'toilet',
  dtrg: 'detergent', wtr: 'water', sprklg: 'sparkling', jce: 'juice', sda: 'soda', cofe: 'coffee', coff: 'coffee',
  bev: 'beverage', bvg: 'beverage', snk: 'snack', crl: 'cereal', cerl: 'cereal', psta: 'pasta', sce: 'sauce', brd: 'bread',
  bgl: 'bagel', shmp: 'shampoo', tthpst: 'toothpaste', deo: 'deodorant', vit: 'vitamin', fairlif: 'fairlife',
}

/** Normalizes a name for matching and learning: "Fairlif 2%Chc Mlk 52z" → "fairlif chc mlk". */
export function categoryKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    // Sizes and amounts: "2%", "16z", "12ct", "1 gal", "6pk"
    .replace(/\d+(?:[.,]\d+)?\s*(?:%|fl\s*oz|oz|z|lbs?|ct|pk|gal|qt|pt|ml|kg|g|l|in|pcs?)?\b/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim()
}

/** Spells out common receipt abbreviations so the keyword rules can match. */
function expand(key: string): string {
  return key
    .split(' ')
    .map((t) => ABBREVIATIONS[t] ?? t)
    .join(' ')
}

/** The rule whose keyword matches the most specifically (longest keyword wins). */
function bestRule(key: string, rules: Record<string, string[]>, only?: string[]): string | undefined {
  let best: { id: string; len: number } | undefined
  for (const [id, words] of Object.entries(rules)) {
    if (only && !only.includes(id)) continue
    for (const w of words) {
      if (w.length <= (best?.len ?? 0)) continue
      if (new RegExp(`\\b${w}(?:s|es)?\\b`).test(key)) best = { id, len: w.length }
    }
  }
  return best?.id
}

export function guessItemCategory(name: string, receiptCategoryId: string | undefined, memory: CategoryMemory): string {
  const learned = memory.item.get(categoryKey(name))
  if (learned) return learned
  const key = expand(categoryKey(name))
  // "Frozen" describes where it lives, whatever the food: frozen dumplings, frozen pizza.
  if (/\bfrozen\b/.test(key)) return 'i:frozen'
  if (receiptCategoryId && RESTAURANT_RECEIPTS.has(receiptCategoryId)) {
    return bestRule(key, ITEM_RULES, RESTAURANT_RULES) ?? 'i:meals'
  }
  return bestRule(key, ITEM_RULES) ?? (receiptCategoryId === 'r:coffee' ? 'i:drinks' : 'i:other')
}

export function guessReceiptCategory(
  input: { store: string; itemCategoryIds: (string | undefined)[]; charges: Pick<Charge, 'kind' | 'label'>[] },
  memory: CategoryMemory,
): string {
  const key = categoryKey(input.store)
  const learned = key && memory.receipt.get(key)
  if (learned) return learned
  const byStore = key ? bestRule(key, RECEIPT_RULES) : undefined
  if (byStore) return byStore

  const ids = input.itemCategoryIds.filter((id) => id && id !== 'i:other')
  const count = (set: Set<string>) => ids.filter((id) => set.has(id!)).length
  const meals = ids.filter((id) => id === 'i:meals').length
  const delivered = input.charges.some((c) => c.kind === 'fee' && /deliver/i.test(c.label))
  const tipped = input.charges.some((c) => c.kind === 'tip')

  // A tip without delivery means table service. Delivered orders (groceries
  // included) are told apart by what was bought.
  if (tipped && !delivered) return 'r:dining'
  if (ids.length > 0) {
    if (count(GROCERY_ITEM_TYPES) * 2 > ids.length) return 'r:groceries'
    if (count(HOUSEHOLD_ITEM_TYPES) * 2 > ids.length) return 'r:household'
    if (meals * 2 >= ids.length) return delivered ? 'r:takeout' : 'r:dining'
  }
  return tipped ? 'r:takeout' : 'r:other'
}

/**
 * Picks categories for a receipt and its items, leaving any the user chose
 * alone. Items are guessed first (they hint at the receipt type), then
 * re-guessed in restaurant context if the receipt turns out to be a meal out.
 */
export function categorize(
  receipt: Pick<Receipt, 'store' | 'charges' | 'categoryId' | 'categoryManual'> & {
    items: Pick<Item, 'name' | 'categoryId' | 'categoryManual'>[]
  },
  memory: CategoryMemory,
): { categoryId: string; itemCategoryIds: (string | undefined)[] } {
  const guessItems = (context?: string) =>
    receipt.items.map((i) => (i.categoryManual ? i.categoryId : i.name.trim() ? guessItemCategory(i.name, context, memory) : undefined))

  const firstPass = guessItems()
  const categoryId =
    receipt.categoryManual && receipt.categoryId
      ? receipt.categoryId
      : guessReceiptCategory({ store: receipt.store, itemCategoryIds: firstPass, charges: receipt.charges }, memory)
  const needsContext = RESTAURANT_RECEIPTS.has(categoryId) || categoryId === 'r:coffee'
  return { categoryId, itemCategoryIds: needsContext ? guessItems(categoryId) : firstPass }
}

/** Sorts by the category list's order, unknown/missing ids last. */
export function byCategoryOrder(categories: Map<string, Category>) {
  return (a: string | undefined, b: string | undefined) =>
    (categories.get(a ?? '')?.order ?? Infinity) - (categories.get(b ?? '')?.order ?? Infinity)
}
