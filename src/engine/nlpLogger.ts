import { emptyMicros, scaleMicros } from '../data/coreFoods';
import type { FoodItem, FoodLogEntry } from '../types';

export interface ParsedMealDraftItem {
  food: FoodItem;
  grams: number;
  servingLabel: string;
  servingQty: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  half: 0.5,
};

/**
 * Deterministic 100% local natural-language meal parser (requires ZERO internet or API key).
 * Examples:
 *  "3 large eggs, 2 slices sourdough bread, 10g butter, and 1 medium banana"
 *  "200g chicken breast + 1 cup jasmine rice + 1 tbsp olive oil"
 */
export function parseNaturalMealOffline(
  input: string,
  catalog: FoodItem[]
): ParsedMealDraftItem[] {
  const segments = input
    .split(/,|\+|\band\b|\bwith\b|\n|;/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);

  const results: ParsedMealDraftItem[] = [];

  for (const rawSeg of segments) {
    const seg = rawSeg.toLowerCase();

    // Check explicit gram / oz weight first: e.g. "200g chicken breast" or "6 oz sirloin"
    let explicitGrams: number | null = null;
    let qty = 1;
    let cleanedQuery = seg;

    const gramMatch = seg.match(/(\d+(?:\.\d+)?)\s*(?:g|grams|gram|ml)\b/);
    const ozMatch = seg.match(/(\d+(?:\.\d+)?)\s*(?:oz|ounce|ounces)\b/);

    if (gramMatch) {
      explicitGrams = parseFloat(gramMatch[1]);
      cleanedQuery = seg.replace(gramMatch[0], ' ').trim();
    } else if (ozMatch) {
      explicitGrams = parseFloat(ozMatch[1]) * 28.35;
      cleanedQuery = seg.replace(ozMatch[0], ' ').trim();
    } else {
      const numMatch = seg.match(/^(\d+(?:\.\d+)?|\ba\b|\ban\b|\bone\b|\btwo\b|\bthree\b|\bfour\b|\bfive\b|\bhalf\b)\s+/);
      if (numMatch) {
        const token = numMatch[1];
        qty = NUMBER_WORDS[token] ?? (parseFloat(token) || 1);
        cleanedQuery = seg.slice(numMatch[0].length).trim();
      }
    }

    // Strip unit words from food search tokens
    const unitHint = cleanedQuery.match(
      /\b(cup|cups|tbsp|tablespoon|tsp|teaspoon|slice|slices|scoop|scoops|fillet|breast|bar|medium|large|container|bowl)\b/
    )?.[1];

    const searchTerms = cleanedQuery
      .replace(
        /\b(cup|cups|tbsp|tablespoon|tsp|teaspoon|slice|slices|scoop|scoops|of|cooked|raw|plain|fresh)\b/g,
        ' '
      )
      .split(/\s+/)
      .map((t) => t.replace(/s$/, '')) // simple singularization
      .filter((t) => t.length >= 2);

    if (searchTerms.length === 0) continue;

    // Score catalog items
    let bestFood: FoodItem | null = null;
    let bestScore = 0;

    for (const item of catalog) {
      const hay = `${item.name} ${item.brand || ''}`.toLowerCase();
      let score = 0;
      for (const term of searchTerms) {
        if (hay.includes(term)) {
          score += term.length >= 4 ? 12 : 6;
          if (hay.startsWith(term)) score += 6;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestFood = item;
      }
    }

    if (!bestFood || bestScore < 6) continue;

    let grams = 100;
    let servingLabel = '100 g';
    let servingQty = 1;

    if (explicitGrams !== null) {
      grams = explicitGrams;
      servingLabel = '100 g';
      servingQty = Math.round((explicitGrams / 100) * 100) / 100;
    } else {
      // Match unitHint against food's natural servings
      let chosenServing = bestFood.servings[0];
      if (unitHint) {
        const matchedS = bestFood.servings.find((s) =>
          s.label.toLowerCase().includes(unitHint.replace(/s$/, ''))
        );
        if (matchedS) chosenServing = matchedS;
      }
      // Special handling when serving already has a count like "2 slices (90g)"
      const singleServing = bestFood.servings.find((s) =>
        /^1\s+/.test(s.label) && s.label !== '100 g' && !s.label.startsWith('1 oz')
      );
      if (singleServing && !unitHint) {
        chosenServing = singleServing;
      }
      grams = chosenServing.grams * qty;
      servingLabel = chosenServing.label;
      servingQty = qty;
    }

    const factor = grams / 100;
    results.push({
      food: bestFood,
      grams: Math.round(grams * 10) / 10,
      servingLabel,
      servingQty,
      calories: Math.round(bestFood.caloriesPer100g * factor),
      protein: Math.round(bestFood.proteinPer100g * factor * 10) / 10,
      carbs: Math.round(bestFood.carbsPer100g * factor * 10) / 10,
      fat: Math.round(bestFood.fatPer100g * factor * 10) / 10,
    });
  }

  return results;
}

export function draftItemsToLogEntries(
  items: ParsedMealDraftItem[],
  date: string,
  hour: number
): FoodLogEntry[] {
  return items.map((it, idx) => {
    const factor = it.grams / 100;
    return {
      id: `log-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      date,
      hour,
      foodId: it.food.id,
      foodName: it.food.name,
      brand: it.food.brand,
      grams: it.grams,
      servingLabel: it.servingLabel,
      servingQty: it.servingQty,
      calories: it.calories,
      protein: it.protein,
      carbs: it.carbs,
      fat: it.fat,
      micros: scaleMicros(it.food.microsPer100g || emptyMicros(), factor),
    };
  });
}

/**
 * Optional BYOK Gemini API helper (runs directly in browser -> generativelanguage.googleapis.com)
 */
export async function analyzeWithGeminiBYOK(params: {
  apiKey: string;
  prompt: string;
  imageBase64?: string;
  imageMimeType?: string;
  contextSummary: string;
}): Promise<{
  reply: string;
  estimatedItems: Array<{
    name: string;
    grams: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number;
  }>;
}> {
  const parts: any[] = [
    {
      text: `You are Phase, an evidence-based, adherence-neutral nutrition & Adaptive TDEE coach (like MacroFactor).
User's current local context:
${params.contextSummary}

Respond strictly as valid JSON matching this exact schema:
{
  "reply": "Clear, concise, supportive coaching response or meal breakdown explanation",
  "estimatedItems": [
    { "name": "Food Name", "grams": 150, "calories": 248, "protein": 46.5, "carbs": 0, "fat": 5.4, "fiber": 0 }
  ]
}
Only populate "estimatedItems" if the user described a meal/food or uploaded a food/label photo they might want to log; otherwise return an empty array [].

User message: ${params.prompt}`,
    },
  ];

  if (params.imageBase64 && params.imageMimeType) {
    parts.push({
      inline_data: {
        mime_type: params.imageMimeType,
        data: params.imageBase64,
      },
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
    params.apiKey.trim()
  )}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API ${resp.status}: ${errText.slice(0, 180)}`);
  }

  const data = await resp.json();
  const rawText =
    data?.candidates?.[0]?.content?.parts?.[0]?.text || '{"reply":"No response","estimatedItems":[]}';
  const parsed = JSON.parse(rawText);
  return {
    reply: String(parsed.reply || ''),
    estimatedItems: Array.isArray(parsed.estimatedItems) ? parsed.estimatedItems : [],
  };
}
