// Data layer: CSV parsing, schema normalisation, derived fields, filters, stats.
import embeddedCsv from '../data/amazon_pay_india.csv?raw';

export const EMBEDDED_CSV = embeddedCsv;

// Canonical field keys -> accepted header spellings (normalised: lowercase, alnum only)
const SCHEMA = {
  id: ['customerid', 'id'],
  age: ['age'],
  gender: ['gender'],
  tier: ['citytier', 'tier'],
  income: ['monthlyincomeinr', 'monthlyincome', 'income'],
  tenure: ['tenuremonths', 'tenure'],
  prime: ['amazonprimemember', 'primemember', 'prime'],
  txns: ['avgmonthlytransactions', 'monthlytransactions', 'transactions'],
  atv: ['avgtransactionvalueinr', 'avgtransactionvalue', 'atv'],
  cashback: ['cashbackusedpct', 'cashbackused', 'cashback'],
  engagement: ['appengagementscore', 'engagementscore', 'engagement'],
  support: ['customersupportcontacts', 'supportcontacts', 'support'],
  nps: ['netpromoterscore', 'nps'],
  churned: ['churned', 'churn'],
};
const NUMERIC = ['id', 'age', 'income', 'tenure', 'prime', 'txns', 'atv', 'cashback', 'engagement', 'support', 'nps', 'churned'];
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// RFC-4180-ish parser: quoted fields, escaped quotes, CRLF, BOM.
export function parseCsvText(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

export const AGE_BRACKETS = ['18–25', '26–35', '36–50', '51–64'];
export const ageBracket = (a) => (a <= 25 ? '18–25' : a <= 35 ? '26–35' : a <= 50 ? '36–50' : '51–64');
export const CB_TIERS = ['0–25%', '26–50%', '51–75%', '76–100%'];
export const cbTier = (p) => (p <= 25 ? '0–25%' : p <= 50 ? '26–50%' : p <= 75 ? '51–75%' : '76–100%');
export const NPS_BUCKETS = ['−100 to −51', '−50 to −1', '0 to 49', '50 to 100'];
export const npsBucket = (n) => (n <= -51 ? NPS_BUCKETS[0] : n < 0 ? NPS_BUCKETS[1] : n < 50 ? NPS_BUCKETS[2] : NPS_BUCKETS[3]);
export const ENG_BUCKETS = ['Low (1–3)', 'Mid (4–7)', 'High (8–10)'];
export const engBucket = (e) => (e <= 3 ? ENG_BUCKETS[0] : e <= 7 ? ENG_BUCKETS[1] : ENG_BUCKETS[2]);
export const TENURE_BANDS = ['0–12', '13–24', '25–36', '37–48', '49–60', '61+'];
export const tenureBand = (t) => TENURE_BANDS[Math.min(5, Math.floor((t - 1) / 12))];
export const INCOME_Q = ['Q1 (lowest)', 'Q2', 'Q3', 'Q4 (highest)'];
export const TIERS = ['Tier 1', 'Tier 2', 'Tier 3'];
export const GENDERS = ['Male', 'Female', 'Other'];

/** Parse + validate + enrich. Returns { rows, issues, columns } */
export function loadDataset(text) {
  const table = parseCsvText(text);
  if (table.length < 2) throw new Error('CSV has no data rows.');
  const header = table[0].map(norm);
  const idx = {};
  const missing = [];
  for (const [key, alts] of Object.entries(SCHEMA)) {
    const i = header.findIndex((h) => alts.includes(h));
    if (i === -1) missing.push(key); else idx[key] = i;
  }
  if (missing.length) throw new Error(`Missing required column(s): ${missing.join(', ')}`);

  let dropped = 0;
  const rows = [];
  for (let r = 1; r < table.length; r++) {
    const line = table[r];
    const o = {};
    let bad = false;
    for (const [key, i] of Object.entries(idx)) {
      const raw = (line[i] ?? '').trim();
      if (NUMERIC.includes(key)) {
        const v = Number(raw);
        if (raw === '' || !Number.isFinite(v)) { bad = true; break; }
        o[key] = v;
      } else o[key] = raw;
    }
    if (bad) { dropped++; continue; }
    // normalise categorical spellings
    const t = o.tier.replace(/\s+/g, '').toLowerCase();
    o.tier = t.endsWith('1') ? 'Tier 1' : t.endsWith('2') ? 'Tier 2' : t.endsWith('3') ? 'Tier 3' : o.tier;
    const g = o.gender.toLowerCase();
    o.gender = g.startsWith('m') ? 'Male' : g.startsWith('f') ? 'Female' : 'Other';
    o.prime = o.prime ? 1 : 0;
    o.churned = o.churned ? 1 : 0;
    rows.push(o);
  }
  if (!rows.length) throw new Error('No valid rows after parsing.');

  // Income quartile cut-points on the full loaded base
  const inc = rows.map((r) => r.income).sort((a, b) => a - b);
  const q = (p) => inc[Math.floor(p * (inc.length - 1))];
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];

  for (const o of rows) {
    o.gmv = o.txns * o.atv; // implied monthly spend through Amazon Pay
    o.cumSpend = o.gmv * o.tenure; // cumulative spend proxy
    o.ltv = o.cumSpend; // transparent LTV proxy = txns x ATV x tenure
    o.spendToIncome = o.income ? o.gmv / o.income : NaN;
    o.ageB = ageBracket(o.age);
    o.cbT = cbTier(o.cashback);
    o.npsB = npsBucket(o.nps);
    o.engB = engBucket(o.engagement);
    o.tenB = tenureBand(o.tenure);
    o.incQ = o.income <= q1 ? INCOME_Q[0] : o.income <= q2 ? INCOME_Q[1] : o.income <= q3 ? INCOME_Q[2] : INCOME_Q[3];
    o.primeLabel = o.prime ? 'Prime' : 'Non-Prime';
  }
  return { rows, dropped, incomeCuts: [q1, q2, q3] };
}

export const DEFAULT_FILTERS = { tier: 'All', prime: 'All', gender: 'All', age: 'All', inc: 'All', churn: 'All' };

export function applyFilters(rows, f) {
  return rows.filter((r) =>
    (f.tier === 'All' || r.tier === f.tier) &&
    (f.prime === 'All' || (f.prime === 'Prime' ? r.prime === 1 : r.prime === 0)) &&
    (f.gender === 'All' || r.gender === f.gender) &&
    (f.age === 'All' || r.ageB === f.age) &&
    (!f.inc || f.inc === 'All' || r.incQ === f.inc) &&
    (f.churn === 'All' || (f.churn === 'Churned' ? r.churned === 1 : r.churned === 0)));
}

// ---------- stats ----------
export const mean = (a, k) => (a.length ? a.reduce((s, r) => s + (k ? r[k] : r), 0) / a.length : NaN);
export const sum = (a, k) => a.reduce((s, r) => s + r[k], 0);
export const churnRate = (a) => (a.length ? sum(a, 'churned') / a.length : NaN);
export const sd = (a, k) => {
  const m = mean(a, k);
  return Math.sqrt(a.reduce((s, r) => s + (r[k] - m) ** 2, 0) / Math.max(1, a.length - 1));
};

/** Wilson 95% interval for a proportion */
export function wilson(k, n, z = 1.96) {
  if (!n) return [NaN, NaN];
  const p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/** z-score of a subgroup churn rate vs the rest of the base */
export function zVsRest(sub, all) {
  const k1 = sum(sub, 'churned'), n1 = sub.length;
  const k2 = sum(all, 'churned') - k1, n2 = all.length - n1;
  if (!n1 || !n2) return 0;
  const p = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se ? (k1 / n1 - k2 / n2) / se : 0;
}

export function pearson(a, kx, ky) {
  const n = a.length;
  if (n < 3) return 0;
  const mx = mean(a, kx), my = mean(a, ky);
  let sxy = 0, sx = 0, sy = 0;
  for (const r of a) {
    const dx = r[kx] - mx, dy = r[ky] - my;
    sxy += dx * dy; sx += dx * dx; sy += dy * dy;
  }
  return sx && sy ? sxy / Math.sqrt(sx * sy) : 0;
}

/** Group rows by key fn; returns ordered array of {key, rows} */
export function groupBy(a, fn, order) {
  const m = new Map();
  for (const r of a) {
    const k = fn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  const keys = order ? order.filter((k) => m.has(k)) : [...m.keys()].sort();
  return keys.map((k) => ({ key: k, rows: m.get(k) }));
}

/** Churn-rate profile across quantile bins of a numeric feature + mutual information (bits). */
export function binProfile(a, k, bins = 5) {
  const vals = a.map((r) => r[k]).sort((x, y) => x - y);
  const distinct = new Set(vals).size;
  let assign;
  if (distinct <= 10) assign = (v) => v; // already discrete
  else {
    const cuts = Array.from({ length: bins - 1 }, (_, i) => vals[Math.floor(((i + 1) / bins) * (vals.length - 1))]);
    assign = (v) => cuts.findIndex((c) => v <= c) === -1 ? bins - 1 : cuts.findIndex((c) => v <= c);
  }
  const g = groupBy(a, (r) => assign(r[k]));
  const rates = g.filter((x) => x.rows.length >= 30).map((x) => churnRate(x.rows));
  const spread = rates.length ? Math.max(...rates) - Math.min(...rates) : 0;
  // mutual information I(bin; churn)
  const N = a.length, pc = churnRate(a);
  let mi = 0;
  for (const x of g) {
    const pb = x.rows.length / N, p1 = churnRate(x.rows);
    for (const [pj, py] of [[p1, pc], [1 - p1, 1 - pc]]) {
      const joint = pb * pj;
      if (joint > 0 && py > 0) mi += joint * Math.log2(joint / (pb * py));
    }
  }
  return { spread, mi };
}

// ---------- formatting ----------
export const fmtInt = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-IN') : '–');
export const fmtPct = (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '–');
export const fmtNum = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }) : '–');
export const fmtINR = (v, d = 0) => (Number.isFinite(v) ? `₹${v.toLocaleString('en-IN', { maximumFractionDigits: d })}` : '–');
export function fmtINRShort(v) {
  if (!Number.isFinite(v)) return '–';
  const a = Math.abs(v), sgn = v < 0 ? '−' : '';
  if (a >= 1e7) return `${sgn}₹${(a / 1e7).toFixed(a >= 1e9 ? 0 : 2)} Cr`;
  if (a >= 1e5) return `${sgn}₹${(a / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${sgn}₹${(a / 1e3).toFixed(1)}K`;
  return `${sgn}₹${a.toFixed(0)}`;
}
export const pp = (v, d = 1) => (Number.isFinite(v) ? `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)} pp` : '–');
