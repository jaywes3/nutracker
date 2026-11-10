import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  X,
} from 'lucide-react';
import type { CheckInProposal } from '../engine/metabolism';
import { kgToDisplay, splitCaloriesIntoMacros, unitWeightLabel } from '../engine/metabolism';
import type { MacroTargets, UserProfile } from '../types';

interface CheckInModalProps {
  proposal: CheckInProposal;
  profile: UserProfile;
  onAccept: (targets: MacroTargets, action: 'accepted' | 'overridden') => void;
  onSkip: () => void;
  onClose: () => void;
}

export const CheckInModal: React.FC<CheckInModalProps> = ({
  proposal,
  profile,
  onAccept,
  onSkip,
  onClose,
}) => {
  const [overrideMode, setOverrideMode] = useState(false);
  const [customKcal, setCustomKcal] = useState(proposal.proposedTargets.calories);

  const unit = unitWeightLabel(profile.unitSystem);
  const previewTargets = overrideMode
    ? splitCaloriesIntoMacros(customKcal, proposal.trendWeightKg, profile)
    : proposal.proposedTargets;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-emerald-500/15 via-slate-900 to-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Weekly Coaching Check-In
              </h2>
              <p className="text-xs text-slate-400">
                Evidence-based review of your last 14 days
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Summary Stats Row */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-3">
              <div className="text-[11px] text-slate-400">Adaptive TDEE</div>
              <div className="text-lg font-bold text-amber-400 tabular-nums mt-0.5">
                {proposal.measuredTdee}
                <span className="text-xs font-normal text-slate-400 ml-1">kcal</span>
              </div>
              <div className="text-[11px] text-slate-500">
                {proposal.confidence}% confidence
              </div>
            </div>
            <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-3">
              <div className="text-[11px] text-slate-400">Trend Weight</div>
              <div className="text-lg font-bold text-emerald-400 tabular-nums mt-0.5">
                {kgToDisplay(proposal.trendWeightKg, profile.unitSystem)}
                <span className="text-xs font-normal text-slate-400 ml-1">{unit}</span>
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                {proposal.weeklyTrendDeltaKg > 0 ? '+' : ''}
                {kgToDisplay(proposal.weeklyTrendDeltaKg, profile.unitSystem)} {unit}/wk
              </div>
            </div>
            <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-3">
              <div className="text-[11px] text-slate-400">Data Coverage</div>
              <div className="text-lg font-bold text-sky-400 tabular-nums mt-0.5">
                {proposal.loggedDaysLast14}/14
              </div>
              <div className="text-[11px] text-slate-500">complete days</div>
            </div>
          </div>

          {/* Reasoning Banner */}
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/60 p-3.5">
            <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-emerald-400 shrink-0" />
              {proposal.headline}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mt-1.5">
              {proposal.explanation}
            </p>
            {(proposal.wasCappedAt200 || proposal.hitCalorieFloor) && (
              <div className="flex flex-wrap gap-2 mt-2.5">
                {proposal.wasCappedAt200 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <ShieldAlert className="w-3 h-3" />
                    ±200 kcal/wk guardrail applied (unclamped: {proposal.unclampedCalories} kcal)
                  </span>
                )}
                {proposal.hitCalorieFloor && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-sky-500/15 text-sky-300 border border-sky-500/30">
                    <ShieldAlert className="w-3 h-3" />
                    90% BMR Safety Floor Active
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Before -> After Target Comparison */}
          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
              <span>Previous Daily Base</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-emerald-400 font-medium">
                {overrideMode ? 'Custom Override' : 'Recommended Base'}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                {
                  label: 'Calories',
                  prev: proposal.previousTargets.calories,
                  next: previewTargets.calories,
                  unit: 'kcal',
                  color: 'text-slate-100',
                },
                {
                  label: 'Protein',
                  prev: proposal.previousTargets.protein,
                  next: previewTargets.protein,
                  unit: 'g',
                  color: 'text-sky-400',
                },
                {
                  label: 'Fat',
                  prev: proposal.previousTargets.fat,
                  next: previewTargets.fat,
                  unit: 'g',
                  color: 'text-amber-400',
                },
                {
                  label: 'Carbs',
                  prev: proposal.previousTargets.carbs,
                  next: previewTargets.carbs,
                  unit: 'g',
                  color: 'text-pink-400',
                },
              ].map((m) => {
                const diff = m.next - m.prev;
                return (
                  <div
                    key={m.label}
                    className="rounded-lg bg-slate-900/90 border border-slate-800/80 p-2.5"
                  >
                    <div className="text-[11px] text-slate-400">{m.label}</div>
                    <div className="text-[11px] text-slate-500 line-through tabular-nums mt-0.5">
                      {m.prev}
                      {m.unit === 'g' ? 'g' : ''}
                    </div>
                    <div className={`text-base font-bold tabular-nums ${m.color}`}>
                      {m.next}
                      <span className="text-[11px] font-normal text-slate-400">
                        {m.unit === 'g' ? 'g' : ''}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 tabular-nums">
                      {diff === 0 ? '—' : diff > 0 ? `+${diff}` : `${diff}`}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Optional manual calorie override slider */}
            {overrideMode && (
              <div className="mt-4 pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-300">Custom Daily Calorie Target</span>
                  <span className="font-semibold text-emerald-400 tabular-nums">
                    {customKcal} kcal
                  </span>
                </div>
                <input
                  type="range"
                  min={1100}
                  max={4200}
                  step={10}
                  value={customKcal}
                  onChange={(e) => setCustomKcal(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              onClick={() =>
                onAccept(previewTargets, overrideMode ? 'overridden' : 'accepted')
              }
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 px-4 text-sm transition cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              {overrideMode ? 'Save Custom Targets' : 'Accept New Targets'}
            </button>
            <button
              onClick={() => setOverrideMode((v) => !v)}
              className="rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium py-2.5 px-4 text-sm transition cursor-pointer"
            >
              {overrideMode ? 'Use Coach Value' : 'Override'}
            </button>
            <button
              onClick={onSkip}
              className="rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 font-medium py-2.5 px-3.5 text-sm transition cursor-pointer"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
