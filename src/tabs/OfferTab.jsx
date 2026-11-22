import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, LabelList, Cell,
} from 'recharts';
import { Card, Callout, Tip, axisProps, axisLabel, Legend, Slider, C } from '../components/ui.jsx';
import { PillContrast, SectionTitle, Concept, MacroPanel, ScenarioNote } from '../components/narrative.jsx';
import { annualAttrition } from '../lib/analyses.js';
import { twoPropSampleSize } from '../lib/stats.js';
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
    how: ['One-tap UPI AutoPay for electricity, mobile, DTH, broadband (e-mandates need extra authentication above ₹15,000, so start with small recurring bills)', 'Bill-due reminders as the cue → pay → instant confirmation reward', 'Make Amazon Pay the default saved method at Amazon checkout'],
  },
  'Core (mid 50%)|Heavy cashback': {
    title: 'Variable-ratio scratch cards', concepts: ['Variable Ratio Reinforcement', 'Hyperbolic Discounting'], cost: 200, red: 6, save: 30,
    how: ['Swap guaranteed cashback for scratch cards with the same expected value but lower cost', 'Instant reveal at payment completion', 'Bias rewards toward new categories (UPI scan-and-pay, bills)'],
  },
  'Tail (bottom 30%)|Light cashback': {
    title: 'Friction-reduction nudges', concepts: ['Status Quo Bias', 'Habit Loop'], cost: 30, red: 4, save: 0,
    how: ['Push/WhatsApp nudges only, no cash: UPI Lite for small PIN-less payments (capped per transaction by RBI), one-tap re-pay', 'Fix failed-payment journeys first (hypothesised churn trigger)', 'Low-cost reactivation, no subsidy'],
  },
  'Tail (bottom 30%)|Heavy cashback': {
    title: 'Taper, don’t claw back', concepts: ['Diminishing Marginal Utility', 'Mental Accounting'], cost: 0, red: -3, save: 60,
    how: ['Grandfather earned rewards; taper the rate over two cycles with advance notice (sudden clawbacks trigger backlash)', 'Keep payouts to the bank via UPI where possible; do not force wallet lock-in', 'Downside is bounded: see Sensitivity for how many heavy users could leave before the saving is erased'],
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


  // ---------- sensitivity: does the conclusion survive other assumptions? ----------
  const sens = useMemo(() => {
    const s = [...rows].sort((a, b) => b.ltv - a.ltv);
    const n = s.length;
    const tierOf = new Map();
    s.forEach((r, i) => tierOf.set(r, i < n * 0.2 ? VALUE_TIERS[0] : i < n * 0.7 ? VALUE_TIERS[1] : VALUE_TIERS[2]));
    const annual = annualAttrition(churnRate(rows), windowMonths);
    const at = (takePct, cbPct) => {
      const Tt = takePct / 100, CBr = cbPct / 100;
      let tnet = 0;
      for (const vt of VALUE_TIERS) for (const rl of RELIANCE) {
        const g = rows.filter((r) => tierOf.get(r) === vt && (r.cashback >= cbCut) === (rl === RELIANCE[1]));
        const p = params[`${vt}|${rl}`];
        const m = mean(g.map((r) => annualMargin(r, Tt, CBr)));
        const cbc = g.reduce((acc, r) => acc + r.gmv * 12 * CBr * (r.cashback / 100), 0);
        tnet += g.length * annualAttrition(churnRate(g), windowMonths) * (p.red / 100) * (Number.isFinite(m) ? m : 0) + cbc * (p.save / 100) - g.length * p.cost;
      }
      const mAvg = mean(rows.map((r) => annualMargin(r, Tt, CBr)));
      const bcost = rows.reduce((a, r) => a + r.gmv * 12 * (blanketPct / 100) * (r.cashback / 100), 0);
      const bnet = rows.length * annual * (blanketRed / 100) * mAvg - bcost;
      const beCut = mAvg > 0 ? bcost / (rows.length * annual * mAvg) : Infinity; // relative churn cut needed to break even
      return { takePct, cbPct, tnet, bnet, beCut };
    };
    const grid = [];
    for (const tk of [0.3, 0.6, 1.0]) for (const cb of [0.2, 0.4, 0.8]) grid.push(at(tk, cb));
    const heavy = rows.filter((r) => r.cashback >= cbCut);
    const heavyMargin = mean(heavy.map((r) => annualMargin(r, T, CB)));
    const usersToWipe = heavyMargin > 0 ? tot.cbSaving / heavyMargin : Infinity;
    const gmvUser = rows.reduce((a, r) => a + r.gmv * 12, 0) / rows.length;
    const cbUser = rows.reduce((a, r) => a + r.gmv * 12 * CB * (r.cashback / 100), 0) / rows.length;
    return { grid, heavyN: heavy.length, usersToWipe, gmvUser, revUser: gmvUser * T, cbUser, contribUser: gmvUser * T - cbUser };
  }, [rows, params, cbCut, windowMonths, blanketPct, blanketRed, T, CB, tot.cbSaving]);

  // Power analysis for an A/B retention test
  const p1 = churnRate(rows), p2 = Math.max(0.001, p1 - mde / 100);
  const ss = twoPropSampleSize(p1, p2);
  const nPerArm = ss.corrected; // the conservative figure leads; the other two are shown beside it

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
              <YAxis {...axisProps} tickFormatter={(v) => `₹${Math.round(v / 1e5)}L`} width={48} />
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
                <LabelList dataKey="net" position="top" formatter={(v) => `₹${(v / 1e5).toFixed(1)}L`} fill="var(--text-secondary)" fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <Legend items={[{ label: 'Value-accretive', color: 'var(--series-1)' }, { label: 'Value-destructive', color: 'var(--div-pos)' }]} />
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Segment</th><th>Users</th><th>Churn</th><th>Modelled margin / user / yr</th><th>Distress</th><th>Offer ₹/user</th><th>Churn cut</th><th>CB saving</th><th>Net (scenario)</th><th>ROI (scenario)</th></tr></thead>
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

      <Card title="Sensitivity: does the conclusion survive other assumptions?" subtitle={`Re-runs the targeted plan and the blanket +${blanketPct}% hike across 9 take-rate × cashback-rate combinations, holding your segment levers fixed. All ₹ are per year for this ${fmtInt(rows.length)}-user sample (and an index, since 77% of users show spend above income).`}>
        <ScenarioNote>The 0.6% blended take rate is an assumption, not a CSV fact: UPI merchant payments earn 0% MDR while card, wallet and bill-pay flows earn more. That is why we test 0.3%–1.0% instead of relying on one number.</ScenarioNote>
        <div className="grid g2" style={{ marginBottom: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Take rate</th><th>Cashback rate</th><th>Targeted net</th><th>Blanket net</th><th>Blanket break-even churn cut</th></tr></thead>
              <tbody>
                {sens.grid.map((g) => (
                  <tr key={`${g.takePct}-${g.cbPct}`} className={g.takePct === take && g.cbPct === cbRate ? 'sel' : ''}>
                    <td>{g.takePct.toFixed(1)}%</td><td>{g.cbPct.toFixed(1)}%</td>
                    <td className={g.tnet >= 0 ? 'neg' : 'pos'}>{fmtINRShort(g.tnet)}</td>
                    <td className={g.bnet >= 0 ? 'neg' : 'pos'}>{fmtINRShort(g.bnet)}</td>
                    <td className="muted">{Number.isFinite(g.beCut) ? (g.beCut > 1 ? `${fmtNum(g.beCut * 100, 0)}% (impossible)` : fmtPct(g.beCut, 0)) : 'never (negative margin)'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <div className="stats">
              <div className="stat"><span>Targeted plan positive in</span><b>{sens.grid.filter((g) => g.tnet > 0).length} / 9</b><small>assumption sets</small></div>
              <div className="stat"><span>Blanket hike breaks even in</span><b>{sens.grid.filter((g) => Number.isFinite(g.beCut) && g.beCut <= 1).length} / 9</b><small>needs &gt;100% churn cut otherwise</small></div>
              <div className="stat"><span>Heavy users who would have to leave to erase the cashback saving</span><b>{Number.isFinite(sens.usersToWipe) ? fmtInt(sens.usersToWipe) : '–'}</b><small>{Number.isFinite(sens.usersToWipe) ? `${fmtPct(sens.usersToWipe / sens.heavyN, 0)} of ${fmtInt(sens.heavyN)} heavy users` : 'margin ≤ 0'}</small></div>
            </div>
            <h4 style={{ margin: '12px 0 6px', fontSize: 13 }}>Unit economics per user per year (current sliders)</h4>
            <div className="stats">
              <div className="stat"><span>GMV</span><b>{fmtINRShort(sens.gmvUser)}</b><small>txns × ticket × 12</small></div>
              <div className="stat"><span>Revenue at {take.toFixed(2)}%</span><b>{fmtINRShort(sens.revUser)}</b><small>assumed take rate</small></div>
              <div className="stat"><span>Modelled cashback</span><b>{fmtINRShort(sens.cbUser)}</b><small>GMV × {cbRate.toFixed(2)}% × utilisation</small></div>
              <div className="stat"><span>Contribution</span><b>{fmtINRShort(sens.contribUser)}</b><small>before offer costs</small></div>
            </div>
          </div>
        </div>
      </Card>

      <h3 style={{ margin: '18px 0 10px', fontSize: 15 }}>Psychology-backed offer playbook</h3>
      <div className="play" style={{ marginBottom: 14 }}>
        {cells.map((c) => (
          <div className="play-card" key={c.key}>
            <span className="meta">{c.vt} · {c.rl} · {fmtInt(c.n)} users</span>
            <h4>{c.play.title}</h4>
            <div>{c.play.concepts.map((k) => <Concept key={k} name={k} />)}</div>
            <ul>{c.play.how.map((h) => <li key={h}>{h}</li>)}</ul>
            <span className="meta">Scenario: net {fmtINRShort(c.net)}/yr if an assumed ₹{c.p.cost}/user offer cut churn {c.p.red}%</span>
          </div>
        ))}
      </div>

      <div className="grid g2">
        <Card title="Test before you scale: A/B power analysis" subtitle="Users needed per arm to detect an ASSUMED churn reduction (α = 0.05 two-sided, power = 80%).">
          <Slider label="Minimum detectable churn reduction" value={mde} min={1} max={8} step={0.5} onChange={setMde} format={(v) => `${v} pp`} />
          <div className="stats" style={{ marginTop: 12 }}>
            <div className="stat"><span>Baseline churn</span><b>{fmtPct(p1)}</b><small>current filter</small></div>
            <div className="stat"><span>Target churn</span><b>{fmtPct(p2)}</b><small>−{mde} pp</small></div>
            <div className="stat"><span>Users per arm (continuity-corrected)</span><b>{fmtInt(ss.corrected)}</b><small>pooled {fmtInt(ss.pooled)} · unpooled {fmtInt(ss.unpooled)} · {fmtInt(ss.corrected * 2)} total</small></div>
          </div>
          <Callout tone="info" title="Governance">
            This sizes a test for an effect you assume; it does not show any play will achieve that effect. It uses the normal approximation to a two-sided two-proportion z-test (α 0.05, power 80%), equal arms, independent users and one primary metric; the baseline is the churn flag in the current filter, whose observation window is unknown, so the absolute effect should be restated per period once real churn is measured. Several plays tested at once need a multiple-testing correction, which raises these numbers. Run each play with a 10–20% randomised holdout. A {mde} pp lift on {fmtPct(p1)} churn needs ~{fmtInt(nPerArm)} users per arm, so the Whale segments ({fmtInt(cells[0].n + cells[1].n)} users here) need a production-scale base, not this sample.
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
