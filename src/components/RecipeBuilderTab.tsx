import React, { useEffect, useMemo, useState } from 'react';
import {
  Barcode,
  ChefHat,
  Check,
  ClipboardPaste,
  Copy,
  Download,
  Edit3,
  Globe,
  Layers,
  Loader2,
  Plus,
  Search,
  Share2,
  Trash2,
  Utensils,
} from 'lucide-react';
import { emptyMicros, scaleMicros, sumMicros } from '../data/coreFoods';
import { searchOnlineFoodDatabases } from '../engine/foodSearch';
import {
  buildRecipeShareBundle,
  decodeRecipeFromTextOrUrl,
} from '../engine/recipeSharing';
import { InlineBarcodeScanner } from './InlineBarcodeScanner';
import type { FoodItem, FoodLogEntry, RecipeIngredient } from '../types';

interface RecipeBuilderTabProps {
  catalog: FoodItem[];
  selectedDate: string;
  logHour: number;
  offlineOnlyMode?: boolean;
  usdaApiKey?: string;
  onSaveCustomFood: (food: FoodItem) => void;
  onSaveRecipe: (recipe: FoodItem) => void;
  onDeleteRecipe: (recipeId: string) => void;
  onSelectRecipeToLog: (recipe: FoodItem) => void;
  onLogEntries: (entries: FoodLogEntry[]) => void;
  onRecordNetworkAudit?: (dest: string, purpose: string, allowed: boolean) => void;
  onCloseModal: () => void;
}

export const RecipeBuilderTab: React.FC<RecipeBuilderTabProps> = ({
  catalog,
  selectedDate,
  logHour,
  offlineOnlyMode = false,
  usdaApiKey = '',
  onSaveCustomFood,
  onSaveRecipe,
  onDeleteRecipe,
  onSelectRecipeToLog,
  onLogEntries,
  onRecordNetworkAudit,
  onCloseModal,
}) => {
  const savedRecipes = useMemo(
    () => catalog.filter((f) => f.source === 'recipe'),
    [catalog]
  );

  const [mode, setMode] = useState<'list' | 'builder' | 'import'>(
    savedRecipes.length > 0 ? 'list' : 'builder'
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recipeName, setRecipeName] = useState('');
  const [servingsCount, setServingsCount] = useState('4');
  // Optional cooked/prepared weight override (MacroFactor batch-weighing feature!)
  const [customCookedWeight, setCustomCookedWeight] = useState('');
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);

  // Ingredient picker state (Search + Online Search + Inline Barcode Scanner + Quick Custom Label)
  const [ingQuery, setIngQuery] = useState('');
  const [ingOnlineResults, setIngOnlineResults] = useState<FoodItem[]>([]);
  const [ingSearchingOnline, setIngSearchingOnline] = useState(false);
  const [ingOnlineError, setIngOnlineError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  // Quick inline custom ingredient label form (in case a scanned barcode isn't in OFF/USDA yet)
  const [customIngOpen, setCustomIngOpen] = useState(false);
  const [ciName, setCiName] = useState('');
  const [ciBarcode, setCiBarcode] = useState('');
  const [ciSrvLabel, setCiSrvLabel] = useState('1 serving');
  const [ciSrvGrams, setCiSrvGrams] = useState('100');
  const [ciKcal, setCiKcal] = useState('');
  const [ciProt, setCiProt] = useState('');
  const [ciFat, setCiFat] = useState('');
  const [ciCarbs, setCiCarbs] = useState('');

  const [pickingFood, setPickingFood] = useState<FoodItem | null>(null);
  const [pickServingIdx, setPickServingIdx] = useState(0);
  const [pickQty, setPickQty] = useState('1');

  // 1-Tap Recipe Sharing & Importing state
  const [sharedStatusId, setSharedStatusId] = useState<string | null>(null);
  const [fallbackShareBox, setFallbackShareBox] = useState<{
    recipeId: string;
    text: string;
  } | null>(null);
  const [importInput, setImportInput] = useState('');
  const [importFlash, setImportFlash] = useState<string | null>(null);

  const decodedImportPreview = useMemo(
    () => decodeRecipeFromTextOrUrl(importInput),
    [importInput]
  );

  const handleShareRecipe = async (rec: FoodItem) => {
    const { shareUrl, shareText } = buildRecipeShareBundle(rec);

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Recipe: ${rec.name}`,
          text: shareText,
          ...(shareUrl ? { url: shareUrl } : {}),
        });
        setSharedStatusId(rec.id);
        setTimeout(() => setSharedStatusId(null), 2500);
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setSharedStatusId(rec.id);
      setFallbackShareBox(null);
      setTimeout(() => setSharedStatusId(null), 2500);
    } catch {
      setFallbackShareBox({ recipeId: rec.id, text: shareText });
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt) setImportInput(txt);
    } catch {
      // Clipboard read permission denied; user can paste manually
    }
  };

  const handleConfirmImport = (andLogPortion: boolean) => {
    if (!decodedImportPreview) return;
    onSaveRecipe(decodedImportPreview);
    setImportInput('');
    if (andLogPortion) {
      onSelectRecipeToLog(decodedImportPreview);
    } else {
      setImportFlash(`Saved "${decodedImportPreview.name}" to your recipes!`);
      setMode('list');
      setTimeout(() => setImportFlash(null), 3000);
    }
  };

  const startNewRecipe = () => {
    setEditingId(null);
    setRecipeName('');
    setServingsCount('4');
    setCustomCookedWeight('');
    setIngredients([]);
    setIngQuery('');
    setIngOnlineResults([]);
    setIngOnlineError(null);
    setScannerOpen(false);
    setCustomIngOpen(false);
    setPickingFood(null);
    setMode('builder');
  };

  const startEditRecipe = (rec: FoodItem) => {
    setEditingId(rec.id);
    setRecipeName(rec.name);
    const numSrv = rec.recipeServings || 4;
    setServingsCount(String(numSrv));
    const rawSum = (rec.recipeIngredients || []).reduce((s, i) => s + i.grams, 0);
    const srvGrams = rec.servings[0]?.grams || rawSum / numSrv;
    const totalBatchGrams = Math.round(srvGrams * numSrv);
    setCustomCookedWeight(
      Math.abs(totalBatchGrams - rawSum) > 2 ? String(totalBatchGrams) : ''
    );
    setIngredients(rec.recipeIngredients || []);
    setIngQuery('');
    setIngOnlineResults([]);
    setIngOnlineError(null);
    setScannerOpen(false);
    setCustomIngOpen(false);
    setPickingFood(null);
    setMode('builder');
  };

  const matchingIngredientFoods = useMemo(() => {
    const q = ingQuery.trim().toLowerCase();
    if (!q) return [];
    const tokens = q.split(/\s+/);
    return catalog
      .filter(
        (f) =>
          f.id !== editingId &&
          tokens.every((t) =>
            `${f.name} ${f.brand || ''} ${f.category || ''}`
              .toLowerCase()
              .includes(t)
          )
      )
      .slice(0, 10);
  }, [catalog, ingQuery, editingId]);

  // Combined Local + Online Ingredient Results (must stay above all conditional returns!)
  const combinedIngResults = useMemo(() => {
    const seen = new Set(matchingIngredientFoods.map((f) => f.id));
    const extra = ingOnlineResults.filter((f) => !seen.has(f.id));
    return [...matchingIngredientFoods, ...extra];
  }, [matchingIngredientFoods, ingOnlineResults]);

  const runIngredientOnlineSearch = async (qOverride?: string) => {
    const q = (qOverride ?? ingQuery).trim();
    if (q.length < 2) return;
    setIngSearchingOnline(true);
    setIngOnlineError(null);
    const res = await searchOnlineFoodDatabases({
      query: q,
      usdaApiKey,
      offlineOnlyMode,
      onAudit: onRecordNetworkAudit,
    });
    setIngOnlineResults(res.items);
    setIngOnlineError(res.error);
    setIngSearchingOnline(false);
  };

  // Auto-search online USDA + Open Food Facts after 500ms when local matches are sparse!
  useEffect(() => {
    const q = ingQuery.trim();
    if (q.length < 3 || offlineOnlyMode) {
      if (!q) {
        setIngOnlineResults([]);
        setIngOnlineError(null);
      }
      return;
    }
    if (matchingIngredientFoods.length >= 4) {
      return;
    }
    const timer = setTimeout(() => {
      runIngredientOnlineSearch(q);
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingQuery, matchingIngredientFoods.length, offlineOnlyMode]);

  const selectIngredientFood = (f: FoodItem) => {
    // Cache online or barcode-scanned items locally so future recipe searches find them offline!
    if (f.source === 'off' || f.source === 'usda') {
      onSaveCustomFood({ ...f });
    }
    setScannerOpen(false);
    setCustomIngOpen(false);
    setPickingFood(f);
    setPickServingIdx(0);
    setPickQty('1');
  };

  const handleSaveCustomIngredient = () => {
    if (!ciName.trim()) return;
    const grams = Math.max(1, parseFloat(ciSrvGrams) || 100);
    const factor100 = 100 / grams;
    const kcal = Math.max(0, parseFloat(ciKcal) || 0);
    const prot = Math.max(0, parseFloat(ciProt) || 0);
    const fat = Math.max(0, parseFloat(ciFat) || 0);
    const carbs = Math.max(0, parseFloat(ciCarbs) || 0);
    const cleanCode = ciBarcode.replace(/[^0-9]/g, '');

    const newFood: FoodItem = {
      id: cleanCode ? `custom-bc-${cleanCode}` : `custom-${Date.now()}`,
      name: ciName.trim(),
      brand: 'Custom Label',
      barcode: cleanCode || undefined,
      source: 'custom',
      caloriesPer100g: Math.round(kcal * factor100 * 10) / 10,
      proteinPer100g: Math.round(prot * factor100 * 10) / 10,
      carbsPer100g: Math.round(carbs * factor100 * 10) / 10,
      fatPer100g: Math.round(fat * factor100 * 10) / 10,
      microsPer100g: emptyMicros(),
      servings: [
        { label: `${ciSrvLabel || '1 serving'} (${grams}g)`, grams },
        { label: '100 g', grams: 100 },
        { label: '1 oz (28g)', grams: 28.35 },
      ],
      favorite: true,
    };

    onSaveCustomFood(newFood);
    setCiName('');
    setCiBarcode('');
    setCiKcal('');
    setCiProt('');
    setCiFat('');
    setCiCarbs('');
    setCustomIngOpen(false);
    setPickingFood(newFood);
    setPickServingIdx(0);
    setPickQty('1');
  };

  const handleAddPickedIngredient = () => {
    if (!pickingFood) return;
    const srv = pickingFood.servings[pickServingIdx] || {
      label: '100 g',
      grams: 100,
    };
    const qty = Math.max(0.05, parseFloat(pickQty) || 1);
    const grams = Math.round(srv.grams * qty * 10) / 10;
    const factor = grams / 100;

    const newIng: RecipeIngredient = {
      foodId: pickingFood.id,
      foodName: `${pickingFood.name} (${qty !== 1 ? `${qty} × ` : ''}${srv.label})`,
      grams,
      calories: Math.round(pickingFood.caloriesPer100g * factor),
      protein: Math.round(pickingFood.proteinPer100g * factor * 10) / 10,
      carbs: Math.round(pickingFood.carbsPer100g * factor * 10) / 10,
      fat: Math.round(pickingFood.fatPer100g * factor * 10) / 10,
      micros: scaleMicros(pickingFood.microsPer100g || emptyMicros(), factor),
    };

    setIngredients((prev) => [...prev, newIng]);
    setPickingFood(null);
    setIngQuery('');
    setIngOnlineResults([]);
    setPickQty('1');
  };

  const batchTotals = useMemo(() => {
    const rawGrams = Math.round(ingredients.reduce((s, i) => s + i.grams, 0));
    const cookedOverride = parseFloat(customCookedWeight);
    const finalBatchGrams =
      !Number.isNaN(cookedOverride) && cookedOverride > 0
        ? Math.round(cookedOverride)
        : Math.max(1, rawGrams);
    const numServings = Math.max(0.5, parseFloat(servingsCount) || 1);
    const gramsPerServing = Math.round((finalBatchGrams / numServings) * 10) / 10;

    const calories = ingredients.reduce((s, i) => s + i.calories, 0);
    const protein = ingredients.reduce((s, i) => s + i.protein, 0);
    const carbs = ingredients.reduce((s, i) => s + i.carbs, 0);
    const fat = ingredients.reduce((s, i) => s + i.fat, 0);
    const micros =
      ingredients.length > 0
        ? sumMicros(ingredients.map((i) => i.micros))
        : emptyMicros();

    return {
      rawGrams,
      finalBatchGrams,
      numServings,
      gramsPerServing,
      calories: Math.round(calories),
      protein: Math.round(protein * 10) / 10,
      carbs: Math.round(carbs * 10) / 10,
      fat: Math.round(fat * 10) / 10,
      micros,
      perServing: {
        calories: Math.round(calories / numServings),
        protein: Math.round((protein / numServings) * 10) / 10,
        carbs: Math.round((carbs / numServings) * 10) / 10,
        fat: Math.round((fat / numServings) * 10) / 10,
      },
    };
  }, [ingredients, customCookedWeight, servingsCount]);

  const buildRecipeFoodItem = (): FoodItem | null => {
    if (!recipeName.trim() || ingredients.length === 0) return null;
    const factorTo100 = 100 / Math.max(1, batchTotals.finalBatchGrams);
    return {
      id: editingId || `recipe-${Date.now()}`,
      name: recipeName.trim(),
      brand: `Saved Recipe · ${batchTotals.numServings} servings`,
      category: 'Saved Recipes',
      source: 'recipe',
      caloriesPer100g: Math.round(batchTotals.calories * factorTo100 * 10) / 10,
      proteinPer100g: Math.round(batchTotals.protein * factorTo100 * 10) / 10,
      carbsPer100g: Math.round(batchTotals.carbs * factorTo100 * 10) / 10,
      fatPer100g: Math.round(batchTotals.fat * factorTo100 * 10) / 10,
      microsPer100g: scaleMicros(batchTotals.micros, factorTo100),
      servings: [
        {
          label: `1 serving (${batchTotals.gramsPerServing}g)`,
          grams: batchTotals.gramsPerServing,
        },
        { label: '100 g cooked batch', grams: 100 },
        {
          label: `Entire batch (${batchTotals.finalBatchGrams}g)`,
          grams: batchTotals.finalBatchGrams,
        },
      ],
      favorite: true,
      recipeServings: batchTotals.numServings,
      recipeIngredients: ingredients,
    };
  };

  const handleSaveOnly = () => {
    const rec = buildRecipeFoodItem();
    if (!rec) return;
    onSaveRecipe(rec);
    setMode('list');
  };

  const handleSaveAndLogOneServing = () => {
    const rec = buildRecipeFoodItem();
    if (!rec) return;
    onSaveRecipe(rec);
    onSelectRecipeToLog(rec);
  };

  const handleExplodeRecipeToDiary = (rec: FoodItem) => {
    const numSrv = rec.recipeServings || 1;
    const ings = rec.recipeIngredients || [];
    if (ings.length === 0) {
      onSelectRecipeToLog(rec);
      return;
    }
    const entries: FoodLogEntry[] = ings.map((ing, idx) => ({
      id: `exp-${Date.now()}-${idx}`,
      date: selectedDate,
      hour: logHour,
      foodId: ing.foodId,
      foodName: ing.foodName.split(' (')[0],
      brand: `From ${rec.name}`,
      grams: Math.round((ing.grams / numSrv) * 10) / 10,
      servingLabel: `1/${numSrv} recipe share`,
      servingQty: 1,
      calories: Math.round(ing.calories / numSrv),
      protein: Math.round((ing.protein / numSrv) * 10) / 10,
      carbs: Math.round((ing.carbs / numSrv) * 10) / 10,
      fat: Math.round((ing.fat / numSrv) * 10) / 10,
      micros: scaleMicros(ing.micros || emptyMicros(), 1 / numSrv),
    }));
    onLogEntries(entries);
    onCloseModal();
  };

  // Import Shared Recipe View
  if (mode === 'import') {
    const previewSrv = decodedImportPreview?.servings[0];
    const previewFactor = (previewSrv?.grams || 100) / 100;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
              <Download className="w-4 h-4 text-sky-400" />
              Import a Shared Recipe
            </h3>
            <p className="text-xs text-slate-400">
              Paste a shared recipe message, link, or <code className="text-slate-300">OPR1:...</code> code—only the recipe is imported, keeping your personal data 100% separate.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setImportInput('');
              setMode(savedRecipes.length > 0 ? 'list' : 'builder');
            }}
            className="text-xs text-slate-400 hover:text-slate-200 shrink-0 ml-2 cursor-pointer"
          >
            ← Back
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-300">
              Shared Recipe Message or Code
            </label>
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-medium cursor-pointer"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              Paste from Clipboard
            </button>
          </div>
          <textarea
            rows={3}
            placeholder="Paste the entire text message or OPR1:... recipe code your partner/friend sent you..."
            value={importInput}
            onChange={(e) => setImportInput(e.target.value)}
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-sky-500"
          />
        </div>

        {importInput.trim() && !decodedImportPreview && (
          <div className="rounded-xl bg-rose-950/30 border border-rose-500/30 p-3 text-xs text-rose-200">
            No valid <code className="font-mono">OPR1:...</code> recipe code found in that text. Make sure you copied the entire message or link sent from OpenPhase.
          </div>
        )}

        {decodedImportPreview && previewSrv && (
          <div className="rounded-xl bg-emerald-950/20 border border-emerald-500/30 p-3.5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="inline-block text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 mb-1">
                  Ready to Import
                </span>
                <div className="text-sm font-semibold text-slate-100">
                  {decodedImportPreview.name}
                </div>
                <div className="text-xs text-slate-400">
                  {decodedImportPreview.recipeServings || 1} servings · {previewSrv.label}
                </div>
              </div>
              <div className="text-right tabular-nums">
                <div className="text-base font-bold text-emerald-400">
                  {Math.round(decodedImportPreview.caloriesPer100g * previewFactor)} kcal
                </div>
                <div className="text-xs text-slate-300">
                  {Math.round(decodedImportPreview.proteinPer100g * previewFactor)}P ·{' '}
                  {Math.round(decodedImportPreview.fatPer100g * previewFactor)}F ·{' '}
                  {Math.round(decodedImportPreview.carbsPer100g * previewFactor)}C
                </div>
              </div>
            </div>

            {(decodedImportPreview.recipeIngredients || []).length > 0 && (
              <div className="space-y-1 pt-2 border-t border-slate-800/80 max-h-36 overflow-y-auto">
                {(decodedImportPreview.recipeIngredients || []).map((ing, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs text-slate-300"
                  >
                    <span className="truncate">{ing.foodName}</span>
                    <span className="text-slate-400 tabular-nums shrink-0 ml-2">
                      {ing.grams}g · {ing.calories} kcal
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleConfirmImport(false)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Save to My Recipes
              </button>
              <button
                type="button"
                onClick={() => handleConfirmImport(true)}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs cursor-pointer"
              >
                Save & Log Portion Now
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (mode === 'list') {
    return (
      <div className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
              <ChefHat className="w-4 h-4 text-emerald-400" />
              Saved Multi-Ingredient Recipes ({savedRecipes.length})
            </h3>
            <p className="text-xs text-slate-400">
              Build once, scan barcodes into recipes, share in 1 tap, or log by serving/grams
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMode('import')}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-medium text-xs cursor-pointer"
              title="Paste a recipe sent from another phone"
            >
              <Download className="w-3.5 h-3.5" />
              Import Shared
            </button>
            <button
              onClick={startNewRecipe}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New Recipe
            </button>
          </div>
        </div>

        {importFlash && (
          <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300 flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{importFlash}</span>
          </div>
        )}

        {savedRecipes.length === 0 ? (
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-6 text-center space-y-2.5">
            <p className="text-xs text-slate-400">
              No saved recipes yet. Combine multiple ingredients once and reuse them forever—or import a recipe shared from another phone!
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={startNewRecipe}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-semibold text-xs cursor-pointer"
              >
                Create Your First Recipe
              </button>
              <button
                onClick={() => setMode('import')}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-medium text-xs cursor-pointer"
              >
                Import Shared Recipe
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {savedRecipes.map((rec) => {
              const srv = rec.servings[0];
              const factor = srv.grams / 100;
              const isSharedSuccess = sharedStatusId === rec.id;
              return (
                <div
                  key={rec.id}
                  className="rounded-xl bg-slate-950/75 border border-slate-800 p-3.5 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">
                        {rec.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {(rec.recipeIngredients || []).length} ingredients · {srv.label}
                      </div>
                    </div>
                    <div className="text-right tabular-nums shrink-0">
                      <div className="text-sm font-bold text-emerald-400">
                        {Math.round(rec.caloriesPer100g * factor)} kcal
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {Math.round(rec.proteinPer100g * factor)}P ·{' '}
                        {Math.round(rec.fatPer100g * factor)}F ·{' '}
                        {Math.round(rec.carbsPer100g * factor)}C
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80 text-xs">
                    <button
                      onClick={() => onSelectRecipeToLog(rec)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold cursor-pointer"
                    >
                      <Utensils className="w-3.5 h-3.5" />
                      Log Portion
                    </button>
                    <button
                      onClick={() => handleShareRecipe(rec)}
                      className={`inline-flex items-center gap-1 py-1.5 px-2.5 rounded-lg font-medium cursor-pointer transition-colors ${
                        isSharedSuccess
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30'
                      }`}
                      title="Send this recipe to another phone via text/link (shares ONLY the recipe, zero personal data)"
                    >
                      {isSharedSuccess ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3.5 h-3.5" />
                          Share
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleExplodeRecipeToDiary(rec)}
                      className="inline-flex items-center gap-1 py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                      title="Logs 1 serving as individual editable ingredient rows in today's diary"
                    >
                      <Layers className="w-3.5 h-3.5 text-sky-400" />
                      Explode
                    </button>
                    <button
                      onClick={() => startEditRecipe(rec)}
                      className="inline-flex items-center gap-1 py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => onDeleteRecipe(rec.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-900 cursor-pointer"
                      title="Delete recipe"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {fallbackShareBox && fallbackShareBox.recipeId === rec.id && (
                    <div className="rounded-lg bg-slate-900 border border-sky-500/30 p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-sky-300">
                        <span className="flex items-center gap-1 font-medium">
                          <Copy className="w-3 h-3" /> Copy & text this to the other phone:
                        </span>
                        <button
                          type="button"
                          onClick={() => setFallbackShareBox(null)}
                          className="text-slate-400 hover:text-slate-200 cursor-pointer"
                        >
                          Close
                        </button>
                      </div>
                      <textarea
                        readOnly
                        rows={3}
                        value={fallbackShareBox.text}
                        onFocus={(e) => e.currentTarget.select()}
                        className="w-full rounded bg-slate-950 border border-slate-800 p-2 text-[11px] text-slate-200 font-mono"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Recipe Builder Form
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
          <ChefHat className="w-4 h-4 text-emerald-400" />
          {editingId ? 'Edit Saved Recipe' : 'Create Reusable Recipe'}
        </h3>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMode('import')}
            className="text-xs text-sky-400 hover:text-sky-300 cursor-pointer"
          >
            Import Shared
          </button>
          {savedRecipes.length > 0 && (
            <button
              type="button"
              onClick={() => setMode('list')}
              className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              ← Back to Saved
            </button>
          )}
        </div>
      </div>

      {/* Name, Servings & Optional Cooked Batch Weight */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="sm:col-span-1">
          <label className="block text-[11px] text-slate-400 mb-1">
            Recipe Name *
          </label>
          <input
            type="text"
            placeholder="Turkey Chili Meal Prep"
            value={recipeName}
            onChange={(e) => setRecipeName(e.target.value)}
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-400 mb-1">
            Number of Servings
          </label>
          <input
            type="number"
            step="0.5"
            min="1"
            value={servingsCount}
            onChange={(e) => setServingsCount(e.target.value)}
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 tabular-nums"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-400 mb-1">
            Cooked Pot Weight (g, optional)
          </label>
          <input
            type="number"
            placeholder={`Auto (${batchTotals.rawGrams}g raw)`}
            value={customCookedWeight}
            onChange={(e) => setCustomCookedWeight(e.target.value)}
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 tabular-nums"
          />
        </div>
      </div>

      {/* Ingredient Search, Barcode Scanner & Quick Custom Picker */}
      <div className="rounded-xl bg-slate-950/75 border border-slate-800 p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs font-medium text-emerald-400">
            + Add Ingredients to Recipe
          </label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setPickingFood(null);
                setCustomIngOpen(false);
                setScannerOpen((prev) => !prev);
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer transition ${
                scannerOpen
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/35'
              }`}
            >
              <Barcode className="w-3.5 h-3.5" />
              {scannerOpen ? 'Close Scanner' : 'Scan Barcode'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPickingFood(null);
                setScannerOpen(false);
                setCustomIngOpen((prev) => !prev);
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer ${
                customIngOpen
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              Custom Label
            </button>
          </div>
        </div>

        {/* Inline Barcode Scanner right inside Recipe Builder */}
        {scannerOpen && !pickingFood && (
          <InlineBarcodeScanner
            catalog={catalog}
            usdaApiKey={usdaApiKey}
            offlineOnlyMode={offlineOnlyMode}
            autoStartCamera={true}
            compact={true}
            onFoodFound={(food) => selectIngredientFood(food)}
            onAttachUnknownBarcode={(code) => {
              setScannerOpen(false);
              setCiBarcode(code);
              setCustomIngOpen(true);
            }}
            onRecordNetworkAudit={onRecordNetworkAudit}
            onCloseScanner={() => setScannerOpen(false)}
          />
        )}

        {/* Inline Custom Nutrition Label Form (never lose your half-built recipe!) */}
        {customIngOpen && !pickingFood && (
          <div className="rounded-xl bg-slate-900 border border-slate-700 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-100">
                Quick Custom Ingredient {ciBarcode ? `(Barcode: ${ciBarcode})` : ''}
              </span>
              <button
                type="button"
                onClick={() => setCustomIngOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Ingredient name *"
                value={ciName}
                onChange={(e) => setCiName(e.target.value)}
                className="col-span-2 sm:col-span-1 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-100"
              />
              <input
                type="text"
                placeholder="Serving name (e.g. 1/2 cup)"
                value={ciSrvLabel}
                onChange={(e) => setCiSrvLabel(e.target.value)}
                className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-100"
              />
              <input
                type="number"
                placeholder="Serving weight (g) *"
                value={ciSrvGrams}
                onChange={(e) => setCiSrvGrams(e.target.value)}
                className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-100 tabular-nums"
              />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <input
                type="number"
                placeholder="Calories *"
                value={ciKcal}
                onChange={(e) => setCiKcal(e.target.value)}
                className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs text-slate-100 tabular-nums"
              />
              <input
                type="number"
                placeholder="Protein (g)"
                value={ciProt}
                onChange={(e) => setCiProt(e.target.value)}
                className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs text-slate-100 tabular-nums"
              />
              <input
                type="number"
                placeholder="Fat (g)"
                value={ciFat}
                onChange={(e) => setCiFat(e.target.value)}
                className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs text-slate-100 tabular-nums"
              />
              <input
                type="number"
                placeholder="Carbs (g)"
                value={ciCarbs}
                onChange={(e) => setCiCarbs(e.target.value)}
                className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs text-slate-100 tabular-nums"
              />
            </div>
            <button
              type="button"
              disabled={!ciName.trim() || !ciKcal.trim()}
              onClick={handleSaveCustomIngredient}
              className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-semibold text-xs cursor-pointer"
            >
              Save Food & Choose Recipe Amount →
            </button>
          </div>
        )}

        {/* Portion Picker once an ingredient is chosen or scanned */}
        {pickingFood ? (
          <div className="space-y-2.5 bg-slate-900 rounded-xl p-3 border border-emerald-500/40">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-100 truncate">
                  {pickingFood.name}
                </div>
                {pickingFood.brand && (
                  <div className="text-[11px] text-slate-400 truncate">
                    {pickingFood.brand} · {pickingFood.caloriesPer100g} kcal/100g
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPickingFood(null)}
                className="text-xs text-slate-400 hover:text-slate-200 shrink-0 cursor-pointer"
              >
                Cancel
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={pickServingIdx}
                onChange={(e) => setPickServingIdx(Number(e.target.value))}
                className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs text-slate-100"
              >
                {pickingFood.servings.map((s, idx) => (
                  <option key={idx} value={idx}>
                    {s.label}
                  </option>
                ))}
              </select>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  step="any"
                  min="0.05"
                  value={pickQty}
                  onChange={(e) => setPickQty(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs text-slate-100 tabular-nums"
                  placeholder="Amount"
                />
                <button
                  type="button"
                  onClick={handleAddPickedIngredient}
                  className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs shrink-0 cursor-pointer"
                >
                  + Add to Recipe
                </button>
              </div>
            </div>
          </div>
        ) : (
          !scannerOpen &&
          !customIngOpen && (
            <>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search 135+ cooking staples & 4M+ online grocery items..."
                    value={ingQuery}
                    onChange={(e) => setIngQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        runIngredientOnlineSearch();
                      }
                    }}
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 pl-8 pr-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                {ingQuery.trim().length >= 2 && !offlineOnlyMode && (
                  <button
                    type="button"
                    onClick={() => runIngredientOnlineSearch()}
                    disabled={ingSearchingOnline}
                    className="px-2.5 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-300 text-xs font-medium inline-flex items-center gap-1 shrink-0 cursor-pointer"
                    title="Search USDA & Open Food Facts online"
                  >
                    {ingSearchingOnline ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Globe className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">Search Online</span>
                  </button>
                )}
              </div>

              {ingSearchingOnline && (
                <div className="text-[11px] text-sky-300 flex items-center gap-1.5 px-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Searching USDA & Open Food Facts grocery catalogs...
                </div>
              )}

              {ingOnlineError && combinedIngResults.length === 0 && (
                <div className="text-[11px] text-amber-300 bg-amber-950/25 border border-amber-500/25 rounded-lg px-2.5 py-1.5">
                  {ingOnlineError}
                </div>
              )}

              {combinedIngResults.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {combinedIngResults.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => selectIngredientFood(f)}
                      className="w-full text-left rounded-lg bg-slate-900/90 hover:bg-slate-800 px-3 py-2 text-xs flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-slate-100 font-medium truncate">
                          {f.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {f.brand || f.category || 'Whole Food'} ·{' '}
                          {f.servings[0]?.label || '100 g'}
                        </div>
                      </div>
                      <div className="text-right tabular-nums shrink-0">
                        <div className="text-emerald-400 font-semibold">
                          {f.caloriesPer100g} kcal
                        </div>
                        <div className="text-[10px] text-slate-400">per 100g</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )
        )}

        {/* Added Ingredients List */}
        {ingredients.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-slate-800">
            {ingredients.map((ing, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 rounded-lg bg-slate-900/80 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="text-slate-200 truncate">{ing.foodName}</div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    {ing.grams}g · {ing.protein}P / {ing.fat}F / {ing.carbs}C
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-semibold text-slate-100 tabular-nums">
                    {ing.calories} kcal
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setIngredients((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="text-slate-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Per-Serving Summary */}
      {ingredients.length > 0 && (
        <div className="rounded-xl bg-emerald-950/20 border border-emerald-500/30 p-3.5">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-emerald-300">
              Per Serving ({batchTotals.gramsPerServing}g · 1 of{' '}
              {batchTotals.numServings})
            </span>
            <span className="text-slate-400 tabular-nums">
              Whole batch: {batchTotals.calories} kcal ({batchTotals.finalBatchGrams}g)
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center tabular-nums">
            <div className="rounded-lg bg-slate-950 p-2">
              <div className="text-[10px] text-slate-400">Calories</div>
              <div className="text-sm font-bold text-slate-100">
                {batchTotals.perServing.calories}
              </div>
            </div>
            <div className="rounded-lg bg-slate-950 p-2">
              <div className="text-[10px] text-sky-400">Protein</div>
              <div className="text-sm font-bold text-sky-400">
                {batchTotals.perServing.protein}g
              </div>
            </div>
            <div className="rounded-lg bg-slate-950 p-2">
              <div className="text-[10px] text-amber-400">Fat</div>
              <div className="text-sm font-bold text-amber-400">
                {batchTotals.perServing.fat}g
              </div>
            </div>
            <div className="rounded-lg bg-slate-950 p-2">
              <div className="text-[10px] text-pink-400">Carbs</div>
              <div className="text-sm font-bold text-pink-400">
                {batchTotals.perServing.carbs}g
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Buttons */}
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          disabled={!recipeName.trim() || ingredients.length === 0}
          onClick={handleSaveAndLogOneServing}
          className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Check className="w-4 h-4" />
          Save Recipe & Log Portion
        </button>
        <button
          type="button"
          disabled={!recipeName.trim() || ingredients.length === 0}
          onClick={handleSaveOnly}
          className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-medium text-xs cursor-pointer"
        >
          Save for Future Use Only
        </button>
      </div>
    </div>
  );
};
