import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, LabelList, Cell,
} from 'recharts';
import { Card, Callout, Segmented, Tip, axisProps, axisLabel, Legend, Slider, C } from '../components/ui.jsx';
import { PillContrast, SectionTitle, Concept, Sig, ScenarioNote } from '../components/narrative.jsx';
import { anova, chiSquare, propTest, welch, fmtP } from '../lib/stats.js';
import {
  churnRate, mean, sum, pearson, groupBy, fmtPct, fmtInt, fmtNum, fmtINR, fmtINRShort, CB_TIERS, ENG_BUCKETS,
} from '../lib/data.js';

const OUTCOMES = [
  { k: 'txns', label: 'Monthly transactions', fmt: (v) => fmtNum(v, 1) },
  { k: 'atv', label: 'Avg ticket (₹)', fmt: (v) => fmtINR(v) },
  { k: 'engagement', label: 'Engagement score', fmt: (v) => fmtNum(v, 2) },
  { k: 'nps', label: 'NPS', fmt: (v) => fmtNum(v, 1) },
  { k: 'tenure', label: 'Tenure (months)', fmt: (v) => fmtNum(v, 1) },
  { k: 'churned', label: 'Churn rate', fmt: (v) => fmtPct(v) },
];

export const PERSONAS = [
  { id: 'utility', name: 'Utility-led loyalist', color: 'var(--series-1)', desc: 'High engagement, low cashback reliance. Pays with Amazon Pay because it is easiest.' },
  { id: 'subsidised', name: 'Subsidised engager', color: 'var(--series-3)', desc: 'High engagement and heavy cashback use. Engaged, but partly bought.' },
  { id: 'mercenary', name: 'Mercenary deal-seeker', color: 'var(--series-2)', desc: 'Low engagement, heavy cashback use. Shows up for the subsidy, leaves after.' },
  { id: 'dormant', name: 'Passive / dormant', color: 'var(--text-muted)', desc: 'Low engagement, low cashback. Not hooked by product or by money.' },
  { id: 'middle', name: 'Middle ground', color: 'var(--axis-line)', desc: 'Mid engagement (between thresholds).' },
];

export function personaOf(r, cbCut, engHi, engLo) {
  if (r.engagement >= engHi) return r.cashback >= cbCut ? 'subsidised' : 'utility';
  if (r.engagement <= engLo) return r.cashback >= cbCut ? 'mercenary' : 'dormant';
  return 'middle';
}

export default function CashbackTab({ rows, assume, setAssume }) {
  const { cbCut, engHi, engLo, cbRate } = assume;
  const upd = (k) => (v) => setAssume((a) => ({ ...a, [k]: v }));
  const setCbCut = upd('cbCut'), setEngHi = upd('engHi'), setEngLo = upd('engLo'), setCbRate = upd('cbRate');
  const [heatMetric, setHeatMetric] = useState('txns');

  // dose–response by cashback decile (10-pt bins)
  const dose = useMemo(() => groupBy(rows, (r) => Math.min(9, Math.floor(r.cashback / 10)), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).map(({ key, rows: g }) => ({
    name: `${key * 10}–${key * 10 + 9 + (key === 9 ? 1 : 0)}%`, txns: mean(g, 'txns'), eng: mean(g, 'engagement'), churn: churnRate(g), atv: mean(g, 'atv'), n: g.length,
  })), [rows]);

  const tierTests = useMemo(() => OUTCOMES.map((o) => {
    const groups = groupBy(rows, (r) => r.cbT, CB_TIERS);
    const a = o.k === 'churned' ? chiSquare(rows, (r) => r.cbT, CB_TIERS) : anova(groups, o.k);
    return {
      ...o, p: a.p, r: pearson(rows, 'cashback', o.k),
      data: groups.map(({ key, rows: g }) => ({ name: key, value: o.k === 'churned' ? churnRate(g) : mean(g, o.k), n: g.length })),
    };
  }), [rows]);

  const personas = useMemo(() => {
    const g = groupBy(rows, (r) => personaOf(r, cbCut, engHi, engLo), PERSONAS.map((p) => p.id));
    return PERSONAS.map((p) => {
      const sub = g.find((x) => x.key === p.id)?.rows || [];
      const gmv = sum(sub, 'gmv') * 12;
      const cost = sub.reduce((s, r) => s + r.gmv * 12 * (cbRate / 100) * (r.cashback / 100), 0);
      return {
        ...p, n: sub.length, share: sub.length / rows.length, txns: mean(sub, 'txns'), atv: mean(sub, 'atv'), ltv: mean(sub, 'ltv'),
        churn: churnRate(sub), nps: mean(sub, 'nps'), cb: mean(sub, 'cashback'), eng: mean(sub, 'engagement'),
        cost, costPerUser: sub.length ? cost / sub.length : NaN, gmvPerRupee: cost ? gmv / cost : NaN,
      };
    });
  }, [rows, cbCut, engHi, engLo, cbRate]);
  const P = Object.fromEntries(personas.map((p) => [p.id, p]));
  const totalCost = personas.reduce((s, p) => s + p.cost, 0);

  const heat = useMemo(() => {
    const f = heatMetric === 'churn' ? churnRate : (g) => mean(g, heatMetric);
    const cells = [];
    for (const e of ENG_BUCKETS) for (const c of CB_TIERS) {
      const g = rows.filter((r) => r.engB === e && r.cbT === c);
      cells.push({ e, c, n: g.length, v: g.length >= 15 ? f(g) : NaN });
    }
    const vs = cells.map((x) => x.v).filter(Number.isFinite);
    return { cells, lo: Math.min(...vs), hi: Math.max(...vs) };
  }, [rows, heatMetric]);
  const HM = { txns: { l: 'Avg monthly txns', f: (v) => fmtNum(v, 1) }, atv: { l: 'Avg ticket', f: (v) => fmtINR(v) }, churn: { l: 'Churn rate', f: (v) => fmtPct(v) } }[heatMetric];
  const SEQ = ['var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)'];
  const bucket = (v) => (!Number.isFinite(v) ? -1 : heat.hi === heat.lo ? 2 : Math.min(4, Math.floor(((v - heat.lo) / (heat.hi - heat.lo)) * 5)));

  const sigOutcomes = tierTests.filter((t) => t.p < 0.05);
  const txnSpread = Math.max(...dose.map((d) => d.txns)) - Math.min(...dose.map((d) => d.txns));
  const mercCost = P.mercenary.cost;
  const personaRows = (id) => rows.filter((r) => personaOf(r, cbCut, engHi, engLo) === id);
  const mu = useMemo(() => {
    const m = personaRows('mercenary'), u = personaRows('utility');
    return { churn: propTest(u, m), txns: welch(u, m, 'txns') };
  }, [rows, cbCut, engHi, engLo]); // eslint-disable-line react-hooks/exhaustive-deps
  const subsidyShare = totalCost ? (P.mercenary.cost + P.subsidised.cost) / totalCost : NaN;

  return (
    <>
      <SectionTitle title="Q4 · Is cashback usage driving real engagement or only deal-seeking behaviour?">
        Columns: <code>Cashback used pct</code> vs <code>Avg monthly transactions</code>, <code>Avg transaction value inr</code>, <code>App engagement score</code>, <code>Churned</code>, <code>Net promoter score</code>. Methods: dose–response by decile, ANOVA/χ² across cashback tiers, Pearson r, rule-based engagement × reliance personas (transparent thresholds, no model).
      </SectionTitle>
      <PillContrast
        blue={<>“Cashback works: it builds a <Concept name="Habit Loop">habit loop</Concept>, the reward trains repeat use, and heavy redeemers are our most engaged users.”</>}
        red={<>Across ten cashback-utilisation bands, average monthly transactions vary by only <b>{fmtNum(txnSpread, 1)}</b> (max − min), and {sigOutcomes.length === 0 ? 'none' : sigOutcomes.length} of {tierTests.length} outcomes differ significantly across cashback tiers (all |r| ≤ {Math.max(...tierTests.map((t) => Math.abs(t.r))).toFixed(3)}). This is an <b>association</b> in observational data: it does not prove cashback has no causal effect (heavy users may differ in ways the CSV doesn't record). It is consistent with cashback being consumed as <Concept name="Mental Accounting">“free money”</Concept> under <Concept name="Diminishing Marginal Utility" />; only a randomised test can show what the marginal rupee buys.</>}
      />

      <div className="grid g2">
        <Card title="Dose–response: cashback utilisation vs behaviour" subtitle="Each point = customers in a 10-pt band of Cashback used pct. A real driver slopes upward; a subsidy runs flat.">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={dose} margin={{ top: 10, right: 14, left: 4, bottom: 18 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" {...axisProps} interval={1} label={axisLabel('Cashback used pct band')} />
              <YAxis {...axisProps} domain={[0, 'auto']} width={44} label={axisLabel('Avg monthly transactions', 'y')} />
              <ReferenceLine y={mean(rows, 'txns')} stroke="var(--text-secondary)" strokeDasharray="4 4" label={{ value: 'overall avg', position: 'insideBottomRight', fill: 'var(--text-secondary)', fontSize: 10.5 }} />
              <Tooltip content={<Tip build={(p) => {
                const d = p[0].payload;
                return [{ label: 'Avg txns / month', value: fmtNum(d.txns, 1), color: C.s1 }, { label: 'Engagement', value: fmtNum(d.eng, 2) }, { label: 'Churn', value: fmtPct(d.churn) }, { label: 'Customers', value: fmtInt(d.n) }];
              }} />} />
              <Line dataKey="txns" stroke={C.s1} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <Callout tone="warn" title="Flat line = no detectable association">
            The line stays within ±{fmtNum(txnSpread / 2, 1)} transactions of the mean across the whole range. A strong positive association would make the right side sit visibly higher. No detectable association in this sample; this is not a causal elasticity estimate.
          </Callout>
        </Card>

        <Card title="Engagement × cashback reliance grid" subtitle="Rows: App engagement bucket. Columns: Cashback used tier. Hover a cell for n."
          actions={<Segmented value={heatMetric} onChange={setHeatMetric} options={[{ value: 'txns', label: 'Txns' }, { value: 'atv', label: 'Ticket' }, { value: 'churn', label: 'Churn' }]} />}>
          <div className="heat" style={{ gridTemplateColumns: `100px repeat(${CB_TIERS.length}, minmax(0,1fr))` }}>
            <div />
            {CB_TIERS.map((c) => <div className="hh" key={c}>CB {c}</div>)}
            {ENG_BUCKETS.map((e) => (
              <React.Fragment key={e}>
                <div className="hl">{e}</div>
                {CB_TIERS.map((c) => {
                  const cell = heat.cells.find((x) => x.e === e && x.c === c);
                  const b = bucket(cell.v);
                  return (
                    <div key={c} className="hc" title={`${e} × CB ${c}\n${HM.l}: ${HM.f(cell.v)}\nCustomers: ${cell.n}`}
                      style={{ background: b < 0 ? 'var(--seq-0)' : SEQ[b], color: b >= 2 ? '#fff' : 'var(--text-primary)' }}>
                      {Number.isFinite(cell.v) ? HM.f(cell.v) : '–'}
                      <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>n={cell.n}</div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div className="heat-scale"><span>{HM.f(heat.lo)}</span>{SEQ.map((c) => <i key={c} style={{ background: c }} />)}<span>{HM.f(heat.hi)}</span></div>
          <Callout tone="info" title="Reading the grid">
            Colour range spans only {HM.f(heat.lo)} to {HM.f(heat.hi)}. The scale is stretched to show any gradient at all{sigOutcomes.length === 0 ? '; neither direction (more cashback, more engagement) produces a consistent step-up' : '; check the significance badges below before reading a gradient as real'}.
          </Callout>
        </Card>
      </div>

      <Card title="Cashback tiers: small multiples with significance" subtitle="Mean outcome by Cashback used pct tier. ANOVA (numeric) or χ² (churn) across tiers; r = Pearson with raw cashback %.">
        <div className="grid g3" style={{ marginBottom: 0 }}>
          {tierTests.map((t) => (
            <div key={t.k}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, fontWeight: 600 }}>
                <span>{t.label}</span><span><span className="muted" style={{ fontWeight: 400 }}>r={t.r.toFixed(3)} </span><Sig p={t.p} /></span>
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={t.data} margin={{ top: 18, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" {...axisProps} interval={0} />
                  <YAxis {...axisProps} width={50} tickFormatter={(v) => (t.k === 'churned' ? `${Math.round(v * 100)}%` : t.k === 'atv' ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0))} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tip build={(p) => [{ label: t.label, value: t.fmt(p[0].value), color: C.s1 }, { label: 'Customers', value: fmtInt(p[0].payload.n) }]} />} />
                  <Bar dataKey="value" fill={C.s1} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                    <LabelList dataKey="value" position="top" formatter={t.fmt} fill="var(--text-secondary)" fontSize={10} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      </Card>

      <div className="sim-grid" style={{ marginBottom: 14 }}>
        <Card title="Persona thresholds (hypotheses)" subtitle="Hand-set rules, not validated segments. Tune and watch the table.">
          <div className="controls">
            <Slider label="Heavy cashback user if used ≥" value={cbCut} min={30} max={90} step={5} onChange={setCbCut} format={(v) => `${v}%`} />
            <Slider label="High engagement if score ≥" value={engHi} min={6} max={10} onChange={(v) => setEngHi(Math.max(v, engLo + 2))} format={(v) => v} />
            <Slider label="Low engagement if score ≤" value={engLo} min={1} max={5} onChange={(v) => setEngLo(Math.min(v, engHi - 2))} format={(v) => v} />
            <Slider label="Cashback offered (% of GMV)" value={cbRate} min={0.1} max={2} step={0.05} onChange={setCbRate} format={(v) => `${v.toFixed(2)}%`} hint="Assumption used to cost cashback = GMV × offered % × used %." />
          </div>
          <ul className="assumptions">
            {PERSONAS.slice(0, 4).map((p) => <li key={p.id}><b style={{ color: 'var(--text-primary)' }}>{p.name}:</b> {p.desc}</li>)}
          </ul>
        </Card>

        <Card title="Utility-led vs mercenary: hypothesised personas" subtitle="Who receives the modelled cashback budget. Personas use hand-picked thresholds and are hypotheses, not validated segments.">
          <ScenarioNote>Cashback ₹ cost is modelled as GMV × offered % × utilisation %. <code>Cashback used pct</code> in the CSV is the share of earned cashback utilised, not rupees spent.</ScenarioNote>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={personas.filter((p) => p.n)} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 14 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" {...axisProps} tickFormatter={(v) => fmtINRShort(v)} label={axisLabel('Estimated annual cashback cost')} />
              <YAxis type="category" dataKey="name" {...axisProps} width={150} />
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tip build={(p) => {
                const d = p[0].payload;
                return [{ label: 'Cashback cost', value: fmtINRShort(d.cost), color: d.color }, { label: 'Share of budget', value: fmtPct(d.cost / totalCost) }, { label: 'Customers', value: fmtInt(d.n) }];
              }} />} />
              <Bar dataKey="cost" radius={4} maxBarSize={18} isAnimationActive={false}>
                {personas.filter((p) => p.n).map((p) => <Cell key={p.id} fill={p.color} />)}
                <LabelList dataKey="cost" position="right" formatter={(v) => fmtPct(v / totalCost, 0)} fill="var(--text-secondary)" fontSize={10.5} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Persona</th><th>Users</th><th>Share</th><th>Txns/mo</th><th>Ticket</th><th>Avg throughput</th><th>Churn</th><th>NPS</th><th>CB cost/user/yr</th><th>GMV per ₹1 CB</th></tr></thead>
              <tbody>
                {personas.map((p) => (
                  <tr key={p.id}>
                    <td><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: p.color, marginRight: 6 }} />{p.name}</td>
                    <td>{fmtInt(p.n)}</td><td>{fmtPct(p.share, 0)}</td><td>{fmtNum(p.txns, 1)}</td><td>{fmtINR(p.atv)}</td><td>{fmtINRShort(p.ltv)}</td>
                    <td>{fmtPct(p.churn)}</td><td>{fmtNum(p.nps, 1)}</td><td>{fmtINR(p.costPerUser)}</td><td>{Number.isFinite(p.gmvPerRupee) ? `₹${fmtNum(p.gmvPerRupee, 0)}` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Callout tone="warn" title="Reading: consistent with deal-seeking, not proof of it">
            Mercenary deal-seekers and utility-led loyalists {mu.churn.p >= 0.05 && mu.txns.p >= 0.05 ? 'behave alike' : 'differ on some measures'}: churn {fmtPct(P.mercenary.churn)} vs {fmtPct(P.utility.churn)} (<Sig p={mu.churn.p} />), {fmtNum(P.mercenary.txns, 1)} vs {fmtNum(P.utility.txns, 1)} txns/month (<Sig p={mu.txns.p} />).
            Under the cost model, mercenaries absorb <b>{fmtPct(P.mercenary.cost / totalCost, 0)}</b> of modelled budget ({fmtINRShort(mercCost)}/yr) with <b>no detectable extra frequency or retention</b>, and heavy-cashback personas take {fmtPct(subsidyShare, 0)} of modelled spend while behaving like light users.
            That pattern is <b>consistent with</b> cashback acting as a price discount rather than a habit former. It is a hypothesis worth testing: cap mercenary cashback and trial capped, conditional, <Concept name="Goal-Gradient Effect">goal-gradient</Concept> rewards against a holdout (see Offer Lab).
          </Callout>
        </Card>
      </div>
    </>
  );
}

