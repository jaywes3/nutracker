export type UnitSystem = 'imperial' | 'metric';
export type Sex = 'male' | 'female' | 'neutral';
export type GoalType = 'lose' | 'maintain' | 'gain';
export type ProgramStyle = 'coached' | 'collaborative' | 'manual';
export type DietStyle = 'balanced' | 'high_carb' | 'low_carb' | 'keto';
export type ProteinTier = 'low' | 'moderate' | 'high' | 'extra_high';
export type CalorieCyclingMode = 'off' | 'training_rest';

export interface Micronutrients {
  fiber: number;      // g
  sugar: number;      // g
  satFat: number;     // g
  sodium: number;     // mg
  potassium: number;  // mg
  calcium: number;    // mg
  iron: number;       // mg
  magnesium: number;  // mg
  zinc: number;       // mg
  vitC: number;       // mg
  vitD: number;       // mcg
  vitB12: number;     // mcg
}

export interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface UserProfile {
  name: string;
  sex: Sex;
  age: number;
  heightCm: number;
  startingWeightKg: number;
  targetWeightKg: number;
  bodyFatPct?: number; // optional: uses Katch-McArdle lean-mass BMR when set
  activityMultiplier: number; // 1.2 - 1.9 initial prior
  unitSystem: UnitSystem;
  goalType: GoalType;
  /** Weekly rate in % of body weight per week (e.g. -0.6 for losing 0.6%/wk, +0.25 for lean bulk) */
  goalRatePctPerWeek: number;
  programStyle: ProgramStyle;
  dietStyle: DietStyle;
  proteinTier: ProteinTier;
  calorieCycling: CalorieCyclingMode;
  /** Days of week considered higher-calorie training days: 0=Sun..6=Sat */
  trainingDays: number[];
  /** Manual / accepted check-in baseline targets */
  acceptedBaseTargets: MacroTargets;
  lastCheckInDate: string | null;
  checkInDayOfWeek: number; // 0=Sun..6=Sat (default 1 = Monday)
  offlineOnlyMode: boolean;
  ewmaAlpha: number; // default 0.10 (~19-day half-life)
  isDemoData: boolean;
}

export interface ServingOption {
  label: string;
  grams: number;
}

export interface RecipeIngredient {
  foodId: string;
  foodName: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  micros: Micronutrients;
}

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  category?: string;
  barcode?: string;
  source: 'core' | 'usda' | 'off' | 'custom' | 'recipe' | 'ai';
  /** Per 100g nutritional values */
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  microsPer100g: Micronutrients;
  servings: ServingOption[];
  favorite?: boolean;
  recipeServings?: number;
  recipeIngredients?: RecipeIngredient[];
}

export interface FoodLogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  hour: number; // 0 - 23 (for MacroFactor-style hourly timeline)
  foodId: string;
  foodName: string;
  brand?: string;
  grams: number;
  servingLabel: string;
  servingQty: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  micros: Micronutrients;
}

export interface WeightEntry {
  date: string; // YYYY-MM-DD
  weightKg: number;
  note?: string;
}

export interface CheckInRecord {
  id: string;
  date: string;
  previousCalories: number;
  newCalories: number;
  measuredTdee: number;
  confidence: number;
  trendWeightKg: number;
  weeklyTrendDeltaKg: number;
  action: 'accepted' | 'overridden' | 'skipped';
  note: string;
}

export interface DailyComputedPoint {
  date: string;
  scaleWeightKg: number | null;
  interpolatedWeightKg: number;
  trendWeightKg: number;
  /** Change in trend weight over prior 7 days (kg/week) */
  weeklyTrendDeltaKg: number;
  loggedCalories: number;
  loggedProtein: number;
  loggedCarbs: number;
  loggedFat: number;
  loggedMicros: Micronutrients;
  hasFoodLog: boolean;
  isPartialDay: boolean;
  validNutritionDay: boolean;
  formulaTdee: number;
  rawEmpiricalTdee: number | null;
  expenditure: number; // Smoothed Adaptive TDEE
  expenditureLow: number;
  expenditureHigh: number;
  confidence: number; // 0 - 100
  confidenceBreakdown: {
    coverage: number;
    weightFreq: number;
    depth: number;
    stability: number;
  };
}

export interface NetworkAuditEvent {
  id: string;
  timestamp: string;
  destination: string;
  purpose: string;
  status: 'allowed' | 'blocked-offline';
}
