import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Barcode,
  Camera,
  Check,
  ChefHat,
  Globe,
  Heart,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Utensils,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { emptyMicros, scaleMicros } from '../data/coreFoods';
import {
  lookupBarcodeAcrossDatabases,
  searchOnlineFoodDatabases,
} from '../engine/foodSearch';
import {
  analyzeWithGeminiBYOK,
  draftItemsToLogEntries,
  parseNaturalMealOffline,
} from '../engine/nlpLogger';
import { RecipeBuilderTab } from './RecipeBuilderTab';
import { analyzeWithArena, arenaRelayUrl } from '../engine/arena';
import type { FoodItem, FoodLogEntry } from '../types';

interface FoodLoggerModalProps {
  initialTab?: 'search' | 'recipes' | 'ai' | 'barcode' | 'custom';
  selectedDate: string;
  defaultHour: number;
  catalog: FoodItem[];
  allLogs: FoodLogEntry[];
  offlineOnlyMode: boolean;
  geminiApiKey: string;
  onSaveGeminiKey: (key: string) => void;
  contextSummary: string;
  onLogEntries: (entries: FoodLogEntry[]) => void;
  onSaveCustomFood: (food: FoodItem) => void;
  onDeleteCustomFood: (foodId: string) => void;
  onToggleFavorite: (foodId: string) => void;
  onRecordNetworkAudit: (dest: string, purpose: string, allowed: boolean) => void;
  onClose: () => void;
}

export const FoodLoggerModal: React.FC<FoodLoggerModalProps> = ({
  initialTab = 'search',
  selectedDate,
  defaultHour,
  catalog,
  allLogs,
  offlineOnlyMode,
  geminiApiKey,
  onSaveGeminiKey,
  contextSummary,
  onLogEntries,
  onSaveCustomFood,
  onDeleteCustomFood,
  onToggleFavorite,
  onRecordNetworkAudit,
  onClose,
}) => {
  const [tab, setTab] = useState<'search' | 'recipes' | 'ai' | 'barcode' | 'custom'>(initialTab);
  const [logHour, setLogHour] = useState<number>(defaultHour);

  // Search state
  const [query, setQuery] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [onlineResults, setOnlineResults] = useState<FoodItem[]>([]);
  const [searchingOnline, setSearchingOnline] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);

  // Selected food portion sheet
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [servingIdx, setServingIdx] = useState(0);
  const [servingQty, setServingQty] = useState('1');

  // AI / NLP state
  const [nlpText, setNlpText] = useState('');
  const [aiProvider, setAiProvider] = useState<'arena' | 'gemini'>(() => {
    try { return localStorage.getItem('openphase_ai_provider') === 'gemini' ? 'gemini' : 'arena'; } catch { return 'arena'; }
  });
  const [arenaKey, setArenaKey] = useState(() => { try { return localStorage.getItem('openphase_arena_key') || ''; } catch { return ''; } });
  const [arenaRelay, setArenaRelay] = useState(() => { try { return localStorage.getItem('openphase_arena_relay') || ''; } catch { return ''; } });
  const [arenaModel, setArenaModel] = useState(() => { try { return localStorage.getItem('openphase_arena_model') || 'coding-router-preview'; } catch { return 'coding-router-preview'; } });
  const [arenaSettingsError, setArenaSettingsError] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState(geminiApiKey);
  const [showKeyBox, setShowKeyBox] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [aiEstimated, setAiEstimated] = useState<
    Array<{
      name: string;
      grams: number;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber?: number;
    }>
  >([]);
  const [photoPreview, setPhotoPreview] = useState<{
    base64: string;
    mime: string;
    dataUrl: string;
  } | null>(null);

  // Barcode state
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeStatus, setBarcodeStatus] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Custom Food barcode link + optional personal USDA key
  const [cBarcode, setCBarcode] = useState('');
  const [usdaKey, setUsdaKey] = useState<string>(() => {
    try {
      return localStorage.getItem('openphase_usda_key') || '';
    } catch {
      return '';
    }
  });
  const [showUsdaKeyBox, setShowUsdaKeyBox] = useState(false);
  const [customMode, setCustomMode] = useState<'quick' | 'save'>('quick');
  const [cName, setCName] = useState('');
  const [cBrand, setCBrand] = useState('');
  const [cGrams, setCGrams] = useState('100');
  const [cServingLabel, setCServingLabel] = useState('1 serving');
  const [cKcal, setCKcal] = useState('');
  const [cProt, setCProt] = useState('');
  const [cCarbs, setCCarbs] = useState('');
  const [cFat, setCFat] = useState('');
  const [cFiber, setCFiber] = useState('');

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Compute Behavioral Smart "Picks" score based on frequency & current hour proximity!
  const pickScores = useMemo(() => {
    const scores = new Map<string, { total: number; nearHour: number }>();
    for (const l of allLogs) {
      const cur = scores.get(l.foodId) || { total: 0, nearHour: 0 };
      cur.total += 1;
      if (Math.abs(l.hour - logHour) <= 2) {
        cur.nearHour += 1;
      }
      scores.set(l.foodId, cur);
    }
    return scores;
  }, [allLogs, logHour]);

  const filteredLocalFoods = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);

    return catalog
      .filter((f) => {
        if (onlyFavorites && !f.favorite) return false;
        if (tokens.length === 0) return true;
        const hay = `${f.name} ${f.brand || ''} ${f.category || ''}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .map((f) => {
        const ps = pickScores.get(f.id);
        let rank = 0;
        if (f.favorite) rank += 25;
        if (ps) rank += Math.min(40, ps.total * 2) + ps.nearHour * 8;
        if (q && f.name.toLowerCase().startsWith(q)) rank += 60;
        return { food: f, rank, nearHourCount: ps?.nearHour || 0 };
      })
      .sort((a, b) => b.rank - a.rank);
  }, [catalog, query, onlyFavorites, pickScores]);

  const selectFoodForPortion = (f: FoodItem) => {
    setSelectedFood(f);
    setServingIdx(0);
    setServingQty('1');
  };

  const handleConfirmSelectedFood = () => {
    if (!selectedFood) return;
    const srv = selectedFood.servings[servingIdx] || { label: '100 g', grams: 100 };
    const qty = Math.max(0.05, parseFloat(servingQty) || 1);
    const grams = Math.round(srv.grams * qty * 10) / 10;
    const factor = grams / 100;

    const entry: FoodLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: selectedDate,
      hour: logHour,
      foodId: selectedFood.id,
      foodName: selectedFood.name,
      brand: selectedFood.brand,
      grams,
      servingLabel: srv.label,
      servingQty: qty,
      calories: Math.round(selectedFood.caloriesPer100g * factor),
      protein: Math.round(selectedFood.proteinPer100g * factor * 10) / 10,
      carbs: Math.round(selectedFood.carbsPer100g * factor * 10) / 10,
      fat: Math.round(selectedFood.fatPer100g * factor * 10) / 10,
      micros: scaleMicros(selectedFood.microsPer100g || emptyMicros(), factor),
    };

    // Also cache online foods locally so they work offline next time!
    if (selectedFood.source === 'off' || selectedFood.source === 'usda') {
      onSaveCustomFood({ ...selectedFood });
    }

    onLogEntries([entry]);
    onClose();
  };

  const runOnlineCatalogSearch = async (qOverride?: string) => {
    const q = (qOverride ?? query).trim();
    if (!q) return;

    setSearchingOnline(true);
    setOnlineError(null);

    const res = await searchOnlineFoodDatabases({
      query: q,
      usdaApiKey: usdaKey,
      offlineOnlyMode,
      onAudit: onRecordNetworkAudit,
    });

    setOnlineResults(res.items);
    setOnlineError(res.error);
    if (res.rateLimitedDemoKey) {
      setShowUsdaKeyBox(true);
    }
    setSearchingOnline(false);
  };

  // Only auto-search as-you-type when a personal 1,000/hr USDA key is saved;
  // on shared 30/hr DEMO_KEY, wait for Enter / button tap so keystrokes don't burn the hourly cap!
  useEffect(() => {
    if (tab !== 'search') return;
    const q = query.trim();
    if (!q) {
      setOnlineResults([]);
      setOnlineError(null);
      return;
    }
    if (!usdaKey.trim() || q.length < 3 || offlineOnlyMode) {
      return;
    }
    if (filteredLocalFoods.length >= 4) {
      return;
    }
    const timer = setTimeout(() => {
      runOnlineCatalogSearch(q);
    }, 650);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, query, filteredLocalFoods.length, offlineOnlyMode, usdaKey]);

  // Instant Offline NLP Preview
  const offlineDraftItems = useMemo(
    () => (nlpText.trim() ? parseNaturalMealOffline(nlpText, catalog) : []),
    [nlpText, catalog]
  );

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      if (comma > 0) {
        setPhotoPreview({
          base64: dataUrl.slice(comma + 1),
          mime: file.type || 'image/jpeg',
          dataUrl,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRunGemini = async () => {
    if (offlineOnlyMode) {
      onRecordNetworkAudit('generativelanguage.googleapis.com', 'Gemini AI request', false);
      setAiReply('Blocked: Air-Gap Offline Mode is enabled. Use the instant Offline Parser below or disable Air-Gap Mode.');
      return;
    }
    const activeKey = keyDraft.trim() || geminiApiKey.trim();
    if (!activeKey) {
      setShowKeyBox(true);
      setAiReply('Add a free Google Gemini API key above to use Cloud Photo Vision & Coaching — or use the 100% Offline Meal Parser right below with zero API key!');
      return;
    }
    if (keyDraft.trim() && keyDraft.trim() !== geminiApiKey) {
      onSaveGeminiKey(keyDraft.trim());
    }

    setAiLoading(true);
    setAiReply(null);
    setAiEstimated([]);
    onRecordNetworkAudit('generativelanguage.googleapis.com', 'BYOK Gemini Coach / Vision', true);

    try {
      const res = await analyzeWithGeminiBYOK({
        apiKey: activeKey,
        prompt: nlpText.trim() || 'Analyze this meal photo and estimate items, weights, and macros.',
        imageBase64: photoPreview?.base64,
        imageMimeType: photoPreview?.mime,
        contextSummary,
      });
      setAiReply(res.reply);
      setAiEstimated(res.estimatedItems);
    } catch (err: any) {
      setAiReply(`Error: ${err?.message || 'Gemini request failed'}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleRunArena = async () => {
    setAiEstimated([]);
    setAiReply(null);
    if (offlineOnlyMode) {
      onRecordNetworkAudit('Arena relay', 'Arena meal estimate', false);
      setAiReply('Blocked: Air-Gap Offline Mode is enabled. Use the offline parser or disable Air-Gap Mode.');
      return;
    }
    if (!arenaKey.trim() || !arenaRelay.trim()) {
      setShowKeyBox(true);
      setAiReply('Add your Arena API key and deployed relay URL in Arena Settings.');
      return;
    }
    if (!nlpText.trim() && !photoPreview) {
      setAiReply('Enter a food description or attach a photo first.');
      return;
    }
    try {
      const url = arenaRelayUrl(arenaRelay);
      setAiLoading(true);
      onRecordNetworkAudit(new URL(url).host, 'Arena relay → api.arena.ai (meal description / optional photo)', true);
      const res = await analyzeWithArena({relayUrl:url, apiKey:arenaKey, model:arenaModel, prompt:nlpText.trim(), imageBase64:photoPreview?.base64, imageMimeType:photoPreview?.mime});
      setAiReply(res.reply || 'Review these AI estimates before logging.');
      setAiEstimated(res.estimatedItems);
    } catch (err: any) {
      setAiReply(`Error: ${err?.message || 'Arena request failed'}`);
    } finally { setAiLoading(false); }
  };

  // Barcode Lookup (checks local catalog -> Open Food Facts 3.5M+ -> USDA Branded)
  const lookupBarcode = async (rawCode: string) => {
    const code = rawCode.replace(/[^0-9]/g, '');
    if (!code) return;
    setBarcodeInput(code);
    setBarcodeStatus('Looking up barcode across Local DB, Open Food Facts (3.5M+) & USDA...');

    const res = await lookupBarcodeAcrossDatabases({
      rawCode: code,
      catalog,
      usdaApiKey: usdaKey,
      offlineOnlyMode,
      onAudit: onRecordNetworkAudit,
    });

    setBarcodeStatus(res.sourceLabel);
    if (res.item) {
      selectFoodForPortion(res.item);
    }
  };

  const startCameraBarcodeScan = async () => {
    setBarcodeStatus(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);

      const BarcodeDetectorCls = (window as any).BarcodeDetector;
      if (!BarcodeDetectorCls) {
        setBarcodeStatus(
          'Your desktop browser lacks native BarcodeDetector API — type or click a test barcode below (Android Chrome supports live camera scanning!).'
        );
        return;
      }

      const detector = new BarcodeDetectorCls({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'],
      });
      const interval = setInterval(async () => {
        if (!videoRef.current || !streamRef.current) {
          clearInterval(interval);
          return;
        }
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes.length > 0 && codes[0].rawValue) {
            clearInterval(interval);
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            setCameraActive(false);
            lookupBarcode(codes[0].rawValue);
          }
        } catch {
          // frame not ready
        }
      }, 450);
    } catch {
      setBarcodeStatus(
        'Camera permission unavailable in this browser — enter a barcode number or click a test barcode below.'
      );
    }
  };

  const handleQuickOrCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const grams = Math.max(1, parseFloat(cGrams) || 100);
    const kcal = Math.max(0, parseFloat(cKcal) || 0);
    const prot = Math.max(0, parseFloat(cProt) || 0);
    const carbs = Math.max(0, parseFloat(cCarbs) || 0);
    const fat = Math.max(0, parseFloat(cFat) || 0);
    const fiber = Math.max(0, parseFloat(cFiber) || 0);
    const name = cName.trim() || 'Quick Add Calories';

    const micros = emptyMicros();
    micros.fiber = fiber;

    if (customMode === 'save') {
      const factorTo100 = 100 / grams;
      const newFood: FoodItem = {
        id: `custom-${Date.now()}`,
        name,
        brand: cBrand.trim() || 'Custom',
        barcode: cBarcode.trim() || undefined,
        source: 'custom',
        caloriesPer100g: Math.round(kcal * factorTo100),
        proteinPer100g: Math.round(prot * factorTo100 * 10) / 10,
        carbsPer100g: Math.round(carbs * factorTo100 * 10) / 10,
        fatPer100g: Math.round(fat * factorTo100 * 10) / 10,
        microsPer100g: scaleMicros(micros, factorTo100),
        servings: [
          { label: `${cServingLabel.trim() || '1 serving'} (${grams}g)`, grams },
          { label: '100 g', grams: 100 },
        ],
        favorite: true,
      };
      onSaveCustomFood(newFood);
    }

    onLogEntries([
      {
        id: `log-${Date.now()}`,
        date: selectedDate,
        hour: logHour,
        foodId: `quick-${Date.now()}`,
        foodName: name,
        brand: cBrand.trim() || (customMode === 'quick' ? 'Quick Add' : 'Custom'),
        grams,
        servingLabel: cServingLabel.trim() || `${grams} g`,
        servingQty: 1,
        calories: Math.round(kcal),
        protein: Math.round(prot * 10) / 10,
        carbs: Math.round(carbs * 10) / 10,
        fat: Math.round(fat * 10) / 10,
        micros,
      },
    ]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs sm:p-4">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-100">Log Food</h2>
            <select
              value={logHour}
              onChange={(e) => setLogHour(Number(e.target.value))}
              className="rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1 text-xs text-slate-200"
            >
              {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => {
                const label =
                  h === 12 ? '12:00 PM' : h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`;
                return (
                  <option key={h} value={h}>
                    {selectedDate} · {label}
                  </option>
                );
              })}
            </select>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-5 gap-1 p-2 bg-slate-950/40 border-b border-slate-800 text-xs">
          {[
            { id: 'search', label: 'Search', icon: Search },
            { id: 'recipes', label: 'Recipes', icon: ChefHat },
            { id: 'ai', label: 'Describe', icon: Sparkles },
            { id: 'barcode', label: 'Barcode', icon: Barcode },
            { id: 'custom', label: 'Custom', icon: Plus },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedFood(null);
                  setTab(t.id as any);
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg font-medium transition cursor-pointer ${
                  active
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Selected Food Portion Sheet */}
        {selectedFood ? (
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-emerald-400 font-medium">
                  {selectedFood.brand || selectedFood.source.toUpperCase()}
                </div>
                <h3 className="text-lg font-semibold text-slate-100 mt-0.5">
                  {selectedFood.name}
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onToggleFavorite(selectedFood.id)}
                  className={`p-2 rounded-lg border cursor-pointer ${
                    selectedFood.favorite
                      ? 'bg-pink-500/15 border-pink-500/40 text-pink-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                  title="Favorite"
                >
                  <Heart className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelectedFood(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Back
                </button>
              </div>
            </div>

            {(() => {
              const srv = selectedFood.servings[servingIdx] || {
                label: '100 g',
                grams: 100,
              };
              const qty = Math.max(0.05, parseFloat(servingQty) || 0);
              const totalGrams = Math.round(srv.grams * qty * 10) / 10;
              const factor = totalGrams / 100;
              const kcal = Math.round(selectedFood.caloriesPer100g * factor);
              const p = Math.round(selectedFood.proteinPer100g * factor * 10) / 10;
              const c = Math.round(selectedFood.carbsPer100g * factor * 10) / 10;
              const f = Math.round(selectedFood.fatPer100g * factor * 10) / 10;
              const mic = scaleMicros(
                selectedFood.microsPer100g || emptyMicros(),
                factor
              );

              return (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Serving Size
                      </label>
                      <select
                        value={servingIdx}
                        onChange={(e) => setServingIdx(Number(e.target.value))}
                        className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2.5 text-sm text-slate-100"
                      >
                        {selectedFood.servings.map((s, idx) => (
                          <option key={idx} value={idx}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Quantity ({totalGrams} g total)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.25"
                          min="0.1"
                          value={servingQty}
                          onChange={(e) => setServingQty(e.target.value)}
                          className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 tabular-nums"
                        />
                        {[0.5, 1, 1.5, 2].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setServingQty(String(preset))}
                            className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 tabular-nums cursor-pointer"
                          >
                            {preset}x
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Live Macro Summary */}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                      <div className="text-[11px] text-slate-400">Calories</div>
                      <div className="text-lg font-bold text-slate-100 tabular-nums">
                        {kcal}
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                      <div className="text-[11px] text-sky-400">Protein</div>
                      <div className="text-lg font-bold text-sky-400 tabular-nums">
                        {p}g
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                      <div className="text-[11px] text-amber-400">Fat</div>
                      <div className="text-lg font-bold text-amber-400 tabular-nums">
                        {f}g
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                      <div className="text-[11px] text-pink-400">Carbs</div>
                      <div className="text-lg font-bold text-pink-400 tabular-nums">
                        {c}g
                      </div>
                    </div>
                  </div>

                  {/* Key Micronutrients */}
                  <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3">
                    <div className="text-xs font-medium text-slate-400 mb-2">
                      Micronutrient Breakdown ({totalGrams}g)
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs tabular-nums">
                      <div>
                        <span className="text-slate-500">Fiber:</span>{' '}
                        <span className="text-slate-200">{mic.fiber}g</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Sodium:</span>{' '}
                        <span className="text-slate-200">{mic.sodium}mg</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Potass:</span>{' '}
                        <span className="text-slate-200">{mic.potassium}mg</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Iron:</span>{' '}
                        <span className="text-slate-200">{mic.iron}mg</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Magnes:</span>{' '}
                        <span className="text-slate-200">{mic.magnesium}mg</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Calcium:</span>{' '}
                        <span className="text-slate-200">{mic.calcium}mg</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleConfirmSelectedFood}
                    className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    Add to {selectedDate} ({kcal} kcal)
                  </button>
                </>
              );
            })()}
          </div>
        ) : (
          /* Tab Contents */
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {tab === 'search' && (
              <>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Instant local search (e.g. chicken, oats, yogurt, avocado)..."
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setOnlineResults([]);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && query.trim()) {
                          runOnlineCatalogSearch();
                        }
                      }}
                      className="w-full rounded-xl bg-slate-950 border border-slate-700 pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <button
                    onClick={() => setOnlyFavorites((v) => !v)}
                    className={`px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                      onlyFavorites
                        ? 'bg-pink-500/15 border-pink-500/40 text-pink-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Heart className="w-3.5 h-3.5" />
                    Favs
                  </button>
                </div>

                {/* Online USDA + Open Food Facts Trigger */}
                {query.trim().length >= 2 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-950/70 border border-slate-800 px-3 py-2 text-xs">
                    <span className="text-slate-400">
                      Auto-searches online when local hits are sparse — or tap to search 4M+ items:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowUsdaKeyBox((v) => !v)}
                        className="text-[11px] text-slate-400 hover:text-sky-300 underline cursor-pointer"
                      >
                        {usdaKey ? 'USDA Key ✓' : 'USDA Key'}
                      </button>
                      <button
                        type="button"
                        onClick={() => runOnlineCatalogSearch()}
                        disabled={searchingOnline}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 font-medium cursor-pointer disabled:opacity-50"
                      >
                        {searchingOnline ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : offlineOnlyMode ? (
                          <WifiOff className="w-3.5 h-3.5" />
                        ) : (
                          <Globe className="w-3.5 h-3.5" />
                        )}
                        Search USDA + Open Food Facts
                      </button>
                    </div>
                  </div>
                )}

                {showUsdaKeyBox && (
                  <div className="rounded-xl bg-slate-950 border border-sky-500/30 p-3 space-y-2 text-xs">
                    <div className="text-slate-300">
                      Optional free personal USDA API key (get one in 20 sec at{' '}
                      <span className="font-mono text-sky-300">fdc.nal.usda.gov/api-key-signup</span>{' '}
                      for 1,000 searches/hour instead of the shared public DEMO_KEY):
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Paste your free USDA API key..."
                        value={usdaKey}
                        onChange={(e) => {
                          const val = e.target.value;
                          setUsdaKey(val);
                          try {
                            if (val.trim()) localStorage.setItem('openphase_usda_key', val.trim());
                            else localStorage.removeItem('openphase_usda_key');
                          } catch {
                            // ignore storage restrictions
                          }
                        }}
                        className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setShowUsdaKeyBox(false);
                          runOnlineCatalogSearch();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-xs cursor-pointer"
                      >
                        Save & Retry
                      </button>
                    </div>
                  </div>
                )}

                {onlineError && (
                  <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
                    {onlineError}
                  </div>
                )}

                {/* Online Results */}
                {onlineResults.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-400 px-1">
                      Live USDA & Open Food Facts Results
                    </div>
                    {onlineResults.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => selectFoodForPortion(f)}
                        className="w-full text-left rounded-xl bg-slate-950/80 hover:bg-slate-800/80 border border-sky-500/20 px-3.5 py-2.5 flex items-center justify-between gap-3 transition cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-100 truncate">
                            {f.name}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {f.brand || f.source.toUpperCase()} · per 100g
                          </div>
                        </div>
                        <div className="text-right shrink-0 tabular-nums">
                          <div className="text-sm font-semibold text-slate-100">
                            {f.caloriesPer100g} kcal
                          </div>
                          <div className="text-[11px] text-slate-400">
                            P {f.proteinPer100g} · F {f.fatPer100g} · C {f.carbsPer100g}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Local Instant Foods + Smart Time-of-Day Picks */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {query.trim()
                        ? `Offline Local Matches (${filteredLocalFoods.length})`
                        : `Smart Picks for ${
                            logHour === 12
                              ? '12 PM'
                              : logHour > 12
                              ? `${logHour - 12} PM`
                              : `${logHour} AM`
                          } & Offline Core`}
                    </span>
                    <span className="text-[11px] text-emerald-400/80">0ms local SQLite-style index</span>
                  </div>

                  {filteredLocalFoods.map(({ food: f, nearHourCount }) => {
                    const defaultSrv = f.servings[0];
                    const factor = defaultSrv.grams / 100;
                    return (
                      <button
                        key={f.id}
                        onClick={() => selectFoodForPortion(f)}
                        className="w-full text-left rounded-xl bg-slate-950/65 hover:bg-slate-800/80 border border-slate-800/90 px-3.5 py-2.5 flex items-center justify-between gap-3 transition cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-100 truncate">
                              {f.name}
                            </span>
                            {f.source === 'recipe' && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-sm text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                                <ChefHat className="w-2.5 h-2.5" /> Recipe
                              </span>
                            )}
                            {nearHourCount >= 2 && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-sm text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                                <Zap className="w-2.5 h-2.5" /> Pick
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {defaultSrv.label}
                            {f.brand ? ` · ${f.brand}` : ''}
                          </div>
                        </div>
                        <div className="text-right shrink-0 tabular-nums">
                          <div className="text-sm font-semibold text-slate-100">
                            {Math.round(f.caloriesPer100g * factor)} kcal
                          </div>
                          <div className="text-[11px] text-slate-400">
                            <span className="text-sky-400">
                              {Math.round(f.proteinPer100g * factor)}P
                            </span>{' '}
                            ·{' '}
                            <span className="text-amber-400">
                              {Math.round(f.fatPer100g * factor)}F
                            </span>{' '}
                            ·{' '}
                            <span className="text-pink-400">
                              {Math.round(f.carbsPer100g * factor)}C
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {tab === 'recipes' && (
              <RecipeBuilderTab
                catalog={catalog}
                selectedDate={selectedDate}
                logHour={logHour}
                offlineOnlyMode={offlineOnlyMode}
                usdaApiKey={usdaKey}
                onSaveUsdaKey={(k) => {
                  setUsdaKey(k);
                  try {
                    if (k) localStorage.setItem('openphase_usda_key', k);
                    else localStorage.removeItem('openphase_usda_key');
                  } catch {
                    // ignore storage restrictions
                  }
                }}
                onSaveCustomFood={onSaveCustomFood}
                onSaveRecipe={(rec) => onSaveCustomFood(rec)}
                onDeleteRecipe={(id) => onDeleteCustomFood(id)}
                onSelectRecipeToLog={(rec) => selectFoodForPortion(rec)}
                onLogEntries={onLogEntries}
                onRecordNetworkAudit={onRecordNetworkAudit}
                onCloseModal={onClose}
              />
            )}

            {tab === 'ai' && (
              <div className="space-y-3.5">
                <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Natural-Language Meal Logger & Phase AI Coach
                    </div>
                    <button
                      onClick={() => setShowKeyBox((v) => !v)}
                      className="text-[11px] text-sky-400 hover:underline cursor-pointer"
                    >
                      {aiProvider === 'arena' ? 'Arena Settings' : (geminiApiKey ? 'Gemini Key Configured ✓' : 'Add Gemini Key')}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <label htmlFor="ai-provider">AI provider:</label>
                    <select id="ai-provider" value={aiProvider} onChange={(e) => {
                      const provider = e.target.value as 'arena' | 'gemini';
                      setAiProvider(provider); setShowKeyBox(false); setAiReply(null); setAiEstimated([]);
                      try { localStorage.setItem('openphase_ai_provider', provider); } catch { /* private mode */ }
                    }} className="rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-slate-100">
                      <option value="arena">Arena</option><option value="gemini">Gemini</option>
                    </select>
                  </div>
                  {showKeyBox && aiProvider === 'arena' && (
                    <div className="rounded-lg bg-slate-900 border border-slate-700 p-3 space-y-2 text-xs">
                      <p className="text-slate-300">Deploy the relay in ARENA-SETUP.md first. Your key is saved on this device and sent to your relay and Arena when you ask. Only use a relay you trust. Your meal description and any attached photo are sent; your profile and diary are not.</p>
                      <label className="block text-slate-300">Cloudflare Workers relay URL
                        <input type="url" value={arenaRelay} onChange={(e) => setArenaRelay(e.target.value)} placeholder="https://your-relay.your-name.workers.dev" className="w-full mt-1 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-slate-100" />
                      </label>
                      <label className="block text-slate-300">Arena API key
                        <input type="password" value={arenaKey} onChange={(e) => setArenaKey(e.target.value)} placeholder="Paste your Arena API key" autoComplete="off" className="w-full mt-1 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-slate-100" />
                      </label>
                      <label className="block text-slate-300">Model available to your Arena key
                        <input type="text" value={arenaModel} onChange={(e) => setArenaModel(e.target.value)} placeholder="coding-router-preview" className="w-full mt-1 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-slate-100" />
                      </label>
                      <p className="text-slate-400">Default is Arena's documented coding router; availability and suitability for nutrition depend on your account. Choose an enabled model if needed. API charges may apply.</p>
                      {arenaSettingsError && <p className="text-amber-300">{arenaSettingsError}</p>}
                      <button type="button" onClick={() => {
                        try {
                          const url = arenaRelayUrl(arenaRelay);
                          if (!arenaKey.trim()) throw new Error('Enter your Arena API key.');
                          localStorage.setItem('openphase_arena_relay', url);
                          localStorage.setItem('openphase_arena_key', arenaKey.trim());
                          localStorage.setItem('openphase_arena_model', arenaModel.trim() || 'coding-router-preview');
                          setArenaRelay(url); setArenaSettingsError(null); setShowKeyBox(false);
                        } catch (err: any) { setArenaSettingsError(err?.message || 'Unable to save settings on this device.'); }
                      }} className="px-3 py-2 rounded-lg bg-emerald-500 text-slate-950 font-semibold cursor-pointer">Save Arena Settings</button>
                      <button type="button" onClick={() => {
                        setArenaKey(''); setArenaRelay(''); setArenaModel('coding-router-preview');
                        try { localStorage.removeItem('openphase_arena_key'); localStorage.removeItem('openphase_arena_relay'); localStorage.removeItem('openphase_arena_model'); } catch { /* ignore */ }
                      }} className="ml-2 px-3 py-2 text-slate-300 underline cursor-pointer">Remove saved Arena settings</button>
                    </div>
                  )}
                  {showKeyBox && aiProvider === 'gemini' && (
                    <div className="rounded-lg bg-slate-900 border border-slate-700 p-2.5 space-y-2">
                      <div className="text-[11px] text-slate-300">
                        Optional BYOK Gemini API Key (stored only in your browser localStorage; never sent to our server):
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          placeholder="AIzaSy..."
                          value={keyDraft}
                          onChange={(e) => setKeyDraft(e.target.value)}
                          className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-100"
                        />
                        <button
                          onClick={() => {
                            onSaveGeminiKey(keyDraft.trim());
                            setShowKeyBox(false);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold cursor-pointer"
                        >
                          Save Key
                        </button>
                      </div>
                    </div>
                  )}

                  <textarea
                    rows={3}
                    placeholder='Try typing: "3 large eggs, 2 slices sourdough bread, 10g butter, and 1 medium banana" — or ask a coaching question!'
                    value={nlpText}
                    onChange={(e) => setNlpText(e.target.value)}
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                  />

                  {/* Sample 1-Click Prompts */}
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      '3 large eggs, 2 slices sourdough bread, 10g butter, 1 banana',
                      '200g chicken breast, 1 cup jasmine rice, 1/2 avocado',
                      '200g greek yogurt, 1 scoop whey, 100g blueberries, 16g peanut butter',
                    ].map((sample, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setNlpText(sample)}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/70 cursor-pointer"
                      >
                        Sample #{i + 1}
                      </button>
                    ))}
                  </div>

                  {/* Optional Plate/Label Photo Upload + Cloud AI Button */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer">
                      <Camera className="w-3.5 h-3.5 text-sky-400" />
                      {photoPreview ? 'Change Meal Photo' : 'Attach Plate / Label Photo'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={aiProvider === 'arena' ? handleRunArena : handleRunGemini}
                      disabled={aiLoading}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-xs font-medium text-sky-200 cursor-pointer"
                    >
                      {aiLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      {aiProvider === 'arena' ? 'Ask Arena' : 'Ask Cloud Gemini Vision / Coach'}
                    </button>
                  </div>

                  {photoPreview && (
                    <div className="flex items-center gap-3 pt-1">
                      <img
                        src={photoPreview.dataUrl}
                        alt="Meal preview"
                        className="w-16 h-16 object-cover rounded-lg border border-slate-700"
                      />
                      <button
                        onClick={() => setPhotoPreview(null)}
                        className="text-xs text-slate-400 hover:text-slate-200"
                      >
                        Remove photo
                      </button>
                    </div>
                  )}
                </div>

                {/* Instant 100% Offline Deterministic Parse Preview */}
                {offlineDraftItems.length > 0 && (
                  <div className="rounded-xl bg-emerald-950/25 border border-emerald-500/30 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-300">
                        Instant On-Device Parse (0 Network Calls · {offlineDraftItems.length}{' '}
                        items)
                      </span>
                      <span className="text-xs font-bold text-slate-100 tabular-nums">
                        {offlineDraftItems.reduce((s, x) => s + x.calories, 0)} kcal total
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {offlineDraftItems.map((it, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs bg-slate-950/70 rounded-lg px-3 py-2"
                        >
                          <div>
                            <div className="font-medium text-slate-100">{it.food.name}</div>
                            <div className="text-slate-400">
                              {it.servingQty} × {it.servingLabel} ({it.grams}g)
                            </div>
                          </div>
                          <div className="text-right tabular-nums">
                            <div className="font-semibold text-slate-100">
                              {it.calories} kcal
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {it.protein}P · {it.fat}F · {it.carbs}C
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        onLogEntries(
                          draftItemsToLogEntries(offlineDraftItems, selectedDate, logHour)
                        );
                        onClose();
                      }}
                      className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Utensils className="w-3.5 h-3.5" />
                      Log All {offlineDraftItems.length} Parsed Items to Diary
                    </button>
                  </div>
                )}

                {/* Cloud AI response: always review estimates before logging. */}
                {aiReply && (
                  <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 space-y-3">
                    <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {aiReply}
                    </p>
                    {aiEstimated.length > 0 && (
                      <>
                        <div className="space-y-1.5">
                          {aiEstimated.map((item, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-xs bg-slate-900 rounded-lg px-3 py-2"
                            >
                              <span className="text-slate-100 font-medium">
                                {item.name} ({item.grams}g)
                              </span>
                              <span className="text-slate-300 tabular-nums">
                                {item.calories} kcal · {item.protein}P/{item.fat}F/{item.carbs}C
                              </span>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => {
                            const entries: FoodLogEntry[] = aiEstimated.map((it, i) => {
                              const m = emptyMicros();
                              m.fiber = it.fiber || 0;
                              return {
                                id: `ai-log-${Date.now()}-${i}`,
                                date: selectedDate,
                                hour: logHour,
                                foodId: `ai-${Date.now()}-${i}`,
                                foodName: it.name,
                                brand: 'AI Estimate',
                                grams: it.grams,
                                servingLabel: `${it.grams} g`,
                                servingQty: 1,
                                calories: Math.round(it.calories),
                                protein: Math.round(it.protein * 10) / 10,
                                carbs: Math.round(it.carbs * 10) / 10,
                                fat: Math.round(it.fat * 10) / 10,
                                micros: m,
                              };
                            });
                            onLogEntries(entries);
                            onClose();
                          }}
                          className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer"
                        >
                          Review & Log AI Estimated Meal
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === 'barcode' && (
              <div className="space-y-4">
                <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">
                        Barcode Lookup (Local + Open Food Facts)
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Scan with your phone camera or enter any UPC/EAN barcode
                      </p>
                    </div>
                    <button
                      onClick={startCameraBarcodeScan}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-medium cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      Start Camera
                    </button>
                  </div>

                  {cameraActive && (
                    <video
                      ref={videoRef}
                      className="w-full max-h-52 rounded-xl bg-black object-cover border border-slate-700"
                      playsInline
                      muted
                    />
                  )}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter UPC / EAN barcode (e.g. 0748927028669)..."
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 tabular-nums"
                    />
                    <button
                      onClick={() => lookupBarcode(barcodeInput)}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs cursor-pointer"
                    >
                      Lookup
                    </button>
                  </div>

                  {/* Test Barcodes for Desktop Demo */}
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] text-slate-400">
                      Test drive right now without a package in hand:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'ON Gold Standard Whey', code: '0748927028669' },
                        { label: 'Fage Total 0% Yogurt', code: '0689544080602' },
                        { label: 'Live OFF: Nutella Jar', code: '3017620422003' },
                      ].map((b) => (
                        <button
                          key={b.code}
                          onClick={() => lookupBarcode(b.code)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 cursor-pointer"
                        >
                          {b.label} ({b.code.slice(-4)})
                        </button>
                      ))}
                    </div>
                  </div>

                  {barcodeStatus && (
                    <div className="text-xs text-sky-300 bg-sky-500/10 border border-sky-500/25 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                      <span>{barcodeStatus}</span>
                      {barcodeInput && barcodeStatus.startsWith('No product found') && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomMode('save');
                            setCBarcode(barcodeInput);
                            setTab('custom');
                          }}
                          className="px-2.5 py-1 rounded-md bg-emerald-500 text-slate-950 font-semibold cursor-pointer"
                        >
                          Attach Barcode to Custom Food →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'custom' && (
              <form onSubmit={handleQuickOrCustomSubmit} className="space-y-3.5">
                <div className="flex gap-2 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setCustomMode('quick')}
                    className={`flex-1 py-2 rounded-lg font-medium cursor-pointer ${
                      customMode === 'quick'
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400'
                    }`}
                  >
                    One-Off Quick Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomMode('save')}
                    className={`flex-1 py-2 rounded-lg font-medium cursor-pointer ${
                      customMode === 'save'
                        ? 'bg-slate-800 text-emerald-300'
                        : 'text-slate-400'
                    }`}
                  >
                    Save Reusable Custom Food
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Title / Food Name
                    </label>
                    <input
                      type="text"
                      required={customMode === 'save'}
                      placeholder={
                        customMode === 'quick' ? 'Restaurant Estimate' : 'Homemade Chili'
                      }
                      value={cName}
                      onChange={(e) => setCName(e.target.value)}
                      className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100"
                    />
                  </div>
                  {customMode === 'save' && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Brand / Source (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="Homemade / Trader Joe's"
                        value={cBrand}
                        onChange={(e) => setCBrand(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100"
                      />
                    </div>
                  )}
                </div>

                {customMode === 'save' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Serving Label
                      </label>
                      <input
                        type="text"
                        value={cServingLabel}
                        onChange={(e) => setCServingLabel(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Serving Weight (grams)
                      </label>
                      <input
                        type="number"
                        value={cGrams}
                        onChange={(e) => setCGrams(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Barcode (Optional UPC/EAN)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 0012345678905"
                        value={cBarcode}
                        onChange={(e) => setCBarcode(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 tabular-nums"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {[
                    { label: 'Calories *', val: cKcal, set: setCKcal, req: true },
                    { label: 'Protein (g)', val: cProt, set: setCProt },
                    { label: 'Fat (g)', val: cFat, set: setCFat },
                    { label: 'Carbs (g)', val: cCarbs, set: setCCarbs },
                    { label: 'Fiber (g)', val: cFiber, set: setCFiber },
                  ].map((f) => (
                    <div key={f.label}>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        {f.label}
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        required={f.req}
                        placeholder="0"
                        value={f.val}
                        onChange={(e) => f.set(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-700 px-2.5 py-2 text-sm text-slate-100 tabular-nums"
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm cursor-pointer"
                >
                  {customMode === 'save'
                    ? 'Save Custom Food & Log Serving'
                    : 'Quick Add to Diary'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
