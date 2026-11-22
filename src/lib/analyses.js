// Shared analyses so every tab quotes the same test battery and the same assumptions.
import { welch, chiSquare, logisticFit, logisticPredict, nullLogLik, lrTest, auc, propTest as _propTest } from './stats.js';
import {
  churnRate, zVsRest, groupBy, TIERS, GENDERS, AGE_BRACKETS, INCOME_Q, TENURE_BANDS, ENG_BUCKETS, NPS_BUCKETS, CB_TIERS,
} from './data.js';

export const DEFAULT_ASSUMPTIONS = { take: 0.6, cbRate: 0.4, cbCut: 60, engHi: 7, engLo: 4, windowMonths: 12 };

/**
 * The CSV's churn flag has no stated observation window. Scenario maths needs an annual rate, so we
 * ASSUME the flag covers `windowMonths` and convert: annual = 1 − (1 − churn)^(12 / windowMonths).
 */
export const annualAttrition = (churn, windowMonths = 12) => (Number.isFinite(churn) ? 1 - (1 - churn) ** (12 / windowMonths) : NaN);

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

// ---------- multivariate churn model (logistic regression; inferential, not an ML pipeline) ----------

const MODEL_NUM = [
  ['age', 'Age'], ['income', 'Monthly income'], ['tenure', 'Tenure'], ['txns', 'Monthly transactions'], ['atv', 'Avg transaction value'],
  ['cashback', 'Cashback utilisation'], ['engagement', 'App engagement'], ['support', 'Support contacts'], ['nps', 'NPS'],
];
const MODEL_CAT = [
  ['Prime member', (r) => r.prime], ['Tier 2 (vs Tier 1)', (r) => (r.tier === 'Tier 2' ? 1 : 0)], ['Tier 3 (vs Tier 1)', (r) => (r.tier === 'Tier 3' ? 1 : 0)],
  ['Male (vs Female)', (r) => (r.gender === 'Male' ? 1 : 0)], ['Other gender (vs Female)', (r) => (r.gender === 'Other' ? 1 : 0)],
];
export const NAMED_INTERACTIONS = [['support', 'nps'], ['engagement', 'support'], ['engagement', 'nps'], ['cashback', 'tenure'], ['cashback', 'engagement']];

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Logistic regression of churn on all 12 recorded attributes (numeric fields standardised), plus
 * nested likelihood-ratio tests for squared terms (non-linearity) and named interactions, a 5-fold
 * cross-validated AUC, and the "unhappy, disengaged, high-support" risk zone.
 */
export function churnModel(rows) {
  const y = rows.map((r) => r.churned);
  const nPos = y.reduce((s, v) => s + v, 0);
  if (rows.length < 300 || nPos < 30 || nPos > rows.length - 30) return { ok: false, reason: 'Needs at least 300 customers with both churned and active users.' };
  const stdz = Object.fromEntries(MODEL_NUM.map(([k]) => {
    const m = rows.reduce((s, r) => s + r[k], 0) / rows.length;
    const sdv = Math.sqrt(rows.reduce((s, r) => s + (r[k] - m) ** 2, 0) / (rows.length - 1)) || 1;
    return [k, (r) => (r[k] - m) / sdv];
  }));
  // main design: drop any column that is constant under the current filter
  let terms = [...MODEL_NUM.map(([k, label]) => ({ label, f: stdz[k] })), ...MODEL_CAT.map(([label, f]) => ({ label, f }))];
  terms = terms.filter((t) => { const v = rows.map(t.f); return Math.max(...v) - Math.min(...v) > 1e-9; });
  const X = rows.map((r) => terms.map((t) => t.f(r)));
  const main = logisticFit(X, y);
  const l0 = nullLogLik(y);
  const overall = lrTest(main.ll, l0, terms.length);
  const coefs = terms.map((t, i) => ({ label: t.label, ...main.coefs[i + 1] }));

  const sq = MODEL_NUM.map(([k]) => (r) => stdz[k](r) ** 2);
  const quadFit = logisticFit(rows.map((r, i) => [...X[i], ...sq.map((f) => f(r))]), y);
  const quad = lrTest(quadFit.ll, main.ll, sq.length);

  const ix = NAMED_INTERACTIONS.map(([a, b]) => (r) => stdz[a](r) * stdz[b](r));
  const ixFit = logisticFit(rows.map((r, i) => [...X[i], ...ix.map((f) => f(r))]), y);
  const inter = lrTest(ixFit.ll, main.ll, ix.length);
  const interEach = NAMED_INTERACTIONS.map(([a, b], j) => ({ label: `${a} × ${b}`, ...ixFit.coefs[terms.length + 1 + j] }));

  // 5-fold cross-validated AUC with a fixed seed (reproducible)
  const rnd = mulberry32(7);
  const fold = rows.map(() => Math.floor(rnd() * 5));
  const aucs = [];
  for (let f = 0; f < 5; f++) {
    const tr = [], te = [];
    rows.forEach((_, i) => (fold[i] === f ? te : tr).push(i));
    const fit = logisticFit(tr.map((i) => X[i]), tr.map((i) => y[i]));
    aucs.push(auc(logisticPredict(fit, te.map((i) => X[i])), te.map((i) => y[i])));
  }
  const cvAuc = aucs.reduce((s, v) => s + v, 0) / aucs.length;

  const zoneRows = rows.filter((r) => r.engagement <= 3 && r.support >= 7 && r.nps < 0);
  const restRows = rows.filter((r) => !(r.engagement <= 3 && r.support >= 7 && r.nps < 0));
  const zone = { n: zoneRows.length, ...(_propTest(restRows, zoneRows)) };

  return { ok: true, n: rows.length, terms: terms.length, overall, mcfadden: 1 - main.ll / l0, coefs, quad, inter, interEach, cvAuc, zone };
}
