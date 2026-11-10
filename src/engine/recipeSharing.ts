import type { FoodItem, Micronutrients, RecipeIngredient } from '../types';

const MICRO_KEYS: (keyof Micronutrients)[] = [
  'fiber',
  'sugar',
  'satFat',
  'sodium',
  'potassium',
  'calcium',
  'iron',
  'magnesium',
  'zinc',
  'vitC',
  'vitD',
  'vitB12',
];

type MicroTuple = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

interface CompactRecipePayloadV1 {
  v: 1;
  /** Recipe name */
  n: string;
  /** Number of servings */
  s: number;
  /** Servings list: [label, grams] */
  sv: [string, number][];
  /** Per-100g macros: [calories, protein, carbs, fat] */
  m: [number, number, number, number];
  /** Per-100g 12 micronutrients */
  mc: MicroTuple;
  /** Ingredients: [foodId, foodName, grams, cal, pro, carbs, fat, micros12] */
  i: [string, string, number, number, number, number, number, MicroTuple][];
}

function microsToTuple(m?: Partial<Micronutrients>): MicroTuple {
  return MICRO_KEYS.map((k) => Math.round(((m?.[k] as number) || 0) * 100) / 100) as MicroTuple;
}

function tupleToMicros(t?: number[]): Micronutrients {
  const out: Partial<Micronutrients> = {};
  MICRO_KEYS.forEach((k, idx) => {
    out[k] = typeof t?.[idx] === 'number' && Number.isFinite(t[idx]) ? t[idx] : 0;
  });
  return out as Micronutrients;
}

function utf8ToBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUtf8(b64url: string): string {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLen);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Encodes ONLY the recipe's nutritional & ingredient definition into a URL-safe
 * share token (`OPR1:...`). Never includes personal profile, weight, or diary data.
 */
export function encodeRecipeShareToken(recipe: FoodItem): string {
  const payload: CompactRecipePayloadV1 = {
    v: 1,
    n: recipe.name,
    s: recipe.recipeServings || 1,
    sv: (recipe.servings || [{ label: '100 g', grams: 100 }]).map((s) => [
      s.label,
      Math.round(s.grams * 10) / 10,
    ]),
    m: [
      Math.round(recipe.caloriesPer100g * 10) / 10,
      Math.round(recipe.proteinPer100g * 10) / 10,
      Math.round(recipe.carbsPer100g * 10) / 10,
      Math.round(recipe.fatPer100g * 10) / 10,
    ],
    mc: microsToTuple(recipe.microsPer100g),
    i: (recipe.recipeIngredients || []).map((ing) => [
      ing.foodId,
      ing.foodName,
      Math.round(ing.grams * 10) / 10,
      Math.round(ing.calories),
      Math.round(ing.protein * 10) / 10,
      Math.round(ing.carbs * 10) / 10,
      Math.round(ing.fat * 10) / 10,
      microsToTuple(ing.micros),
    ]),
  };

  return `OPR1:${utf8ToBase64Url(JSON.stringify(payload))}`;
}

/**
 * Extracts and decodes an `OPR1:...` recipe token from a full text message,
 * `#recipe=...` URL, or raw code string.
 */
export function decodeRecipeFromTextOrUrl(input: string): FoodItem | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Extract OPR1:<base64url> even if surrounded by SMS chat text or inside a URL hash
  const match = trimmed.match(/OPR1:([A-Za-z0-9\-_]+)/);
  if (!match) return null;

  try {
    const jsonStr = base64UrlToUtf8(match[1]);
    const parsed = JSON.parse(jsonStr) as CompactRecipePayloadV1;
    if (!parsed || parsed.v !== 1 || !parsed.n || !Array.isArray(parsed.m)) {
      return null;
    }

    const ingredients: RecipeIngredient[] = (parsed.i || []).map((row) => ({
      foodId: String(row[0] || 'custom'),
      foodName: String(row[1] || 'Ingredient'),
      grams: Number(row[2]) || 0,
      calories: Number(row[3]) || 0,
      protein: Number(row[4]) || 0,
      carbs: Number(row[5]) || 0,
      fat: Number(row[6]) || 0,
      micros: tupleToMicros(row[7]),
    }));

    const servings =
      Array.isArray(parsed.sv) && parsed.sv.length > 0
        ? parsed.sv.map(([label, grams]) => ({
            label: String(label || '1 serving'),
            grams: Math.max(1, Number(grams) || 100),
          }))
        : [{ label: '100 g', grams: 100 }];

    const numServings = Math.max(0.5, Number(parsed.s) || 1);

    // Deterministic content-based ID so importing the exact same recipe twice updates cleanly instead of duplicating
    const slug = parsed.n
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32);

    return {
      id: `recipe-shared-${slug || Date.now()}`,
      name: String(parsed.n).slice(0, 120),
      brand: `Shared Recipe · ${numServings} servings`,
      category: 'Saved Recipes',
      source: 'recipe',
      caloriesPer100g: Number(parsed.m[0]) || 0,
      proteinPer100g: Number(parsed.m[1]) || 0,
      carbsPer100g: Number(parsed.m[2]) || 0,
      fatPer100g: Number(parsed.m[3]) || 0,
      microsPer100g: tupleToMicros(parsed.mc),
      servings,
      favorite: true,
      recipeServings: numServings,
      recipeIngredients: ingredients,
    };
  } catch {
    return null;
  }
}

/**
 * Builds both a 1-tap shareable URL (when hosted on http/https such as GitHub Pages)
 * and a human-readable SMS/chat snippet containing the recipe macros + token.
 */
export function buildRecipeShareBundle(recipe: FoodItem): {
  token: string;
  shareUrl: string | null;
  shareText: string;
} {
  const token = encodeRecipeShareToken(recipe);
  const srv = recipe.servings[0] || { label: '1 serving', grams: 100 };
  const factor = srv.grams / 100;
  const kcal = Math.round(recipe.caloriesPer100g * factor);
  const pro = Math.round(recipe.proteinPer100g * factor);
  const fat = Math.round(recipe.fatPer100g * factor);
  const carb = Math.round(recipe.carbsPer100g * factor);

  const isWebOrigin =
    typeof window !== 'undefined' &&
    (window.location.protocol === 'https:' || window.location.protocol === 'http:') &&
    !window.location.hostname.endsWith('.e2b.app');

  const baseUrl = isWebOrigin
    ? `${window.location.origin}${window.location.pathname}`
    : null;

  const shareUrl = baseUrl ? `${baseUrl}#recipe=${token}` : null;

  const header = `🍳 ${recipe.name} (${srv.label}: ${kcal} kcal | ${pro}P · ${fat}F · ${carb}C)`;
  const shareText = shareUrl
    ? `${header}\nTap to add to your OpenPhase Recipes:\n${shareUrl}`
    : `${header}\nPaste into OpenPhase → Log Food → Recipes → Import Shared:\n${token}`;

  return { token, shareUrl, shareText };
}
