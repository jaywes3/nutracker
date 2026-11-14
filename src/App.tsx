import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Barcode,
  Calendar,
  Check,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Flame,
  Plus,
  Scale,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  TrendingDown,
  Utensils,
  WifiOff,
} from 'lucide-react';
import { CORE_FOODS, emptyMicros, getDriTargets, scaleMicros, sumMicros } from './data/coreFoods';
import { createFreshProfile, generateDemoDataset } from './engine/demoData';
import { decodeRecipeFromTextOrUrl } from './engine/recipeSharing';
import {
  addDays,
  buildWeeklyCheckInProposal,
  computeDailySeries,
  computeIdealTargetsFromExpenditure,
  displayToKg,
  getDayAdjustedTargets,
  getTodayLocalStr,
  kgToDisplay,
  unitWeightLabel,
} from './engine/metabolism';
import { CheckInModal } from './components/CheckInModal';
import { FoodLoggerModal } from './components/FoodLoggerModal';
import { FoodTimeline, resizeLogPortion } from './components/FoodTimeline';
import { PrivacyAndDataPanel, StrategyPanel } from './components/StrategyAndAuditViews';
import { ExpenditureTrendChart, WeightTrendChart } from './components/TrendCharts';
import type {
  CheckInRecord,
  FoodItem,
  FoodLogEntry,
  MacroTargets,
  NetworkAuditEvent,
  UserProfile,
  WeightEntry,
} from './types';

const STORAGE_KEY = 'openphase_state_v1';
const GEMINI_KEY_STORAGE = 'openphase_gemini_key';

interface PersistedState {
  profile: UserProfile;
  weights: WeightEntry[];
  logs: FoodLogEntry[];
  customFoods: FoodItem[];
  favoriteIds: string[];
  partialDates: string[];
  checkIns: CheckInRecord[];
}

function loadInitialState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.profile && Array.isArray(parsed.logs)) {
        return parsed;
      }
    }
  } catch {
    // fallback to demo
  }
  const demo = generateDemoDataset(getTodayLocalStr());
  return {
    ...demo,
    favoriteIds: CORE_FOODS.filter((f) => f.favorite).map((f) => f.id),
  };
}

export const App: React.FC = () => {
  const todayStr = useMemo(() => getTodayLocalStr(), []);
  const [state, setState] = useState<PersistedState>(() => loadInitialState());
  const [activeTab, setActiveTab] = useState<'dashboard' | 'diary' | 'strategy' | 'privacy'>(
    'dashboard'
  );
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Modal state
  const [loggerModal, setLoggerModal] = useState<{
    open: boolean;
    tab: 'search' | 'recipes' | 'ai' | 'barcode' | 'custom';
    hour: number;
  }>({ open: false, tab: 'search', hour: new Date().getHours() || 12 });
  const [checkInOpen, setCheckInOpen] = useState(false);

  // Incoming 1-tap shared recipe via #recipe=OPR1:... URL hash
  const [incomingSharedRecipe, setIncomingSharedRecipe] = useState<FoodItem | null>(
    null
  );
  const [sharedRecipeSavedNotice, setSharedRecipeSavedNotice] = useState<string | null>(
    null
  );

  useEffect(() => {
    const checkHashForSharedRecipe = () => {
      if (typeof window === 'undefined') return;
      const hash = window.location.hash || '';
      if (!hash.includes('OPR1:')) return;
      const decoded = decodeRecipeFromTextOrUrl(decodeURIComponent(hash));
      if (decoded) {
        setIncomingSharedRecipe(decoded);
        try {
          window.history.replaceState(
            null,
            '',
            window.location.pathname + window.location.search
          );
        } catch {
          // ignore sandbox history restrictions
        }
      }
    };
    checkHashForSharedRecipe();
    window.addEventListener('hashchange', checkHashForSharedRecipe);
    return () => window.removeEventListener('hashchange', checkHashForSharedRecipe);
  }, []);

  // Weigh-in quick input
  const [weightInput, setWeightInput] = useState('');
  const [weightSavedFlash, setWeightSavedFlash] = useState(false);

  // BYOK Gemini API key & session network audit
  const [geminiKey, setGeminiKey] = useState<string>(() => {
    try {
      return localStorage.getItem(GEMINI_KEY_STORAGE) || '';
    } catch {
      return '';
    }
  });
  const [networkEvents, setNetworkEvents] = useState<NetworkAuditEvent[]>([]);

  // Persist to browser localStorage automatically
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage quota / sandboxed iframe guard
    }
  }, [state]);

  const handleSaveGeminiKey = (k: string) => {
    setGeminiKey(k);
    try {
      if (k) localStorage.setItem(GEMINI_KEY_STORAGE, k);
      else localStorage.removeItem(GEMINI_KEY_STORAGE);
    } catch {
      // sandboxed iframe guard
    }
  };

  const recordNetworkAudit = (dest: string, purpose: string, allowed: boolean) => {
    const now = new Date().toLocaleTimeString();
    setNetworkEvents((prev) => [
      {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: now,
        destination: dest,
        purpose,
        status: allowed ? 'allowed' : 'blocked-offline',
      },
      ...prev,
    ]);
  };

  // Merge CORE_FOODS + user's custom/cached foods + favorites
  const catalog = useMemo<FoodItem[]>(() => {
    const favSet = new Set(state.favoriteIds);
    const map = new Map<string, FoodItem>();
    for (const f of CORE_FOODS) {
      map.set(f.id, { ...f, favorite: favSet.has(f.id) });
    }
    for (const cf of state.customFoods) {
      map.set(cf.id, { ...cf, favorite: favSet.has(cf.id) || cf.favorite });
    }
    return Array.from(map.values());
  }, [state.customFoods, state.favoriteIds]);

  // Compute full longitudinal EWMA Trend Weight + Adaptive TDEE series!
  const series = useMemo(
    () =>
      computeDailySeries(
        state.profile,
        state.weights,
        state.logs,
        state.partialDates,
        todayStr
      ),
    [state.profile, state.weights, state.logs, state.partialDates, todayStr]
  );

  const latestPoint = series[series.length - 1];
  const selectedDayPoint =
    series.find((p) => p.date === selectedDate) || latestPoint;

  // Sync weight input placeholder when selectedDate changes
  useEffect(() => {
    const existing = state.weights.find((w) => w.date === selectedDate);
    if (existing) {
      setWeightInput(String(kgToDisplay(existing.weightKg, state.profile.unitSystem)));
    } else {
      setWeightInput('');
    }
  }, [selectedDate, state.weights, state.profile.unitSystem]);

  // Day-adjusted targets (with optional Training / Rest Day Calorie Cycling)
  const dayTargetInfo = useMemo(
    () =>
      getDayAdjustedTargets(
        state.profile,
        latestPoint.trendWeightKg,
        selectedDate
      ),
    [state.profile, latestPoint.trendWeightKg, selectedDate]
  );

  const checkInProposal = useMemo(
    () => buildWeeklyCheckInProposal(series, state.profile, todayStr),
    [series, state.profile, todayStr]
  );

  // Selected date food logs sorted chronologically
  const selectedLogs = useMemo(
    () =>
      state.logs
        .filter((l) => l.date === selectedDate)
        .sort((a, b) => a.hour - b.hour),
    [state.logs, selectedDate]
  );

  const dayTotals = useMemo(() => {
    const calories = Math.round(selectedLogs.reduce((s, l) => s + l.calories, 0));
    const protein = Math.round(selectedLogs.reduce((s, l) => s + l.protein, 0));
    const carbs = Math.round(selectedLogs.reduce((s, l) => s + l.carbs, 0));
    const fat = Math.round(selectedLogs.reduce((s, l) => s + l.fat, 0));
    return { calories, protein, carbs, fat };
  }, [selectedLogs]);

  // 7-day average micronutrients (for DRI coverage view)
  const sevenDayAvgMicros = useMemo(() => {
    const recentLogged = series.slice(-7).filter((p) => p.hasFoodLog);
    if (recentLogged.length === 0) return latestPoint.loggedMicros;
    const summed = sumMicros(recentLogged.map((p) => p.loggedMicros));
    const d = recentLogged.length;
    return {
      fiber: Math.round((summed.fiber / d) * 10) / 10,
      sugar: Math.round((summed.sugar / d) * 10) / 10,
      satFat: Math.round((summed.satFat / d) * 10) / 10,
      sodium: Math.round(summed.sodium / d),
      potassium: Math.round(summed.potassium / d),
      calcium: Math.round(summed.calcium / d),
      iron: Math.round((summed.iron / d) * 10) / 10,
      magnesium: Math.round(summed.magnesium / d),
      zinc: Math.round((summed.zinc / d) * 10) / 10,
      vitC: Math.round(summed.vitC / d),
      vitD: Math.round((summed.vitD / d) * 10) / 10,
      vitB12: Math.round((summed.vitB12 / d) * 100) / 100,
    };
  }, [series, latestPoint]);

  const dri = useMemo(() => getDriTargets(state.profile.sex), [state.profile.sex]);
  const unit = unitWeightLabel(state.profile.unitSystem);

  // Handlers
  const handleSaveWeight = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(weightInput);
    if (Number.isNaN(val) || val <= 20) return;
    const kg = Math.round(displayToKg(val, state.profile.unitSystem) * 100) / 100;

    setState((prev) => {
      const others = prev.weights.filter((w) => w.date !== selectedDate);
      return {
        ...prev,
        weights: [...others, { date: selectedDate, weightKg: kg }].sort((a, b) =>
          a.date.localeCompare(b.date)
        ),
      };
    });
    setWeightSavedFlash(true);
    setTimeout(() => setWeightSavedFlash(false), 1600);
  };

  const handleAddLogs = (entries: FoodLogEntry[]) => {
    setState((prev) => ({
      ...prev,
      logs: [...prev.logs, ...entries],
    }));
  };

  const handleDeleteLog = (id: string) => {
    setState((prev) => ({
      ...prev,
      logs: prev.logs.filter((l) => l.id !== id),
    }));
  };

  const handleCopyYesterday = () => {
    const prevDate = addDays(selectedDate, -1);
    const yLogs = state.logs.filter((l) => l.date === prevDate);
    if (yLogs.length === 0) return;
    const cloned = yLogs.map((l, idx) => ({
      ...l,
      id: `copy-${Date.now()}-${idx}`,
      date: selectedDate,
    }));
    handleAddLogs(cloned);
  };

  const handleResizeLog = (id: string, newGrams: number) => {
    setState(prev => ({
      ...prev,
      logs: prev.logs.map(entry => entry.id === id ? resizeLogPortion(entry, newGrams) : entry),
    }));
  };

  const handleAcceptCheckIn = (
    targets: MacroTargets,
    action: 'accepted' | 'overridden'
  ) => {
    const rec: CheckInRecord = {
      id: `ci-${Date.now()}`,
      date: todayStr,
      previousCalories: state.profile.acceptedBaseTargets.calories,
      newCalories: targets.calories,
      measuredTdee: checkInProposal.measuredTdee,
      confidence: checkInProposal.confidence,
      trendWeightKg: checkInProposal.trendWeightKg,
      weeklyTrendDeltaKg: checkInProposal.weeklyTrendDeltaKg,
      action,
      note: checkInProposal.headline,
    };
    setState((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        acceptedBaseTargets: targets,
        lastCheckInDate: todayStr,
      },
      checkIns: [...prev.checkIns, rec],
    }));
    setCheckInOpen(false);
  };

  const handleSkipCheckIn = () => {
    setState((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        lastCheckInDate: todayStr,
      },
    }));
    setCheckInOpen(false);
  };

  const handleStartFreshPersonalProfile = (setup: {
    name: string;
    sex: 'male' | 'female' | 'neutral';
    age: number;
    heightCm: number;
    currentWeightDisplay: number;
    targetWeightDisplay: number;
    unitSystem: 'imperial' | 'metric';
    goalType: 'lose' | 'maintain' | 'gain';
    activityMultiplier: number;
    goalRatePctPerWeek: number;
    bodyFatPct?: number;
  }) => {
    const startKg = displayToKg(setup.currentWeightDisplay, setup.unitSystem);
    const targKg = displayToKg(setup.targetWeightDisplay, setup.unitSystem);

    const fresh = createFreshProfile({
      name: setup.name,
      sex: setup.sex,
      age: setup.age,
      heightCm: setup.heightCm,
      startingWeightKg: Math.round(startKg * 100) / 100,
      targetWeightKg: Math.round(targKg * 100) / 100,
      bodyFatPct: setup.bodyFatPct,
      activityMultiplier: setup.activityMultiplier,
      unitSystem: setup.unitSystem,
      goalType: setup.goalType,
      goalRatePctPerWeek: setup.goalRatePctPerWeek,
      isDemoData: false,
    });
    const bmr =
      typeof setup.bodyFatPct === 'number' &&
      setup.bodyFatPct >= 4 &&
      setup.bodyFatPct <= 65
        ? Math.max(950, Math.round(370 + 21.6 * startKg * (1 - setup.bodyFatPct / 100)))
        : Math.max(
            950,
            Math.round(
              10 * startKg +
                6.25 * setup.heightCm -
                5 * setup.age +
                (setup.sex === 'male' ? 5 : setup.sex === 'female' ? -161 : -78)
            )
          );
    const formulaTdee = Math.round(bmr * fresh.activityMultiplier);
    fresh.acceptedBaseTargets = computeIdealTargetsFromExpenditure(
      formulaTdee,
      startKg,
      fresh
    );

    setState({
      profile: fresh,
      weights: [{ date: todayStr, weightKg: Math.round(startKg * 100) / 100 }],
      logs: [],
      customFoods: state.customFoods,
      favoriteIds: state.favoriteIds,
      partialDates: [],
      checkIns: [],
    });
    setSelectedDate(todayStr);
    setActiveTab('dashboard');
  };

  const handleReloadDemo = () => {
    const demo = generateDemoDataset(todayStr);
    setState({
      ...demo,
      favoriteIds: CORE_FOODS.filter((f) => f.favorite).map((f) => f.id),
    });
    setSelectedDate(todayStr);
    setActiveTab('dashboard');
  };

  const handleImportData = (
    impWeights: WeightEntry[],
    impLogs: FoodLogEntry[],
    mode: 'merge' | 'replace'
  ) => {
    setState((prev) => {
      if (mode === 'replace') {
        return {
          ...prev,
          profile: { ...prev.profile, isDemoData: false },
          weights: impWeights.length > 0 ? impWeights : prev.weights,
          logs: impLogs.length > 0 ? impLogs : prev.logs,
          partialDates: [],
        };
      }
      const wMap = new Map(prev.weights.map((w) => [w.date, w]));
      for (const w of impWeights) wMap.set(w.date, w);
      return {
        ...prev,
        profile: { ...prev.profile, isDemoData: false },
        weights: Array.from(wMap.values()).sort((a, b) =>
          a.date.localeCompare(b.date)
        ),
        logs: [...prev.logs, ...impLogs],
      };
    });
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openphase-backup-${todayStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const header = 'Date,Hour,Food,Grams,Calories,Protein_g,Fat_g,Carbs_g,Fiber_g\n';
    const rows = state.logs
      .map(
        (l) =>
          `${l.date},${l.hour},"${l.foodName.replace(/"/g, '""')}",${l.grams},${
            l.calories
          },${l.protein},${l.fat},${l.carbs},${l.micros?.fiber || 0}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openphase-diary-${todayStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const contextSummaryForAI = `Goal: ${state.profile.goalType} (${state.profile.goalRatePctPerWeek}%/wk).
EWMA Trend Weight: ${kgToDisplay(latestPoint.trendWeightKg, state.profile.unitSystem)} ${unit}.
Adaptive TDEE: ${latestPoint.expenditure} kcal/day (${latestPoint.confidence}% confidence).
Today (${selectedDate}) Consumed: ${dayTotals.calories} / ${dayTargetInfo.targets.calories} kcal (P ${dayTotals.protein}/${dayTargetInfo.targets.protein}g, F ${dayTotals.fat}/${dayTargetInfo.targets.fat}g, C ${dayTotals.carbs}/${dayTargetInfo.targets.carbs}g).`;

  const targets = dayTargetInfo.targets;
  const remainingKcal = targets.calories - dayTotals.calories;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24 sm:pb-12">
      {/* Sticky Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-slate-950/85 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center">
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-slate-100">
                  OpenPhase
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  <ShieldCheck className="w-3 h-3" /> Local-First · 0 Telemetry
                </span>
                {state.profile.offlineOnlyMode && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <WifiOff className="w-3 h-3" /> Air-Gapped
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden sm:flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-xl p-1 text-xs">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: Activity },
              { id: 'diary', label: 'Trends', icon: TrendingDown },
              { id: 'strategy', label: 'Strategy & TDEE', icon: Sliders },
              { id: 'privacy', label: 'Import & Privacy', icon: ShieldCheck },
            ].map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                    active
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Fast + Log Button */}
          <button
            onClick={() =>
              setLoggerModal({
                open: true,
                tab: 'search',
                hour: new Date().getHours() || 12,
              })
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs shadow-lg shadow-emerald-500/15 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Log Food
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-4 space-y-4">
        {/* Incoming 1-Tap Shared Recipe Banner (from #recipe=OPR1:... link) */}
        {incomingSharedRecipe && (
          <div className="rounded-2xl bg-gradient-to-r from-sky-500/20 via-emerald-500/10 to-slate-900 border border-sky-500/40 p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-300 shrink-0">
                  <ChefHat className="w-5 h-5" />
                </div>
                <div>
                  <span className="inline-block text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-sky-500/20 text-sky-200 mb-1">
                    Shared Recipe Received · Zero Personal Data Shared
                  </span>
                  <h3 className="text-sm font-bold text-slate-100">
                    {incomingSharedRecipe.name}
                  </h3>
                  <p className="text-xs text-slate-300">
                    {(incomingSharedRecipe.recipeIngredients || []).length} ingredients ·{' '}
                    {incomingSharedRecipe.servings[0]?.label} ·{' '}
                    <span className="font-semibold text-emerald-300">
                      {Math.round(
                        incomingSharedRecipe.caloriesPer100g *
                          ((incomingSharedRecipe.servings[0]?.grams || 100) / 100)
                      )}{' '}
                      kcal/serving
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    const rec = incomingSharedRecipe;
                    setState((prev) => ({
                      ...prev,
                      customFoods: [
                        ...prev.customFoods.filter((x) => x.id !== rec.id),
                        rec,
                      ],
                    }));
                    setIncomingSharedRecipe(null);
                    setSharedRecipeSavedNotice(
                      `Saved "${rec.name}" to your Recipes!`
                    );
                    setTimeout(() => setSharedRecipeSavedNotice(null), 4000);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Save to My Recipes
                </button>
                <button
                  onClick={() => {
                    const rec = incomingSharedRecipe;
                    const srv = rec.servings[0] || { label: '1 serving', grams: 100 };
                    const factor = srv.grams / 100;
                    const entry: FoodLogEntry = {
                      id: `log-${Date.now()}`,
                      date: selectedDate,
                      hour: new Date().getHours() || 12,
                      foodId: rec.id,
                      foodName: rec.name,
                      brand: rec.brand,
                      grams: srv.grams,
                      servingLabel: srv.label,
                      servingQty: 1,
                      calories: Math.round(rec.caloriesPer100g * factor),
                      protein: Math.round(rec.proteinPer100g * factor * 10) / 10,
                      carbs: Math.round(rec.carbsPer100g * factor * 10) / 10,
                      fat: Math.round(rec.fatPer100g * factor * 10) / 10,
                      micros: scaleMicros(
                        rec.microsPer100g || emptyMicros(),
                        factor
                      ),
                    };
                    setState((prev) => ({
                      ...prev,
                      customFoods: [
                        ...prev.customFoods.filter((x) => x.id !== rec.id),
                        rec,
                      ],
                      logs: [...prev.logs, entry],
                    }));
                    setIncomingSharedRecipe(null);
                    setSharedRecipeSavedNotice(
                      `Saved "${rec.name}" & logged 1 serving to ${selectedDate}!`
                    );
                    setTimeout(() => setSharedRecipeSavedNotice(null), 4000);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs cursor-pointer"
                >
                  Save & Log 1 Serving
                </button>
                <button
                  onClick={() => setIncomingSharedRecipe(null)}
                  className="px-2.5 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {sharedRecipeSavedNotice && (
          <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/35 px-3.5 py-2.5 text-xs text-emerald-300 flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{sharedRecipeSavedNotice}</span>
          </div>
        )}

        {/* Demo Mode Helper Strip */}
        {state.profile.isDemoData && (
          <div className="rounded-xl bg-slate-900/90 border border-slate-800 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="text-slate-300">
              <span className="font-semibold text-emerald-400">Test-Drive Mode:</span>{' '}
              Preloaded with 35 days of realistic weigh-ins (including a Day-24 sodium water spike!) & meals so you can inspect EWMA Trend Weight & Adaptive TDEE immediately.
            </div>
            <button
              onClick={() => setActiveTab('privacy')}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium shrink-0 cursor-pointer"
            >
              Switch to My Own Profile / Import MacroFactor →
            </button>
          </div>
        )}

        {/* Weekly Check-In Ready Notification Banner */}
        {checkInProposal.isDue && activeTab === 'dashboard' && (
          <div className="rounded-2xl bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-slate-900 border border-emerald-500/35 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-300">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-100">
                  Weekly Coaching Check-In Ready
                </div>
                <div className="text-xs text-slate-300 mt-0.5">
                  Adaptive TDEE is <span className="text-amber-300 font-semibold">{checkInProposal.measuredTdee} kcal</span> ({checkInProposal.confidence}% confidence). {checkInProposal.headline}.
                </div>
              </div>
            </div>
            <button
              onClick={() => setCheckInOpen(true)}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition cursor-pointer"
            >
              Review Weekly Check-In
            </button>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <>
            {/* Top Grid: Today's Macro Targets + Morning Scale Weigh-In & Key Metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Adherence-Neutral Daily Macro Card */}
              <div className="lg:col-span-7 rounded-2xl bg-slate-900/80 border border-slate-800 p-5 flex flex-col justify-between">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                      className="p-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-semibold text-slate-100 tabular-nums flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                      {selectedDate === todayStr ? `Today (${selectedDate})` : selectedDate}
                    </span>
                    <button
                      onClick={() =>
                        setSelectedDate(
                          selectedDate < todayStr ? addDays(selectedDate, 1) : todayStr
                        )
                      }
                      disabled={selectedDate >= todayStr}
                      className="p-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {state.profile.calorieCycling === 'training_rest' && (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                        dayTargetInfo.isTrainingDay
                          ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                          : 'bg-slate-800 border-slate-700 text-slate-300'
                      }`}
                    >
                      {dayTargetInfo.isTrainingDay
                        ? `Training Day (+${dayTargetInfo.dayOffsetPct}% kcal)`
                        : `Rest Day (${dayTargetInfo.dayOffsetPct}% kcal)`}
                    </span>
                  )}
                </div>

                {/* Main Calorie Progress (Adherence-Neutral — calm indigo/emerald, NEVER shaming red!) */}
                <div className="mb-4">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <div>
                      <span className="text-3xl font-bold text-slate-100 tabular-nums">
                        {dayTotals.calories}
                      </span>
                      <span className="text-sm text-slate-400 tabular-nums">
                        {' '}
                        / {targets.calories} kcal
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 tabular-nums">
                      {remainingKcal >= 0
                        ? `${remainingKcal} kcal remaining`
                        : `+${Math.abs(remainingKcal)} kcal above target (logged neutrally)`}
                    </div>
                  </div>
                  <div className="h-3 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        remainingKcal >= 0 ? 'bg-emerald-500' : 'bg-indigo-400'
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((dayTotals.calories / Math.max(1, targets.calories)) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Protein / Fat / Carbs Bars */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      label: 'Protein',
                      cur: dayTotals.protein,
                      targ: targets.protein,
                      bar: 'bg-sky-400',
                      text: 'text-sky-400',
                    },
                    {
                      label: 'Fat',
                      cur: dayTotals.fat,
                      targ: targets.fat,
                      bar: 'bg-amber-400',
                      text: 'text-amber-400',
                    },
                    {
                      label: 'Carbs',
                      cur: dayTotals.carbs,
                      targ: targets.carbs,
                      bar: 'bg-pink-400',
                      text: 'text-pink-400',
                    },
                  ].map((m) => {
                    const pct = Math.min(
                      100,
                      Math.round((m.cur / Math.max(1, m.targ)) * 100)
                    );
                    return (
                      <div
                        key={m.label}
                        className="rounded-xl bg-slate-950/70 border border-slate-800/90 p-3"
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className={`font-semibold ${m.text}`}>{m.label}</span>
                          <span className="text-slate-400 tabular-nums">{pct}%</span>
                        </div>
                        <div className="text-sm font-bold text-slate-100 tabular-nums mb-1.5">
                          {m.cur}
                          <span className="text-xs font-normal text-slate-500">
                            {' '}
                            / {m.targ}g
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-900 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${m.bar}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Quick Logging Shortcuts */}
                <div className="grid grid-cols-5 gap-1.5 mt-4 pt-3.5 border-t border-slate-800/80 text-xs">
                  <button
                    onClick={() =>
                      setLoggerModal({
                        open: true,
                        tab: 'search',
                        hour: new Date().getHours() || 12,
                      })
                    }
                    className="py-2 px-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200 flex items-center justify-center gap-1 font-medium cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> Search
                  </button>
                  <button
                    onClick={() =>
                      setLoggerModal({
                        open: true,
                        tab: 'recipes',
                        hour: new Date().getHours() || 12,
                      })
                    }
                    className="py-2 px-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200 flex items-center justify-center gap-1 font-medium cursor-pointer"
                  >
                    <ChefHat className="w-3.5 h-3.5 text-emerald-300 shrink-0" /> Recipes
                  </button>
                  <button
                    onClick={() =>
                      setLoggerModal({
                        open: true,
                        tab: 'ai',
                        hour: new Date().getHours() || 12,
                      })
                    }
                    className="py-2 px-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200 flex items-center justify-center gap-1 font-medium cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" /> Describe
                  </button>
                  <button
                    onClick={() =>
                      setLoggerModal({
                        open: true,
                        tab: 'barcode',
                        hour: new Date().getHours() || 12,
                      })
                    }
                    className="py-2 px-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200 flex items-center justify-center gap-1 font-medium cursor-pointer"
                  >
                    <Barcode className="w-3.5 h-3.5 text-amber-400 shrink-0" /> Barcode
                  </button>
                  <button
                    onClick={() => document.getElementById('food-timeline')?.scrollIntoView({ behavior: 'smooth' })}
                    className="py-2 px-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200 flex items-center justify-center gap-1 font-medium cursor-pointer"
                  >
                    <Utensils className="w-3.5 h-3.5 text-pink-400 shrink-0" /> Diary
                  </button>
                </div>
              </div>

              {/* Right Column: Morning Weigh-In */}
              <div className="lg:col-span-5 flex flex-col justify-between gap-4">
                {/* Fast Scale Weigh-In Card */}
                <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-emerald-400" />
                      Morning Scale Weigh-In ({selectedDate})
                    </span>
                    <button
                      onClick={() =>
                        setState((p) => ({
                          ...p,
                          profile: {
                            ...p.profile,
                            unitSystem:
                              p.profile.unitSystem === 'imperial' ? 'metric' : 'imperial',
                          },
                        }))
                      }
                      className="text-[11px] text-slate-400 hover:text-emerald-300 underline cursor-pointer"
                    >
                      Switch to {state.profile.unitSystem === 'imperial' ? 'kg' : 'lbs'}
                    </button>
                  </div>

                  <form onSubmit={handleSaveWeight} className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="0.1"
                        placeholder={`Enter scale weight (${unit})...`}
                        value={weightInput}
                        onChange={(e) => setWeightInput(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2 text-sm text-slate-100 tabular-nums focus:outline-none focus:border-emerald-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                        {unit}
                      </span>
                    </div>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition cursor-pointer"
                    >
                      {weightSavedFlash ? 'Saved ✓' : 'Log Weight'}
                    </button>
                  </form>
                </div>

              </div>
            </div>

            <FoodTimeline key={selectedDate} logs={selectedLogs} selectedDate={selectedDate} onCopyYesterday={handleCopyYesterday} onDelete={handleDeleteLog} onResize={handleResizeLog} />

            {/* 7-Day Micronutrient Coverage Panel */}
            <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    7-Day Micronutrient Coverage (vs. IOM Reference Intakes)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Included free with zero paywalls — averaged across your last 7 logged days
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'Dietary Fiber', val: sevenDayAvgMicros.fiber, targ: dri.fiber, u: 'g' },
                  { label: 'Potassium', val: sevenDayAvgMicros.potassium, targ: dri.potassium, u: 'mg' },
                  { label: 'Magnesium', val: sevenDayAvgMicros.magnesium, targ: dri.magnesium, u: 'mg' },
                  { label: 'Calcium', val: sevenDayAvgMicros.calcium, targ: dri.calcium, u: 'mg' },
                  { label: 'Iron', val: sevenDayAvgMicros.iron, targ: dri.iron, u: 'mg' },
                  { label: 'Zinc', val: sevenDayAvgMicros.zinc, targ: dri.zinc, u: 'mg' },
                  { label: 'Vitamin C', val: sevenDayAvgMicros.vitC, targ: dri.vitC, u: 'mg' },
                  { label: 'Vitamin D', val: sevenDayAvgMicros.vitD, targ: dri.vitD, u: 'mcg' },
                  { label: 'Vitamin B12', val: sevenDayAvgMicros.vitB12, targ: dri.vitB12, u: 'mcg' },
                  { label: 'Sodium (Limit)', val: sevenDayAvgMicros.sodium, targ: dri.sodium, u: 'mg', isCap: true },
                ].map((m) => {
                  const pct = Math.round((m.val / Math.max(0.1, m.targ)) * 100);
                  return (
                    <div
                      key={m.label}
                      className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-3"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="truncate">{m.label}</span>
                        <span className="tabular-nums font-medium text-slate-300">
                          {pct}%
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-100 tabular-nums mt-1 mb-1.5">
                        {m.val} / {m.targ} {m.u}
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-900 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            m.isCap
                              ? pct > 100
                                ? 'bg-amber-400'
                                : 'bg-sky-400'
                              : pct >= 85
                              ? 'bg-emerald-400'
                              : 'bg-sky-400'
                          }`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {activeTab === 'diary' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="text-base font-semibold text-slate-100">Trends</h2><p className="text-xs text-slate-400">Weight and adaptive expenditure</p></div>
              <div className="flex items-center gap-2">
                <button aria-label="Previous date" onClick={() => setSelectedDate(addDays(selectedDate, -1))} className="p-1.5 rounded-lg bg-slate-800 text-slate-200 cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-xs text-slate-300 tabular-nums">{selectedDate === todayStr ? `Today · ${selectedDate}` : selectedDate}</span>
                <button aria-label="Next date" onClick={() => setSelectedDate(selectedDate < todayStr ? addDays(selectedDate, 1) : todayStr)} disabled={selectedDate >= todayStr} className="p-1.5 rounded-lg bg-slate-800 text-slate-200 disabled:opacity-30 cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
                {/* Live EWMA Trend Weight + Adaptive TDEE Engine Readout */}
                <div className="grid grid-cols-2 gap-3 flex-1">
                  <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>EWMA Trend Weight</span>
                      <TrendingDown className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="my-1">
                      <span className="text-2xl font-bold text-emerald-400 tabular-nums">
                        {kgToDisplay(selectedDayPoint.trendWeightKg, state.profile.unitSystem)}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">{unit}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 tabular-nums">
                      7d change:{' '}
                      <span className="text-slate-200 font-medium">
                        {selectedDayPoint.weeklyTrendDeltaKg > 0 ? '+' : ''}
                        {kgToDisplay(
                          selectedDayPoint.weeklyTrendDeltaKg,
                          state.profile.unitSystem
                        )}{' '}
                        {unit}/wk
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Adaptive TDEE</span>
                      <Flame className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="my-1">
                      <span className="text-2xl font-bold text-amber-400 tabular-nums">
                        {selectedDayPoint.expenditure}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">kcal</span>
                    </div>
                    <div className="text-[11px] text-slate-400 tabular-nums">
                      Band: {selectedDayPoint.expenditureLow}–{selectedDayPoint.expenditureHigh} (
                      {selectedDayPoint.confidence}%)
                    </div>
                  </div>
                </div>
            {/* Interactive Charts Row: Weight Trend vs Scale + Adaptive Expenditure vs Intake */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      Weight Trend (EWMA) vs. Raw Scale Noise
                    </h3>
                    <p className="text-xs text-slate-400">
                      Hover/tap days to see how EWMA (α = {state.profile.ewmaAlpha}) filters water spikes
                    </p>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/20 tabular-nums">
                    Goal: {kgToDisplay(state.profile.targetWeightKg, state.profile.unitSystem)} {unit}
                  </span>
                </div>
                <WeightTrendChart
                  series={series}
                  unitSystem={state.profile.unitSystem}
                  targetWeightKg={state.profile.targetWeightKg}
                />
              </div>

              <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      Adaptive Expenditure (TDEE) & Logged Intake
                    </h3>
                    <p className="text-xs text-slate-400">
                      14-day energy balance engine with confidence uncertainty band
                    </p>
                  </div>
                  <button
                    onClick={() => setCheckInOpen(true)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-medium cursor-pointer"
                  >
                    Check-In Math
                  </button>
                </div>
                <ExpenditureTrendChart
                  series={series}
                  targetCalories={state.profile.acceptedBaseTargets.calories}
                />
              </div>
            </div>

          </div>
        )}

        {activeTab === 'strategy' && (
          <StrategyPanel
            profile={state.profile}
            latestPoint={latestPoint}
            checkIns={state.checkIns}
            onUpdateProfile={(next) => setState((p) => ({ ...p, profile: next }))}
            onOpenCheckIn={() => setCheckInOpen(true)}
          />
        )}

        {activeTab === 'privacy' && (
          <PrivacyAndDataPanel
            profile={state.profile}
            weights={state.weights}
            logs={state.logs}
            networkEvents={networkEvents}
            onUpdateProfile={(next) => setState((p) => ({ ...p, profile: next }))}
            onStartFreshPersonalProfile={handleStartFreshPersonalProfile}
            onReloadDemo={handleReloadDemo}
            onImportData={handleImportData}
            onExportBackupJson={handleExportJson}
            onExportCsv={handleExportCsv}
          />
        )}
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-800 bg-slate-950/95 backdrop-blur-md grid grid-cols-4 py-1.5 px-2 text-[11px]">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: Activity },
          { id: 'diary', label: 'Trends', icon: TrendingDown },
          { id: 'strategy', label: 'Strategy', icon: Sliders },
          { id: 'privacy', label: 'Privacy', icon: ShieldCheck },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`flex flex-col items-center gap-0.5 py-1 rounded-lg ${
                active ? 'text-emerald-400 font-semibold' : 'text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Food Logger Modal */}
      {loggerModal.open && (
        <FoodLoggerModal
          initialTab={loggerModal.tab}
          selectedDate={selectedDate}
          defaultHour={loggerModal.hour}
          catalog={catalog}
          allLogs={state.logs}
          offlineOnlyMode={state.profile.offlineOnlyMode}
          geminiApiKey={geminiKey}
          onSaveGeminiKey={handleSaveGeminiKey}
          contextSummary={contextSummaryForAI}
          onLogEntries={handleAddLogs}
          onSaveCustomFood={(food) =>
            setState((prev) => ({
              ...prev,
              customFoods: [
                ...prev.customFoods.filter((x) => x.id !== food.id),
                food,
              ],
            }))
          }
          onDeleteCustomFood={(foodId) =>
            setState((prev) => ({
              ...prev,
              customFoods: prev.customFoods.filter((x) => x.id !== foodId),
            }))
          }
          onToggleFavorite={(foodId) =>
            setState((prev) => ({
              ...prev,
              favoriteIds: prev.favoriteIds.includes(foodId)
                ? prev.favoriteIds.filter((id) => id !== foodId)
                : [...prev.favoriteIds, foodId],
            }))
          }
          onRecordNetworkAudit={recordNetworkAudit}
          onClose={() => setLoggerModal((m) => ({ ...m, open: false }))}
        />
      )}

      {/* Weekly Coaching Check-In Modal */}
      {checkInOpen && (
        <CheckInModal
          proposal={checkInProposal}
          profile={state.profile}
          onAccept={handleAcceptCheckIn}
          onSkip={handleSkipCheckIn}
          onClose={() => setCheckInOpen(false)}
        />
      )}
    </div>
  );
};
