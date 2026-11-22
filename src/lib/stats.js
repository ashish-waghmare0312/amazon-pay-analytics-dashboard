// Inferential statistics in plain JS (no ML): Welch t, chi-square, one-way ANOVA,
// quantiles, Cohen's d, Cramér's V, eta². P-values via regularised incomplete beta/gamma.

// ---------- special functions ----------
function gammaln(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const ci of c) ser += ci / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a, b, x) {
  const MAXIT = 300, EPS = 3e-12, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a,b) */
export function ibeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Regularised lower incomplete gamma P(a,x) */
function gammp(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 3e-12) break; }
    return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}

export const tTwoSidedP = (t, df) => (Number.isFinite(t) && df > 0 ? ibeta(df / (df + t * t), df / 2, 0.5) : NaN);
export const fP = (F, d1, d2) => (F > 0 && d1 > 0 && d2 > 0 ? ibeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2) : NaN);
export const chi2P = (x, k) => (k > 0 && x >= 0 ? 1 - gammp(k / 2, x / 2) : NaN);

// ---------- descriptive ----------
const vals = (rows, k) => rows.map((r) => (typeof k === 'function' ? k(r) : r[k]));
export function moments(arr) {
  const n = arr.length;
  if (!n) return { n: 0, mean: NaN, sd: NaN, var: NaN };
  const m = arr.reduce((s, v) => s + v, 0) / n;
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1);
  return { n, mean: m, var: v, sd: Math.sqrt(v) };
}

export function quantile(sorted, p) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** Five-number summary (whiskers at P5/P95) for a box plot */
export function boxStats(rows, k) {
  const s = vals(rows, k).filter(Number.isFinite).sort((a, b) => a - b);
  const m = moments(s);
  return { n: s.length, p5: quantile(s, 0.05), q1: quantile(s, 0.25), med: quantile(s, 0.5), q3: quantile(s, 0.75), p95: quantile(s, 0.95), mean: m.mean, sd: m.sd };
}

// ---------- tests ----------
/** Welch two-sample t-test with Cohen's d and 95% CI of the difference (b − a). */
export function welch(a, b, k) {
  const A = moments(vals(a, k)), B = moments(vals(b, k));
  if (A.n < 2 || B.n < 2) return { ...nullTest, ma: A.mean, mb: B.mean };
  const va = A.var / A.n, vb = B.var / B.n;
  const se = Math.sqrt(va + vb);
  const diff = B.mean - A.mean;
  const t = se ? diff / se : 0;
  const df = (va + vb) ** 2 / ((va * va) / (A.n - 1) + (vb * vb) / (B.n - 1));
  const pooled = Math.sqrt(((A.n - 1) * A.var + (B.n - 1) * B.var) / (A.n + B.n - 2));
  return {
    ma: A.mean, mb: B.mean, na: A.n, nb: B.n, diff, t, df,
    p: tTwoSidedP(t, df),
    d: pooled ? diff / pooled : 0,
    ci: [diff - 1.96 * se, diff + 1.96 * se],
  };
}
const nullTest = { diff: NaN, t: NaN, df: NaN, p: NaN, d: NaN, ci: [NaN, NaN] };

/** Two-proportion z-test (b − a) on a binary field. */
export function propTest(a, b, k = 'churned') {
  const na = a.length, nb = b.length;
  if (!na || !nb) return { pa: NaN, pb: NaN, diff: NaN, z: NaN, p: NaN, ci: [NaN, NaN] };
  const ka = a.reduce((s, r) => s + r[k], 0), kb = b.reduce((s, r) => s + r[k], 0);
  const pa = ka / na, pb = kb / nb, pp = (ka + kb) / (na + nb);
  const se0 = Math.sqrt(pp * (1 - pp) * (1 / na + 1 / nb));
  const se = Math.sqrt((pa * (1 - pa)) / na + (pb * (1 - pb)) / nb);
  const z = se0 ? (pb - pa) / se0 : 0;
  return { pa, pb, diff: pb - pa, z, p: 2 * (1 - normCdf(Math.abs(z))), ci: [pb - pa - 1.96 * se, pb - pa + 1.96 * se] };
}

/** Pearson chi-square test of independence between a categorical key and a binary outcome. */
export function chiSquare(rows, catFn, order, outcome = 'churned') {
  const cats = order || [...new Set(rows.map(catFn))].sort();
  const counts = cats.map(() => [0, 0]);
  for (const r of rows) {
    const i = cats.indexOf(catFn(r));
    if (i >= 0) counts[i][r[outcome] ? 1 : 0]++;
  }
  const kept = cats.map((c, i) => ({ c, o: counts[i] })).filter((x) => x.o[0] + x.o[1] > 0);
  const N = kept.reduce((s, x) => s + x.o[0] + x.o[1], 0);
  const col = [0, 1].map((j) => kept.reduce((s, x) => s + x.o[j], 0));
  let chi2 = 0, minExp = Infinity;
  for (const x of kept) {
    const rt = x.o[0] + x.o[1];
    for (const j of [0, 1]) {
      const e = (rt * col[j]) / N;
      minExp = Math.min(minExp, e);
      if (e > 0) chi2 += (x.o[j] - e) ** 2 / e;
    }
  }
  const df = Math.max(1, kept.length - 1);
  return {
    chi2, df, p: kept.length > 1 && col[0] && col[1] ? chi2P(chi2, df) : NaN,
    cramerV: N ? Math.sqrt(chi2 / N) : NaN, minExp,
    table: kept.map((x) => ({ cat: x.c, n: x.o[0] + x.o[1], churned: x.o[1], rate: x.o[1] / (x.o[0] + x.o[1]) })),
  };
}

/** One-way ANOVA of a numeric value across groups ([{key, rows}]). */
export function anova(groups, k) {
  const gs = groups.map((g) => ({ key: g.key, ...moments(vals(g.rows, k)) })).filter((g) => g.n > 1);
  const N = gs.reduce((s, g) => s + g.n, 0);
  if (gs.length < 2 || N <= gs.length) return { F: NaN, p: NaN, eta2: NaN, df1: NaN, df2: NaN, groups: gs };
  const grand = gs.reduce((s, g) => s + g.mean * g.n, 0) / N;
  const ssb = gs.reduce((s, g) => s + g.n * (g.mean - grand) ** 2, 0);
  const ssw = gs.reduce((s, g) => s + g.var * (g.n - 1), 0);
  const df1 = gs.length - 1, df2 = N - gs.length;
  const F = ssw ? ssb / df1 / (ssw / df2) : NaN;
  return { F, p: fP(F, df1, df2), eta2: ssb / (ssb + ssw), df1, df2, groups: gs };
}

export function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

// ---------- formatting helpers for tests ----------
export const fmtP = (p) => (!Number.isFinite(p) ? '–' : p < 0.001 ? '< 0.001' : p.toFixed(3));
export const sigLabel = (p) => (!Number.isFinite(p) ? '–' : p < 0.01 ? 'Significant (p<.01)' : p < 0.05 ? 'Significant (p<.05)' : p < 0.1 ? 'Marginal (p<.10)' : 'Not significant');
export const sigClass = (p) => (!Number.isFinite(p) ? 'muted' : p < 0.05 ? 'sig' : p < 0.1 ? 'marg' : 'muted');
export const effectLabel = (d) => {
  const a = Math.abs(d);
  return !Number.isFinite(a) ? '–' : a < 0.1 ? 'Negligible' : a < 0.3 ? 'Small' : a < 0.5 ? 'Medium' : 'Large';
};
