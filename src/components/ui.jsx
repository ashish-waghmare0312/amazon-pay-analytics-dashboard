import React from 'react';

// Categorical slots (fixed order, never cycled) — resolved from CSS vars so light/dark swap in one place.
export const C = {
  s1: 'var(--series-1)', // blue
  s2: 'var(--series-2)', // orange
  s3: 'var(--series-3)', // aqua
  grid: 'var(--grid)',
  axis: 'var(--text-muted)',
  ref: 'var(--text-secondary)',
};
export const TIER_COLOR = { 'Tier 1': C.s1, 'Tier 2': C.s2, 'Tier 3': C.s3 };

export const axisProps = {
  stroke: 'var(--axis-line)',
  tick: { fill: 'var(--text-muted)', fontSize: 11 },
  tickLine: false,
};
export const axisLabel = (value, axis = 'x') =>
  axis === 'x'
    ? { value, position: 'insideBottom', offset: -4, fill: 'var(--text-secondary)', fontSize: 11 }
    : { value, angle: -90, position: 'insideLeft', offset: 12, fill: 'var(--text-secondary)', fontSize: 11, style: { textAnchor: 'middle' } };

export function Card({ title, subtitle, children, actions, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p className="sub">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Callout({ children, tone = 'info', title = 'Insight' }) {
  return (
    <div className={`callout callout-${tone}`} role="note">
      <strong>{title}. </strong>{children}
    </div>
  );
}

export function Segmented({ label, value, options, onChange }) {
  return (
    <div className="seg-wrap">
      {label && <span className="seg-label">{label}</span>}
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value;
          const l = typeof o === 'string' ? o : o.label;
          return (
            <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
              {l}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange, format = (v) => v, hint }) {
  return (
    <label className="slider">
      <div className="slider-top">
        <span>{label}</span>
        <output>{format(value)}</output>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function NumberField({ label, value, onChange, step = 0.1, suffix }) {
  return (
    <label className="numfield">
      <span>{label}</span>
      <div>
        <input type="number" value={value} step={step} onChange={(e) => onChange(Number(e.target.value))} />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  );
}

/** Generic tooltip: rows = [{label, value, color?}] built by a formatter from the hovered payload. */
export function Tip({ active, payload, label, build, title }) {
  if (!active || !payload || !payload.length) return null;
  const rows = build ? build(payload, label) : payload.map((p) => ({ label: p.name, value: p.value, color: p.color || p.fill }));
  const head = title ? title(payload, label) : label;
  return (
    <div className="tip">
      {head != null && <div className="tip-head">{head}</div>}
      {rows.map((r, i) => (
        <div className="tip-row" key={i}>
          {r.color && <i style={{ background: r.color }} />}
          <span>{r.label}</span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.label}><i style={{ background: it.color }} />{it.label}</span>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}
