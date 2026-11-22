// Shared analyses so every tab quotes the same test battery and the same assumptions.
import { welch, chiSquare } from './stats.js';
import {
  churnRate, zVsRest, groupBy, TIERS, GENDERS, AGE_BRACKETS, INCOME_Q, TENURE_BANDS, ENG_BUCKETS, NPS_BUCKETS, CB_TIERS,
} from './data.js';

export const DEFAULT_ASSUMPTIONS = { take: 0.6, cbRate: 0.4, cbCut: 60, engHi: 7, engLo: 4 };

export const CHURN_FEATURES = [
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

export const CHURN_CATEGORICALS = [
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
];

/** The single churn test battery: Welch t per numeric feature + χ² per categorical driver. */
export function churnBattery(rows) {
  const act = rows.filter((r) => !r.churned), ch = rows.filter((r) => r.churned);
  const profile = CHURN_FEATURES.map(({ k, label }) => {
    const w = welch(act, ch, k);
    const denom = Math.abs(w.ma) < 1e-9 ? 1 : Math.abs(w.ma);
    return { k, label, active: w.ma, churned: w.mb, diffPct: k === 'nps' ? w.mb - w.ma : ((w.mb - w.ma) / denom) * 100, t: w.t, p: w.p, d: w.d };
  });
  const chi = CHURN_CATEGORICALS.map((c) => ({ ...c, ...chiSquare(rows, c.fn, c.order) }));
  const all = [...profile.map((x) => ({ label: x.label, p: x.p })), ...chi.map((x) => ({ label: x.label, p: x.p }))].filter((x) => Number.isFinite(x.p));
  const sig = all.filter((x) => x.p < 0.05);
  const minP = all.length ? Math.min(...all.map((x) => x.p)) : NaN;
  const minLabel = all.find((x) => x.p === minP)?.label;
  // strongest single group vs the rest (one level of one categorical)
  let topGroup = null;
  for (const c of CHURN_CATEGORICALS.slice(0, 5)) {
    for (const { key, rows: g } of groupBy(rows, c.fn, c.order)) {
      if (g.length < 30 || g.length === rows.length) continue;
      const z = zVsRest(g, rows);
      if (!topGroup || Math.abs(z) > Math.abs(topGroup.z)) topGroup = { dim: c.label, key, n: g.length, rate: churnRate(g), z };
    }
  }
  const bonf = all.filter((x) => x.p < 0.05 / Math.max(1, all.length));
  return { profile, chi, total: all.length, sig, bonf, minP, minLabel, topGroup };
}
