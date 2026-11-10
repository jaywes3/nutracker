import React, { useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Upload,
  UserCheck,
  WifiOff,
} from 'lucide-react';
import {
  calculateBMR,
  computeIdealTargetsFromExpenditure,
  displayToKg,
  getDayAdjustedTargets,
  kgToDisplay,
  unitWeightLabel,
} from '../engine/metabolism';
import { parseMacroFactorOrCsvFile } from '../engine/importer';
import type {
  CheckInRecord,
  DailyComputedPoint,
  FoodLogEntry,
  NetworkAuditEvent,
  UserProfile,
  WeightEntry,
} from '../types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface StrategyProps {
  profile: UserProfile;
  latestPoint: DailyComputedPoint;
  checkIns: CheckInRecord[];
  onUpdateProfile: (next: UserProfile) => void;
  onOpenCheckIn: () => void;
}

export const StrategyPanel: React.FC<StrategyProps> = ({
  profile,
  latestPoint,
  checkIns,
  onUpdateProfile,
  onOpenCheckIn,
}) => {
  const unit = unitWeightLabel(profile.unitSystem);
  const [customKcalInput, setCustomKcalInput] = useState(
    String(profile.acceptedBaseTargets.calories)
  );

  const applyStrategyChange = (patch: Partial<UserProfile>, recalcTargets = true) => {
    const merged: UserProfile = { ...profile, ...patch };
    // Recalculate formula TDEE when activityMultiplier changes while empirical data is still sparse (<14 days)
    const effectiveExpenditure =
      patch.activityMultiplier !== undefined && latestPoint.confidence < 75
        ? Math.round(
            calculateBMR(merged, latestPoint.trendWeightKg) *
              merged.activityMultiplier
          )
        : latestPoint.expenditure;

    if (recalcTargets && merged.programStyle !== 'manual') {
      merged.acceptedBaseTargets = computeIdealTargetsFromExpenditure(
        effectiveExpenditure,
        latestPoint.trendWeightKg,
        merged
      );
      setCustomKcalInput(String(merged.acceptedBaseTargets.calories));
    }
    onUpdateProfile(merged);
  };

  const applyCustomCalorieOverride = (kcal: number) => {
    const clamped = Math.max(1000, Math.min(6000, Math.round(kcal)));
    // Compute balanced protein/fat/carbs around user's chosen calories
    const tempGoalProfile: UserProfile = {
      ...profile,
      goalType: 'maintain',
      goalRatePctPerWeek: 0,
    };
    const balanced = computeIdealTargetsFromExpenditure(
      clamped,
      latestPoint.trendWeightKg,
      tempGoalProfile
    );
    onUpdateProfile({
      ...profile,
      programStyle:
        profile.programStyle === 'coached' ? 'collaborative' : profile.programStyle,
      acceptedBaseTargets: { ...balanced, calories: clamped },
    });
    setCustomKcalInput(String(clamped));
  };

  const toggleTrainingDay = (dow: number) => {
    const exists = profile.trainingDays.includes(dow);
    const nextDays = exists
      ? profile.trainingDays.filter((d) => d !== dow)
      : [...profile.trainingDays, dow].sort();
    applyStrategyChange({ trainingDays: nextDays }, false);
  };

  return (
    <div className="space-y-5">
      {/* Top Active Program Summary */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              Nutrition Strategy & Coaching Program
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              BMR: {calculateBMR(profile, latestPoint.trendWeightKg)} kcal · Current Adaptive TDEE:{' '}
              <span className="text-amber-400 font-medium">
                {latestPoint.expenditure} kcal
              </span>{' '}
              ({latestPoint.confidence}% confidence)
            </p>
          </div>
          <button
            onClick={onOpenCheckIn}
            className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs cursor-pointer"
          >
            Run Check-In Now
          </button>
        </div>

        {/* Program Style Selector */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Program Mode
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                id: 'coached',
                title: 'Coached',
                desc: 'Auto-calculates & updates weekly',
              },
              {
                id: 'collaborative',
                title: 'Collaborative',
                desc: 'Coach suggests, you customize',
              },
              {
                id: 'manual',
                title: 'Manual',
                desc: 'Fixed targets + TDEE analytics',
              },
            ].map((m) => {
              const active = profile.programStyle === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => applyStrategyChange({ programStyle: m.id as any })}
                  className={`text-left rounded-xl p-3 border transition cursor-pointer ${
                    active
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-slate-100'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="text-xs font-semibold">{m.title}</div>
                  <div className="text-[11px] opacity-80 mt-0.5">{m.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Goal Direction & Weekly Rate */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Goal Direction
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'lose', label: 'Cut / Lose', rate: -0.6 },
                { id: 'maintain', label: 'Maintain', rate: 0 },
                { id: 'gain', label: 'Lean Gain', rate: 0.25 },
              ].map((g) => (
                <button
                  key={g.id}
                  onClick={() =>
                    applyStrategyChange({
                      goalType: g.id as any,
                      goalRatePctPerWeek: g.rate,
                    })
                  }
                  className={`py-2.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                    profile.goalType === g.id
                      ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {profile.goalType !== 'maintain' && (
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-400">Target Weekly Rate</span>
                <span className="font-semibold text-emerald-400 tabular-nums">
                  {profile.goalRatePctPerWeek > 0 ? '+' : ''}
                  {profile.goalRatePctPerWeek.toFixed(2)}% / wk (
                  {kgToDisplay(
                    (profile.goalRatePctPerWeek / 100) * latestPoint.trendWeightKg,
                    profile.unitSystem
                  )}{' '}
                  {unit}/wk)
                </span>
              </div>
              <input
                type="range"
                min={profile.goalType === 'lose' ? -1.2 : 0.1}
                max={profile.goalType === 'lose' ? -0.2 : 0.6}
                step={0.05}
                value={profile.goalRatePctPerWeek}
                onChange={(e) =>
                  applyStrategyChange({ goalRatePctPerWeek: Number(e.target.value) })
                }
                className="w-full accent-emerald-500 mt-1"
              />
            </div>
          )}
        </div>

        {/* Protein Tier & Diet Floor */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Protein Anchor (Scaled to Trend Weight)
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { id: 'low', label: 'Low', sub: '0.7g/lb' },
                { id: 'moderate', label: 'Mod', sub: '0.85g/lb' },
                { id: 'high', label: 'High', sub: '1.0g/lb' },
                { id: 'extra_high', label: 'Extra', sub: '1.15g/lb' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyStrategyChange({ proteinTier: p.id as any })}
                  className={`py-2 px-2 rounded-xl border text-center cursor-pointer ${
                    profile.proteinTier === p.id
                      ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="text-xs font-semibold">{p.label}</div>
                  <div className="text-[10px] opacity-75">{p.sub}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Carb / Fat Preference
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { id: 'balanced', label: 'Balanced' },
                { id: 'high_carb', label: 'High Carb' },
                { id: 'low_carb', label: 'Low Carb' },
              {
                id: 'keto',
                label: 'Keto',
              },
            ].map((d) => (
              <button
                key={d.id}
                onClick={() => applyStrategyChange({ dietStyle: d.id as any })}
                className={`py-2.5 px-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                  profile.dietStyle === d.id
                    ? 'bg-pink-500/15 border-pink-500/40 text-pink-300'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Day-1 Baseline Activity Level & Direct Custom Calorie Override */}
      <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Initial Activity Baseline (Used Days 1–13 Before Real TDEE Locks In)
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { mult: 1.2, label: 'Sedentary', sub: 'Desk · <5k steps' },
              { mult: 1.3, label: 'Light', sub: '6k–8k + Lift' },
              { mult: 1.45, label: 'Moderate', sub: '9k–11k steps' },
              { mult: 1.6, label: 'Very Active', sub: '12k+ / Labor' },
            ].map((a) => {
              const active = Math.abs(profile.activityMultiplier - a.mult) < 0.04;
              return (
                <button
                  key={a.mult}
                  onClick={() => applyStrategyChange({ activityMultiplier: a.mult })}
                  className={`py-2 px-1.5 rounded-xl border text-center cursor-pointer ${
                    active
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="text-[11px] font-semibold">{a.label}</div>
                  <div className="text-[9px] opacity-75">{a.sub}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Custom Daily Calorie Override (Optional — Auto-Balances Macros)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min={1000}
              max={6000}
              step={25}
              value={customKcalInput}
              onChange={(e) => setCustomKcalInput(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 tabular-nums"
              placeholder="e.g. 1750"
            />
            <button
              type="button"
              onClick={() => applyCustomCalorieOverride(Number(customKcalInput) || 1800)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-emerald-300 shrink-0 cursor-pointer"
            >
              Set Target
            </button>
          </div>
        </div>
      </div>
    </div>

      {/* Training / Rest Day Calorie Cycling Card */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Training vs. Rest Day Calorie Shifting
            </h3>
            <p className="text-xs text-slate-400">
              Shifts +10% calories into carbs on lifting/training days while keeping weekly total identical ({profile.acceptedBaseTargets.calories * 7} kcal/wk)
            </p>
          </div>
          <button
            onClick={() =>
              applyStrategyChange(
                {
                  calorieCycling:
                    profile.calorieCycling === 'training_rest'
                      ? 'off'
                      : 'training_rest',
                },
                false
              )
            }
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
              profile.calorieCycling === 'training_rest'
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-950 border-slate-700 text-slate-400'
            }`}
          >
            {profile.calorieCycling === 'training_rest' ? 'Active' : 'Off'}
          </button>
        </div>

        {profile.calorieCycling === 'training_rest' && (
          <div className="grid grid-cols-7 gap-1.5 pt-1">
            {DAY_NAMES.map((name, dow) => {
              // Construct dummy date matching that weekday (2026-11-08 is Sunday = 0)
              const sampleDate = `2026-11-${String(8 + dow).padStart(2, '0')}`;
              const adj = getDayAdjustedTargets(
                profile,
                latestPoint.trendWeightKg,
                sampleDate
              );
              return (
                <button
                  key={dow}
                  onClick={() => toggleTrainingDay(dow)}
                  className={`rounded-xl p-2 border text-center transition cursor-pointer ${
                    adj.isTrainingDay
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                      : 'bg-slate-950/70 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="text-[11px] font-semibold">{name}</div>
                  <div className="text-xs font-bold text-slate-100 tabular-nums mt-1">
                    {adj.targets.calories}
                  </div>
                  <div className="text-[10px] opacity-80 tabular-nums">
                    {adj.targets.carbs}g C
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Past Check-In History */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5">
        <h3 className="text-sm font-semibold text-slate-100 mb-3">
          Check-In History ({checkIns.length})
        </h3>
        <div className="space-y-2">
          {[...checkIns].reverse().map((ci) => (
            <div
              key={ci.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-950/70 border border-slate-800/80 px-3.5 py-2.5 text-xs"
            >
              <div>
                <div className="font-medium text-slate-200">
                  {ci.date} ·{' '}
                  <span className="capitalize text-emerald-400">{ci.action}</span>
                </div>
                <div className="text-slate-400 mt-0.5">{ci.note}</div>
              </div>
              <div className="text-right tabular-nums">
                <div className="font-semibold text-slate-100">
                  {ci.previousCalories} → {ci.newCalories} kcal
                </div>
                <div className="text-[11px] text-slate-500">
                  TDEE {ci.measuredTdee} kcal ({ci.confidence}%)
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface PrivacyAndDataProps {
  profile: UserProfile;
  weights: WeightEntry[];
  logs: FoodLogEntry[];
  networkEvents: NetworkAuditEvent[];
  onUpdateProfile: (next: UserProfile) => void;
  onStartFreshPersonalProfile: (setup: {
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
  }) => void;
  onReloadDemo: () => void;
  onImportData: (weights: WeightEntry[], logs: FoodLogEntry[], mode: 'merge' | 'replace') => void;
  onExportBackupJson: () => void;
  onExportCsv: () => void;
}

export const PrivacyAndDataPanel: React.FC<PrivacyAndDataProps> = ({
  profile,
  weights,
  logs,
  networkEvents,
  onUpdateProfile,
  onStartFreshPersonalProfile,
  onReloadDemo,
  onImportData,
  onExportBackupJson,
  onExportCsv,
}) => {
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('replace');

  // Fresh personal profile form state
  const initTotalIn = Math.round(profile.heightCm / 2.54);
  const [fName, setFName] = useState('Me');
  const [fUnit, setFUnit] = useState<'imperial' | 'metric'>(profile.unitSystem);
  const [fSex, setFSex] = useState<'male' | 'female' | 'neutral'>(profile.sex);
  const [fAge, setFAge] = useState(String(profile.age));
  const [fHeightCm, setFHeightCm] = useState(String(profile.heightCm));
  const [fHeightFt, setFHeightFt] = useState(String(Math.floor(initTotalIn / 12)));
  const [fHeightIn, setFHeightIn] = useState(String(initTotalIn % 12));
  const [fCurW, setFCurW] = useState(
    String(kgToDisplay(profile.startingWeightKg, profile.unitSystem))
  );
  const [fTargW, setFTargW] = useState(
    String(kgToDisplay(profile.targetWeightKg, profile.unitSystem))
  );
  const [fGoal, setFGoal] = useState<'lose' | 'maintain' | 'gain'>(profile.goalType);
  const [fActivity, setFActivity] = useState('1.3');
  const [fPacePct, setFPacePct] = useState('-0.65');
  const [fBodyFat, setFBodyFat] = useState(
    profile.bodyFatPct ? String(profile.bodyFatPct) : ''
  );

  // Compute live Day-1 preview right inside the onboarding form!
  const effectiveHeightCm =
    fUnit === 'imperial'
      ? Math.round(((Number(fHeightFt) || 5) * 12 + (Number(fHeightIn) || 0)) * 2.54)
      : Number(fHeightCm) || 175;
  const previewWeightKg = displayToKg(Number(fCurW) || 170, fUnit);
  const parsedBf = parseFloat(fBodyFat);
  const validBf =
    !Number.isNaN(parsedBf) && parsedBf >= 4 && parsedBf <= 65 ? parsedBf : undefined;
  const previewRate =
    fGoal === 'maintain'
      ? 0
      : fGoal === 'gain'
        ? Math.abs(parseFloat(fPacePct) || 0.25)
        : -Math.abs(parseFloat(fPacePct) || 0.65);

  const previewProfile: UserProfile = {
    ...profile,
    sex: fSex,
    age: Number(fAge) || 30,
    heightCm: effectiveHeightCm,
    bodyFatPct: validBf,
    activityMultiplier: Number(fActivity) || 1.3,
    goalType: fGoal,
    goalRatePctPerWeek: previewRate,
  };
  const previewBmr = calculateBMR(previewProfile, previewWeightKg);
  const previewInitialTdee = Math.round(
    previewBmr * previewProfile.activityMultiplier
  );
  const previewTargets = computeIdealTargetsFromExpenditure(
    previewInitialTdee,
    previewWeightKg,
    previewProfile
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus('Parsing file locally in browser...');
    try {
      if (file.name.endsWith('.json')) {
        const text = await file.text();
        const data = JSON.parse(text);
        if (Array.isArray(data.weights) || Array.isArray(data.logs)) {
          onImportData(data.weights || [], data.logs || [], importMode);
          setImportStatus(
            `Restored ${(data.weights || []).length} weigh-ins & ${(data.logs || []).length} food logs from JSON backup.`
          );
          return;
        }
      }
      const res = await parseMacroFactorOrCsvFile(file, profile.unitSystem);
      onImportData(res.weights, res.logs, importMode);
      setImportStatus(res.summary);
    } catch (err: any) {
      setImportStatus(`Import error: ${err?.message || 'Could not parse file'}`);
    }
  };

  // Approximate localStorage bytes used
  const storageKb = Math.round(
    (JSON.stringify({ profile, weights, logs }).length / 1024) * 10
  ) / 10;

  return (
    <div className="space-y-5">
      {/* Switch Between Demo Mode & Real Personal Profile */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              Start Fresh With Your Own Profile (Or Reset Demo)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Currently viewing:{' '}
              <span className="text-emerald-300 font-medium">
                {profile.isDemoData ? '35-Day Demo Dataset' : `Personal Profile (${profile.name})`}
              </span>
            </p>
          </div>
          <button
            onClick={onReloadDemo}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reload 35-Day Demo Data
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onStartFreshPersonalProfile({
              name: fName.trim() || 'Me',
              sex: fSex,
              age: Number(fAge) || 30,
              heightCm: effectiveHeightCm,
              currentWeightDisplay: Number(fCurW) || 180,
              targetWeightDisplay: Number(fTargW) || 165,
              unitSystem: fUnit,
              goalType: fGoal,
              activityMultiplier: Number(fActivity) || 1.3,
              goalRatePctPerWeek: previewRate,
              bodyFatPct: validBf,
            });
          }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1"
        >
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Name</label>
            <input
              type="text"
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Units</label>
            <select
              value={fUnit}
              onChange={(e) => {
                const nextU = e.target.value as 'imperial' | 'metric';
                const curKg = displayToKg(Number(fCurW) || 80, fUnit);
                const targKg = displayToKg(Number(fTargW) || 75, fUnit);
                if (nextU === 'imperial' && fUnit === 'metric') {
                  const totIn = Math.round((Number(fHeightCm) || 175) / 2.54);
                  setFHeightFt(String(Math.floor(totIn / 12)));
                  setFHeightIn(String(totIn % 12));
                } else if (nextU === 'metric' && fUnit === 'imperial') {
                  setFHeightCm(String(effectiveHeightCm));
                }
                setFUnit(nextU);
                setFCurW(String(kgToDisplay(curKg, nextU)));
                setFTargW(String(kgToDisplay(targKg, nextU)));
              }}
              className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100"
            >
              <option value="imperial">Imperial (lbs, ft/in)</option>
              <option value="metric">Metric (kg, cm)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">BMR Sex</label>
            <select
              value={fSex}
              onChange={(e) => setFSex(e.target.value as any)}
              className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="neutral">Non-binary midpoint</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Age</label>
            <input
              type="number"
              value={fAge}
              onChange={(e) => setFAge(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 tabular-nums"
            />
          </div>

          {fUnit === 'imperial' ? (
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Height (ft / in)
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="number"
                  min={3}
                  max={8}
                  placeholder="ft"
                  value={fHeightFt}
                  onChange={(e) => setFHeightFt(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs text-slate-100 tabular-nums"
                />
                <input
                  type="number"
                  min={0}
                  max={11}
                  placeholder="in"
                  value={fHeightIn}
                  onChange={(e) => setFHeightIn(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs text-slate-100 tabular-nums"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Height (cm)</label>
              <input
                type="number"
                value={fHeightCm}
                onChange={(e) => setFHeightCm(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 tabular-nums"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Current Weight ({fUnit === 'imperial' ? 'lbs' : 'kg'})
            </label>
            <input
              type="number"
              step="0.1"
              value={fCurW}
              onChange={(e) => setFCurW(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Goal Weight ({fUnit === 'imperial' ? 'lbs' : 'kg'})
            </label>
            <input
              type="number"
              step="0.1"
              value={fTargW}
              onChange={(e) => setFTargW(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Body Fat % (Optional)
            </label>
            <input
              type="number"
              min={4}
              max={65}
              placeholder="Auto (Mifflin)"
              value={fBodyFat}
              onChange={(e) => setFBodyFat(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 tabular-nums"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-[11px] text-slate-400 mb-1">
              Daily Lifestyle / Baseline Activity (Days 1–13 Prior)
            </label>
            <select
              value={fActivity}
              onChange={(e) => setFActivity(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100"
            >
              <option value="1.2">Sedentary / Desk Job (&lt;5,000 steps/day · 1.20×)</option>
              <option value="1.3">Lightly Active (Desk + 3x Workouts / 6k–8k steps · 1.30×)</option>
              <option value="1.45">Moderately Active (On feet / 9k–12k steps · 1.45×)</option>
              <option value="1.6">Very Active (Physical job / 12k+ steps · 1.60×)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Goal</label>
            <select
              value={fGoal}
              onChange={(e) => {
                const g = e.target.value as 'lose' | 'maintain' | 'gain';
                setFGoal(g);
                if (g === 'lose') setFPacePct('-0.65');
                else if (g === 'gain') setFPacePct('0.25');
                else setFPacePct('0');
              }}
              className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100"
            >
              <option value="lose">Lose Fat</option>
              <option value="maintain">Maintain</option>
              <option value="gain">Build Muscle</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Weekly Pace
            </label>
            {fGoal === 'maintain' ? (
              <div className="w-full rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2 text-xs text-slate-400">
                Weight Maintenance
              </div>
            ) : fGoal === 'lose' ? (
              <select
                value={fPacePct}
                onChange={(e) => setFPacePct(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100"
              >
                <option value="-0.5">Gentle (-0.5% / wk)</option>
                <option value="-0.65">Standard (-0.65% / wk)</option>
                <option value="-0.85">Brisk (-0.85% / wk)</option>
                <option value="-1.0">Aggressive (-1.0% / wk)</option>
              </select>
            ) : (
              <select
                value={fPacePct}
                onChange={(e) => setFPacePct(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100"
              >
                <option value="0.2">Lean (+0.2% / wk)</option>
                <option value="0.3">Standard (+0.3% / wk)</option>
                <option value="0.5">Fast (+0.5% / wk)</option>
              </select>
            )}
          </div>

          {/* Live Day-1 Preview Card */}
          <div className="col-span-2 sm:col-span-4 rounded-xl bg-slate-950/80 border border-emerald-500/30 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="text-slate-300">
              <span className="text-slate-400">Day-1 Formula Estimate:</span>{' '}
              BMR <span className="font-mono text-slate-200">{previewBmr}</span> ×{' '}
              <span className="font-mono text-slate-200">{fActivity}</span> ={' '}
              <span className="font-semibold text-amber-300">
                {previewInitialTdee} TDEE
              </span>{' '}
              {fGoal !== 'maintain' && (
                <span className="text-slate-400">
                  ({previewTargets.calories - previewInitialTdee > 0 ? '+' : ''}
                  {previewTargets.calories - previewInitialTdee} kcal/day goal offset)
                </span>
              )}
            </div>
            <div className="font-bold text-emerald-400 tabular-nums">
              Day-1 Target: {previewTargets.calories} kcal ({previewTargets.protein}P ·{' '}
              {previewTargets.fat}F · {previewTargets.carbs}C)
            </div>
          </div>

          <div className="col-span-2 sm:col-span-4 pt-1">
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs cursor-pointer"
            >
              Wipe Demo Data & Start My Personal Tracker ({previewTargets.calories} kcal/day)
            </button>
          </div>
        </form>
      </div>

      {/* MacroFactor .xlsx / .csv Importer & Local Backup */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 space-y-3.5">
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-sky-400" />
          Import MacroFactor (.xlsx / .csv) & Local Backups
        </h3>
        <p className="text-xs text-slate-400">
          Drop your official MacroFactor Quick Export (<code>.xlsx</code>), CSV spreadsheet, or OpenPhase JSON backup. Parsing runs 100% locally inside your browser.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={importMode}
            onChange={(e) => setImportMode(e.target.value as any)}
            className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-200"
          >
            <option value="replace">Replace current logs</option>
            <option value="merge">Merge with current logs</option>
          </select>

          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-xs font-semibold text-sky-200 cursor-pointer">
            <Upload className="w-4 h-4" />
            Select MacroFactor .xlsx / .csv / .json
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.json"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          <button
            onClick={onExportBackupJson}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export Full JSON Backup
          </button>

          <button
            onClick={onExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
          >
            <Database className="w-3.5 h-3.5" />
            Export Diary CSV
          </button>
        </div>

        {importStatus && (
          <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3.5 py-2.5">
            {importStatus}
          </div>
        )}
      </div>

      {/* Security & Privacy Transparency Audit */}
      <div className="rounded-2xl bg-slate-900/80 border border-emerald-500/25 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Security, Privacy & Source Audit (vs. Closed-Source APKs)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Zero crash reporters (no Sentry), zero analytics SDKs, zero accounts. Local browser footprint: {storageKb} KB.
            </p>
          </div>

          <button
            onClick={() =>
              onUpdateProfile({
                ...profile,
                offlineOnlyMode: !profile.offlineOnlyMode,
              })
            }
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              profile.offlineOnlyMode
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-600'
            }`}
          >
            <WifiOff className="w-3.5 h-3.5" />
            {profile.offlineOnlyMode
              ? 'Air-Gap Offline Mode: ON'
              : 'Enable Air-Gap Offline Mode'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
            <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> 100% Inspectable Source
            </div>
            <p className="text-slate-400 mt-1">
              Every line of EWMA smoothing & Adaptive TDEE math is plain TypeScript in <code>src/engine/metabolism.ts</code>.
            </p>
          </div>
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
            <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Local-Only Database
            </div>
            <p className="text-slate-400 mt-1">
              Weights, food logs, and optional Gemini keys live strictly in browser <code>localStorage</code>.
            </p>
          </div>
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
            <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Installable Home-Screen PWA
            </div>
            <p className="text-slate-400 mt-1">
              In Chrome/Safari on your phone, tap <strong>Share / Menu → Add to Home Screen</strong>—no APK sideloading needed.
            </p>
          </div>
        </div>

        {/* Live Outbound Network Log */}
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Session Outbound Network Request Audit ({networkEvents.length} external calls)
          </div>
          {networkEvents.length === 0 ? (
            <div className="text-xs text-slate-500">
              0 external network calls made this session — all calculations, food searches, and charts ran 100% locally.
            </div>
          ) : (
            <div className="space-y-1 max-h-32 overflow-y-auto text-xs tabular-nums">
              {networkEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between text-slate-300 py-0.5"
                >
                  <span>
                    <span className="text-slate-500">{ev.timestamp}</span> ·{' '}
                    {ev.destination} ({ev.purpose})
                  </span>
                  <span
                    className={
                      ev.status === 'allowed' ? 'text-emerald-400' : 'text-amber-400'
                    }
                  >
                    {ev.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
