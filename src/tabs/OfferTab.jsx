import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, LabelList, Cell,
} from 'recharts';
import { Card, Callout, Tip, axisProps, axisLabel, Legend, Slider, C } from '../components/ui.jsx';
import { PillContrast, SectionTitle, Concept, MacroPanel, ScenarioNote } from '../components/narrative.jsx';
import { annualAttrition } from '../lib/analyses.js';
import { churnRate, mean, sum, fmtPct, fmtInt, fmtNum, fmtINR, fmtINRShort } from '../lib/data.js';
import { annualMargin } from './LtvTab.jsx';

const VALUE_TIERS = ['Whale (top 20%)', 'Core (mid 50%)', 'Tail (bottom 30%)'];
const RELIANCE = ['Light cashback', 'Heavy cashback'];

// Default playbook per cell: offer, psychology, cost per user per year (₹), relative churn reduction, cashback restructuring saving.
const PLAYS = {
  'Whale (top 20%)|Light cashback': {
    title: 'Recognition, not rebates', concepts: ['Endowment Effect', 'Loss Aversion'], cost: 400, red: 15, save: 0,
    how: ['“Pay Elite” status visible in-app, priority human support line', 'Early access to Prime Day / bank offers', 'Status framed as something you could lose (quarterly re-qualification)'],
  },
  'Whale (top 20%)|Heavy cashback': {
    title: 'Tiered cap + milestone unlocks', concepts: ['Goal-Gradient Effect', 'Loss Aversion'], cost: 600, red: 12, save: 25,
    how: ['Replace flat % cashback with monthly milestones (e.g. 10/25/50 txns)', 'Progress bar in app; cap per cycle to stop leakage', '“You’re 3 payments from ₹150” nudges'],
  },
  'Core (mid 50%)|Light cashback': {
    title: 'Habit bridge: bills & AutoPay', concepts: ['Habit Loop', 'Status Quo Bias'], cost: 150, red: 10, save: 0,
    how: ['One-tap UPI AutoPay set-up for electricity, mobile, DTH, broadband', 'Bill-due reminders as the cue → pay → instant confirmation reward', 'Make Amazon Pay the default saved method at Amazon checkout'],
  },
  'Core (mid 50%)|Heavy cashback': {
    title: 'Variable-ratio scratch cards', concepts: ['Variable Ratio Reinforcement', 'Hyperbolic Discounting'], cost: 200, red: 6, save: 30,
    how: ['Swap guaranteed cashback for scratch cards with the same expected value but lower cost', 'Instant reveal at payment completion', 'Bias rewards toward new categories (UPI scan-and-pay, bills)'],
  },
  'Tail (bottom 30%)|Light cashback': {
    title: 'Friction-reduction nudges', concepts: ['Status Quo Bias', 'Habit Loop'], cost: 30, red: 4, save: 0,
    how: ['Push/WhatsApp nudges only, no cash: UPI Lite for small payments, one-tap re-pay', 'Fix failed-payment journeys first (hypothesised churn trigger)', 'Low-cost reactivation, no subsidy'],
  },
  'Tail (bottom 30%)|Heavy cashback': {
    title: 'Cap & wean the mercenaries', concepts: ['Diminishing Marginal Utility', 'Mental Accounting'], cost: 0, red: -3, save: 60,
    how: ['Hard monthly cap; cashback only as Amazon Pay balance (keeps it in-ecosystem)', 'Accept some attrition: these users are margin-negative', 'Redirect saved budget to Whale and Core plays'],
  },
};

const z = { a: 1.96, b: 0.8416 };

export default function OfferTab({ rows, assume, setAssume }) {
  const { take, cbRate, cbCut, windowMonths } = assume;
  const upd = (k) => (v) => setAssume((a) => ({ ...a, [k]: v }));
  const setTake = upd('take'), setCbRate = upd('cbRate'), setCbCut = upd('cbCut'), setWindow = upd('windowMonths');
  const [params, setParams] = useState(() => Object.fromEntries(Object.entries(PLAYS).map(([k, v]) => [k, { cost: v.cost, red: v.red, save: v.save }])));
  const [blanketPct, setBlanketPct] = useState(0.5);
  const [blanketRed, setBlanketRed] = useState(5);
  const [mde, setMde] = useState(3);
  const T = take / 100, CB = cbRate / 100;

  const cells = useMemo(() => {
    const s = [...rows].sort((a, b) => b.ltv - a.ltv);
    const n = s.length;
    const tierOf = new Map();
    s.forEach((r, i) => tierOf.set(r, i < n * 0.2 ? VALUE_TIERS[0] : i < n * 0.7 ? VALUE_TIERS[1] : VALUE_TIERS[2]));
    const out = [];
    for (const vt of VALUE_TIERS) for (const rl of RELIANCE) {
      const g = rows.filter((r) => tierOf.get(r) === vt && (r.cashback >= cbCut) === (rl === RELIANCE[1]));
      const key = `${vt}|${rl}`;
      const p = params[key];
      const margin = mean(g.map((r) => annualMargin(r, T, CB)));
      const cbCost = g.reduce((acc, r) => acc + r.gmv * 12 * CB * (r.cashback / 100), 0);
      const churn = churnRate(g);
      const annual = annualAttrition(churn, windowMonths); // assumed annualisation of the churn flag
      const distress = g.filter((r) => r.nps < 0 || r.support >= 7).length;
      const savedUsers = g.length * annual * (p.red / 100);
      const retainedValue = savedUsers * (Number.isFinite(margin) ? margin : 0);
      const cbSaving = cbCost * (p.save / 100);
      const offerCost = g.length * p.cost;
      const net = retainedValue + cbSaving - offerCost;
      out.push({
        key, vt, rl, n: g.length, churn, margin, cbCost, distress, savedUsers, retainedValue, cbSaving, offerCost, net,
        roi: offerCost ? net / offerCost : NaN, play: PLAYS[key], p, short: `${vt.split(' ')[0]} · ${rl.split(' ')[0]}`,
      });
    }
    return out;
  }, [rows, params, T, CB, cbCut, windowMonths]);

  const top20Share = useMemo(() => { const s = [...rows].sort((a, b) => b.ltv - a.ltv); return sum(s.slice(0, Math.round(s.length * 0.2)), 'ltv') / sum(s, 'ltv'); }, [rows]);
  const tot = cells.reduce((a, c) => ({
    n: a.n + c.n, offerCost: a.offerCost + c.offerCost, cbSaving: a.cbSaving + c.cbSaving, retainedValue: a.retainedValue + c.retainedValue, net: a.net + c.net, savedUsers: a.savedUsers + c.savedUsers,
  }), { n: 0, offerCost: 0, cbSaving: 0, retainedValue: 0, net: 0, savedUsers: 0 });

  // Blanket alternative: extra cashback % to everyone, uniform churn reduction.
  const blanket = useMemo(() => {
    const cost = rows.reduce((a, r) => a + r.gmv * 12 * (blanketPct / 100) * (r.cashback / 100), 0);
    const saved = rows.length * annualAttrition(churnRate(rows), windowMonths) * (blanketRed / 100);
    const value = saved * mean(rows.map((r) => annualMargin(r, T, CB)));
    return { cost, saved, value, net: value - cost };
  }, [rows, blanketPct, blanketRed, T, CB, windowMonths]);

  // Power analysis for an A/B retention test
  const p1 = churnRate(rows), p2 = Math.max(0.001, p1 - mde / 100);
  const nPerArm = Math.ceil(((z.a + z.b) ** 2 * (p1 * (1 - p1) + p2 * (1 - p2))) / (p1 - p2) ** 2);

  const setP = (key, field) => (v) => setParams((s) => ({ ...s, [key]: { ...s[key], [field]: v } }));
  const chart = cells.map((c) => ({ name: c.short, net: c.net, key: c.key }));

  return (
    <>
      <SectionTitle title="Q5 · How can Amazon Pay personalise offers to improve retention?">
        Segmentation = throughput-proxy rank (value tier) × <code>Cashback used pct</code> (reliance), with an overlay of distress signals (<code>Net promoter score</code> &lt; 0 or <code>Customer support contacts</code> ≥ 7). Methods: value × reliance matrix, scenario P&amp;L, blanket-vs-targeted comparison, A/B power analysis.
      </SectionTitle>
      <PillContrast
        blue={<>“Retention is a cashback problem. Raise the cashback rate for everyone and churn will fall.”</>}
        red={<>In the full 5,000-user sample, cashback utilisation shows no detectable association with behaviour (Q4) and no recorded attribute explains churn (Q1), so a blanket rate hike has <b>no evidence behind it</b> and a clear cost (<Concept name="Diminishing Marginal Utility" />). What does vary is <b>throughput</b> (Q3: top 20% = {fmtPct(top20Share, 0)} of the pool). So <b>test</b> personalisation on <b>throughput × reliance</b>: status for top users, habit-building for the middle, caps for hypothesised mercenaries.</>}
      />

      <ScenarioNote><b>Illustrative scenario, not a forecast.</b> Churn reductions, offer costs and cashback savings are assumptions you set; none has been measured. Outputs show what would follow <i>if</i> those assumptions held, and each play needs an A/B test before any result is claimed.</ScenarioNote>
      <div className="sim-grid">
        <Card title="Global assumptions" subtitle="Scenario inputs (not CSV facts).">
          <div className="controls">
            <Slider label="Net take rate on GMV" value={take} min={0.1} max={2} step={0.05} onChange={setTake} format={(v) => `${v.toFixed(2)}%`} />
            <Slider label="Current cashback (% of GMV)" value={cbRate} min={0} max={2} step={0.05} onChange={setCbRate} format={(v) => `${v.toFixed(2)}%`} />
            <Slider label="Heavy-reliance threshold" value={cbCut} min={30} max={90} step={5} onChange={setCbCut} format={(v) => `≥ ${v}% used`} />
            <Slider label="Assumed churn-flag window" value={windowMonths} min={3} max={36} step={3} onChange={setWindow} format={(v) => `${v} months`} hint={`Not stated in the CSV. Annualised churn ≈ ${fmtPct(annualAttrition(p1, windowMonths))}.`} />
          </div>
          <div className="stats" style={{ marginTop: 14 }}>
            <div className="stat"><span>Scenario: targeted plan net / yr</span><b style={{ color: tot.net >= 0 ? 'var(--good-ink)' : 'var(--critical)' }}>{fmtINRShort(tot.net)}</b><small>cost {fmtINRShort(tot.offerCost)} · CB saved {fmtINRShort(tot.cbSaving)}</small></div>
            <div className="stat"><span>Customers retained if assumptions hold</span><b>{fmtInt(tot.savedUsers)}</b><small>annualised churn {fmtPct(annualAttrition(p1, windowMonths))} → {fmtPct(annualAttrition(p1, windowMonths) - tot.savedUsers / rows.length)}</small></div>
            <div className="stat"><span>Scenario: blanket +{blanketPct}% cashback</span><b style={{ color: blanket.net >= 0 ? 'var(--good-ink)' : 'var(--critical)' }}>{fmtINRShort(blanket.net)}</b><small>cost {fmtINRShort(blanket.cost)} · would retain {fmtInt(blanket.saved)} at the assumed cut</small></div>
          </div>
          <h4 style={{ margin: '14px 0 6px', fontSize: 13 }}>Blanket alternative</h4>
          <div className="controls">
            <Slider label="Extra cashback to everyone" value={blanketPct} min={0.1} max={2} step={0.1} onChange={setBlanketPct} format={(v) => `${v.toFixed(1)}% of GMV`} />
            <Slider label="Assumed churn reduction" value={blanketRed} min={0} max={30} onChange={setBlanketRed} format={(v) => `${v}%`} hint="An assumption: the CSV shows no detectable association, so any value here is a guess." />
          </div>
        </Card>

        <Card title="Scenario: net annual impact by segment" subtitle="Retained margin + cashback savings − offer cost, if the assumed effects held. Edit each segment's levers below.">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chart} margin={{ top: 18, right: 8, left: 8, bottom: 18 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" {...axisProps} interval={0} label={axisLabel('Value tier · cashback reliance')} />
              <YAxis {...axisProps} tickFormatter={fmtINRShort} width={64} label={axisLabel('Net impact / yr', 'y')} />
              <ReferenceLine y={0} stroke="var(--text-secondary)" />
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tip build={(p) => {
                const c = cells.find((x) => x.key === p[0].payload.key);
                return [
                  { label: 'Retained margin', value: fmtINRShort(c.retainedValue), color: C.s1 },
                  { label: 'Cashback saved', value: fmtINRShort(c.cbSaving) },
                  { label: 'Offer cost', value: `−${fmtINRShort(c.offerCost)}` },
                  { label: 'Net', value: fmtINRShort(c.net) },
                  { label: 'Customers', value: fmtInt(c.n) },
                ];
              }} />} />
              <Bar dataKey="net" radius={4} maxBarSize={48} isAnimationActive={false}>
                {chart.map((d) => <Cell key={d.key} fill={d.net >= 0 ? 'var(--series-1)' : 'var(--div-pos)'} />)}
                <LabelList dataKey="net" position="top" formatter={fmtINRShort} fill="var(--text-secondary)" fontSize={10.5} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <Legend items={[{ label: 'Value-accretive', color: 'var(--series-1)' }, { label: 'Value-destructive', color: 'var(--div-pos)' }]} />
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Segment</th><th>Users</th><th>Churn</th><th>Margin/user/yr</th><th>Distress</th><th>Offer ₹/user</th><th>Churn cut</th><th>CB saving</th><th>Net</th><th>ROI</th></tr></thead>
              <tbody>
                {cells.map((c) => (
                  <tr key={c.key} className="sim-row">
                    <td>{c.short}</td>
                    <td>{fmtInt(c.n)}</td>
                    <td>{fmtPct(c.churn)}</td>
                    <td className={c.margin < 0 ? 'pos' : ''}>{fmtINR(c.margin)}</td>
                    <td className="muted">{fmtPct(c.distress / Math.max(1, c.n), 0)}</td>
                    <td><input type="range" min={0} max={1500} step={10} value={c.p.cost} onChange={(e) => setP(c.key, 'cost')(Number(e.target.value))} aria-label={`${c.short} offer cost`} /><output>₹{c.p.cost}</output></td>
                    <td><input type="range" min={-10} max={40} value={c.p.red} onChange={(e) => setP(c.key, 'red')(Number(e.target.value))} aria-label={`${c.short} churn reduction`} /><output>{c.p.red}%</output></td>
                    <td><input type="range" min={0} max={80} step={5} value={c.p.save} onChange={(e) => setP(c.key, 'save')(Number(e.target.value))} aria-label={`${c.short} cashback saving`} /><output>{c.p.save}%</output></td>
                    <td className={c.net >= 0 ? 'neg' : 'pos'}>{fmtINRShort(c.net)}</td>
                    <td className="muted">{Number.isFinite(c.roi) ? `${fmtNum(c.roi, 1)}×` : '∞'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Callout tone="info" title="How to read">
            Churn cut = relative reduction in that segment's annualised churn the offer is <b>assumed</b> to achieve (not measured). CB saving = share of the segment's current cashback cost removed by restructuring (caps, scratch cards, balance-only payout).
            Distress = share with NPS &lt; 0 or ≥ 7 support contacts: a candidate pool for proactive service recovery (a hypothesis; neither signal predicts churn in this data).
          </Callout>
        </Card>
      </div>

      <h3 style={{ margin: '18px 0 10px', fontSize: 15 }}>Psychology-backed offer playbook</h3>
      <div className="play" style={{ marginBottom: 14 }}>
        {cells.map((c) => (
          <div className="play-card" key={c.key} style={{ borderTopColor: c.net >= 0 ? 'var(--series-1)' : 'var(--div-pos)' }}>
            <span className="meta">{c.vt} · {c.rl} · {fmtInt(c.n)} users</span>
            <h4>{c.play.title}</h4>
            <div>{c.play.concepts.map((k) => <Concept key={k} name={k} />)}</div>
            <ul>{c.play.how.map((h) => <li key={h}>{h}</li>)}</ul>
            <span className="meta">Net {fmtINRShort(c.net)}/yr · offer ₹{c.p.cost}/user · churn −{c.p.red}%</span>
          </div>
        ))}
      </div>

      <div className="grid g2">
        <Card title="Test before you scale: A/B power analysis" subtitle="Users needed per arm to detect an ASSUMED churn reduction (α = 0.05 two-sided, power = 80%).">
          <Slider label="Minimum detectable churn reduction" value={mde} min={1} max={8} step={0.5} onChange={setMde} format={(v) => `${v} pp`} />
          <div className="stats" style={{ marginTop: 12 }}>
            <div className="stat"><span>Baseline churn</span><b>{fmtPct(p1)}</b><small>current filter</small></div>
            <div className="stat"><span>Target churn</span><b>{fmtPct(p2)}</b><small>−{mde} pp</small></div>
            <div className="stat"><span>Users per arm</span><b>{fmtInt(nPerArm)}</b><small>{fmtInt(nPerArm * 2)} total</small></div>
          </div>
          <Callout tone="info" title="Governance">
            This sizes a test for an effect you assume; it does not show any play will achieve that effect. Run each play with a 10–20% randomised holdout. A {mde} pp lift on {fmtPct(p1)} churn needs ~{fmtInt(nPerArm)} users per arm, so the Whale segments ({fmtInt(cells[0].n + cells[1].n)} users here) need a production-scale base, not this sample.
            Kill any play whose holdout gap is not significant after one cycle (<Concept name="Sunk Cost Fallacy">avoid sunk-cost escalation</Concept>).
          </Callout>
        </Card>
        <MacroPanel
          title="Offer design guardrails from the Indian market"
          items={[
            <><b>Cashback wars are structurally expensive:</b> with zero MDR on UPI, every rupee of UPI cashback is unrecovered acquisition cost. Rivals have pulled back from blanket cashback toward scratch cards and targeted rewards.</>,
            <><b>Recurring rails create defaults:</b> UPI AutoPay (e-mandates) for bills and subscriptions turns one decision into many payments: <Concept name="Status Quo Bias" /> working for you.</>,
            <><b>Small-ticket friction:</b> UPI Lite and one-tap flows remove PIN friction for low-value payments, the highest-frequency use case.</>,
            <><b>Credit is where margin lives:</b> co-branded cards, credit on UPI and BNPL earn interchange/interest. Route whales toward Amazon Pay credit products, not deeper cashback.</>,
          ]}
        />
      </div>
    </>
  );
}
