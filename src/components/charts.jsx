import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell, LabelList,
} from 'recharts';
import { axisProps, axisLabel, Tip, C } from './ui.jsx';
import { churnRate, wilson, sum, fmtPct, fmtInt, groupBy } from '../lib/data.js';

/** Build churn-rate rows for a grouping. */
export function rateRows(rows, fn, order) {
  return groupBy(rows, fn, order).map(({ key, rows: g }) => {
    const k = sum(g, 'churned');
    const [lo, hi] = wilson(k, g.length);
    return { name: key, rate: churnRate(g), n: g.length, lo, hi };
  });
}

/** Single-series churn-rate bar chart with a dashed baseline reference. */
export function RateBarChart({ data, baseline, xLabel, height = 210, color = C.s1, yLabel = 'Churn rate' }) {
  const max = Math.max(baseline || 0, ...data.map((d) => d.hi || d.rate));
  const step = max > 0.4 ? 0.1 : 0.05;
  const top = Math.min(1, Math.ceil((max + 0.001) / step) * step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => +(i * step).toFixed(2));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 18, right: 8, left: 4, bottom: 18 }} barCategoryGap="24%">
        <CartesianGrid vertical={false} />
        <XAxis dataKey="name" {...axisProps} interval={0} fontSize={11} label={axisLabel(Number.isFinite(baseline) ? `${xLabel} · dashed line = average ${fmtPct(baseline)}` : xLabel)} />
        <YAxis {...axisProps} tickFormatter={(v) => `${Math.round(v * 100)}%`} domain={[0, top]} ticks={ticks} width={40} />
        <Tooltip
          cursor={{ fill: 'var(--surface-2)' }}
          content={
            <Tip
              build={(p) => {
                const d = p[0].payload;
                return [
                  { label: 'Churn rate', value: fmtPct(d.rate), color },
                  { label: '95% CI', value: `${fmtPct(d.lo)} – ${fmtPct(d.hi)}` },
                  { label: 'vs average', value: `${d.rate >= baseline ? '+' : '−'}${Math.abs((d.rate - baseline) * 100).toFixed(1)} pp` },
                  { label: 'Customers', value: fmtInt(d.n) },
                ];
              }}
            />
          }
        />
        {Number.isFinite(baseline) && (
          <ReferenceLine y={baseline} stroke="var(--text-secondary)" strokeDasharray="4 4" />
        )}
        <Bar dataKey="rate" fill={color} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
          <LabelList dataKey="rate" position="top" formatter={(v) => fmtPct(v, 1)} fill="var(--text-secondary)" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Two-to-four bar comparison with direct value labels (small multiple). */
export function CompareBars({ data, fmt, yLabel, height = 170, xLabel }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 20, right: 6, left: 0, bottom: xLabel ? 16 : 2 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} />
        <XAxis dataKey="name" {...axisProps} interval={0} label={xLabel ? axisLabel(xLabel) : undefined} />
        <YAxis {...axisProps} tickFormatter={fmt} width={52} label={axisLabel(yLabel, 'y')} />
        <Tooltip
          cursor={{ fill: 'var(--surface-2)' }}
          content={<Tip build={(p) => [{ label: yLabel, value: fmt(p[0].value), color: p[0].payload.color }, ...(p[0].payload.n ? [{ label: 'Customers', value: fmtInt(p[0].payload.n) }] : [])]} />}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
          {data.map((d) => <Cell key={d.name} fill={d.color} />)}
          <LabelList dataKey="value" position="top" formatter={fmt} fill="var(--text-primary)" fontSize={11} fontWeight={600} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
