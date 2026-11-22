import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, LabelList,
} from 'recharts';
import { Card, Callout, Segmented, Tip, axisProps, axisLabel, Legend, C } from '../components/ui.jsx';
import { PillContrast, SectionTitle, Concept, Sig, BoxPlot, MacroPanel } from '../components/narrative.jsx';
import { welch, propTest, boxStats, fmtP } from '../lib/stats.js';
import {
  churnRate, mean, fmtPct, fmtInt, fmtNum, fmtINR, fmtINRShort, groupBy, TIERS, AGE_BRACKETS, INCOME_Q, TENURE_BANDS,
} from '../lib/data.js';

const METRICS = [
  { k: 'txns', label: 'Avg monthly transactions', fmt: (v) => fmtNum(v, 1) },
  { k: 'atv', label: 'Avg transaction value', fmt: (v) => fmtINR(v) },
  { k: 'gmv', label: 'Implied monthly GMV', fmt: (v) => fmtINRShort(v) },
  { k: 'engagement', label: 'App engagement score', fmt: (v) => fmtNum(v, 2) },
  { k: 'nps', label: 'Net promoter score', fmt: (v) => fmtNum(v, 1) },
  { k: 'tenure', label: 'Tenure (months)', fmt: (v) => fmtNum(v, 1) },
  { k: 'cashback', label: 'Cashback used %', fmt: (v) => `${fmtNum(v, 1)}%` },
  { k: 'support', label: 'Support contacts', fmt: (v) => fmtNum(v, 2) },
];

const CUTS = [
  { id: 'tier', label: 'City tier', fn: (r) => r.tier, order: TIERS },
  { id: 'age', label: 'Age', fn: (r) => r.ageB, order: AGE_BRACKETS },
  { id: 'inc', label: 'Income', fn: (r) => r.incQ, order: INCOME_Q },
  { id: 'ten', label: 'Tenure', fn: (r) => r.tenB, order: TENURE_BANDS },
];

export default function PrimeTab({ rows }) {
  const [metric, setMetric] = useState('txns');
  const [cut, setCut] = useState('tier');
  const prime = useMemo(() => rows.filter((r) => r.prime), [rows]);
  const non = useMemo(() => rows.filter((r) => !r.prime), [rows]);
  const both = prime.length > 1 && non.length > 1;

  const tests = useMemo(() => METRICS.map((m) => ({ ...m, ...welch(non, prime, m.k) })), [prime, non]);
  const churnT = useMemo(() => propTest(non, prime), [prime, non]);
  const M = METRICS.find((m) => m.k === metric);
  const box = useMemo(() => [
    { label: 'Prime', color: C.s1, stats: boxStats(prime, metric) },
    { label: 'Non-Prime', color: C.s2, stats: boxStats(non, metric) },
  ], [prime, non, metric]);

  const cutDef = CUTS.find((c) => c.id === cut);
  const cutData = useMemo(() => groupBy(rows, cutDef.fn, cutDef.order).map(({ key, rows: g }) => {
    const p = g.filter((r) => r.prime), n = g.filter((r) => !r.prime);
    const pt = propTest(n, p);
    return { name: key, Prime: churnRate(p), 'Non-Prime': churnRate(n), np: p.length, nn: n.length, gap: pt.diff, p: pt.p };
  }), [rows, cutDef]);

  // index chart: Prime mean as % of non-Prime mean (100 = parity)
  const indexData = tests.filter((t) => t.k !== 'nps').map((t) => ({ name: t.label, index: (t.mb / t.ma) * 100, p: t.p }));
  const sigTests = tests.filter((t) => t.p < 0.05);

  return (
    <>
      <SectionTitle title="Q2 · How does Prime membership affect transaction frequency and loyalty?">
        Columns: <code>Amazon prime member</code> vs <code>Avg monthly transactions</code>, <code>Avg transaction value inr</code>, <code>App engagement score</code>, <code>Net promoter score</code>, <code>Churned</code>. Methods: Welch t-test, two-proportion z-test, Cohen's d, box plots, stratified churn by segment.
      </SectionTitle>
      {both && (
        <PillContrast
          blue={<>“Prime is the ultimate <Concept name="Carrot-and-Stick" /> moat: the annual fee creates <Concept name="Sunk Cost Fallacy">sunk-cost</Concept> lock-in, so Prime members pay more often and churn less.”</>}
          red={<>Prime members transact <b>{fmtNum(tests[0].mb, 1)}</b> vs <b>{fmtNum(tests[0].ma, 1)}</b> times a month and churn at <b>{fmtPct(churnT.pb)}</b> vs <b>{fmtPct(churnT.pa)}</b> (p = {fmtP(churnT.p)}). {sigTests.length === 0 ? 'No metric differs significantly.' : <>{sigTests.length} metric(s) differ significantly ({sigTests.map((t) => `${t.label}: ${t.mb > t.ma ? 'Prime higher' : 'Prime lower'}`).join('; ')}).</>} {churnT.p < 0.05 && churnT.diff < 0 ? 'Prime members churn less in this view (an association, not proof Prime causes it). ' : ''}A non-significant result is <b>not proof of no effect</b>, and Prime members self-select, so none of this is causal. <b>Why</b> is not something this CSV can show. One hypothesis to test: Prime's benefits reward Amazon shopping rather than paying with Amazon Pay, so membership need not change the payment habit. A Pay-linked Prime benefit tested against a holdout would settle it.</>}
        />
      )}

      <div className="grid g4">
        {[
          { l: 'Prime penetration', v: fmtPct(prime.length / rows.length), s: `${fmtInt(prime.length)} of ${fmtInt(rows.length)}` },
          { l: 'Churn: Prime vs Non-Prime', v: `${fmtPct(churnT.pb)} vs ${fmtPct(churnT.pa)}`, s: <>Δ {churnT.diff >= 0 ? '+' : '−'}{Math.abs(churnT.diff * 100).toFixed(1)} pp · <Sig p={churnT.p} /></> },
          { l: 'Monthly txns: Prime vs Non', v: `${fmtNum(tests[0].mb)} vs ${fmtNum(tests[0].ma)}`, s: <>d = {fmtNum(tests[0].d, 3)} · <Sig p={tests[0].p} /></> },
          { l: 'NPS: Prime vs Non', v: `${fmtNum(tests[4].mb)} vs ${fmtNum(tests[4].ma)}`, s: <>d = {fmtNum(tests[4].d, 3)} · <Sig p={tests[4].p} /></> },
        ].map((k) => (
          <div className="kpi" key={k.l}>
            <span className="kpi-label">{k.l}</span>
            <b className="kpi-value" style={{ fontSize: 19 }}>{k.v}</b>
            <small className="kpi-delta">{k.s}</small>
          </div>
        ))}
      </div>

      <div className="grid g2">
        <Card title="Prime index by metric" subtitle="Prime mean ÷ Non-Prime mean × 100. 100 = parity; hover for the Welch test. NPS excluded (mean ≈ 0 makes a ratio meaningless; see table).">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={indexData} layout="vertical" margin={{ top: 4, right: 40, left: 10, bottom: 18 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" {...axisProps} domain={[(min) => Math.floor(Math.min(min, 96)), (max) => Math.ceil(Math.max(max, 104))]} label={axisLabel('Index (Non-Prime = 100)')} />
              <YAxis type="category" dataKey="name" {...axisProps} width={160} />
              <ReferenceLine x={100} stroke="var(--text-secondary)" strokeDasharray="4 4" />
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tip build={(p) => {
                const d = p[0].payload; const t = tests.find((x) => x.label === d.name);
                return [
                  { label: 'Prime', value: t.fmt(t.mb), color: C.s1 },
                  { label: 'Non-Prime', value: t.fmt(t.ma), color: C.s2 },
                  { label: 'Index', value: fmtNum(d.index, 1) },
                  { label: 'Welch p', value: fmtP(t.p) },
                ];
              }} />} />
              <Bar dataKey="index" fill={C.s1} radius={4} maxBarSize={16} isAnimationActive={false}>
                <LabelList dataKey="index" position="right" formatter={(v) => fmtNum(v, 1)} fill="var(--text-secondary)" fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
                  <Callout tone="info" title="Reading it">
            Every metric sits within {fmtNum(Math.max(...indexData.map((d) => Math.abs(d.index - 100))), 1)} points of parity, and {indexData.filter((d) => d.p < 0.05).length === 0 ? 'none differs significantly' : `${indexData.filter((d) => d.p < 0.05).length} differ significantly`} (Welch p, uncorrected). Prime and non-Prime customers use Amazon Pay at about the same frequency, ticket and engagement in this sample.
          </Callout>
        </Card>

        <Card
          title={`Distribution: ${M.label}`}
          subtitle="Quartile box plot by membership. Overlapping boxes = no practical difference."
          actions={(
            <select value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Metric" style={{ width: 210 }}>
              {METRICS.map((m) => <option key={m.k} value={m.k}>{m.label}</option>)}
            </select>
          )}
        >
          {both ? <BoxPlot groups={box} fmt={M.fmt} axisLabelText={M.label} /> : <p className="muted">Needs both Prime and Non-Prime customers in the filter.</p>}
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table>
              <thead><tr><th>Metric</th><th>Prime</th><th>Non-Prime</th><th>Δ (95% CI)</th><th>d</th><th>p</th></tr></thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.k} className={t.k === metric ? 'sel' : ''} onClick={() => setMetric(t.k)} style={{ cursor: 'pointer' }}>
                    <td>{t.label}</td><td>{t.fmt(t.mb)}</td><td>{t.fmt(t.ma)}</td>
                    <td className="muted">{t.fmt(t.diff)} ({t.fmt(t.ci[0])} to {t.fmt(t.ci[1])})</td>
                    <td className="muted">{fmtNum(t.d, 3)}</td>
                    <td><Sig p={t.p} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card
        title="Churn by Prime status, stratified"
        subtitle="Does Prime protect any specific segment? Two-proportion z-test inside each stratum."
        actions={<Segmented value={cut} onChange={setCut} options={CUTS.map((c) => ({ value: c.id, label: c.label }))} />}
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={cutData} margin={{ top: 18, right: 8, left: 4, bottom: 18 }} barGap={2} barCategoryGap="26%">
            <CartesianGrid vertical={false} />
            <XAxis dataKey="name" {...axisProps} interval={0} label={axisLabel(cutDef.label)} />
            <YAxis {...axisProps} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={44} label={axisLabel('Churn rate', 'y')} />
            <ReferenceLine y={churnRate(rows)} stroke="var(--text-secondary)" strokeDasharray="4 4" />
            <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tip build={(p) => {
              const d = p[0].payload;
              return [
                { label: `Prime (n=${fmtInt(d.np)})`, value: fmtPct(d.Prime), color: C.s1 },
                { label: `Non-Prime (n=${fmtInt(d.nn)})`, value: fmtPct(d['Non-Prime']), color: C.s2 },
                { label: 'Gap', value: `${d.gap >= 0 ? '+' : '−'}${Math.abs(d.gap * 100).toFixed(1)} pp` },
                { label: 'z-test p', value: fmtP(d.p) },
              ];
            }} />} />
            <Bar dataKey="Prime" fill={C.s1} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}>
              <LabelList dataKey="Prime" position="top" formatter={(v) => fmtPct(v, 1)} fill="var(--text-secondary)" fontSize={11} />
            </Bar>
            <Bar dataKey="Non-Prime" fill={C.s2} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}>
              <LabelList dataKey="Non-Prime" position="top" formatter={(v) => fmtPct(v, 1)} fill="var(--text-secondary)" fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <Legend items={[{ label: 'Prime', color: C.s1 }, { label: 'Non-Prime', color: C.s2 }, { label: 'Dashed = overall churn', color: 'var(--text-secondary)' }]} />
        <Callout tone="info" title="Reading it">
          <b>Data gap:</b> the CSV has no channel split (Amazon shopping vs UPI vs bill-pay), so Prime's effect on each Pay use case cannot be separated; that is the first data request.{' '}
          {cutData.filter((d) => d.p < 0.05).length === 0
            ? <>In no {cutDef.label.toLowerCase()} stratum does Prime significantly reduce churn. Overall Prime churn runs {fmtNum(Math.abs(churnT.diff * 100), 1)} pp {churnT.diff >= 0 ? 'higher' : 'lower'} (not significant); the CSV gives no basis for explaining that gap.</>
            : <>Prime shifts churn significantly in: {cutData.filter((d) => d.p < 0.05).map((d) => `${d.name} (${d.gap >= 0 ? '+' : '−'}${Math.abs(d.gap * 100).toFixed(1)} pp)`).join(', ')}. Treat as hypotheses to A/B test.</>}
        </Callout>
      </Card>

      <div className="grid g2">
        <MacroPanel
          title="Carrot-and-Stick: how Prime is meant to retain"
          items={[
            <><b>Carrot:</b> Amazon Pay ICICI credit card gives Prime members a higher reward rate on Amazon (5% vs 3% for non-Prime); Prime-exclusive deal windows (Prime Day, early access).</>,
            <><b>Stick:</b> lapse means losing free/fast delivery, Prime Video and Music. <Concept name="Loss Aversion" /> and the <Concept name="Sunk Cost Fallacy">sunk-cost</Concept> of a ~₹1,499 annual fee keep members shopping on Amazon.</>,
            <><b>Hypothesis, not established by the CSV:</b> none of these benefits is tied to <i>paying with Amazon Pay</i> off-Amazon (UPI scan-and-pay, bills). The CSV only shows no significant Prime difference in Pay frequency; it cannot say why.</>,
            <><b>Test:</b> make Pay usage a visible Prime benefit: “Prime Pay” streak rewards, bill-pay cashback only for Prime, Prime renewal credit earned through Pay spend (<Concept name="Endowment Effect" />).</>,
          ]}
        />
        <MacroPanel
          title="UPI ecosystem: why the wallet war is about habit, not price"
          items={[
            <><b>Scale:</b> UPI crossed ~20 billion transactions a month in 2025 (NPCI), the dominant retail payment rail in India.</>,
            <><b>Concentration:</b> PhonePe and Google Pay together hold roughly 80%+ of UPI volume; Amazon Pay is a small single-digit-share player. NPCI's 30% per-app market-share cap has been deferred to end-2026.</>,
            <><b>Zero MDR</b> on UPI person-to-merchant payments means each UPI transaction earns ~nothing directly; monetisation comes from credit (card/BNPL), bill-pay, merchant services and the Amazon commerce flywheel.</>,
            <><b>Implication:</b> cashback is a costly way to buy share on a zero-margin rail. Winning the default slot (<Concept name="Status Quo Bias" />) via UPI AutoPay mandates and bill reminders is the cheaper moat.</>,
          ]}
        />
      </div>
    </>
  );
}
