import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, LabelList, Line, ComposedChart, Cell,
} from 'recharts';
import { Card, Callout, Segmented, Tip, axisProps, axisLabel, Legend, Slider, C } from '../components/ui.jsx';
import { PillContrast, SectionTitle, Concept, Sig } from '../components/narrative.jsx';
import { anova, fmtP, welch, propTest } from '../lib/stats.js';
import { annualAttrition } from '../lib/analyses.js';
import { ScenarioNote } from '../components/narrative.jsx';
import {
  churnRate, mean, sum, pearson, groupBy, fmtPct, fmtInt, fmtNum, fmtINR, fmtINRShort,
  TIERS, AGE_BRACKETS, INCOME_Q, GENDERS,
} from '../lib/data.js';

const DIMS = [
  { k: 'tier', label: 'City tier', order: TIERS },
  { k: 'ageB', label: 'Age', order: AGE_BRACKETS },
  { k: 'incQ', label: 'Income quartile', order: INCOME_Q },
  { k: 'primeLabel', label: 'Prime', order: ['Prime', 'Non-Prime'] },
  { k: 'gender', label: 'Gender', order: GENDERS },
];

const SEQ = ['var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)'];
const seqInk = (i) => `var(--seq-ink-${i + 1})`; // ink per ramp step, set per theme

/** Annual net margin per customer under the scenario assumptions. */
export const annualMargin = (r, take, cbRate) => r.gmv * 12 * (take - cbRate * (r.cashback / 100));
/** Forward value over H years; `churn` must already be an ANNUAL attrition rate (see annualAttrition). */
export const forwardValue = (marginPerYear, churn, years) => {
  let v = 0;
  for (let t = 0; t < years; t++) v += marginPerYear * (1 - churn) ** t;
  return v;
};

export default function LtvTab({ rows, assume, setAssume }) {
  const { take, cbRate, windowMonths } = assume;
  const upd = (k) => (v) => setAssume((a) => ({ ...a, [k]: v }));
  const setTake = upd('take'), setCbRate = upd('cbRate'), setWindow = upd('windowMonths');
  const [years, setYears] = useState(3);
  const [rowDim, setRowDim] = useState('tier');
  const [colDim, setColDim] = useState('ageB');
  const [metric, setMetric] = useState('ltv');

  const T = take / 100, CB = cbRate / 100;

  // ---------- Pareto ----------
  const pareto = useMemo(() => {
    const s = [...rows].sort((a, b) => b.ltv - a.ltv);
    const total = sum(s, 'ltv');
    const n = s.length;
    const curve = [{ x: 0, y: 0 }];
    let cum = 0;
    s.forEach((r, i) => {
      cum += r.ltv;
      if ((i + 1) % Math.max(1, Math.floor(n / 50)) === 0 || i === n - 1) curve.push({ x: (i + 1) / n, y: cum / total });
    });
    const shareTop = (p) => sum(s.slice(0, Math.round(n * p)), 'ltv') / total;
    // Gini on ascending order
    const asc = [...s].reverse();
    let g = 0;
    asc.forEach((r, i) => { g += (2 * (i + 1) - n - 1) * r.ltv; });
    const gini = g / (n * total);
    const deciles = Array.from({ length: 10 }, (_, d) => {
      const g2 = s.slice(Math.round((d * n) / 10), Math.round(((d + 1) * n) / 10));
      return {
        name: `D${d + 1}`, share: sum(g2, 'ltv') / total, n: g2.length,
        ltv: mean(g2, 'ltv'), txns: mean(g2, 'txns'), atv: mean(g2, 'atv'), tenure: mean(g2, 'tenure'),
        churn: churnRate(g2), prime: mean(g2, 'prime'), cb: mean(g2, 'cashback'), eng: mean(g2, 'engagement'),
        income: mean(g2, 'income'), age: mean(g2, 'age'), t1: g2.filter((r) => r.tier === 'Tier 1').length / g2.length,
        nps: mean(g2, 'nps'), sup: mean(g2, 'support'), rows: g2,
      };
    });
    return { curve, top10: shareTop(0.1), top20: shareTop(0.2), top50: shareTop(0.5), gini, deciles, total };
  }, [rows]);

  // ---------- drivers of LTV ----------
  const drivers = useMemo(() => [
    ['txns', 'Monthly transactions'], ['atv', 'Avg transaction value'], ['tenure', 'Tenure'], ['engagement', 'App engagement'],
    ['cashback', 'Cashback used %'], ['income', 'Monthly income'], ['age', 'Age'], ['prime', 'Prime member'], ['nps', 'NPS'], ['support', 'Support contacts'],
  ].map(([k, label]) => ({ k, label, r: pearson(rows, k, 'ltv') })).sort((a, b) => Math.abs(b.r) - Math.abs(a.r)), [rows]);

  // ---------- ANOVA by segment ----------
  const anovas = useMemo(() => DIMS.map((d) => ({ ...d, ...anova(groupBy(rows, (r) => r[d.k], d.order), 'ltv') })), [rows]);

  // ---------- heatmap ----------
  const rd = DIMS.find((d) => d.k === rowDim), cd = DIMS.find((d) => d.k === colDim);
  const METRICS = {
    ltv: { label: 'Avg throughput proxy (₹ throughput)', fmt: fmtINRShort, f: (g) => mean(g, 'ltv') },
    fwd: { label: `Scenario: ${years}-yr net value / user (assumed ${windowMonths}-month churn window)`, fmt: fmtINRShort, f: (g) => forwardValue(mean(g.map((r) => annualMargin(r, T, CB))), annualAttrition(churnRate(g), windowMonths), years) },
    churn: { label: 'Churn rate', fmt: (v) => fmtPct(v), f: (g) => churnRate(g) },
    pool: { label: 'Total throughput pool (share)', fmt: (v) => fmtPct(v), f: (g) => sum(g, 'ltv') / pareto.total },
  };
  const M = METRICS[metric];
  const heat = useMemo(() => {
    const cells = [];
    for (const rv of rd.order) for (const cv of cd.order) {
      const g = rows.filter((r) => r[rd.k] === rv && r[cd.k] === cv);
      cells.push({ rv, cv, n: g.length, v: g.length >= 15 ? M.f(g) : NaN });
    }
    const vs = cells.map((c) => c.v).filter(Number.isFinite);
    const lo = Math.min(...vs), hi = Math.max(...vs);
    return { cells, lo, hi };
  }, [rows, rd, cd, metric, T, CB, years, windowMonths]); // eslint-disable-line react-hooks/exhaustive-deps
  const bucket = (v) => (!Number.isFinite(v) ? -1 : heat.hi === heat.lo ? 2 : Math.min(4, Math.floor(((v - heat.lo) / (heat.hi - heat.lo)) * 5)));
  const best = heat.cells.filter((c) => Number.isFinite(c.v)).sort((a, b) => (metric === 'churn' ? a.v - b.v : b.v - a.v))[0];
  const worst = heat.cells.filter((c) => Number.isFinite(c.v)).sort((a, b) => (metric === 'churn' ? b.v - a.v : a.v - b.v))[0];

  // ---------- portfolio economics ----------
  const econ = useMemo(() => {
    const margins = rows.map((r) => annualMargin(r, T, CB));
    const gmvYr = sum(rows, 'gmv') * 12;
    const cbCost = rows.reduce((s, r) => s + r.gmv * 12 * CB * (r.cashback / 100), 0);
    const net = margins.reduce((s, v) => s + v, 0);
    const negative = margins.filter((m) => m < 0).length;
    const top20 = [...rows].sort((a, b) => b.ltv - a.ltv).slice(0, Math.round(rows.length * 0.2));
    const top20Net = top20.reduce((s, r) => s + annualMargin(r, T, CB), 0);
    return { gmvYr, revenue: gmvYr * T, cbCost, net, negative, top20Share: net ? top20Net / net : NaN, perUser: net / rows.length };
  }, [rows, T, CB]);

  const sigAnova = anovas.filter((a) => a.p < 0.05);
  const demoSimilar = (() => { const d1x = pareto.deciles[0], d10x = pareto.deciles[9]; return Math.abs(d1x.income / d10x.income - 1) < 0.1 && Math.abs(d1x.prime - d10x.prime) < 0.1 && Math.abs(d1x.churn - d10x.churn) < 0.05; })();
  const d1 = pareto.deciles[0], d10 = pareto.deciles[9];

  return (
    <>
      <SectionTitle title="Q3 · Which customer segments deliver the highest lifetime value?">
        <b>Throughput proxy</b> (our stand-in for LTV) = <code>Avg monthly transactions</code> × <code>Avg transaction value inr</code> × <code>Tenure months</code>: cumulative ₹ transaction value, <b>not profit and not true lifetime value</b>. Forward value is a scenario: assumed take rate and cashback cost, with segment churn converted to annual attrition under an assumed observation window. Methods: Pareto/Lorenz & Gini, decile profiling, one-way ANOVA (η²), segment heatmaps.
      </SectionTitle>
      <PillContrast
        blue={<>“High-LTV customers are Tier-1, affluent, Prime, 26–35 year olds. Target the right demographic and value follows.”</>}
        red={<>Transaction throughput is <b>highly concentrated</b> (top 20% = {fmtPct(pareto.top20, 0)} of the pool, Gini {fmtNum(pareto.gini, 2)}) and shows <b>no significant demographic association</b>: {sigAnova.length === 0 ? 'no' : sigAnova.length} of {anovas.length} segment ANOVAs are significant and η² stays below {fmtPct(Math.max(...anovas.map((a) => a.eta2 || 0)), 1)}. Top-decile users look similar to the bottom decile on income, age, tier mix and Prime rate. They differ in frequency, ticket and tenure, but that is <b>partly by construction</b>, since the proxy is built from exactly those columns; it does not show that real customer value is purely behavioural.</>}
      />

      <div className="grid g4">
        {[
          { l: 'Top 10% share of throughput pool', v: fmtPct(pareto.top10), s: 'cumulative ₹ throughput, not profit' },
          { l: 'Top 20% share of throughput pool', v: fmtPct(pareto.top20), s: `Pareto 20/${Math.round(pareto.top20 * 100)}${pareto.top20 < 0.75 ? ', not 20/80' : ''}` },
          { l: 'Gini coefficient (throughput)', v: fmtNum(pareto.gini, 3), s: '0 = equal · 1 = one customer holds all' },
          { l: 'Top vs bottom decile throughput', v: `${fmtNum(d1.ltv / d10.ltv, 0)}×`, s: `${fmtINRShort(d1.ltv)} vs ${fmtINRShort(d10.ltv)}` },
        ].map((k) => (
          <div className="kpi" key={k.l}><span className="kpi-label">{k.l}</span><b className="kpi-value">{k.v}</b><small className="kpi-delta">{k.s}</small></div>
        ))}
      </div>

      <div className="grid g2">
        <Card title="Lorenz curve: cumulative share of LTV" subtitle="Customers ranked by throughput proxy (highest first). Dashed diagonal = perfect equality.">
          <ResponsiveContainer width="100%" height={270}>
            <AreaChart data={pareto.curve} margin={{ top: 8, right: 14, left: 4, bottom: 18 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="x" type="number" domain={[0, 1]} {...axisProps} tickFormatter={(v) => `${Math.round(v * 100)}%`} label={axisLabel('Share of customers (ranked by LTV)')} />
              <YAxis {...axisProps} domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={44} label={axisLabel('Cumulative LTV share', 'y')} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="var(--text-muted)" strokeDasharray="4 4" />
              <ReferenceLine x={0.2} stroke="var(--text-secondary)" strokeDasharray="2 3" label={{ value: `top 20% → ${fmtPct(pareto.top20, 0)}`, position: 'insideBottomRight', fill: 'var(--text-secondary)', fontSize: 11 }} />
              <Tooltip content={<Tip title={(p) => `Top ${fmtPct(p[0].payload.x, 0)} of customers`} build={(p) => [{ label: 'Share of throughput pool', value: fmtPct(p[0].payload.y), color: C.s1 }]} />} />
              <Area type="monotone" dataKey="y" stroke={C.s1} strokeWidth={2} fill={C.s1} fillOpacity={0.16} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Correlation with the throughput proxy" subtitle="Pearson r. Blue = the three columns the proxy is built from (correlated by construction, not a finding); grey = every other attribute.">
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={drivers} layout="vertical" margin={{ top: 4, right: 40, left: 10, bottom: 18 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" {...axisProps} domain={[-0.1, 0.6]} tickFormatter={(v) => v.toFixed(1)} label={axisLabel('Pearson r with throughput proxy')} />
              <YAxis type="category" dataKey="label" {...axisProps} width={150} />
              <ReferenceLine x={0} stroke="var(--text-secondary)" />
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tip build={(p) => [{ label: 'r', value: p[0].payload.r.toFixed(3), color: C.s1 }, { label: 'Variance explained', value: fmtPct(p[0].payload.r ** 2, 1) }]} />} />
              <Bar dataKey="r" radius={4} maxBarSize={16} isAnimationActive={false}>
                {drivers.map((d) => <Cell key={d.k} fill={['txns', 'atv', 'tenure'].includes(d.k) ? C.s1 : 'var(--text-muted)'} />)}
                <LabelList dataKey="r" position="right" formatter={(v) => v.toFixed(2)} fill="var(--text-secondary)" fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <Legend items={[{ label: 'LTV components (mechanical)', color: C.s1 }, { label: 'Other attributes', color: 'var(--text-muted)' }]} />
        </Card>
      </div>

      <Card title="Decile profile: what separates whales from the long tail?" subtitle="D1 = top 10% by throughput proxy. Behaviour columns fall by construction; the informative comparison is the demographic columns.">
        <div className="grid g2" style={{ marginBottom: 6 }}>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={pareto.deciles} margin={{ top: 18, right: 8, left: 4, bottom: 18 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" {...axisProps} label={axisLabel('LTV decile (D1 = highest)')} />
              <YAxis {...axisProps} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={44} label={axisLabel('Share of throughput pool', 'y')} />
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tip build={(p) => [{ label: 'Share of pool', value: fmtPct(p[0].payload.share), color: C.s1 }, { label: 'Avg throughput proxy', value: fmtINRShort(p[0].payload.ltv) }, { label: 'Customers', value: fmtInt(p[0].payload.n) }]} />} />
              <Bar dataKey="share" fill={C.s1} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}>
                <LabelList dataKey="share" position="top" formatter={(v) => fmtPct(v, 0)} fill="var(--text-secondary)" fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height={210}>
            <ComposedChart data={pareto.deciles} margin={{ top: 18, right: 8, left: 4, bottom: 18 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" {...axisProps} label={axisLabel('LTV decile (D1 = highest)')} />
              <YAxis {...axisProps} domain={[0, 0.7]} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={44} label={axisLabel('Share of decile', 'y')} />
              <Tooltip content={<Tip build={(p) => p.map((x) => ({ label: x.name, value: fmtPct(x.value), color: x.color }))} />} />
              <Line dataKey="prime" name="Prime share" stroke={C.s1} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              <Line dataKey="t1" name="Tier-1 share" stroke={C.s2} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              <Line dataKey="churn" name="Churn rate" stroke={C.s3} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[{ label: 'Prime share', color: C.s1 }, { label: 'Tier-1 share', color: C.s2 }, { label: 'Churn rate', color: C.s3 }]} />
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>Decile</th><th>Avg throughput</th><th>Txns/mo</th><th>Avg ticket</th><th>Tenure</th><th>Engagement</th><th>NPS</th><th>Support</th><th>Cashback %</th><th>Income</th><th>Age</th><th>Prime</th><th>Churn</th></tr></thead>
            <tbody>
              {pareto.deciles.map((d) => (
                <tr key={d.name}>
                  <td>{d.name}</td><td>{fmtINRShort(d.ltv)}</td><td>{fmtNum(d.txns, 0)}</td><td>{fmtINR(d.atv)}</td><td>{fmtNum(d.tenure, 0)}</td>
                  <td className="muted">{fmtNum(d.eng, 1)}</td><td className="muted">{fmtNum(d.nps, 1)}</td><td className="muted">{fmtNum(d.sup, 1)}</td><td className="muted">{fmtNum(d.cb, 0)}%</td><td className="muted">{fmtINRShort(d.income)}</td><td className="muted">{fmtNum(d.age, 0)}</td><td className="muted">{fmtPct(d.prime, 0)}</td><td className="muted">{fmtPct(d.churn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(() => {
          const top = pareto.deciles[0].rows, bot = pareto.deciles[9].rows;
          const nums = [['engagement', 'App engagement', (v) => fmtNum(v, 2)], ['nps', 'NPS', (v) => fmtNum(v, 1)], ['support', 'Support contacts', (v) => fmtNum(v, 2)],
            ['cashback', 'Cashback utilisation %', (v) => `${fmtNum(v, 1)}%`], ['income', 'Monthly income', fmtINRShort], ['age', 'Age', (v) => fmtNum(v, 1)]];
          const res = [
            ...nums.map(([k, label, f]) => { const w = welch(bot, top, k); return { label, a: f(w.mb), b: f(w.ma), p: w.p }; }),
            ...[['prime', 'Prime share', (r) => r.prime], ['t1', 'Tier-1 share', (r) => (r.tier === 'Tier 1' ? 1 : 0)], ['churned', 'Churn rate', (r) => r.churned]].map(([k, label, fn]) => {
              const pt = propTest(bot.map((r) => ({ v: fn(r) })), top.map((r) => ({ v: fn(r) })), 'v');
              return { label, a: fmtPct(pt.pb), b: fmtPct(pt.pa), p: pt.p };
            }),
          ];
          const sig = res.filter((x) => x.p < 0.05);
          return (
            <div style={{ marginTop: 12 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 13.5 }}>Non-component check: top vs bottom decile on attributes NOT in the throughput formula</h4>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Attribute</th><th>Top 10% (D1)</th><th>Bottom 10% (D10)</th><th>p</th></tr></thead>
                  <tbody>{res.map((x) => <tr key={x.label}><td>{x.label}</td><td>{x.a}</td><td>{x.b}</td><td><Sig p={x.p} /></td></tr>)}</tbody>
                </table>
              </div>
              <Callout tone="info" title="Why this table and not the spend ratios">
                Transactions, ticket and tenure are higher in D1 by construction, because the proxy multiplies them. The informative test is everything else:
                {sig.length === 0 ? ' no attribute outside the formula differs significantly between top and bottom deciles.' : ` only ${sig.map((x) => x.label).join(', ')} differ${sig.length === 1 ? 's' : ''} at p < .05 (uncorrected, ${res.length} tests).`}
                {' '}Top users cannot be found from demographics or experience scores; they can only be ranked by their own transaction behaviour.
              </Callout>
            </div>
          );
        })()}
        <Callout tone="info" title="What the deciles do and do not show">
          D1 transacts {fmtNum(d1.txns / d10.txns, 1)}× as often as D10, at {fmtNum(d1.atv / d10.atv, 1)}× the ticket and {fmtNum(d1.tenure / d10.tenure, 1)}× the tenure,
          while their income (≈{fmtINRShort(d1.income)} vs {fmtINRShort(d10.income)}), Prime share ({fmtPct(d1.prime, 0)} vs {fmtPct(d10.prime, 0)}) and churn ({fmtPct(d1.churn)} vs {fmtPct(d10.churn)}) {demoSimilar ? 'are near-identical' : 'differ, but far less than behaviour does'}.
          {Math.abs(d1.churn - d10.churn) < 0.05 ? 'Whales churn at about the same rate as minnows, so' : 'Whatever the churn gap,'} each lost top-decile customer removes ~{fmtNum(d1.ltv / mean(rows, 'ltv'), 1)}× the average <b>throughput</b> (not profit). The higher behaviour figures are mechanical; the useful finding is that demographics do not single these users out, which argues for <b>throughput-weighted</b> rather than demographic targeting.
        </Callout>
      </Card>

      <div className="grid g2">
        <Card
          title="Segment value heatmap"
          subtitle="Pick two dimensions and a metric. Cells with n < 15 are blanked."
          actions={(
            <>
              <select value={rowDim} onChange={(e) => setRowDim(e.target.value)} aria-label="Rows" style={{ width: 130 }}>{DIMS.filter((d) => d.k !== colDim).map((d) => <option key={d.k} value={d.k}>{d.label}</option>)}</select>
              <select value={colDim} onChange={(e) => setColDim(e.target.value)} aria-label="Columns" style={{ width: 130 }}>{DIMS.filter((d) => d.k !== rowDim).map((d) => <option key={d.k} value={d.k}>{d.label}</option>)}</select>
            </>
          )}
        >
          <Segmented value={metric} onChange={setMetric} options={[{ value: 'ltv', label: 'Avg throughput' }, { value: 'fwd', label: 'Fwd value (scenario)' }, { value: 'churn', label: 'Churn' }, { value: 'pool', label: 'Pool share' }]} />
          {metric === 'fwd' && <div style={{ marginTop: 10 }}><ScenarioNote>Forward value is not measured. It assumes the churn flag covers {windowMonths} months (the CSV does not say), a {take.toFixed(2)}% take rate and {cbRate.toFixed(2)}% cashback; change any of them below and every cell changes.</ScenarioNote></div>}
          <div className="heat" style={{ gridTemplateColumns: `110px repeat(${cd.order.length}, minmax(0,1fr))`, marginTop: 10 }}>
            <div />
            {cd.order.map((c) => <div className="hh" key={c}>{c}</div>)}
            {rd.order.map((rv) => (
              <React.Fragment key={rv}>
                <div className="hl">{rv}</div>
                {cd.order.map((cv) => {
                  const cell = heat.cells.find((x) => x.rv === rv && x.cv === cv);
                  const b = bucket(cell.v);
                  return (
                    <div key={cv} className="hc" title={`${rv} × ${cv}\n${M.label}: ${Number.isFinite(cell.v) ? M.fmt(cell.v) : 'n too small'}\nCustomers: ${cell.n}`}
                      style={{ background: b < 0 ? 'var(--seq-0)' : SEQ[b], color: b < 0 ? 'var(--text-muted)' : seqInk(b) }}>
                      {Number.isFinite(cell.v) ? M.fmt(cell.v) : '–'}
                      <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85 }}>n={cell.n}</div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div className="heat-scale">
            <span>{Number.isFinite(heat.lo) ? M.fmt(heat.lo) : ''}</span>
            {SEQ.map((c) => <i key={c} style={{ background: c }} />)}
            <span>{Number.isFinite(heat.hi) ? M.fmt(heat.hi) : ''}</span>
          </div>
          {best && worst && (
            <Callout tone="info" title="Spread check">
              Best cell <b>{best.rv} × {best.cv}</b> ({M.fmt(best.v)}) vs worst <b>{worst.rv} × {worst.cv}</b> ({M.fmt(worst.v)}). With ~{fmtInt(rows.length / heat.cells.length)} customers per cell, gaps under ~10% are within noise; check the ANOVA table before acting on any cell.
            </Callout>
          )}
        </Card>

        <Card title="One-way ANOVA: does LTV differ by segment?" subtitle="F-test of mean throughput proxy across segment levels. η² = share of LTV variance the segment explains.">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Segment</th><th>Highest mean</th><th>Lowest mean</th><th>F</th><th>η²</th><th>p</th></tr></thead>
              <tbody>
                {anovas.map((a) => {
                  const s = [...a.groups].sort((x, y) => y.mean - x.mean);
                  return (
                    <tr key={a.k}>
                      <td>{a.label}</td>
                      <td>{s[0] ? `${s[0].key} · ${fmtINRShort(s[0].mean)}` : '–'}</td>
                      <td>{s.at(-1) ? `${s.at(-1).key} · ${fmtINRShort(s.at(-1).mean)}` : '–'}</td>
                      <td>{fmtNum(a.F, 2)}</td>
                      <td className="muted">{fmtPct(a.eta2, 2)}</td>
                      <td><Sig p={a.p} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Callout tone={sigAnova.length ? 'info' : 'warn'} title="Verdict">
            {sigAnova.length
              ? <>Significant: {sigAnova.map((a) => a.label).join(', ')}, but each explains under {fmtPct(Math.max(...sigAnova.map((a) => a.eta2)), 1)} of throughput variance. Statistically real, commercially small.</>
              : <>No segment dimension is significantly associated with the throughput proxy (all p ≥ .05, smallest p = {fmtP(Math.min(...anovas.map((a) => a.p)))}). {(() => { const g = anovas.flatMap((a) => a.groups.map((x) => ({ ...x, dim: a.label }))).sort((x, y) => y.mean - x.mean)[0]; return g ? `${g.key} (${g.dim}) has the highest raw mean, but the gap is within noise.` : ''; })()} The highest-throughput group is defined by the proxy's own components (the top-2 deciles), not by a demographic segment.</>}
          </Callout>

        </Card>
      </div>

      <Card title="Unit-economics scenario" subtitle="Turns the throughput proxy into an illustrative margin. Every input is an assumption.">
        <div className="grid g2" style={{ marginBottom: 0 }}>
          <ScenarioNote>Every figure below follows from the sliders, not from the CSV. Cashback cost is modelled (GMV × offered % × utilisation %); the CSV records utilisation, not rupees paid.</ScenarioNote>
          <div className="controls">
            <Slider label="Net take rate on GMV" value={take} min={0.1} max={2} step={0.05} onChange={setTake} format={(v) => `${v.toFixed(2)}%`} hint="Blended MDR/interchange/bill-pay/ads revenue per ₹ of GMV. UPI P2M is zero-MDR." />
            <Slider label="Cashback offered (% of GMV)" value={cbRate} min={0} max={2} step={0.05} onChange={setCbRate} format={(v) => `${v.toFixed(2)}%`} hint="Cost = GMV × offered % × Cashback used pct." />
            <Slider label="Forward horizon" value={years} min={1} max={5} onChange={setYears} format={(v) => `${v} yr`} />
            <Slider label="Assumed churn-flag window" value={windowMonths} min={3} max={36} step={3} onChange={setWindow} format={(v) => `${v} months`} hint={`The CSV gives no observation window. At ${windowMonths} months, ${fmtPct(churnRate(rows))} churn ≈ ${fmtPct(annualAttrition(churnRate(rows), windowMonths))} a year.`} />
          </div>
          <div className="stats">
            <div className="stat"><span>Annual net revenue</span><b>{fmtINRShort(econ.revenue)}</b><small>on {fmtINRShort(econ.gmvYr)} GMV</small></div>
            <div className="stat"><span>Modelled cashback cost / yr</span><b>{fmtINRShort(econ.cbCost)}</b><small>{fmtPct(econ.cbCost / econ.revenue, 0)} of revenue</small></div>
            <div className="stat"><span>Annual net margin</span><b>{fmtINRShort(econ.net)}</b><small>{fmtINR(econ.perUser)} per user</small></div>
            <div className="stat"><span>Negative modelled margin</span><b>{fmtPct(econ.negative / rows.length, 0)}</b><small>{fmtInt(econ.negative)} users under these slider values; the CSV has no revenue or cost data</small></div>
          </div>
        </div>
      </Card>
    </>
  );
}
