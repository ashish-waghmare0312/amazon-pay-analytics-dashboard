import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell,
} from 'recharts';
import { Card, Callout, Segmented, Tip, axisProps, axisLabel, Legend, C } from '../components/ui.jsx';
import { RateBarChart, rateRows } from '../components/charts.jsx';
import {
  churnRate, mean, sd, pearson, binProfile, zVsRest, groupBy, fmtPct, fmtInt, fmtNum,
  TIERS, GENDERS, NPS_BUCKETS, ENG_BUCKETS, AGE_BRACKETS, CB_TIERS, INCOME_Q, TENURE_BANDS,
} from '../lib/data.js';
import { welch, chiSquare, fmtP } from '../lib/stats.js';
import { PillContrast, SectionTitle, Concept, Sig } from '../components/narrative.jsx';

const FEATURES = [
  { k: 'age', label: 'Age' },
  { k: 'income', label: 'Monthly income' },
  { k: 'tenure', label: 'Tenure (months)' },
  { k: 'prime', label: 'Prime member' },
  { k: 'txns', label: 'Monthly transactions' },
  { k: 'atv', label: 'Avg transaction value' },
  { k: 'gmv', label: 'Implied monthly GMV' },
  { k: 'cashback', label: 'Cashback used %' },
  { k: 'engagement', label: 'App engagement' },
  { k: 'support', label: 'Support contacts' },
  { k: 'nps', label: 'NPS' },
];

const DIMS = [
  { k: 'tier', label: 'Tier' },
  { k: 'gender', label: 'Gender' },
  { k: 'primeLabel', label: 'Prime' },
  { k: 'ageB', label: 'Age' },
  { k: 'engB', label: 'Engagement' },
  { k: 'npsB', label: 'NPS' },
  { k: 'cbT', label: 'Cashback' },
  { k: 'incQ', label: 'Income' },
  { k: 'tenB', label: 'Tenure' },
];

function combos(arr, size) {
  if (size === 1) return arr.map((a) => [a]);
  const out = [];
  arr.forEach((a, i) => combos(arr.slice(i + 1), size - 1).forEach((c) => out.push([a, ...c])));
  return out;
}

function findPockets(rows) {
  const base = churnRate(rows);
  const minN = Math.max(40, Math.round(rows.length * 0.01));
  const out = [];
  let tested = 0;
  for (const size of [2, 3]) {
    for (const dims of combos(DIMS, size)) {
      const g = groupBy(rows, (r) => dims.map((d) => r[d.k]).join(' | '));
      for (const { key, rows: sub } of g) {
        if (sub.length < minN || sub.length === rows.length) continue;
        tested++;
        const rate = churnRate(sub);
        out.push({
          name: key.split(' | ').map((v, i) => `${dims[i].label}: ${v}`).join(' · '),
          n: sub.length, rate, lift: rate - base, z: zVsRest(sub, rows),
        });
      }
    }
  }
  return { list: out, tested, base, minN };
}

export default function ChurnTab({ rows }) {
  const base = churnRate(rows);
  const [pocketDir, setPocketDir] = useState('High risk');

  const splits = useMemo(() => [
    { title: 'By city tier', x: 'City tier', data: rateRows(rows, (r) => r.tier, TIERS) },
    { title: 'By gender', x: 'Gender', data: rateRows(rows, (r) => r.gender, GENDERS) },
    { title: 'By Prime status', x: 'Membership', data: rateRows(rows, (r) => r.primeLabel, ['Prime', 'Non-Prime']) },
    { title: 'By NPS bucket', x: 'Net promoter score', data: rateRows(rows, (r) => r.npsB, NPS_BUCKETS) },
    { title: 'By engagement bucket', x: 'App engagement score', data: rateRows(rows, (r) => r.engB, ENG_BUCKETS) },
    { title: 'By age bracket', x: 'Age', data: rateRows(rows, (r) => r.ageB, AGE_BRACKETS) },
  ], [rows]);

  // Strongest single split: largest |z| among all groups shown
  const splitInsight = useMemo(() => {
    let best = null;
    const all = [];
    splits.forEach((s) => s.data.forEach((d) => {
      const sub = rows.filter((r) => [r.tier, r.gender, r.primeLabel, r.npsB, r.engB, r.ageB].includes(d.name));
      const z = zVsRest(sub, rows);
      all.push({ ...d, z, split: s.title });
      if (!best || Math.abs(z) > Math.abs(best.z)) best = { ...d, z, split: s.title };
    }));
    const range = Math.max(...all.map((d) => Math.abs(d.rate - base)));
    return { best, range, sig: all.filter((d) => Math.abs(d.z) >= 1.96 && d.n >= 30).length, total: all.length };
  }, [splits, rows, base]);

  const profile = useMemo(() => {
    const act = rows.filter((r) => !r.churned);
    const ch = rows.filter((r) => r.churned);
    return FEATURES.map(({ k, label }) => {
      const w = welch(act, ch, k);
      const denom = Math.abs(w.ma) < 1e-9 ? 1 : Math.abs(w.ma);
      return {
        k, label, active: w.ma, churned: w.mb,
        diffPct: k === 'nps' ? w.mb - w.ma : ((w.mb - w.ma) / denom) * 100,
        t: w.t, p: w.p, d: w.d,
      };
    });
  }, [rows]);

  const chi = useMemo(() => [
    { label: 'City tier', fn: (r) => r.tier, order: TIERS },
    { label: 'Gender', fn: (r) => r.gender, order: GENDERS },
    { label: 'Prime status', fn: (r) => r.primeLabel, order: ['Prime', 'Non-Prime'] },
    { label: 'Age bracket', fn: (r) => r.ageB, order: AGE_BRACKETS },
    { label: 'Income quartile', fn: (r) => r.incQ, order: INCOME_Q },
    { label: 'Tenure band', fn: (r) => r.tenB, order: TENURE_BANDS },
    { label: 'Engagement bucket', fn: (r) => r.engB, order: ENG_BUCKETS },
    { label: 'NPS bucket', fn: (r) => r.npsB, order: NPS_BUCKETS },
    { label: 'Support contacts (0–9)', fn: (r) => r.support },
    { label: 'Cashback tier', fn: (r) => r.cbT, order: CB_TIERS },
  ].map((c) => ({ ...c, ...chiSquare(rows, c.fn, c.order) })), [rows]);
  const sigCount = profile.filter((d) => d.p < 0.05).length + chi.filter((c) => c.p < 0.05).length;
  const hasBoth = rows.some((r) => r.churned) && rows.some((r) => !r.churned);

  const importance = useMemo(() => {
    const sigR = 1.96 / Math.sqrt(rows.length);
    const list = FEATURES.map(({ k, label }) => {
      const r = pearson(rows, k, 'churned');
      const { spread, mi } = binProfile(rows, k);
      return { label, r, absR: Math.abs(r), spread, mi };
    });
    return { list: [...list].sort((a, b) => b.absR - a.absR), sigR, spreadSorted: [...list].sort((a, b) => b.spread - a.spread) };
  }, [rows]);

  const pockets = useMemo(() => findPockets(rows), [rows]);
  const pocketList = useMemo(() => {
    const l = [...pockets.list].sort((a, b) => (pocketDir === 'High risk' ? b.z - a.z : a.z - b.z));
    return l.slice(0, 10);
  }, [pockets, pocketDir]);
  const sigPockets = pockets.list.filter((p) => p.z >= 1.96).length;
  const expectedByChance = Math.round(pockets.tested * 0.025);

  const maxAbsR = importance.list[0]?.absR || 0;
  const topSpread = importance.spreadSorted[0];
  const fmtVal = (k, v) => (['income', 'atv', 'gmv'].includes(k) ? `₹${fmtInt(v)}` : fmtNum(v, k === 'prime' ? 2 : 1));

  return (
    <>
      <SectionTitle title="Q1 · What drives churn?">
        Columns: <code>Churned</code> vs <code>Tenure months</code>, <code>App engagement score</code>, <code>Customer support contacts</code>, <code>Net promoter score</code>, <code>City tier</code>, <code>Age</code>, <code>Monthly income inr</code>. Methods: Wilson CIs, Welch t, χ² independence, point-biserial r, bin spread, 2–3-way pocket scan.
      </SectionTitle>
      <PillContrast
        blue={<>“Churners are the disengaged, unhappy, high-support users. Fix NPS and support and churn falls.” The textbook <Concept name="Habit Loop">broken-habit-loop</Concept> story.</>}
        red={<>In this sample, <b>{sigCount === 0 ? 'none' : `only ${sigCount}`}</b> of {profile.length + chi.length} tests reach p &lt; .05. Churned users have the same engagement, NPS, support load, tenure and income as active ones. Churn is <b>event-driven, not profile-driven</b>: the trigger (a failed UPI payment, a rival's cashback, an unresolved refund) is not in the CSV. Targeting by demographics is <Concept name="Red Pill vs Blue Pill">blue-pill</Concept> comfort.</>}
      />
      <div className="grid g3">
        {splits.map((s) => (
          <Card key={s.title} title={`Churn ${s.title.toLowerCase()}`} className="mini">
            <RateBarChart data={s.data} baseline={base} xLabel={s.x} />
          </Card>
        ))}
      </div>
      {!Number.isNaN(base) && rows.some((r) => r.churned) && (
        <Callout tone="info" title="Reading the splits">
          Every split sits within ±{(splitInsight.range * 100).toFixed(1)} pp of the {fmtPct(base)} average, and the 95% intervals (hover a bar) mostly overlap it.
          The biggest gap is <b>{splitInsight.best?.name}</b> ({splitInsight.best?.split.replace('By ', '')}) at {fmtPct(splitInsight.best?.rate)} on n = {fmtInt(splitInsight.best?.n)} (z = {fmtNum(splitInsight.best?.z, 2)}).{' '}
          {splitInsight.sig === 0
            ? 'No single demographic or behavioural group is significantly different from the rest at the 95% level, so churn can’t be pinned on one attribute.'
            : `${splitInsight.sig} of ${splitInsight.total} groups clear |z| ≥ 1.96. Treat them as hypotheses, because some will clear that bar by chance when this many groups are tested.`}
        </Callout>
      )}

      <div className="grid g2" style={{ marginTop: 14 }}>
        <Card title="Churned vs. Active: profile gap" subtitle="Churned mean vs Active mean, as % difference (NPS: absolute points). Red = higher among churners.">
          {hasBoth ? (
            <>
              <ResponsiveContainer width="100%" height={330}>
                <BarChart data={profile} layout="vertical" margin={{ top: 4, right: 20, left: 10, bottom: 18 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" {...axisProps} tickFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`} label={axisLabel('% difference, churned vs active')} domain={['auto', 'auto']} />
                  <YAxis type="category" dataKey="label" {...axisProps} width={140} />
                  <ReferenceLine x={0} stroke="var(--text-secondary)" />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-2)' }}
                    content={<Tip build={(p) => {
                      const d = p[0].payload;
                      return [
                        { label: 'Active mean', value: fmtVal(d.k, d.active), color: C.s1 },
                        { label: 'Churned mean', value: fmtVal(d.k, d.churned), color: C.s2 },
                        { label: d.k === 'nps' ? 'Gap (points)' : 'Gap', value: `${d.diffPct > 0 ? '+' : ''}${d.diffPct.toFixed(2)}${d.k === 'nps' ? '' : '%'}` },
                        { label: 'Welch t', value: fmtNum(d.t, 2) },
                      ];
                    }} />}
                  />
                  <Bar dataKey="diffPct" radius={4} maxBarSize={16} isAnimationActive={false}>
                    {profile.map((d) => <Cell key={d.k} fill={d.diffPct >= 0 ? 'var(--div-pos)' : 'var(--div-neg)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <Legend items={[{ label: 'Higher among churned', color: 'var(--div-pos)' }, { label: 'Lower among churned', color: 'var(--div-neg)' }]} />
            </>
          ) : <p className="muted">Needs both churned and active customers. Set the Status filter to All.</p>}
        </Card>

        <Card title="Profile table: Welch t-tests" subtitle="Means by status; p < .05 marks a gap unlikely to be noise. Cohen's d < 0.1 = negligible effect.">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Metric</th><th>Active</th><th>Churned</th><th>Gap</th><th>Cohen's d</th><th>Welch p</th></tr></thead>
              <tbody>
                {profile.map((d) => (
                  <tr key={d.k}>
                    <td>{d.label}</td>
                    <td>{fmtVal(d.k, d.active)}</td>
                    <td>{fmtVal(d.k, d.churned)}</td>
                    <td className={Math.abs(d.t) >= 1.96 ? (d.diffPct > 0 ? 'pos' : 'neg') : 'muted'}>{Number.isFinite(d.diffPct) ? `${d.diffPct > 0 ? '+' : ''}${d.diffPct.toFixed(1)}${d.k === 'nps' ? ' pts' : '%'}` : '–'}</td>
                    <td className="muted">{fmtNum(d.d, 3)}</td>
                    <td><Sig p={d.p} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasBoth && (
            <Callout tone={profile.some((d) => Math.abs(d.t) >= 1.96) ? 'info' : 'warn'} title="Profile read">
              {profile.some((d) => Math.abs(d.t) >= 1.96)
                ? `Significant gaps: ${profile.filter((d) => Math.abs(d.t) >= 1.96).map((d) => d.label).join(', ')}. Everything else looks the same for churned and active customers.`
                : 'Churned and active customers look statistically the same on every metric. Churn here isn’t explained by who customers are or how much they transact, so the levers are probably experience events this dataset doesn’t capture (failed payments, unresolved tickets, competitor offers).'}
            </Callout>
          )}
        </Card>
      </div>

      <div className="grid g2">
        <Card title="Linear signal: |correlation| with churn" subtitle="Point-biserial r. Dashed line = 95% significance threshold for this sample size.">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={importance.list} layout="vertical" margin={{ top: 4, right: 20, left: 10, bottom: 18 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" {...axisProps} domain={[0, (max) => Math.max(max, importance.sigR) * 1.15]} tickFormatter={(v) => v.toFixed(3)} label={axisLabel('|r| with churn flag')} />
              <YAxis type="category" dataKey="label" {...axisProps} width={140} />
              <ReferenceLine x={importance.sigR} stroke="var(--text-secondary)" strokeDasharray="4 4" label={{ value: `p<.05 at |r|>${importance.sigR.toFixed(3)}`, position: 'insideBottomRight', fill: 'var(--text-secondary)', fontSize: 10.5 }} />
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tip build={(p) => {
                const d = p[0].payload;
                return [{ label: 'r (signed)', value: d.r.toFixed(4), color: C.s1 }, { label: 'Variance explained', value: `${(d.r * d.r * 100).toFixed(3)}%` }];
              }} />} />
              <Bar dataKey="absR" fill={C.s1} radius={4} maxBarSize={16} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
          <Callout tone="warn" title="Why linear correlations are near zero">
            The strongest feature reaches only |r| = {maxAbsR.toFixed(3)}, which explains {(maxAbsR * maxAbsR * 100).toFixed(2)}% of churn variance.
            Churn is close to evenly spread across every measured attribute, so any single linear driver is weak.
            Correlation can also miss U-shaped effects and interactions, which the right-hand chart and the pocket table test for.
          </Callout>
        </Card>

        <Card title="Non-linear signal: churn spread across bins" subtitle="Max − min churn rate across quintiles (or levels) of each feature, in pp. Hover for mutual information.">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={importance.spreadSorted} layout="vertical" margin={{ top: 4, right: 20, left: 10, bottom: 18 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" {...axisProps} tickFormatter={(v) => `${(v * 100).toFixed(0)}`} label={axisLabel('Churn-rate spread across bins (pp)')} />
              <YAxis type="category" dataKey="label" {...axisProps} width={140} />
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tip build={(p) => {
                const d = p[0].payload;
                return [{ label: 'Bin spread', value: `${(d.spread * 100).toFixed(1)} pp`, color: C.s2 }, { label: 'Mutual info', value: `${(d.mi * 1000).toFixed(2)} mbit` }, { label: '|r|', value: d.absR.toFixed(4) }];
              }} />} />
              <Bar dataKey="spread" fill={C.s2} radius={4} maxBarSize={16} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
          <Callout tone="info" title="Where non-linearity shows up">
            <b>{topSpread?.label}</b> has the widest swing across its bins ({(topSpread?.spread * 100).toFixed(1)} pp) even though its |r| is {topSpread?.absR.toFixed(3)}.
            A swing this size with no linear trend means some ranges of the feature run hotter than others without a steady direction.
            Bins hold about 1,000 customers each, so a ±2–3 pp swing is within sampling noise. Use the pocket table below to find combinations that stand out.
          </Callout>
        </Card>
      </div>

      <Card
        title="Segment pockets: 2- and 3-way combinations"
        subtitle={`${fmtInt(pockets.tested)} segments tested (n ≥ ${pockets.minN}). Ranked by z-score vs the rest of the filtered base.`}
        actions={<Segmented value={pocketDir} onChange={setPocketDir} options={['High risk', 'Low risk']} />}
      >
        <div className="table-wrap">
          <table>
            <thead><tr><th>Segment</th><th>Customers</th><th>Churn rate</th><th>vs avg</th><th>z</th></tr></thead>
            <tbody>
              {pocketList.map((p) => (
                <tr key={p.name}>
                  <td className="l">{p.name}</td>
                  <td>{fmtInt(p.n)}</td>
                  <td>{fmtPct(p.rate)}</td>
                  <td className={p.lift > 0 ? 'pos' : 'neg'}>{p.lift > 0 ? '+' : '−'}{Math.abs(p.lift * 100).toFixed(1)} pp</td>
                  <td>{fmtNum(p.z, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Callout tone={sigPockets > expectedByChance * 1.5 ? 'good' : 'warn'} title="Multiple-testing check">
          {sigPockets} pockets exceed z ≥ 1.96, against about {expectedByChance} that would by chance alone across {fmtInt(pockets.tested)} tests.{' '}
          {sigPockets > expectedByChance * 1.5
            ? 'That’s more than chance predicts, so the top pockets are worth targeted A/B retention tests.'
            : 'That’s roughly what chance predicts. Treat these pockets as places to run test-and-learn experiments, not proven drivers.'}
        </Callout>
      </Card>
      <Card title="χ² tests of independence: categorical driver vs churn" subtitle="Pearson χ² on each categorical/binned driver × churn flag. Cramér's V measures effect size (< 0.1 = negligible).">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Driver</th><th>Levels</th><th>χ²</th><th>df</th><th>Cramér's V</th><th>Lowest churn</th><th>Highest churn</th><th>p-value</th></tr></thead>
            <tbody>
              {chi.map((c) => {
                const sorted = [...c.table].sort((a, b) => a.rate - b.rate);
                const lo = sorted[0], hi = sorted[sorted.length - 1];
                return (
                  <tr key={c.label}>
                    <td>{c.label}</td>
                    <td>{c.table.length}</td>
                    <td>{fmtNum(c.chi2, 2)}</td>
                    <td>{c.df}</td>
                    <td className="muted">{fmtNum(c.cramerV, 3)}</td>
                    <td>{lo ? `${lo.cat} · ${fmtPct(lo.rate)}` : '–'}</td>
                    <td>{hi ? `${hi.cat} · ${fmtPct(hi.rate)}` : '–'}</td>
                    <td><Sig p={c.p} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Callout tone="warn" title="So what for Amazon Pay">
          With {chi.filter((c) => c.p < 0.05).length} of {chi.length} categorical drivers significant (smallest p = {fmtP(Math.min(...chi.map((c) => c.p)))}), static segmentation cannot predict who leaves.
          Shift retention spend from <b>who the customer is</b> to <b>what just happened to them</b>: trigger-based saves on failed transactions, refund delays and competitor-offer windows,
          framed with <Concept name="Loss Aversion" /> (“your ₹ cashback expires”) rather than generic win-back discounts. Instrument these events; that is the data gap to close.
        </Callout>
      </Card>
    </>
  );
}
