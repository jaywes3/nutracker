import React, { useState } from 'react';
import type { DailyComputedPoint, UnitSystem } from '../types';
import { kgToDisplay, unitWeightLabel } from '../engine/metabolism';

interface WeightChartProps {
  series: DailyComputedPoint[];
  unitSystem: UnitSystem;
  targetWeightKg: number;
}

export const WeightTrendChart: React.FC<WeightChartProps> = ({
  series,
  unitSystem,
  targetWeightKg,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const unit = unitWeightLabel(unitSystem);

  if (series.length === 0) return null;

  const W = 680;
  const H = 225;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const vals: number[] = [];
  for (const p of series) {
    vals.push(kgToDisplay(p.trendWeightKg, unitSystem));
    if (p.scaleWeightKg !== null) {
      vals.push(kgToDisplay(p.scaleWeightKg, unitSystem));
    }
  }
  const minV = Math.min(...vals) - (unitSystem === 'imperial' ? 1.2 : 0.6);
  const maxV = Math.max(...vals) + (unitSystem === 'imperial' ? 1.2 : 0.6);
  const spanV = Math.max(0.5, maxV - minV);

  const xOf = (idx: number) =>
    padL + (series.length <= 1 ? innerW / 2 : (idx / (series.length - 1)) * innerW);
  const yOf = (val: number) => padT + innerH - ((val - minV) / spanV) * innerH;

  const trendPath = series
    .map((p, i) => {
      const x = xOf(i).toFixed(1);
      const y = yOf(kgToDisplay(p.trendWeightKg, unitSystem)).toFixed(1);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');

  const areaPath = `${trendPath} L${xOf(series.length - 1).toFixed(1)},${(
    padT + innerH
  ).toFixed(1)} L${xOf(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;

  const activePoint =
    hoverIdx !== null && series[hoverIdx] ? series[hoverIdx] : series[series.length - 1];
  const targetDisp = kgToDisplay(targetWeightKg, unitSystem);
  const showTargetLine = targetDisp >= minV && targetDisp <= maxV;

  // Grid ticks (4 horizontal lines)
  const yTicks = [0, 0.33, 0.66, 1].map((t) => minV + t * spanV);

  return (
    <div className="w-full select-none">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="w-3 h-0.5 bg-emerald-400 rounded-full inline-block" />
            EWMA Trend: {kgToDisplay(activePoint.trendWeightKg, unitSystem)} {unit}
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-slate-400/80 inline-block" />
            Scale:{' '}
            {activePoint.scaleWeightKg !== null
              ? `${kgToDisplay(activePoint.scaleWeightKg, unitSystem)} ${unit}`
              : '— (interpolated)'}
          </span>
        </div>
        <span className="text-slate-400 tabular-nums">{activePoint.date}</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto overflow-visible touch-pan-y"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {yTicks.map((tv, idx) => {
          const y = yOf(tv);
          return (
            <g key={idx}>
              <line
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
                stroke="rgba(148,163,184,0.12)"
                strokeDasharray="3 3"
              />
              <text
                x={padL - 6}
                y={y + 3.5}
                textAnchor="end"
                className="fill-slate-500 text-[10px] tabular-nums"
              >
                {tv.toFixed(1)}
              </text>
            </g>
          );
        })}

        {showTargetLine && (
          <line
            x1={padL}
            y1={yOf(targetDisp)}
            x2={W - padR}
            y2={yOf(targetDisp)}
            stroke="#38bdf8"
            strokeOpacity="0.45"
            strokeDasharray="5 4"
          />
        )}

        {/* Area & EWMA Trend Curve */}
        <path d={areaPath} fill="url(#trendGrad)" />
        <path
          d={trendPath}
          fill="none"
          stroke="#10b981"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Connectors from scale dots to trend curve (shows water noise stripped out!) */}
        {series.map((p, i) => {
          if (p.scaleWeightKg === null) return null;
          const x = xOf(i);
          const ys = yOf(kgToDisplay(p.scaleWeightKg, unitSystem));
          const yt = yOf(kgToDisplay(p.trendWeightKg, unitSystem));
          return (
            <g key={p.date}>
              <line
                x1={x}
                y1={ys}
                x2={x}
                y2={yt}
                stroke="rgba(148,163,184,0.28)"
                strokeWidth="1"
              />
              <circle
                cx={x}
                cy={ys}
                r={hoverIdx === i ? 4.5 : 3}
                fill={hoverIdx === i ? '#f8fafc' : '#94a3b8'}
              />
            </g>
          );
        })}

        {/* Active hover marker */}
        {hoverIdx !== null && series[hoverIdx] && (
          <g>
            <line
              x1={xOf(hoverIdx)}
              y1={padT}
              x2={xOf(hoverIdx)}
              y2={padT + innerH}
              stroke="rgba(16,185,129,0.4)"
              strokeWidth="1"
            />
            <circle
              cx={xOf(hoverIdx)}
              cy={yOf(kgToDisplay(series[hoverIdx].trendWeightKg, unitSystem))}
              r="5"
              fill="#10b981"
              stroke="#090d16"
              strokeWidth="2"
            />
          </g>
        )}

        {/* X-axis labels */}
        {[0, Math.floor((series.length - 1) / 2), series.length - 1]
          .filter((v, idx, arr) => arr.indexOf(v) === idx)
          .map((idx) => (
            <text
              key={idx}
              x={xOf(idx)}
              y={H - 6}
              textAnchor={
                idx === 0 ? 'start' : idx === series.length - 1 ? 'end' : 'middle'
              }
              className="fill-slate-500 text-[10px] tabular-nums"
            >
              {series[idx].date.slice(5)}
            </text>
          ))}

        {/* Invisible hover columns */}
        {series.map((_, i) => {
          const colW = innerW / Math.max(1, series.length);
          return (
            <rect
              key={i}
              x={xOf(i) - colW / 2}
              y={padT}
              width={Math.max(6, colW)}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              onTouchStart={() => setHoverIdx(i)}
            />
          );
        })}
      </svg>
    </div>
  );
};

interface ExpenditureChartProps {
  series: DailyComputedPoint[];
  targetCalories: number;
}

export const ExpenditureTrendChart: React.FC<ExpenditureChartProps> = ({
  series,
  targetCalories,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (series.length === 0) return null;

  const W = 680;
  const H = 225;
  const padL = 46;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const allVals: number[] = [targetCalories];
  for (const p of series) {
    allVals.push(p.expenditureLow, p.expenditureHigh);
    if (p.hasFoodLog) allVals.push(p.loggedCalories);
  }
  const minV = Math.max(800, Math.min(...allVals) - 140);
  const maxV = Math.max(...allVals) + 140;
  const spanV = Math.max(300, maxV - minV);

  const xOf = (idx: number) =>
    padL + (series.length <= 1 ? innerW / 2 : (idx / (series.length - 1)) * innerW);
  const yOf = (val: number) => padT + innerH - ((val - minV) / spanV) * innerH;

  // Uncertainty band polygon
  const upperPts = series.map(
    (p, i) => `${xOf(i).toFixed(1)},${yOf(p.expenditureHigh).toFixed(1)}`
  );
  const lowerPts = [...series]
    .reverse()
    .map(
      (p, revI) =>
        `${xOf(series.length - 1 - revI).toFixed(1)},${yOf(p.expenditureLow).toFixed(1)}`
    );
  const bandPath = `M${upperPts.join(' L')} L${lowerPts.join(' L')} Z`;

  const expPath = series
    .map(
      (p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.expenditure).toFixed(1)}`
    )
    .join(' ');

  const activePoint =
    hoverIdx !== null && series[hoverIdx] ? series[hoverIdx] : series[series.length - 1];

  const yTicks = [0, 0.33, 0.66, 1].map((t) => Math.round(minV + t * spanV));
  const barWidth = Math.max(3, Math.min(11, (innerW / Math.max(1, series.length)) * 0.55));

  return (
    <div className="w-full select-none">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium tabular-nums">
            <span className="w-3 h-0.5 bg-amber-400 rounded-full inline-block" />
            Adaptive TDEE: {activePoint.expenditure} kcal ({activePoint.confidence}% conf)
          </span>
          <span className="inline-flex items-center gap-1.5 text-sky-400 tabular-nums">
            <span className="w-2.5 h-2.5 rounded-xs bg-sky-500/50 inline-block" />
            Intake: {activePoint.hasFoodLog ? `${activePoint.loggedCalories} kcal` : 'Unlogged'}
          </span>
        </div>
        <span className="text-slate-400 tabular-nums">{activePoint.date}</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto overflow-visible touch-pan-y"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {yTicks.map((tv, idx) => {
          const y = yOf(tv);
          return (
            <g key={idx}>
              <line
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
                stroke="rgba(148,163,184,0.12)"
                strokeDasharray="3 3"
              />
              <text
                x={padL - 6}
                y={y + 3.5}
                textAnchor="end"
                className="fill-slate-500 text-[10px] tabular-nums"
              >
                {tv}
              </text>
            </g>
          );
        })}

        {/* Daily Intake Bars (Adherence-neutral calm sky-blue!) */}
        {series.map((p, i) => {
          if (!p.hasFoodLog) return null;
          const x = xOf(i) - barWidth / 2;
          const y = yOf(Math.min(maxV, Math.max(minV, p.loggedCalories)));
          const h = Math.max(2, padT + innerH - y);
          return (
            <rect
              key={p.date}
              x={x}
              y={y}
              width={barWidth}
              height={h}
              rx="1.5"
              fill={hoverIdx === i ? 'rgba(56,189,248,0.65)' : 'rgba(56,189,248,0.25)'}
            />
          );
        })}

        {/* Target Calorie Reference Line */}
        <line
          x1={padL}
          y1={yOf(targetCalories)}
          x2={W - padR}
          y2={yOf(targetCalories)}
          stroke="#34d399"
          strokeOpacity="0.55"
          strokeDasharray="4 4"
        />

        {/* Uncertainty Band + Smoothed Adaptive TDEE Line */}
        <path d={bandPath} fill="rgba(251,191,36,0.13)" />
        <path
          d={expPath}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {hoverIdx !== null && series[hoverIdx] && (
          <circle
            cx={xOf(hoverIdx)}
            cy={yOf(series[hoverIdx].expenditure)}
            r="5"
            fill="#fbbf24"
            stroke="#090d16"
            strokeWidth="2"
          />
        )}

        {[0, Math.floor((series.length - 1) / 2), series.length - 1]
          .filter((v, idx, arr) => arr.indexOf(v) === idx)
          .map((idx) => (
            <text
              key={idx}
              x={xOf(idx)}
              y={H - 6}
              textAnchor={
                idx === 0 ? 'start' : idx === series.length - 1 ? 'end' : 'middle'
              }
              className="fill-slate-500 text-[10px] tabular-nums"
            >
              {series[idx].date.slice(5)}
            </text>
          ))}

        {series.map((_, i) => {
          const colW = innerW / Math.max(1, series.length);
          return (
            <rect
              key={i}
              x={xOf(i) - colW / 2}
              y={padT}
              width={Math.max(6, colW)}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              onTouchStart={() => setHoverIdx(i)}
            />
          );
        })}
      </svg>
    </div>
  );
};
