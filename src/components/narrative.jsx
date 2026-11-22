import React, { useState } from 'react';
import { conceptDef } from '../lib/lexicon.js';

/** Psychology concept chip — hover/focus shows the definition. */
export function Concept({ name, children }) {
  return (
    <span className="concept" tabIndex={0} title={conceptDef(name)} aria-label={`${name}: ${conceptDef(name)}`}>
      {children || name}
    </span>
  );
}

/** Source badge: separates CSV-derived numbers from external macro context. */
export function SourceTag({ kind = 'sample' }) {
  if (kind === 'macro') return <span className="src-tag macro">Macro context</span>;
  if (kind === 'scenario') return <span className="src-tag scenario">Scenario, assumption-based</span>;
  return <span className="src-tag sample">From the 5,000-customer CSV</span>;
}

/** Banner for simulated figures: outputs follow from stated assumptions, not from the CSV. */
export function ScenarioNote({ children }) {
  return (
    <div className="scenario-note" role="note">
      <SourceTag kind="scenario" />
      <span>{children}</span>
    </div>
  );
}

export function SectionTitle({ title, kind = 'sample', children }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      <SourceTag kind={kind} />
      {children && <p>{children}</p>}
    </div>
  );
}

/** Red-pill vs blue-pill contrast card. */
export function PillContrast({ blue, red, title }) {
  return (
    <div className="pills">
      {title && <h4>{title}</h4>}
      <div className="pill-grid">
        <div className="pill-side blue">
          <span className="pill-tag">Common assumption</span>
          <p>{blue}</p>
        </div>
        <div className="pill-side red">
          <span className="pill-tag">What the data shows</span>
          <p>{red}</p>
        </div>
      </div>
    </div>
  );
}

/** Macro / industry context panel (clearly labelled as external, non-CSV). */
export function MacroPanel({ title, items, note }) {
  return (
    <section className="card macro">
      <header className="card-head">
        <div><h3>{title}</h3></div>
        <SourceTag kind="macro" />
      </header>
      <ul className="macro-list">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
      <p className="macro-note">
        {note || 'External context from public sources (NPCI, Amazon India, RBI), approximate and as of 2025. Not derived from the CSV; refresh figures before presenting.'}
      </p>
    </section>
  );
}

/** Significance badge */
export function Sig({ p }) {
  if (!Number.isFinite(p)) return <span className="sig-b ns">–</span>;
  const cls = p < 0.05 ? 'sig' : p < 0.1 ? 'marg' : 'ns';
  const txt = p < 0.001 ? 'p<.001' : `p=${p.toFixed(3)}`;
  return <span className={`sig-b ${cls}`}>{txt}</span>;
}

/**
 * Horizontal box plot (P5–Q1–median–Q3–P95, mean dot) — custom SVG; one row per group.
 * groups: [{label, color, stats:{p5,q1,med,q3,p95,mean,n}}]
 */
export function BoxPlot({ groups, fmt = (v) => v, axisLabelText }) {
  const [hover, setHover] = useState(null);
  const W = 560, padL = 96, padR = 18, rowH = 34, top = 6;
  const H = top + groups.length * rowH + 32;
  const lo = Math.min(...groups.map((g) => g.stats.p5));
  const hi = Math.max(...groups.map((g) => g.stats.p95));
  const span = hi - lo || 1;
  const x = (v) => padL + ((v - lo) / span) * (W - padL - padR);
  const ticks = Array.from({ length: 5 }, (_, i) => lo + (span * i) / 4);
  return (
    <div className="boxplot">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={axisLabelText}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={x(t)} x2={x(t)} y1={top} y2={H - 28} stroke="var(--grid)" />
            <text x={x(t)} y={H - 16} textAnchor="middle" fontSize="10.5" fill="var(--text-muted)">{fmt(t)}</text>
          </g>
        ))}
        {axisLabelText && <text x={(padL + W - padR) / 2} y={H - 2} textAnchor="middle" fontSize="10.5" fill="var(--text-secondary)">{axisLabelText}</text>}
        {groups.map((g, i) => {
          const y = top + i * rowH + rowH / 2;
          const s = g.stats;
          return (
            <g key={g.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={0} y={y - rowH / 2} width={W} height={rowH} fill={hover === i ? 'var(--surface-2)' : 'transparent'} />
              <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="11.5" fill="var(--text-secondary)">{g.label}</text>
              <line x1={x(s.p5)} x2={x(s.p95)} y1={y} y2={y} stroke="var(--text-muted)" strokeWidth="1.5" />
              <line x1={x(s.p5)} x2={x(s.p5)} y1={y - 6} y2={y + 6} stroke="var(--text-muted)" strokeWidth="1.5" />
              <line x1={x(s.p95)} x2={x(s.p95)} y1={y - 6} y2={y + 6} stroke="var(--text-muted)" strokeWidth="1.5" />
              <rect x={x(s.q1)} y={y - 10} width={Math.max(2, x(s.q3) - x(s.q1))} height={20} rx="4" fill={g.color} fillOpacity="0.28" stroke={g.color} strokeWidth="1.5" />
              <line x1={x(s.med)} x2={x(s.med)} y1={y - 10} y2={y + 10} stroke={g.color} strokeWidth="2.5" />
              <circle cx={x(s.mean)} cy={y} r="4" fill="var(--surface-1)" stroke="var(--text-primary)" strokeWidth="1.5" />
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="tip boxtip">
          <div className="tip-head">{groups[hover].label}</div>
          {[['P95', 'p95'], ['Q3', 'q3'], ['Median', 'med'], ['Mean', 'mean'], ['Q1', 'q1'], ['P5', 'p5']].map(([l, k]) => (
            <div className="tip-row" key={k}><span>{l}</span><b>{fmt(groups[hover].stats[k])}</b></div>
          ))}
          <div className="tip-row"><span>Customers</span><b>{groups[hover].stats.n.toLocaleString('en-IN')}</b></div>
        </div>
      )}
      <div className="legend" style={{ marginTop: 4 }}>
        {groups.map((g) => <span key={g.label}><i style={{ background: g.color }} />{g.label}</span>)}
        <span><i style={{ background: 'var(--surface-1)', border: '1.5px solid var(--text-primary)', borderRadius: '50%' }} />Mean</span>
        <span className="muted">Box = Q1–Q3 · whiskers = P5–P95</span>
      </div>
    </div>
  );
}
