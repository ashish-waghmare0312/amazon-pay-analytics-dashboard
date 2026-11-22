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

/** Two-sided critical t value for the given df (e.g. 0.05 → t such that P(|T| > t) = 0.05), by bisection. */
export function tCrit(df, alpha = 0.05) {
  if (!(df > 0)) return NaN;
  let lo = 0, hi = 1000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tTwoSidedP(mid, df) > alpha) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Exact critical |r| for a two-sided Pearson test at level alpha with n observations (t-test on r, df = n − 2). */
export function pearsonRCrit(n, alpha = 0.05) {
  if (n < 4) return NaN;
  const t = tCrit(n - 2, alpha);
  return t / Math.sqrt(n - 2 + t * t);
}

/** Benjamini–Hochberg adjusted p-values (q-values), returned in the input order. */
export function bhAdjust(ps) {
  const m = ps.length;
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const q = new Array(m);
  let prev = 1;
  for (let k = m - 1; k >= 0; k--) {
    const [p, i] = order[k];
    prev = Math.min(prev, (p * m) / (k + 1));
    q[i] = Math.min(1, prev);
  }
  return q;
}

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
  const tc = tCrit(df); // Welch–Satterthwaite critical value, not the normal 1.96
  const pooled = Math.sqrt(((A.n - 1) * A.var + (B.n - 1) * B.var) / (A.n + B.n - 2));
  return {
    ma: A.mean, mb: B.mean, na: A.n, nb: B.n, diff, t, df,
    p: tTwoSidedP(t, df),
    d: pooled ? diff / pooled : 0,
    ci: [diff - tc * se, diff + tc * se],
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
/**
 * Users per arm to detect p1 → p2 with a two-sided two-proportion z-test (normal approximation).
 * unpooled: (zα + zβ)² (p1q1 + p2q2) / d²   (the simplest form)
 * pooled:   [zα √(2 p̄ q̄) + zβ √(p1q1 + p2q2)]² / d²   (standard; variance under H0 pooled)
 * corrected: Fleiss continuity correction applied to the pooled n.
 * Assumes independent users, equal arms, a fixed absolute effect and one primary metric.
 */
export function twoPropSampleSize(p1, p2, alpha = 0.05, power = 0.8) {
  const za = alpha === 0.05 ? 1.959964 : NaN;
  const zb = power === 0.8 ? 0.841621 : power === 0.9 ? 1.281552 : NaN;
  const d = Math.abs(p1 - p2);
  if (!(d > 0) || !Number.isFinite(za) || !Number.isFinite(zb)) return { unpooled: NaN, pooled: NaN, corrected: NaN };
  const q1 = 1 - p1, q2 = 1 - p2, pb = (p1 + p2) / 2;
  const unpooled = ((za + zb) ** 2 * (p1 * q1 + p2 * q2)) / d ** 2;
  const pooled = (za * Math.sqrt(2 * pb * (1 - pb)) + zb * Math.sqrt(p1 * q1 + p2 * q2)) ** 2 / d ** 2;
  const corrected = (pooled / 4) * (1 + Math.sqrt(1 + 4 / (pooled * d))) ** 2;
  return { unpooled: Math.ceil(unpooled), pooled: Math.ceil(pooled), corrected: Math.ceil(corrected) };
}

export const fmtP = (p) => (!Number.isFinite(p) ? '–' : p < 0.001 ? '< 0.001' : p.toFixed(3));
export const sigLabel = (p) => (!Number.isFinite(p) ? '–' : p < 0.01 ? 'Significant (p<.01)' : p < 0.05 ? 'Significant (p<.05)' : p < 0.1 ? 'Marginal (p<.10)' : 'Not significant');
export const sigClass = (p) => (!Number.isFinite(p) ? 'muted' : p < 0.05 ? 'sig' : p < 0.1 ? 'marg' : 'muted');
export const effectLabel = (d) => {
  const a = Math.abs(d);
  return !Number.isFinite(a) ? '–' : a < 0.1 ? 'Negligible' : a < 0.3 ? 'Small' : a < 0.5 ? 'Medium' : 'Large';
};

// ---------- multivariate logistic regression (IRLS / Newton–Raphson; inferential, not ML) ----------
function solve(A, b) {
  // Gaussian elimination with partial pivoting; returns x for A x = b (A is n×n)
  const n = A.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / (r[i] || 1e-12));
}
function invert(A) {
  const n = A.length;
  return Array.from({ length: n }, (_, j) => solve(A, A.map((_, i) => (i === j ? 1 : 0)))).reduce(
    (acc, col, j) => { col.forEach((v, i) => { acc[i][j] = v; }); return acc; }, A.map(() => new Array(n).fill(0)));
}

/**
 * Fit P(y=1) = logistic(X β) with an intercept. X: array of rows (numbers), y: 0/1 array.
 * Returns coefficients with SE, Wald z/p, odds ratios + 95% CI, and the log-likelihood.
 */
export function logisticFit(X, y, maxIter = 50) {
  const n = X.length, k = X[0].length + 1;
  const Z = X.map((r) => [1, ...r]);
  let beta = new Array(k).fill(0);
  let ll = -Infinity;
  for (let it = 0; it < maxIter; it++) {
    const H = Array.from({ length: k }, () => new Array(k).fill(0));
    const g = new Array(k).fill(0);
    let llNew = 0;
    for (let i = 0; i < n; i++) {
      const eta = Z[i].reduce((s, v, j) => s + v * beta[j], 0);
      const p = 1 / (1 + Math.exp(-eta));
      llNew += y[i] ? Math.log(Math.max(p, 1e-300)) : Math.log(Math.max(1 - p, 1e-300));
      const w = p * (1 - p), r = y[i] - p;
      for (let a = 0; a < k; a++) {
        g[a] += Z[i][a] * r;
        for (let b = a; b < k; b++) H[a][b] += w * Z[i][a] * Z[i][b];
      }
    }
    for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) H[a][b] = H[b][a];
    const step = solve(H, g);
    beta = beta.map((v, j) => v + step[j]);
    if (Math.abs(llNew - ll) < 1e-9) { ll = llNew; break; }
    ll = llNew;
  }
  // final Hessian for standard errors
  const H = Array.from({ length: k }, () => new Array(k).fill(0));
  ll = 0;
  for (let i = 0; i < n; i++) {
    const p = 1 / (1 + Math.exp(-Z[i].reduce((s, v, j) => s + v * beta[j], 0)));
    ll += y[i] ? Math.log(Math.max(p, 1e-300)) : Math.log(Math.max(1 - p, 1e-300));
    const w = p * (1 - p);
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) H[a][b] += w * Z[i][a] * Z[i][b];
  }
  const cov = invert(H);
  const coefs = beta.map((b, j) => {
    const se = Math.sqrt(Math.max(cov[j][j], 0));
    const z = se ? b / se : 0;
    return { beta: b, se, z, p: 2 * (1 - normCdf(Math.abs(z))), or: Math.exp(b), lo: Math.exp(b - 1.96 * se), hi: Math.exp(b + 1.96 * se) };
  });
  return { beta, coefs, ll, n, k };
}
export const logisticPredict = (fit, X) => X.map((r) => 1 / (1 + Math.exp(-(fit.beta[0] + r.reduce((s, v, j) => s + v * fit.beta[j + 1], 0)))));
export function nullLogLik(y) {
  const p = y.reduce((s, v) => s + v, 0) / y.length;
  return y.reduce((s, v) => s + (v ? Math.log(p) : Math.log(1 - p)), 0);
}
/** Likelihood-ratio test of a bigger nested model vs a smaller one. */
export const lrTest = (llBig, llSmall, df) => { const lr = 2 * (llBig - llSmall); return { lr, df, p: chi2P(Math.max(lr, 0), df) }; };

/** Area under the ROC curve (rank-based, ties averaged). */
export function auc(scores, y) {
  const idx = scores.map((s, i) => [s, y[i]]).sort((a, b) => a[0] - b[0]);
  let rank = 0, sumPos = 0, nPos = 0;
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j < idx.length && idx[j][0] === idx[i][0]) j++;
    const avg = (i + 1 + j) / 2;
    for (let t = i; t < j; t++) if (idx[t][1]) { sumPos += avg; nPos++; }
    rank = j; i = j;
  }
  const nNeg = idx.length - nPos;
  return nPos && nNeg ? (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg) : NaN;
}
