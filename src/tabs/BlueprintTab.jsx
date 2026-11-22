import React from 'react';
import { Card, Callout } from '../components/ui.jsx';
import { SectionTitle, Concept } from '../components/narrative.jsx';
import { LEXICON } from '../lib/lexicon.js';

const ROWS = [
  {
    q: 'Q1 · Churn drivers',
    cols: ['Churned', 'Tenure months', 'App engagement score', 'Customer support contacts', 'Net promoter score', 'City tier', 'Age', 'Monthly income inr'],
    methods: 'Churn rate by segment with Wilson 95% CI; Welch t-test + Cohen’s d (churned vs active means); Pearson χ² + Cramér’s V for categorical drivers; point-biserial r; quintile bin-spread + mutual information (non-linear check); 2–3-way pocket scan with z-scores and a multiple-testing check.',
    psych: ['Red Pill vs Blue Pill', 'Habit Loop', 'Loss Aversion'],
    module: 'Churn & Risk',
  },
  {
    q: 'Q2 · Prime impact',
    cols: ['Amazon prime member', 'Avg monthly transactions', 'Avg transaction value inr', 'App engagement score', 'Net promoter score', 'Churned'],
    methods: 'Welch t-tests with 95% CI of difference and Cohen’s d; two-proportion z-test on churn; quartile box plots (P5–P95); Prime index (Prime ÷ Non-Prime × 100); churn stratified by tier / age / income / tenure.',
    psych: ['Carrot-and-Stick', 'Sunk Cost Fallacy', 'Endowment Effect', 'Status Quo Bias'],
    module: 'Prime & UPI',
  },
  {
    q: 'Q3 · High-LTV segments',
    cols: ['Avg monthly transactions', 'Avg transaction value inr', 'Tenure months', 'City tier', 'Age', 'Monthly income inr', 'Amazon prime member', 'Cashback used pct'],
    methods: 'throughput proxy = txns × ATV × tenure; Lorenz curve, Gini, top-10/20% share; decile profiling; Pearson r of attributes with LTV; one-way ANOVA + η² by segment; two-way segment heatmap; scenario unit economics (take rate, cashback cost, segment churn as attrition).',
    psych: ['Pareto Principle', 'Survivorship Bias'],
    module: 'LTV & Segments',
  },
  {
    q: 'Q4 · Cashback: engagement or deal-seeking',
    cols: ['Cashback used pct', 'Avg monthly transactions', 'Avg transaction value inr', 'App engagement score', 'Churned', 'Net promoter score'],
    methods: 'Dose–response by 10-pt cashback band (elasticity check); ANOVA / χ² across cashback tiers; Pearson r; engagement × reliance grid; hypothesised rule-based personas with hand-set thresholds, not validated segments (utility-led, subsidised, mercenary, dormant) with tunable thresholds; cashback cost and GMV per ₹1 of cashback by persona.',
    psych: ['Mental Accounting', 'Diminishing Marginal Utility', 'Mercenary vs Utility-led', 'Variable Ratio Reinforcement'],
    module: 'Cashback Lab',
  },
  {
    q: 'Q5 · Personalised offers',
    cols: ['throughput proxy (derived)', 'Cashback used pct', 'Net promoter score', 'Customer support contacts', 'Churned'],
    methods: 'Value tier (LTV rank) × cashback reliance matrix; distress-signal overlay; per-segment scenario P&L (retained margin + cashback savings − offer cost, ROI); blanket-vs-targeted comparison; two-proportion power analysis for A/B holdouts.',
    psych: ['Goal-Gradient Effect', 'Variable Ratio Reinforcement', 'Status Quo Bias', 'Endowment Effect', 'Hyperbolic Discounting'],
    module: 'Offer Strategy Lab',
  },
];

export default function BlueprintTab() {
  return (
    <>
      <SectionTitle title="Analytical & Behavioural Blueprint">
        Every case question mapped to the exact CSV columns, the statistical method, the behavioural lens, and the dashboard module that answers it. Data analytics only: descriptive and inferential statistics, no predictive models.
      </SectionTitle>
      <Card>
        <div className="table-wrap">
          <table className="bp-table">
            <thead><tr><th>Case question</th><th>CSV columns</th><th>Analytics methods</th><th>Behavioural lens</th><th>Module</th></tr></thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.q}>
                  <td>{r.q}</td>
                  <td>{r.cols.map((c) => <React.Fragment key={c}><code>{c}</code>{' '}</React.Fragment>)}</td>
                  <td>{r.methods}</td>
                  <td>{r.psych.map((p) => <Concept key={p} name={p} />)}</td>
                  <td>{r.module}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid" style={{ marginTop: 14 }}>
        <Card title="Method notes & guardrails">
          <ul className="assumptions" style={{ fontSize: 12.8, color: 'var(--text-secondary)' }}>
            <li><b>Significance:</b> p-values from Welch t (Satterthwaite df), Pearson χ² (no Yates correction), one-way ANOVA F; computed in-browser from the filtered rows.</li>
            <li><b>Effect sizes</b> are reported next to every p-value (Cohen’s d, Cramér’s V, η²). With n = 5,000, tiny effects can be “significant”; effect size decides whether they matter commercially.</li>
            
            <li><b>Throughput proxy</b> (txns × ticket × tenure) is cumulative ₹ transaction value, not profit or true lifetime value. Forward value adds assumed take rate, cashback cost and an assumed churn-flag window; all are labelled as scenarios.</li>
            <li><b>Causality:</b> every comparison is observational. Non-significant results are not proof of no effect; significant ones are associations. Personas use hand-set thresholds and are hypotheses.</li>
            <li><b>Multiple testing:</b> exploratory subgroup scans report Benjamini–Hochberg FDR q-values; Welch CIs use t critical values at Satterthwaite df; correlation thresholds use the exact t-test on r.</li>
            <li><b>Cashback:</b> <code>Cashback used pct</code> is utilisation, not rupee spend; ₹ cashback cost is modelled.</li>
            <li><b>Data integrity:</b> implied GMV exceeds stated income for most users, so ₹ values are treated as an index; conclusions rest on ranks, ratios and tests.</li>
            <li><b>Macro / Industry Context</b> panels (green tag) are external, approximate and dated; they are never mixed into CSV metrics (blue tag).</li>
          </ul>
        </Card>
        <Card title="Behavioural lexicon">
          <div className="table-wrap">
            <table className="bp-table">
              <tbody>
                {Object.entries(LEXICON).map(([k, v]) => (
                  <tr key={k}><td>{k}</td><td>{v}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Callout tone="info" title="Filters apply everywhere">
        Every chart, test and simulator recomputes from the rows matching the filter bar, so judges can ask “what about Tier-3 women under 25?” and get a live, tested answer.
      </Callout>
    </>
  );
}
