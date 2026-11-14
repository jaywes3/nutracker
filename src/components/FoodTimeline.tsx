import React, { useState } from 'react';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { emptyMicros } from '../data/coreFoods';
import type { FoodLogEntry, Micronutrients } from '../types';

/** Proportionally adjusts a single historical entry without changing its catalog food or recipe. */
export function resizeLogPortion(entry: FoodLogEntry, newGrams: number): FoodLogEntry {
  if (!Number.isFinite(entry.grams) || entry.grams <= 0 || !Number.isFinite(newGrams) || newGrams <= 0 || newGrams > 100000) {
    throw new Error('Enter a valid amount greater than zero.');
  }
  const ratio = newGrams / entry.grams;
  const scaled = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * ratio * 1000000) / 1000000;
  const micros = { ...emptyMicros(), ...entry.micros };
  const nextMicros = Object.fromEntries(Object.entries(micros).map(([key, value]) => [key, scaled(value)])) as unknown as Micronutrients;
  return {
    ...entry,
    grams: newGrams,
    servingQty: Number.isFinite(entry.servingQty) && entry.servingQty > 0 ? scaled(entry.servingQty) : 1,
    servingLabel: Number.isFinite(entry.servingQty) && entry.servingQty > 0 ? entry.servingLabel : `${newGrams} g`,
    calories: scaled(entry.calories),
    protein: scaled(entry.protein),
    carbs: scaled(entry.carbs),
    fat: scaled(entry.fat),
    micros: nextMicros,
  };
}

function timeLabel(hour: number): string {
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return 'Time unavailable';
  return `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
}
function displayNumber(value: number) {
  return Number(value.toFixed(6)).toString();
}
function displayNutrition(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(1)).toString() : '—';
}

interface Props {
  logs: FoodLogEntry[];
  selectedDate: string;
  onCopyYesterday: () => void;
  onDelete: (id: string) => void;
  onResize: (id: string, newGrams: number) => void;
}

export const FoodTimeline: React.FC<Props> = ({logs, selectedDate, onCopyYesterday, onDelete, onResize}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'grams' | 'servings'>('grams');
  const [error, setError] = useState<string | null>(null);
  const startEdit = (entry: FoodLogEntry) => {
    setEditingId(entry.id); setMode('grams'); setAmount(String(entry.grams)); setError(null);
  };
  return (
    <section id="food-timeline" className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 space-y-3" aria-label="Food timeline">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Food Timeline</h3>
          <p className="text-xs text-slate-400">{selectedDate} · logged times are shown by hour</p>
        </div>
        <button type="button" onClick={onCopyYesterday} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs cursor-pointer"><Copy className="w-3.5 h-3.5" />Copy Yesterday</button>
      </div>
      {logs.length === 0 ? <p className="text-xs text-slate-400 py-2">No foods logged for this day yet.</p> : (
        <div className="divide-y divide-slate-800">
          {logs.map(entry => {
            const canEdit = Number.isFinite(entry.grams) && entry.grams > 0;
            const hasServing = canEdit && Number.isFinite(entry.servingQty) && entry.servingQty > 0;
            const servingGrams = hasServing ? entry.grams / entry.servingQty : 0;
            return <div key={entry.id} className="py-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-400 w-16 shrink-0 tabular-nums">{timeLabel(entry.hour)}</span>
                <span className="text-sm font-medium text-slate-100 flex-1 min-w-0 break-words">{entry.foodName}</span>
                <button type="button" onClick={() => startEdit(entry)} disabled={!canEdit} aria-label={`Edit portion for ${entry.foodName}`} title={canEdit ? 'Edit portion' : 'Original weight missing; cannot resize'} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs disabled:opacity-40 cursor-pointer"><Pencil className="w-3.5 h-3.5" />Edit</button>
                <button type="button" onClick={() => { if (editingId === entry.id) setEditingId(null); onDelete(entry.id); }} aria-label={`Remove ${entry.foodName}`} title="Remove entry" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="ml-0 sm:ml-16 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs tabular-nums">
                <span className="text-slate-400">{hasServing && entry.servingQty !== 1 ? `${displayNumber(entry.servingQty)} × ` : ''}{entry.servingLabel || 'Portion'}{canEdit ? ` (${displayNumber(entry.grams)} g)` : ''}</span>
                <span className="text-slate-300"><strong className="text-slate-100">{displayNutrition(entry.calories)} kcal</strong> · <span className="text-sky-400">{displayNutrition(entry.protein)}g P</span> · <span className="text-amber-400">{displayNutrition(entry.fat)}g F</span> · <span className="text-pink-400">{displayNutrition(entry.carbs)}g C</span></span>
              </div>
              {editingId === entry.id && <form className="ml-0 sm:ml-16 rounded-xl bg-slate-950 border border-slate-700 p-3 space-y-2" onSubmit={e => {
                e.preventDefault();
                const value = Number(amount);
                const newGrams = mode === 'servings' ? value * servingGrams : value;
                if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(newGrams) || newGrams <= 0 || newGrams > 100000) { setError('Enter an amount greater than zero (up to 100,000 g).'); return; }
                onResize(entry.id, newGrams); setEditingId(null); setError(null);
              }}>
                <div className="text-xs text-slate-300">Current: {displayNumber(entry.grams)} g{hasServing ? ` · ${displayNumber(entry.servingQty)} × ${entry.servingLabel}` : ''}. Calories and nutrients scale with the amount.</div>
                <div className="flex items-end gap-2">
                  <label className="flex-1 text-xs text-slate-300">New amount<input aria-label="New portion amount" type="number" min="0.000001" step="any" required value={amount} onChange={e=>setAmount(e.target.value)} className="block w-full mt-1 rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-sm text-slate-100" /></label>
                  <label className="text-xs text-slate-300">Unit<select aria-label="Portion unit" value={mode} onChange={e=>{
                    const next = e.target.value as 'grams' | 'servings';
                    const current = Number(amount);
                    if (Number.isFinite(current) && current > 0 && servingGrams > 0) setAmount(displayNumber(next === 'grams' ? current * servingGrams : current / servingGrams));
                    setMode(next);
                  }} className="block mt-1 rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-sm text-slate-100"><option value="grams">grams</option>{hasServing && <option value="servings">servings</option>}</select></label>
                </div>
                {hasServing && mode === 'servings' && <p className="text-xs text-slate-400">1 serving = {displayNumber(servingGrams)} g ({entry.servingLabel})</p>}
                {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
                <div className="flex gap-2"><button type="submit" className="px-3 py-2 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-xs cursor-pointer">Save Portion</button><button type="button" onClick={()=>setEditingId(null)} className="px-3 py-2 text-slate-300 text-xs cursor-pointer">Cancel</button></div>
              </form>}
            </div>;
          })}
        </div>
      )}
    </section>
  );
};
