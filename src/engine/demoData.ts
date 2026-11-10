import { CORE_FOODS, scaleMicros } from '../data/coreFoods';
import type {
  CheckInRecord,
  FoodItem,
  FoodLogEntry,
  UserProfile,
  WeightEntry,
} from '../types';
import { addDays, getTodayLocalStr } from './metabolism';

function makeLogFromCore(
  foodId: string,
  date: string,
  hour: number,
  grams: number,
  servingLabel: string,
  servingQty: number,
  idx: number
): FoodLogEntry {
  const f: FoodItem =
    CORE_FOODS.find((c) => c.id === foodId) || CORE_FOODS[0];
  const factor = grams / 100;
  return {
    id: `demo-log-${date}-${hour}-${idx}`,
    date,
    hour,
    foodId: f.id,
    foodName: f.name,
    brand: f.brand,
    grams: Math.round(grams * 10) / 10,
    servingLabel,
    servingQty: Math.round(servingQty * 100) / 100,
    calories: Math.round(f.caloriesPer100g * factor),
    protein: Math.round(f.proteinPer100g * factor * 10) / 10,
    carbs: Math.round(f.carbsPer100g * factor * 10) / 10,
    fat: Math.round(f.fatPer100g * factor * 10) / 10,
    micros: scaleMicros(f.microsPer100g, factor),
  };
}

// Deterministic pseudo-random so demo looks consistent & realistic
function seededNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function generateDemoDataset(todayStr = getTodayLocalStr()): {
  profile: UserProfile;
  weights: WeightEntry[];
  logs: FoodLogEntry[];
  customFoods: FoodItem[];
  partialDates: string[];
  checkIns: CheckInRecord[];
} {
  const profile: UserProfile = {
    name: 'Alex (35-Day Demo)',
    sex: 'male',
    age: 31,
    heightCm: 180, // ~5'11"
    startingWeightKg: 84.4, // ~186.1 lbs
    targetWeightKg: 78.0, // ~172.0 lbs
    activityMultiplier: 1.52,
    unitSystem: 'imperial',
    goalType: 'lose',
    goalRatePctPerWeek: -0.6,
    programStyle: 'coached',
    dietStyle: 'balanced',
    proteinTier: 'high',
    calorieCycling: 'training_rest',
    trainingDays: [1, 3, 5, 6], // Mon, Wed, Fri, Sat
    acceptedBaseTargets: {
      calories: 2110,
      protein: 182,
      carbs: 204,
      fat: 63,
    },
    lastCheckInDate: addDays(todayStr, -8), // Makes Weekly Check-In ready today!
    checkInDayOfWeek: 1,
    offlineOnlyMode: false,
    ewmaAlpha: 0.1,
    isDemoData: true,
  };

  const weights: WeightEntry[] = [];
  const logs: FoodLogEntry[] = [];

  // Simulate 35 days: [today - 34 .. today]
  let trueMassKg = 84.45;
  for (let d = -34; d <= 0; d++) {
    const date = addDays(todayStr, d);
    const dayIndex = d + 34; // 0..34
    const isToday = d === 0;

    // True metabolic expenditure slowly adapts from 2660 -> 2525 kcal as mass drops
    const trueTdee = 2660 - dayIndex * 3.8;

    // Build realistic meals for the day
    const mealVariant = dayIndex % 3;
    const dayEntries: FoodLogEntry[] = [];

    if (!isToday) {
      // Breakfast (8 AM)
      if (mealVariant === 0) {
        dayEntries.push(makeLogFromCore('core-egg-whole', date, 8, 150, '3 large eggs (150g)', 1, 1));
        dayEntries.push(makeLogFromCore('core-sourdough-bread', date, 8, 90, '2 slices (90g)', 1, 2));
        dayEntries.push(makeLogFromCore('core-butter', date, 8, 8, '1 pat / tsp (5g)', 1.6, 3));
        dayEntries.push(makeLogFromCore('core-blueberries', date, 8, 90, '100 g', 0.9, 4));
      } else if (mealVariant === 1) {
        dayEntries.push(makeLogFromCore('core-rolled-oats', date, 8, 65, '60 g dry', 1.08, 1));
        dayEntries.push(makeLogFromCore('core-whey-isolate', date, 8, 31, '1 scoop (31g)', 1, 2));
        dayEntries.push(makeLogFromCore('core-banana', date, 8, 118, '1 medium banana (118g)', 1, 3));
        dayEntries.push(makeLogFromCore('core-peanut-butter', date, 8, 16, '1 tbsp (16g)', 1, 4));
      } else {
        dayEntries.push(makeLogFromCore('core-greek-yogurt-0', date, 8, 227, '1 cup (227g)', 1, 1));
        dayEntries.push(makeLogFromCore('core-whey-isolate', date, 8, 31, '1 scoop (31g)', 1, 2));
        dayEntries.push(makeLogFromCore('core-strawberries', date, 8, 150, '1 cup halves (152g)', 1, 3));
        dayEntries.push(makeLogFromCore('core-almonds', date, 8, 24, '1 oz / ~23 almonds (28g)', 0.85, 4));
      }

      // Lunch (12 or 13 PM)
      if (mealVariant !== 2) {
        dayEntries.push(makeLogFromCore('core-chicken-breast', date, 12, 185, '1 breast (170g)', 1.09, 5));
        dayEntries.push(makeLogFromCore('core-jasmine-rice', date, 12, 210, '200 g', 1.05, 6));
        dayEntries.push(makeLogFromCore('core-avocado', date, 12, 68, '1/2 avocado (68g)', 1, 7));
        dayEntries.push(makeLogFromCore('core-broccoli', date, 12, 140, '1 cup (156g)', 0.9, 8));
      } else {
        dayEntries.push(makeLogFromCore('core-ground-turkey-93', date, 13, 170, '170 g', 1, 5));
        dayEntries.push(makeLogFromCore('core-sweet-potato', date, 13, 210, '200 g', 1.05, 6));
        dayEntries.push(makeLogFromCore('core-spinach', date, 13, 80, '100 g', 0.8, 7));
        dayEntries.push(makeLogFromCore('core-olive-oil', date, 13, 9, '10 g', 0.9, 8));
      }

      // Afternoon Snack (16 PM)
      const extraSnack = seededNoise(dayIndex + 100) > 0.45;
      dayEntries.push(makeLogFromCore('core-greek-yogurt-0', date, 16, 170, '170 g container', 1, 9));
      if (extraSnack) {
        dayEntries.push(makeLogFromCore('core-apple', date, 16, 182, '1 medium apple (182g)', 1, 10));
      }

      // Dinner (19 PM)
      const isWeekendSocial = dayIndex === 23; // High-sodium Saturday dinner causing water jump next morning!
      if (isWeekendSocial) {
        dayEntries.push(makeLogFromCore('core-sirloin-steak', date, 19, 240, '200 g', 1.2, 11));
        dayEntries.push(makeLogFromCore('core-pasta-cooked', date, 19, 280, '200 g cooked', 1.4, 12));
        dayEntries.push(makeLogFromCore('core-olive-oil', date, 19, 18, '1 tbsp (14g)', 1.3, 13));
        dayEntries.push(makeLogFromCore('core-dark-chocolate-85', date, 20, 28, '1 oz (28g)', 1, 14));
      } else if (dayIndex % 2 === 0) {
        dayEntries.push(makeLogFromCore('core-ground-beef-93', date, 19, 165, '150 g', 1.1, 11));
        dayEntries.push(makeLogFromCore('core-potato-russet', date, 19, 230, '200 g', 1.15, 12));
        dayEntries.push(makeLogFromCore('core-bell-pepper', date, 19, 119, '1 medium pepper (119g)', 1, 13));
        dayEntries.push(makeLogFromCore('core-olive-oil', date, 19, 7, '1 tsp (4.5g)', 1.55, 14));
      } else {
        dayEntries.push(makeLogFromCore('core-salmon-atlantic', date, 19, 160, '1 fillet (154g)', 1.04, 11));
        dayEntries.push(makeLogFromCore('core-jasmine-rice', date, 19, 190, '200 g', 0.95, 12));
        dayEntries.push(makeLogFromCore('core-asparagus', date, 19, 135, '150 g', 0.9, 13));
      }
    } else {
      // Today: Breakfast & Lunch logged so user has room left in today's macro bars to test logging!
      dayEntries.push(makeLogFromCore('core-egg-whole', date, 8, 100, '2 large eggs (100g)', 1, 1));
      dayEntries.push(makeLogFromCore('core-sourdough-bread', date, 8, 90, '2 slices (90g)', 1, 2));
      dayEntries.push(makeLogFromCore('core-greek-yogurt-0', date, 8, 170, '170 g container', 1, 3));
      dayEntries.push(makeLogFromCore('core-blueberries', date, 8, 80, '100 g', 0.8, 4));
      dayEntries.push(makeLogFromCore('core-chicken-breast', date, 12, 180, '1 breast (170g)', 1.06, 5));
      dayEntries.push(makeLogFromCore('core-jasmine-rice', date, 12, 200, '200 g', 1, 6));
      dayEntries.push(makeLogFromCore('core-broccoli', date, 12, 156, '1 cup (156g)', 1, 7));
    }

    // Leave 2 unlogged days (~day 11 & day 19) to demonstrate adherence-neutral gap handling
    const skipFoodDay = dayIndex === 11 || dayIndex === 19;
    if (!skipFoodDay) {
      logs.push(...dayEntries);
    }

    const dayIntake = skipFoodDay
      ? 2250
      : dayEntries.reduce((s, e) => s + e.calories, 0);

    // Update true mass via energy balance
    if (!isToday) {
      trueMassKg += (dayIntake - trueTdee) / 7700;
    }

    // Morning scale reading with realistic daily water noise + Day 24/25 sodium water retention spike
    const skipWeighIn = dayIndex === 6 || dayIndex === 15 || dayIndex === 28;
    if (!skipWeighIn) {
      const baseJitter = (seededNoise(dayIndex * 7 + 3) - 0.5) * 0.72; // +/- 0.36 kg (~0.8 lb)
      const sodiumSpike =
        dayIndex === 24 ? 0.88 : dayIndex === 25 ? 0.48 : dayIndex === 26 ? 0.15 : 0;
      const scaleKg = Math.round((trueMassKg + baseJitter + sodiumSpike) * 100) / 100;
      weights.push({
        date,
        weightKg: scaleKg,
        note:
          dayIndex === 24
            ? 'Post-restaurant sodium water retention (+1.9 lbs scale jump — watch EWMA ignore it!)'
            : undefined,
      });
    }
  }

  const checkIns: CheckInRecord[] = [
    {
      id: 'demo-ci-1',
      date: addDays(todayStr, -22),
      previousCalories: 2210,
      newCalories: 2155,
      measuredTdee: 2635,
      confidence: 74,
      trendWeightKg: 83.8,
      weeklyTrendDeltaKg: -0.44,
      action: 'accepted',
      note: 'Initial 2-week calibration locked onto empirical TDEE.',
    },
    {
      id: 'demo-ci-2',
      date: addDays(todayStr, -8),
      previousCalories: 2155,
      newCalories: 2110,
      measuredTdee: 2575,
      confidence: 89,
      trendWeightKg: 83.0,
      weeklyTrendDeltaKg: -0.48,
      action: 'accepted',
      note: 'Trimmed 45 kcal as body mass decreased.',
    },
  ];

  const sampleRecipe: FoodItem = {
    id: 'recipe-demo-turkey-chili',
    name: 'High-Protein Turkey Burrito Bowl Prep',
    brand: 'Saved Recipe · 4 servings',
    category: 'Saved Recipes',
    source: 'recipe',
    caloriesPer100g: 132,
    proteinPer100g: 12.1,
    carbsPer100g: 13.8,
    fatPer100g: 3.1,
    microsPer100g: {
      fiber: 2.9,
      sugar: 1.1,
      satFat: 0.8,
      sodium: 185,
      potassium: 265,
      calcium: 24,
      iron: 1.4,
      magnesium: 34,
      zinc: 1.4,
      vitC: 18,
      vitD: 0,
      vitB12: 0.52,
    },
    servings: [
      { label: '1 serving (410g)', grams: 410 },
      { label: '100 g cooked batch', grams: 100 },
      { label: 'Entire batch (1640g)', grams: 1640 },
    ],
    favorite: true,
    recipeServings: 4,
    recipeIngredients: [
      {
        foodId: 'core-ground-turkey-93',
        foodName: 'Ground Turkey, 93% Lean (Cooked) (600g)',
        grams: 600,
        calories: 1140,
        protein: 164.4,
        carbs: 0,
        fat: 49.8,
        micros: scaleMicros(CORE_FOODS.find((c) => c.id === 'core-ground-turkey-93')!.microsPer100g, 6),
      },
      {
        foodId: 'core-jasmine-rice',
        foodName: 'White Jasmine Rice, Cooked (600g)',
        grams: 600,
        calories: 780,
        protein: 16.2,
        carbs: 169.2,
        fat: 1.8,
        micros: scaleMicros(CORE_FOODS.find((c) => c.id === 'core-jasmine-rice')!.microsPer100g, 6),
      },
      {
        foodId: 'core-black-beans',
        foodName: 'Black Beans, Cooked (240g)',
        grams: 240,
        calories: 317,
        protein: 21.4,
        carbs: 56.9,
        fat: 1.2,
        micros: scaleMicros(CORE_FOODS.find((c) => c.id === 'core-black-beans')!.microsPer100g, 2.4),
      },
      {
        foodId: 'core-bell-pepper',
        foodName: 'Red Bell Pepper (200g)',
        grams: 200,
        calories: 62,
        protein: 2.0,
        carbs: 12.0,
        fat: 0.6,
        micros: scaleMicros(CORE_FOODS.find((c) => c.id === 'core-bell-pepper')!.microsPer100g, 2),
      },
    ],
  };

  return {
    profile,
    weights,
    logs,
    customFoods: [sampleRecipe],
    partialDates: [],
    checkIns,
  };
}

export function createFreshProfile(
  overrides?: Partial<UserProfile>
): UserProfile {
  return {
    name: 'My Profile',
    sex: 'male',
    age: 30,
    heightCm: 178,
    startingWeightKg: 81.6, // 180 lbs
    targetWeightKg: 74.8, // 165 lbs
    activityMultiplier: 1.3,
    unitSystem: 'imperial',
    goalType: 'lose',
    goalRatePctPerWeek: -0.65,
    programStyle: 'coached',
    dietStyle: 'balanced',
    proteinTier: 'high',
    calorieCycling: 'off',
    trainingDays: [1, 3, 5],
    acceptedBaseTargets: {
      calories: 2150,
      protein: 180,
      carbs: 215,
      fat: 63,
    },
    lastCheckInDate: getTodayLocalStr(),
    checkInDayOfWeek: 1,
    offlineOnlyMode: false,
    ewmaAlpha: 0.1,
    isDemoData: false,
    ...overrides,
  };
}
