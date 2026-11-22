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
import { fmtP, normCdf, bhAdjust, pearsonRCrit } from '../lib/stats.js';
import { churnBattery, CHURN_FEATURES } from '../lib/analyses.js';
import { PillContrast, SectionTitle, Concept, Sig } from '../components/narrative.jsx';


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
  // Two-sided p per pocket, then Benjamini-Hochberg FDR across every pocket tested.
  out.forEach((o) => { o.p = 2 * (1 - normCdf(Math.abs(o.z))); });
  const q = bhAdjust(out.map((o) => o.p));
  out.forEach((o, i) => { o.q = q[i]; });
  return { list: out, tested, base, minN };
}

export default function ChurnTab({ rows }) {
  const base = churnRate(rows);
  const [pocketDir, setPocketDir] = useState('High risk');

  const splits = useMemo(() => [
    { title: 'By city tier', fn: (r) => r.tier, x: 'City tier', data: rateRows(rows, (r) => r.tier, TIERS) },
    { title: 'By gender', fn: (r) => r.gender, x: 'Gender', data: rateRows(rows, (r) => r.gender, GENDERS) },
    { title: 'By Prime status', fn: (r) => r.primeLabel, x: 'Membership', data: rateRows(rows, (r) => r.primeLabel, ['Prime', 'Non-Prime']) },
    { title: 'By NPS bucket', fn: (r) => r.npsB, x: 'Net promoter score', data: rateRows(rows, (r) => r.npsB, NPS_BUCKETS) },
    { title: 'By engagement bucket', fn: (r) => r.engB, x: 'App engagement score', data: rateRows(rows, (r) => r.engB, ENG_BUCKETS) },
    { title: 'By age bracket', fn: (r) => r.ageB, x: 'Age', data: rateRows(rows, (r) => r.ageB, AGE_BRACKETS) },
  ], [rows]);

  // Strongest single split: largest |z| among all groups shown
  const splitInsight = useMemo(() => {
    let best = null;
    const all = [];
    splits.forEach((s) => s.data.forEach((d) => {
      // Explicit attribute-specific filter: only this split's own column is matched.
      const sub = rows.filter((r) => String(s.fn(r)) === String(d.name));
      const z = zVsRest(sub, rows);
      all.push({ ...d, z, p: 2 * (1 - normCdf(Math.abs(z))), split: s.title });
      if (!best || Math.abs(z) > Math.abs(best.z)) best = { ...d, z, split: s.title };
    }));
    const q = bhAdjust(all.map((d) => d.p));
    all.forEach((d, i) => { d.q = q[i]; });
    const range = Math.max(...all.map((d) => Math.abs(d.rate - base)));
    const sigRaw = all.filter((d) => d.p < 0.05 && d.n >= 30);
    const sigFdr = all.filter((d) => d.q < 0.05 && d.n >= 30);
    return { best, range, sig: sigRaw.length, sigFdr, total: all.length };
  }, [splits, rows, base]);

  const battery = useMemo(() => churnBattery(rows), [rows]);
  const { profile, chi } = battery;
  const sigCount = battery.sig.length;
  const hasBoth = rows.some((r) => r.churned) && rows.some((r) => !r.churned);

  const importance = useMemo(() => {
    const sigR = pearsonRCrit(rows.length); // exact two-sided t-test threshold on r, df = n - 2
    const list = CHURN_FEATURES.map(({ k, label }) => {
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
  const rawPockets = pockets.list.filter((p) => p.p < 0.05).length;
  const fdrPockets = pockets.list.filter((p) => p.q < 0.05);
  const expectedByChance = Math.round(pockets.tested * 0.05);

  const maxAbsR = importance.list[0]?.absR || 0;
  const topSpread = importance.spreadSorted[0];
  const fmtVal = (k, v) => (['income', 'atv', 'gmv'].includes(k) ? `₹${fmtInt(v)}` : fmtNum(v, k === 'prime' ? 2 : 1));

  return (
    <>
      <SectionTitle title="Q1 · What factors most strongly influence customer churn?">
        Columns: <code>Churned</code> vs <code>Tenure months</code>, <code>App engagement score</code>, <code>Customer support contacts</code>, <code>Net promoter score</code>, <code>City tier</code>, <code>Age</code>, <code>Monthly income inr</code>. Methods: Wilson CIs, Welch t, χ² independence, point-biserial r, bin spread, 2–3-way pocket scan.
      </SectionTitle>
      <PillContrast
        blue={<>“Churners are the disengaged, unhappy, high-support users. Fix NPS and support and churn falls.” The textbook <Concept name="Habit Loop">broken-habit-loop</Concept> story.</>}
        red={<>In {rows.length === 5000 ? 'this sample' : 'this filtered view'}, <b>{sigCount === 0 ? 'none' : `only ${sigCount}`}</b> of {battery.total} tests reach p &lt; .05{sigCount > 0 ? <> ({battery.sig.map((x) => x.label).join(', ')}; ~{fmtNum(battery.total * 0.05, 0)} false positive{Math.round(battery.total * 0.05) === 1 ? ' is' : 's are'} expected by chance{battery.bonf.length ? <>, but <b>{battery.bonf.map((x) => x.label).join(', ')}</b> survive{battery.bonf.length === 1 ? 's' : ''} Bonferroni correction and merit{battery.bonf.length === 1 ? 's' : ''} a closer look in this segment</> : ', so treat them as hypotheses'})</> : ''}. {sigCount === 0 ? 'Churned users have the same engagement, NPS, support load, tenure and income as active ones.' : 'Everything else looks the same for churned and active users.'} Churn is <b>not explained by any attribute recorded in the CSV</b>. A plausible hypothesis, <i>not testable with this data</i>, is that churn follows experience events the dataset does not capture (failed payments, refund delays, rival offers). Targeting on demographics alone is <Concept name="Red Pill vs Blue Pill">blue-pill</Concept> comfort.</>}
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
          Every split sits within ±{(splitInsight.range * 100).toFixed(1)} pp of the {fmtPct(base)} average{splitInsight.sig === 0 ? ', and every 95% interval (hover a bar) is consistent with it' : ''}.
          The biggest gap is <b>{splitInsight.best?.name}</b> ({splitInsight.best?.split.replace('By ', '')}) at {fmtPct(splitInsight.best?.rate)} on n = {fmtInt(splitInsight.best?.n)} (z = {fmtNum(splitInsight.best?.z, 2)}).{' '}
          {splitInsight.sig === 0
            ? 'No single group differs significantly from the rest at the 95% level (uncorrected), so churn can’t be pinned on one attribute in this data.'
            : <>{splitInsight.sig} of {splitInsight.total} groups {splitInsight.sig === 1 ? 'reaches' : 'reach'} uncorrected p &lt; .05; after Benjamini–Hochberg FDR correction across all {splitInsight.total}, {splitInsight.sigFdr.length === 0 ? 'none remain significant' : `${splitInsight.sigFdr.length} remain (${splitInsight.sigFdr.map((d) => d.name).join(', ')})`}. Exploratory: treat as hypotheses to test.</>}
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
                    <td className={d.p < 0.05 ? (d.diffPct > 0 ? 'pos' : 'neg') : 'muted'}>{Number.isFinite(d.diffPct) ? `${d.diffPct > 0 ? '+' : ''}${d.diffPct.toFixed(1)}${d.k === 'nps' ? ' pts' : '%'}` : '–'}</td>
                    <td className="muted">{fmtNum(d.d, 3)}</td>
                    <td><Sig p={d.p} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasBoth && (
            <Callout tone={profile.some((d) => d.p < 0.05) ? 'info' : 'warn'} title="Profile read">
              {profile.some((d) => d.p < 0.05)
                ? `Significant gaps (Welch p < .05, uncorrected): ${profile.filter((d) => d.p < 0.05).map((d) => d.label).join(', ')}. Everything else looks the same for churned and active customers.`
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
            Bins hold about {fmtInt(rows.length / 5)} customers each, so a swing under ±{fmtNum(196 * Math.sqrt((base * (1 - base)) / Math.max(1, rows.length / 5)), 1)} pp is within sampling noise. Use the pocket table below to find combinations that stand out.
          </Callout>
        </Card>
      </div>

      <Card
        title="Exploratory segment pockets: 2- and 3-way combinations"
        subtitle={`${fmtInt(pockets.tested)} segments tested (n ≥ ${pockets.minN}). Ranked by z vs the rest of the filtered base; q = Benjamini–Hochberg FDR-adjusted p across all ${fmtInt(pockets.tested)} tests.`}
        actions={<Segmented value={pocketDir} onChange={setPocketDir} options={['High risk', 'Low risk']} />}
      >
        <div className="table-wrap">
          <table>
            <thead><tr><th>Segment</th><th>Customers</th><th>Churn rate</th><th>vs avg</th><th>z</th><th>p (raw)</th><th>q (FDR)</th></tr></thead>
            <tbody>
              {pocketList.map((p) => (
                <tr key={p.name}>
                  <td className="l">{p.name}</td>
                  <td>{fmtInt(p.n)}</td>
                  <td>{fmtPct(p.rate)}</td>
                  <td className={p.lift > 0 ? 'pos' : 'neg'}>{p.lift > 0 ? '+' : '−'}{Math.abs(p.lift * 100).toFixed(1)} pp</td>
                  <td>{fmtNum(p.z, 2)}</td>
                  <td className="muted">{fmtP(p.p)}</td>
                  <td className={p.q < 0.05 ? 'sig' : 'muted'}>{fmtP(p.q)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Callout tone={fdrPockets.length ? 'info' : 'warn'} title="Multiple-testing check">
          {rawPockets} of {fmtInt(pockets.tested)} pockets reach uncorrected p &lt; .05, against ~{expectedByChance} expected by chance alone.
          After Benjamini–Hochberg FDR correction, <b>{fdrPockets.length === 0 ? 'none survive' : `${fdrPockets.length} survive (q < .05)`}</b>.{' '}
          {fdrPockets.length === 0
            ? 'Treat every pocket here as exploratory: a place to design a test, not evidence of a driver.'
            : 'Surviving pockets are still exploratory and overlapping; validate them in a held-out sample or A/B test before acting.'}
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
          With {chi.filter((c) => c.p < 0.05).length} of {chi.length} categorical drivers significant (smallest p = {fmtP(Math.min(...chi.map((c) => c.p)))}), the recorded attributes do not identify who leaves.
          <b>Hypothesis to test (not established by this data):</b> churn is triggered by experience events such as failed transactions, refund delays or competitor offers, none of which the CSV records.
          Next step: instrument those events, then test trigger-based saves (e.g. <Concept name="Loss Aversion" />-framed nudges) against a holdout before shifting retention spend.
        </Callout>
      </Card>
    </>
  );
}
