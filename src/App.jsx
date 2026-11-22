import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  EMBEDDED_CSV, loadDataset, applyFilters, DEFAULT_FILTERS, AGE_BRACKETS, INCOME_Q,
  mean, sum, churnRate, fmtInt, fmtPct, fmtNum, fmtINR, fmtINRShort,
} from './lib/data.js';
import { Segmented } from './components/ui.jsx';
import ChurnTab from './tabs/ChurnTab.jsx';
import PrimeTab from './tabs/PrimeTab.jsx';
import LtvTab from './tabs/LtvTab.jsx';
import CashbackTab from './tabs/CashbackTab.jsx';
import OfferTab from './tabs/OfferTab.jsx';
import SummaryTab from './tabs/SummaryTab.jsx';
import BlueprintTab from './tabs/BlueprintTab.jsx';

const TABS = [
  { id: 'summary', label: 'Red Pill Summary', q: 'Executive synthesis: the comfortable averages vs the segmented truth' },
  { id: 'churn', label: 'Churn & Risk', q: 'Q1 · What factors most strongly influence churn?' },
  { id: 'prime', label: 'Prime & UPI', q: 'Q2 · How does Prime affect transaction frequency and loyalty?' },
  { id: 'ltv', label: 'LTV & Segments', q: 'Q3 · Which customer segments deliver the highest lifetime value?' },
  { id: 'cashback', label: 'Cashback Lab', q: 'Q4 · Is cashback driving real engagement or only deal-seeking?' },
  { id: 'offers', label: 'Offer Strategy Lab', q: 'Q5 · How can Amazon Pay personalise offers to improve retention?' },
  { id: 'blueprint', label: 'Blueprint', q: 'Question → columns → methods → behavioural lens' },
];

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('apay-theme') || 'system'; } catch { return 'system'; }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
    try { localStorage.setItem('apay-theme', theme); } catch { /* ignore */ }
  }, [theme]);
  return [theme, setTheme];
}

function KpiStrip({ rows, base }) {
  const k = (a) => ({
    n: a.length,
    churn: churnRate(a),
    prime: mean(a, 'prime'),
    txns: mean(a, 'txns'),
    atv: mean(a, 'atv'),
    gmv: sum(a, 'gmv'),
    nps: mean(a, 'nps'),
    cb: mean(a, 'cashback'),
  });
  const cur = k(rows);
  const all = k(base);
  const filtered = rows.length !== base.length;
  const delta = (a, b, kind) => {
    if (!filtered || !Number.isFinite(a) || !Number.isFinite(b)) return null;
    const d = a - b;
    if (kind === 'pp') return `${d >= 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(1)} pp vs all`;
    if (kind === 'abs') return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} vs all`;
    if (kind === 'share') return `${fmtPct(a / b)} of total`;
    return `${d >= 0 ? '+' : '−'}${Math.abs((d / b) * 100).toFixed(1)}% vs all`;
  };
  const items = [
    { label: 'Total Customers', value: fmtInt(cur.n), d: delta(cur.n, all.n, 'share') },
    { label: 'Churn Rate', value: fmtPct(cur.churn), d: delta(cur.churn, all.churn, 'pp'), bad: filtered && cur.churn > all.churn },
    { label: 'Prime Penetration', value: fmtPct(cur.prime), d: delta(cur.prime, all.prime, 'pp') },
    { label: 'Avg Monthly Txns', value: fmtNum(cur.txns), d: delta(cur.txns, all.txns) },
    { label: 'Avg Txn Value', value: fmtINR(cur.atv), d: delta(cur.atv, all.atv) },
    { label: 'Implied Monthly GMV', value: fmtINRShort(cur.gmv), d: filtered ? delta(cur.gmv, all.gmv, 'share') : `${fmtINR(cur.gmv / cur.n)} per customer` },
    { label: 'Mean NPS', value: fmtNum(cur.nps), d: delta(cur.nps, all.nps, 'abs') },
    { label: 'Avg Cashback Used', value: `${fmtNum(cur.cb)}%`, d: delta(cur.cb, all.cb, 'abs') },
  ];
  return (
    <div className="kpis">
      {items.map((it) => (
        <div className="kpi" key={it.label}>
          <span className="kpi-label">{it.label}</span>
          <b className="kpi-value">{it.value}</b>
          <small className={it.bad ? 'kpi-delta bad' : 'kpi-delta'}>{it.d || ' '}</small>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useTheme();
  const [source, setSource] = useState({ name: 'Embedded dataset (5,000 customers)', text: EMBEDDED_CSV });
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [tab, setTab] = useState(() => {
    try { const t = localStorage.getItem('apay-tab'); return TABS.some((x) => x.id === t) ? t : 'summary'; } catch { return 'summary'; }
  });
  const fileRef = useRef(null);

  useEffect(() => { try { localStorage.setItem('apay-tab', tab); } catch { /* ignore */ } }, [tab]);

  const dataset = useMemo(() => {
    // Uploads are validated before they reach here; this guards the embedded fallback path.
    try { return loadDataset(source.text); } catch { return loadDataset(EMBEDDED_CSV); }
  }, [source]);

  const rows = useMemo(() => applyFilters(dataset.rows, filters), [dataset, filters]);
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));
  const activeFilters = Object.entries(filters).filter(([, v]) => v !== 'All').length;

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setError(null);
      try {
        loadDataset(String(reader.result));
        setSource({ name: file.name, text: String(reader.result) });
      } catch (err) {
        setError(`${file.name}: ${err.message} Showing the embedded dataset instead.`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const current = TABS.find((t) => t.id === tab) || TABS[0];
  const props = { rows, base: dataset.rows, filters };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo" aria-hidden>₹</div>
          <div>
            <h1>Amazon Pay India · Red Pill Analytics</h1>
            <p>5,000-customer case study · churn, Prime, LTV, cashback & offer strategy</p>
          </div>
        </div>
        <div className="top-actions">
          <span className="source" title={source.name}>
            <i className="dot" /> {source.name} · {fmtInt(dataset.rows.length)} rows{dataset.dropped ? ` · ${dataset.dropped} dropped` : ''}
          </span>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
          <button className="btn" onClick={() => fileRef.current?.click()}>Upload CSV</button>
          {source.text !== EMBEDDED_CSV && (
            <button className="btn ghost" onClick={() => { setSource({ name: 'Embedded dataset (5,000 customers)', text: EMBEDDED_CSV }); setError(null); }}>
              Reset data
            </button>
          )}
          <Segmented value={theme} onChange={setTheme} options={[{ value: 'light', label: '☀' }, { value: 'system', label: 'Auto' }, { value: 'dark', label: '☾' }]} />
        </div>
      </header>

      {error && <div className="error-bar" role="alert">{error}<button onClick={() => setError(null)} aria-label="Dismiss">×</button></div>}

      <div className="filterbar">
        <Segmented label="City tier" value={filters.tier} onChange={set('tier')} options={['All', 'Tier 1', 'Tier 2', 'Tier 3']} />
        <Segmented label="Prime" value={filters.prime} onChange={set('prime')} options={['All', 'Prime', 'Non-Prime']} />
        <Segmented label="Gender" value={filters.gender} onChange={set('gender')} options={['All', 'Male', 'Female', 'Other']} />
        <Segmented label="Age" value={filters.age} onChange={set('age')} options={['All', ...AGE_BRACKETS]} />
        <Segmented label="Income" value={filters.inc} onChange={set('inc')} options={['All', ...INCOME_Q.map((q) => ({ value: q, label: q.split(' ')[0] }))]} />
        <Segmented label="Status" value={filters.churn} onChange={set('churn')} options={['All', 'Active', 'Churned']} />
        {activeFilters > 0 && (
          <button className="btn ghost small" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear {activeFilters} filter{activeFilters > 1 ? 's' : ''}</button>
        )}
      </div>

      <KpiStrip rows={rows} base={dataset.rows} />

      <nav className="tabs" role="tablist">
        {TABS.map((t, i) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span className="tab-n">{i + 1}</span>{t.label}
          </button>
        ))}
      </nav>
      <p className="tab-q">{current.q}</p>

      <main>
        {rows.length < 30 ? (
          <div className="empty">Only {rows.length} customers match these filters — too few for reliable analysis. Loosen a filter to continue.</div>
        ) : (
          <>
            {tab === 'summary' && <SummaryTab {...props} goTo={setTab} />}
            {tab === 'churn' && <ChurnTab {...props} />}
            {tab === 'prime' && <PrimeTab {...props} />}
            {tab === 'ltv' && <LtvTab {...props} />}
            {tab === 'cashback' && <CashbackTab {...props} />}
            {tab === 'offers' && <OfferTab {...props} />}
            {tab === 'blueprint' && <BlueprintTab {...props} />}
          </>
        )}
      </main>
      <footer>
        Blue tags = 5,000-User Sample Analytics (computed live from the CSV and filters). Green tags = Macro / Industry Context (external, approximate, as of 2025). Implied monthly GMV = avg monthly transactions × avg transaction value; LTV proxy = GMV × tenure. Churn flag treated as annual attrition in forward-value maths.
        Simulator and calculator outputs are scenario estimates built on stated assumptions, not forecasts.
      </footer>
    </div>
  );
}
