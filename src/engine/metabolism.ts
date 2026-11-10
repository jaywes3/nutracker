import { emptyMicros, sumMicros } from '../data/coreFoods';
import type {
  DailyComputedPoint,
  FoodLogEntry,
  MacroTargets,
  UserProfile,
  WeightEntry,
} from '../types';

export const KCAL_PER_KG_TISSUE = 7700; // ~3,500 kcal per lb
export const KG_TO_LBS = 2.2046226218;

export function kgToDisplay(kg: number, unitSystem: 'imperial' | 'metric'): number {
  return unitSystem === 'imperial'
    ? Math.round(kg * KG_TO_LBS * 10) / 10
    : Math.round(kg * 10) / 10;
}

export function displayToKg(val: number, unitSystem: 'imperial' | 'metric'): number {
  return unitSystem === 'imperial' ? val / KG_TO_LBS : val;
}

export function unitWeightLabel(unitSystem: 'imperial' | 'metric'): string {
  return unitSystem === 'imperial' ? 'lbs' : 'kg';
}

/** DST-safe YYYY-MM-DD arithmetic */
export function parseDateUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function formatDateUTC(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr: string, delta: number): string {
  const dt = parseDateUTC(dateStr);
  dt.setUTCDate(dt.getUTCDate() + delta);
  return formatDateUTC(dt);
}

export function daysBetween(a: string, b: string): number {
  const ms = parseDateUTC(b).getTime() - parseDateUTC(a).getTime();
  return Math.round(ms / 86400000);
}

export function getTodayLocalStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDayOfWeek(dateStr: string): number {
  return parseDateUTC(dateStr).getUTCDay(); // 0=Sun..6=Sat
}

/** Katch-McArdle (when bodyFatPct is provided) or Mifflin-St Jeor BMR */
export function calculateBMR(profile: UserProfile, weightKg: number): number {
  if (
    typeof profile.bodyFatPct === 'number' &&
    profile.bodyFatPct >= 4 &&
    profile.bodyFatPct <= 65
  ) {
    const leanMassKg = weightKg * (1 - profile.bodyFatPct / 100);
    return Math.max(950, Math.round(370 + 21.6 * leanMassKg));
  }
  const base = 10 * weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  const sexOffset =
    profile.sex === 'male' ? 5 : profile.sex === 'female' ? -161 : -78;
  return Math.max(950, Math.round(base + sexOffset));
}

export function calculateFormulaTdee(profile: UserProfile, weightKg: number): number {
  return Math.round(calculateBMR(profile, weightKg) * profile.activityMultiplier);
}

/**
 * Core longitudinal computation:
 * - Linearly interpolates missing weigh-ins
 * - Applies EWMA weight smoothing (alpha = profile.ewmaAlpha, default 0.10 -> ~19-day half-life)
 * - Evaluates 14-day rolling energy-balance expenditure:
 *     Empirical TDEE = AvgLoggedIntake - (DailyTrendSlopeKg * 7700)
 * - Smoothly blends formula prior -> empirical TDEE once >=5 complete days exist
 * - Computes 4-factor confidence score & uncertainty band
 */
export function computeDailySeries(
  profile: UserProfile,
  weights: WeightEntry[],
  logs: FoodLogEntry[],
  partialDates: string[],
  endDateStr: string
): DailyComputedPoint[] {
  const weightMap = new Map<string, number>();
  for (const w of weights) {
    if (w.weightKg > 20 && w.weightKg < 400) {
      weightMap.set(w.date, w.weightKg);
    }
  }

  const logsByDate = new Map<string, FoodLogEntry[]>();
  for (const l of logs) {
    const arr = logsByDate.get(l.date) || [];
    arr.push(l);
    logsByDate.set(l.date, arr);
  }
  const partialSet = new Set(partialDates);

  // Determine earliest date (at least 28 days window if data exists, or from earliest entry)
  const allDates = [
    ...Array.from(weightMap.keys()),
    ...Array.from(logsByDate.keys()),
  ].sort();

  const startDate =
    allDates.length > 0 && allDates[0] < addDays(endDateStr, -13)
      ? allDates[0]
      : addDays(endDateStr, -13);

  const totalDays = Math.max(1, Math.min(365, daysBetween(startDate, endDateStr) + 1));
  const dates: string[] = [];
  for (let i = 0; i < totalDays; i++) {
    dates.push(addDays(startDate, i));
  }

  // Linearly interpolate scale weights for smooth EWMA continuity
  const sortedWeightDates = Array.from(weightMap.keys()).sort();
  const interpWeights: number[] = dates.map((d) => {
    if (weightMap.has(d)) return weightMap.get(d)!;
    if (sortedWeightDates.length === 0) return profile.startingWeightKg;
    if (d <= sortedWeightDates[0]) return weightMap.get(sortedWeightDates[0])!;
    if (d >= sortedWeightDates[sortedWeightDates.length - 1]) {
      return weightMap.get(sortedWeightDates[sortedWeightDates.length - 1])!;
    }
    // Find surrounding known weigh-ins
    let prevD = sortedWeightDates[0];
    let nextD = sortedWeightDates[sortedWeightDates.length - 1];
    for (let k = 0; k < sortedWeightDates.length - 1; k++) {
      if (sortedWeightDates[k] <= d && sortedWeightDates[k + 1] >= d) {
        prevD = sortedWeightDates[k];
        nextD = sortedWeightDates[k + 1];
        break;
      }
    }
    const span = Math.max(1, daysBetween(prevD, nextD));
    const pos = daysBetween(prevD, d);
    const w0 = weightMap.get(prevD)!;
    const w1 = weightMap.get(nextD)!;
    return w0 + ((w1 - w0) * pos) / span;
  });

  // EWMA Trend Weight
  const alpha = Math.min(0.35, Math.max(0.05, profile.ewmaAlpha || 0.1));
  const trendWeights: number[] = [];
  for (let i = 0; i < dates.length; i++) {
    if (i === 0) {
      trendWeights.push(interpWeights[0]);
    } else {
      const prev = trendWeights[i - 1];
      // If an actual scale weight was recorded today, apply full alpha; if interpolated, gentle drift
      const effectiveAlpha = weightMap.has(dates[i]) ? alpha : alpha * 0.5;
      trendWeights.push(effectiveAlpha * interpWeights[i] + (1 - effectiveAlpha) * prev);
    }
  }

  const points: DailyComputedPoint[] = [];
  let prevExpenditure: number | null = null;

  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    const dayLogs = logsByDate.get(d) || [];
    const loggedCalories = Math.round(dayLogs.reduce((s, e) => s + e.calories, 0));
    const loggedProtein = Math.round(dayLogs.reduce((s, e) => s + e.protein, 0));
    const loggedCarbs = Math.round(dayLogs.reduce((s, e) => s + e.carbs, 0));
    const loggedFat = Math.round(dayLogs.reduce((s, e) => s + e.fat, 0));
    const loggedMicros = dayLogs.length > 0 ? sumMicros(dayLogs.map((e) => e.micros)) : emptyMicros();

    const hasFoodLog = dayLogs.length > 0 && loggedCalories > 0;
    const isPartialDay = partialSet.has(d);
    // Do not let today's half-finished diary distort today's TDEE unless calories >= 800
    const isToday = d === endDateStr;
    const validNutritionDay =
      hasFoodLog && !isPartialDay && (!isToday || loggedCalories >= 900);

    const trendW = trendWeights[i];
    const trend7Ago = i >= 7 ? trendWeights[i - 7] : trendWeights[0];
    const span7 = Math.max(1, Math.min(7, i));
    const weeklyTrendDeltaKg = i === 0 ? 0 : ((trendW - trend7Ago) / span7) * 7;

    const formulaTdee = calculateFormulaTdee(profile, trendW);

    // 14-day rolling window [i - 13 .. i]
    const winStart = Math.max(0, i - 13);
    const windowIndices: number[] = [];
    for (let j = winStart; j <= i; j++) windowIndices.push(j);

    const validIntakeDays: number[] = [];
    let weighInsInWindow = 0;
    for (const j of windowIndices) {
      const dj = dates[j];
      if (weightMap.has(dj)) weighInsInWindow++;
      const lj = logsByDate.get(dj) || [];
      const kcalJ = lj.reduce((s, e) => s + e.calories, 0);
      const isValidJ =
        kcalJ > 0 &&
        !partialSet.has(dj) &&
        (dj !== endDateStr || kcalJ >= 900);
      if (isValidJ) validIntakeDays.push(kcalJ);
    }

    // Ordinary least squares slope on trendWeights across the window (kg/day)
    let trendSlopeKgPerDay = 0;
    if (windowIndices.length >= 4) {
      const n = windowIndices.length;
      let sumX = 0,
        sumY = 0,
        sumXY = 0,
        sumXX = 0;
      for (let k = 0; k < n; k++) {
        const y = trendWeights[windowIndices[k]];
        sumX += k;
        sumY += y;
        sumXY += k * y;
        sumXX += k * k;
      }
      const denom = n * sumXX - sumX * sumX;
      if (denom > 0) {
        trendSlopeKgPerDay = (n * sumXY - sumX * sumY) / denom;
      }
    }

    let rawEmpiricalTdee: number | null = null;
    if (validIntakeDays.length >= 5 && weighInsInWindow >= 2) {
      const avgIntake =
        validIntakeDays.reduce((a, b) => a + b, 0) / validIntakeDays.length;
      const dailyEnergyBalance = trendSlopeKgPerDay * KCAL_PER_KG_TISSUE;
      // Clamp extreme short-term artefacts to [formula * 0.62, formula * 1.48]
      rawEmpiricalTdee = Math.min(
        formulaTdee * 1.48,
        Math.max(formulaTdee * 0.62, avgIntake - dailyEnergyBalance)
      );
    }

    // Blend prior -> empirical based on valid logged days in window (5 days = 30%, 12+ days = 100%)
    let targetExp = formulaTdee;
    if (rawEmpiricalTdee !== null) {
      const empiricalWeight = Math.min(
        1,
        Math.max(0.25, (validIntakeDays.length - 3) / 9)
      );
      targetExp =
        empiricalWeight * rawEmpiricalTdee + (1 - empiricalWeight) * formulaTdee;
    }

    // Smooth expenditure day-over-day (prevents noisy jumps, max ~35 kcal/day drift)
    let smoothedExp: number;
    if (prevExpenditure === null) {
      smoothedExp = targetExp;
    } else {
      const rawStep = 0.22 * targetExp + 0.78 * prevExpenditure;
      const delta = Math.max(-35, Math.min(35, rawStep - prevExpenditure));
      smoothedExp = prevExpenditure + delta;
    }
    prevExpenditure = smoothedExp;

    // 4-factor Confidence Score (0 - 100)
    const coverage = Math.min(100, Math.round((validIntakeDays.length / 14) * 100));
    const weightFreq = Math.min(100, Math.round((weighInsInWindow / 10) * 100));
    const totalValidSoFar = points.filter((p) => p.validNutritionDay).length + (validNutritionDay ? 1 : 0);
    const depth = Math.min(100, Math.round((totalValidSoFar / 21) * 100));

    // Scale noise vs trend stability
    let residuals: number[] = [];
    for (const j of windowIndices) {
      if (weightMap.has(dates[j])) {
        residuals.push(Math.abs(weightMap.get(dates[j])! - trendWeights[j]));
      }
    }
    const avgResidualKg =
      residuals.length > 0
        ? residuals.reduce((a, b) => a + b, 0) / residuals.length
        : 0.6;
    const stability = Math.max(
      35,
      Math.min(100, Math.round(100 - avgResidualKg * 42))
    );

    const confidence =
      validIntakeDays.length < 5
        ? Math.min(35, Math.round(coverage * 0.35 + weightFreq * 0.25))
        : Math.round(
            coverage * 0.38 +
              weightFreq * 0.24 +
              depth * 0.23 +
              stability * 0.15
          );

    const uncertainty = Math.round(220 - confidence * 1.45); // +/-75 kcal at high confidence, +/-200 at low
    const expRounded = Math.round(smoothedExp);

    points.push({
      date: d,
      scaleWeightKg: weightMap.has(d) ? Math.round(weightMap.get(d)! * 100) / 100 : null,
      interpolatedWeightKg: Math.round(interpWeights[i] * 100) / 100,
      trendWeightKg: Math.round(trendW * 100) / 100,
      weeklyTrendDeltaKg: Math.round(weeklyTrendDeltaKg * 100) / 100,
      loggedCalories,
      loggedProtein,
      loggedCarbs,
      loggedFat,
      loggedMicros,
      hasFoodLog,
      isPartialDay,
      validNutritionDay,
      formulaTdee,
      rawEmpiricalTdee: rawEmpiricalTdee !== null ? Math.round(rawEmpiricalTdee) : null,
      expenditure: expRounded,
      expenditureLow: expRounded - uncertainty,
      expenditureHigh: expRounded + uncertainty,
      confidence,
      confidenceBreakdown: {
        coverage,
        weightFreq,
        depth,
        stability,
      },
    });
  }

  return points;
}

/**
 * Computes unconstrained baseline daily MacroTargets from Expenditure + Trend Weight + Profile
 */
export function computeIdealTargetsFromExpenditure(
  expenditure: number,
  trendWeightKg: number,
  profile: UserProfile
): MacroTargets {
  const bmr = calculateBMR(profile, trendWeightKg);
  const calorieFloor = Math.max(1000, Math.round(bmr * 0.9));

  let ratePct = profile.goalRatePctPerWeek;
  if (profile.goalType === 'maintain') ratePct = 0;
  if (profile.goalType === 'lose' && ratePct > 0) ratePct = -ratePct;
  if (profile.goalType === 'gain' && ratePct < 0) ratePct = Math.abs(ratePct);

  const weeklyKgChange = (ratePct / 100) * trendWeightKg;
  const dailyDeltaKcal = (weeklyKgChange * KCAL_PER_KG_TISSUE) / 7;
  const calories = Math.max(calorieFloor, Math.round(expenditure + dailyDeltaKcal));

  return splitCaloriesIntoMacros(calories, trendWeightKg, profile);
}

export function splitCaloriesIntoMacros(
  calories: number,
  trendWeightKg: number,
  profile: UserProfile
): MacroTargets {
  // Protein anchored to trend weight (g per kg of trend weight)
  const proteinPerKgMap = {
    low: 1.5,       // ~0.68 g/lb
    moderate: 1.85, // ~0.84 g/lb
    high: 2.2,      // ~1.00 g/lb
    extra_high: 2.55, // ~1.16 g/lb
  };
  let protein = Math.round(trendWeightKg * proteinPerKgMap[profile.proteinTier]);
  // Ensure protein doesn't exceed 45% of total calories
  protein = Math.min(protein, Math.round((calories * 0.45) / 4));
  const proteinKcal = protein * 4;
  const remainingKcal = Math.max(200, calories - proteinKcal);

  let fatShareOfTotal = 0.28;
  if (profile.dietStyle === 'high_carb') fatShareOfTotal = 0.21;
  if (profile.dietStyle === 'low_carb') fatShareOfTotal = 0.40;
  if (profile.dietStyle === 'keto') {
    const carbs = Math.min(30, Math.max(15, Math.round((calories * 0.05) / 4)));
    const fat = Math.max(35, Math.round((calories - proteinKcal - carbs * 4) / 9));
    return { calories, protein, carbs, fat };
  }

  // Enforce essential fatty acid floor (~0.6g/kg)
  const minFat = Math.round(trendWeightKg * 0.6);
  let fat = Math.max(minFat, Math.round((calories * fatShareOfTotal) / 9));
  if (fat * 9 > remainingKcal - 80) {
    fat = Math.max(25, Math.floor((remainingKcal - 80) / 9));
  }
  const carbs = Math.max(0, Math.round((calories - proteinKcal - fat * 9) / 4));

  return { calories, protein, carbs, fat };
}

/**
 * Applies optional Training / Rest Day Calorie Cycling while keeping weekly calorie total = base * 7.
 * Carbs absorb the cycling shift so protein stays anchored every day.
 */
export function getDayAdjustedTargets(
  profile: UserProfile,
  trendWeightKg: number,
  dateStr: string
): { targets: MacroTargets; isTrainingDay: boolean; dayOffsetPct: number } {
  const base = profile.acceptedBaseTargets;
  const dow = getDayOfWeek(dateStr);
  const trainingDays = profile.trainingDays || [];
  const isTrainingDay =
    profile.calorieCycling === 'training_rest' &&
    trainingDays.length > 0 &&
    trainingDays.length < 7 &&
    trainingDays.includes(dow);

  if (
    profile.calorieCycling !== 'training_rest' ||
    trainingDays.length === 0 ||
    trainingDays.length === 7
  ) {
    return { targets: base, isTrainingDay: false, dayOffsetPct: 0 };
  }

  const nTrain = trainingDays.length;
  const nRest = 7 - nTrain;
  // +10% on training days, balanced by rest days so sum across 7 days === base.calories * 7
  const trainBoostPct = 0.10;
  const restCutPct = -(nTrain * trainBoostPct) / nRest;
  const pct = isTrainingDay ? trainBoostPct : restCutPct;

  const bmr = calculateBMR(profile, trendWeightKg);
  const floor = Math.max(1000, Math.round(bmr * 0.9));
  const dayCalories = Math.max(floor, Math.round(base.calories * (1 + pct)));

  // Keep protein & fat steady; carbs absorb the training/rest shift (just like MacroFactor / SparkyFitness)
  const protein = base.protein;
  let fat = base.fat;
  let carbKcal = dayCalories - protein * 4 - fat * 9;
  if (carbKcal < 60) {
    // Low-carb fallback: trim fat slightly if carbs hit bottom
    const needed = 60 - carbKcal;
    fat = Math.max(25, fat - Math.ceil(needed / 9));
    carbKcal = Math.max(0, dayCalories - protein * 4 - fat * 9);
  }
  const carbs = Math.round(carbKcal / 4);

  return {
    targets: { calories: dayCalories, protein, carbs, fat },
    isTrainingDay,
    dayOffsetPct: Math.round(pct * 100),
  };
}

export interface CheckInProposal {
  isDue: boolean;
  daysSinceLastCheckIn: number;
  previousTargets: MacroTargets;
  proposedTargets: MacroTargets;
  unclampedCalories: number;
  deltaCalories: number;
  wasCappedAt200: boolean;
  hitCalorieFloor: boolean;
  measuredTdee: number;
  confidence: number;
  trendWeightKg: number;
  weeklyTrendDeltaKg: number;
  loggedDaysLast14: number;
  headline: string;
  explanation: string;
}

export function buildWeeklyCheckInProposal(
  series: DailyComputedPoint[],
  profile: UserProfile,
  todayStr: string
): CheckInProposal {
  const latest = series[series.length - 1];
  const prev = profile.acceptedBaseTargets;
  const daysSince = profile.lastCheckInDate
    ? Math.max(0, daysBetween(profile.lastCheckInDate, todayStr))
    : 99;
  const isDue = profile.programStyle !== 'manual' && daysSince >= 7;

  const last14 = series.slice(-14);
  const loggedDaysLast14 = last14.filter((d) => d.validNutritionDay).length;

  const idealUnclamped = computeIdealTargetsFromExpenditure(
    latest.expenditure,
    latest.trendWeightKg,
    profile
  );

  const bmr = calculateBMR(profile, latest.trendWeightKg);
  const floor = Math.max(1000, Math.round(bmr * 0.9));

  // Enforce +/-200 kcal weekly check-in cap to prevent metabolic/behavioral whiplash
  const rawDelta = idealUnclamped.calories - prev.calories;
  let clampedDelta = rawDelta;
  let wasCappedAt200 = false;
  if (Math.abs(rawDelta) > 200) {
    clampedDelta = rawDelta > 0 ? 200 : -200;
    wasCappedAt200 = true;
  }

  let nextCalories = prev.calories + clampedDelta;
  let hitCalorieFloor = false;
  if (nextCalories <= floor) {
    nextCalories = floor;
    hitCalorieFloor = true;
  }

  // If sparse data (<5 logged days in 14d), hold targets steady
  if (loggedDaysLast14 < 5) {
    nextCalories = prev.calories;
    wasCappedAt200 = false;
  }

  const proposedTargets = splitCaloriesIntoMacros(
    nextCalories,
    latest.trendWeightKg,
    profile
  );
  const finalDelta = proposedTargets.calories - prev.calories;

  let headline = 'Targets Holding Steady';
  let explanation = '';

  if (loggedDaysLast14 < 5) {
    headline = 'Holding Targets (More Logs Needed)';
    explanation = `Only ${loggedDaysLast14} complete nutrition days were logged in the last 14 days. Keeping your ${prev.calories} kcal target unchanged until at least 5 complete days feed the Adaptive TDEE engine.`;
  } else if (Math.abs(finalDelta) <= 15) {
    headline = 'Right on Track — Minimal Change';
    explanation = `Your Adaptive TDEE is ${latest.expenditure} kcal (${latest.confidence}% confidence), which aligns closely with your current ${prev.calories} kcal plan.`;
  } else if (finalDelta < 0) {
    headline = `Recommend ${finalDelta} kcal/day Adjustment`;
    explanation = `Based on your smoothed weight trend and logged intake, your estimated expenditure is ${latest.expenditure} kcal/day. Trimming ${Math.abs(finalDelta)} kcal keeps you aligned with your ${profile.goalRatePctPerWeek}%/week target${wasCappedAt200 ? ' (capped at -200 kcal this week for sustainability)' : ''}.`;
  } else {
    headline = `Recommend +${finalDelta} kcal/day Increase`;
    explanation = `Your weight trend moved faster than your expenditure prior predicted, indicating a higher active burn of ${latest.expenditure} kcal/day. Adding +${finalDelta} kcal prevents unnecessary lean mass loss${wasCappedAt200 ? ' (capped at +200 kcal this week)' : ''}.`;
  }

  return {
    isDue,
    daysSinceLastCheckIn: daysSince,
    previousTargets: prev,
    proposedTargets,
    unclampedCalories: idealUnclamped.calories,
    deltaCalories: finalDelta,
    wasCappedAt200,
    hitCalorieFloor,
    measuredTdee: latest.expenditure,
    confidence: latest.confidence,
    trendWeightKg: latest.trendWeightKg,
    weeklyTrendDeltaKg: latest.weeklyTrendDeltaKg,
    loggedDaysLast14,
    headline,
    explanation,
  };
}
