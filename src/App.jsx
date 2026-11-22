import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  EMBEDDED_CSV, loadDataset, applyFilters, DEFAULT_FILTERS, AGE_BRACKETS, INCOME_Q,
  mean, sum, churnRate, describeIssues, fmtInt, fmtPct, fmtNum, fmtINR, fmtINRShort,
} from './lib/data.js';
import { DEFAULT_ASSUMPTIONS } from './lib/analyses.js';
import ChurnTab from './tabs/ChurnTab.jsx';
import PrimeTab from './tabs/PrimeTab.jsx';
import LtvTab from './tabs/LtvTab.jsx';
import CashbackTab from './tabs/CashbackTab.jsx';
import OfferTab from './tabs/OfferTab.jsx';
import SummaryTab from './tabs/SummaryTab.jsx';
import BlueprintTab from './tabs/BlueprintTab.jsx';

// Each screen is its own hash route (#/churn), so the sidebar links to screens, not to anchors.
const SCREENS = [
  { id: 'summary', label: 'Summary', title: 'Summary' },
  { id: 'churn', label: 'Churn and risk', title: 'Churn and risk' },
  { id: 'prime', label: 'Prime and UPI', title: 'Prime and UPI' },
  { id: 'ltv', label: 'LTV proxy and segments', title: 'LTV proxy and segments' },
  { id: 'cashback', label: 'Cashback', title: 'Cashback' },
  { id: 'offers', label: 'Offer strategy', title: 'Offer strategy' },
  { id: 'blueprint', label: 'Method and blueprint', title: 'Method and blueprint' },
];
const screenFromHash = () => {
  const id = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '');
  return SCREENS.some((s) => s.id === id) ? id : 'summary';
};

const FILTERS = [
  { key: 'tier', label: 'City tier', options: ['All', 'Tier 1', 'Tier 2', 'Tier 3'] },
  { key: 'prime', label: 'Prime', options: ['All', 'Prime', 'Non-Prime'] },
  { key: 'gender', label: 'Gender', options: ['All', 'Male', 'Female', 'Other'] },
  { key: 'age', label: 'Age', options: ['All', ...AGE_BRACKETS] },
  { key: 'inc', label: 'Income', options: ['All', ...INCOME_Q] },
  { key: 'churn', label: 'Status', options: ['All', 'Active', 'Churned'] },
];

function useTheme() {
  const [theme, setTheme] = useState(() => {
    const forced = new URLSearchParams(location.search).get('theme'); // ?theme=light|dark for screenshots
    if (['light', 'dark', 'system'].includes(forced)) return forced;
    try { return localStorage.getItem('apay-theme') || 'system'; } catch { return 'system'; }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
    try { localStorage.setItem('apay-theme', theme); } catch { /* ignore */ }
  }, [theme]);
  return [theme, setTheme];
}

/** The product's mark: a rupee glyph on the ledger's ink square, drawn for this product. */
function Mark() {
  return (
    <svg className="mark" viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="6" fill="var(--text)" />
      <path d="M9 8h10M9 12h10M9 8c5 0 7 1.5 7 4s-2 4-7 4l8 6" fill="none" stroke="var(--surface)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One divided strip of headline figures; deltas appear only when a filter is on, in grey unless churn worsens. */
function KpiStrip({ rows, base }) {
  const k = (a) => ({
    n: a.length, churn: churnRate(a), prime: mean(a, 'prime'), txns: mean(a, 'txns'),
    atv: mean(a, 'atv'), gmv: sum(a, 'gmv'), nps: mean(a, 'nps'), cb: mean(a, 'cashback'),
  });
  const cur = k(rows), all = k(base);
  const filtered = rows.length !== base.length;
  const delta = (a, b, kind) => {
    if (!filtered || !Number.isFinite(a) || !Number.isFinite(b)) return null;
    const d = a - b;
    if (kind === 'pp') return `${d >= 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(1)} pp vs all customers`;
    if (kind === 'abs') return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} vs all customers`;
    if (kind === 'share') return `${fmtPct(a / b)} of all customers`;
    return `${d >= 0 ? '+' : '−'}${Math.abs((d / b) * 100).toFixed(1)}% vs all customers`;
  };
  const items = [
    { label: 'Customers', value: fmtInt(cur.n), d: delta(cur.n, all.n, 'share') },
    { label: 'Churn rate', value: fmtPct(cur.churn), d: delta(cur.churn, all.churn, 'pp'), bad: filtered && cur.churn - all.churn > 0.0005 },
    { label: 'Prime members', value: fmtPct(cur.prime), d: delta(cur.prime, all.prime, 'pp') },
    { label: 'Transactions a month', value: fmtNum(cur.txns), d: delta(cur.txns, all.txns) },
    { label: 'Average ticket', value: fmtINR(cur.atv), d: delta(cur.atv, all.atv) },
    { label: 'Implied monthly GMV', value: fmtINRShort(cur.gmv), d: filtered ? delta(cur.gmv, all.gmv, 'share') : `${fmtINR(cur.gmv / cur.n)} per customer` },
    { label: 'Mean NPS', value: fmtNum(cur.nps), d: delta(cur.nps, all.nps, 'abs') },
    { label: 'Cashback utilisation', value: `${fmtNum(cur.cb)}%`, d: delta(cur.cb, all.cb, 'abs') },
  ];
  return (
    <section className="kpi-strip" aria-label="Headline figures for the current filter">
      {items.map((it) => (
        <div className="kpi" key={it.label}>
          <span className="kpi-label">{it.label}</span>
          <b className="kpi-value num">{it.value}</b>
          <small className={`kpi-delta${it.bad ? ' bad' : ''}${it.d ? '' : ' none'}`}>{it.d || ' '}</small>
        </div>
      ))}
    </section>
  );
}

export default function App() {
  const [theme, setTheme] = useTheme();
  const [source, setSource] = useState({ name: 'Embedded dataset', text: EMBEDDED_CSV });
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [assume, setAssume] = useState(DEFAULT_ASSUMPTIONS);
  const [tab, setTabState] = useState(screenFromHash);
  const [navOpen, setNavOpen] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const onHash = () => { setTabState(screenFromHash()); setNavOpen(false); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const setTab = (id) => { if (location.hash !== `#/${id}`) location.hash = `/${id}`; };

  const dataset = useMemo(() => {
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

  const current = SCREENS.find((t) => t.id === tab) || SCREENS[0];
  const props = { rows, base: dataset.rows, filters, assume, setAssume, dropped: dataset.dropped, issues: dataset.issues, isFiltered: rows.length !== dataset.rows.length };
  const scope = rows.length === dataset.rows.length
    ? `All ${fmtInt(dataset.rows.length)} customers`
    : `${fmtInt(rows.length)} of ${fmtInt(dataset.rows.length)} customers, ${activeFilters} filter${activeFilters > 1 ? 's' : ''} on`;

  return (
    <div className={`shell${navOpen ? ' nav-open' : ''}`}>
      <header className="phone-bar">
        <Mark />
        <span className="phone-title">{current.title}</span>
        <button className="btn ghost" aria-expanded={navOpen} aria-controls="side" onClick={() => setNavOpen((o) => !o)}>
          {navOpen ? 'Close' : activeFilters ? `Menu · ${activeFilters} filter${activeFilters > 1 ? 's' : ''}` : 'Menu'}
        </button>
      </header>

      <aside className="side" id="side">
        <div className="side-brand">
          <Mark />
          <div>
            <b>Amazon Pay India</b>
            <span>Customer analytics case</span>
          </div>
        </div>

        <div className="side-scope" title={dataset.dropped ? `${source.name}: dropped ${describeIssues(dataset.issues)}` : source.name}>
          <span className="side-label">Dataset</span>
          <b className="num">{source.name} · {fmtInt(dataset.rows.length)} rows</b>
          {dataset.dropped > 0 && <small>{dataset.dropped} invalid rows dropped</small>}
          <div className="side-actions">
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
            <button className="btn ghost" onClick={() => fileRef.current?.click()}>Upload CSV</button>
            {source.text !== EMBEDDED_CSV && (
              <button className="btn text" onClick={() => { setSource({ name: 'Embedded dataset', text: EMBEDDED_CSV }); setError(null); }}>Reset</button>
            )}
          </div>
        </div>

        <nav className="side-nav" aria-label="Screens">
          {SCREENS.map((t) => (
            <a key={t.id} href={`#/${t.id}`} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined}>{t.label}</a>
          ))}
        </nav>

        <div className="side-filters" role="group" aria-label="Filters">
          <div className="side-filter-head">
            <span className="side-label">Filters</span>
            {activeFilters > 0 && <button className="btn text" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear {activeFilters}</button>}
          </div>
          {FILTERS.map((f) => (
            <label key={f.key} className="side-filter">
              <span>{f.label}</span>
              <select value={filters[f.key]} onChange={(e) => set(f.key)(e.target.value)} className={filters[f.key] !== 'All' ? 'set' : ''}>
                {f.options.map((o) => <option key={o} value={o}>{o === 'All' ? `All` : o}</option>)}
              </select>
            </label>
          ))}
        </div>

        <div className="side-foot">
          <span className="side-label">Theme</span>
          <div className="seg" role="radiogroup" aria-label="Theme">
            {[['light', 'Light'], ['system', 'Auto'], ['dark', 'Dark']].map(([v, l]) => (
              <button key={v} role="radio" aria-checked={theme === v} className={theme === v ? 'on' : ''} onClick={() => setTheme(v)}>{l}</button>
            ))}
          </div>
        </div>
      </aside>

      <div className="canvas">
        <div className="title-row">
          <div>
            <h1>{current.title}</h1>
            <p>{scope}. Every figure below recomputes from these rows.</p>
          </div>
        </div>

        {error && <div className="error-bar" role="alert">{error}<button className="btn text" onClick={() => setError(null)}>Dismiss</button></div>}

        <KpiStrip rows={rows} base={dataset.rows} />

        <main>
          {rows.length < 30 ? (
            <div className="empty">Only {rows.length} customers match these filters, too few for reliable analysis. Loosen a filter to continue.</div>
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
          Sample tags mark figures computed live from the CSV and the filters; macro tags mark external market context (approximate, as of 2025); scenario tags mark outputs that follow from stated assumptions.
          Implied monthly GMV = monthly transactions × average ticket. Throughput proxy = GMV × tenure: cumulative transaction value, not profit or true lifetime value. Cashback utilisation % is not rupee spend.
          Scenario maths converts the churn flag to annual attrition under an assumed observation window, which the CSV does not state.
        </footer>
      </div>
    </div>
  );
}
