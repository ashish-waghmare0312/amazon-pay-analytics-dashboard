import React, { useMemo } from 'react';
import { Card, Callout } from '../components/ui.jsx';
import { SectionTitle, Concept, MacroPanel, Sig } from '../components/narrative.jsx';
import { welch, propTest, anova } from '../lib/stats.js';
import { churnBattery } from '../lib/analyses.js';
import { describeIssues, churnRate, mean, sum, pearson, groupBy, fmtPct, fmtInt, fmtNum, fmtINRShort, TIERS, GENDERS, AGE_BRACKETS, INCOME_Q } from '../lib/data.js';
import { personaOf } from './CashbackTab.jsx';

export default function SummaryTab({ rows, goTo, assume, dropped = 0, issues, isFiltered }) {
  const s = useMemo(() => {
    const bat = churnBattery(rows);
    const prime = rows.filter((r) => r.prime), non = rows.filter((r) => !r.prime);
    const pChurn = propTest(non, prime);
    const pTx = welch(non, prime, 'txns');
    const sorted = [...rows].sort((a, b) => b.ltv - a.ltv);
    const total = sum(rows, 'ltv');
    const top20 = sum(sorted.slice(0, Math.round(rows.length * 0.2)), 'ltv') / total;
    const ltvTier = anova(groupBy(rows, (r) => r.tier, TIERS), 'ltv');
    const cbR = Math.max(...['txns', 'atv', 'engagement', 'churned'].map((k) => Math.abs(pearson(rows, 'cashback', k))));
    const merc = rows.filter((r) => personaOf(r, assume.cbCut, assume.engHi, assume.engLo) === 'mercenary');
    const util = rows.filter((r) => personaOf(r, assume.cbCut, assume.engHi, assume.engLo) === 'utility');
    const mu = propTest(util, merc);
    const overSpend = rows.filter((r) => r.gmv > r.income).length;
    return { bat, pChurn, pTx, top20, ltvTier, cbR, merc, util, overSpend, mu };
  }, [rows, assume]);

  const findings = [
    {
      tab: 'churn', q: 'Q1 Churn',
      t: <>Churn ({fmtPct(churnRate(rows))}) is <b>not explained by any recorded attribute</b>. {s.bat.sig.length} of {s.bat.total} Welch/χ² tests reach p &lt; .05 (smallest p = {fmtNum(s.bat.minP, 3)}, {s.bat.minLabel}){s.bat.sig.length ? <>: {s.bat.sig.map((x) => x.label).join(', ')}{s.bat.bonf.length ? <>; {s.bat.bonf.map((x) => x.label).join(', ')} survive{s.bat.bonf.length === 1 ? 's' : ''} Bonferroni correction, a segment-specific lead worth testing</> : <>, about what chance alone would produce across {s.bat.total} tests</>}</> : ''}. {s.bat.topGroup && Math.abs(s.bat.topGroup.z) >= 1.96 ? <>The only standout single group is {s.bat.topGroup.dim} = {s.bat.topGroup.key} at {fmtPct(s.bat.topGroup.rate)} churn, but on just n = {fmtInt(s.bat.topGroup.n)}. </> : ''}<i>Hypothesis, not testable with this CSV:</i> churn follows unrecorded experience events (failed payments, refund delays, rival offers), so instrument and test event-triggered saves.</>,
    },
    {
      tab: 'prime', q: 'Q2 Prime',
      t: <>No significant Prime difference is detected in Pay frequency ({fmtNum(s.pTx.mb, 1)} vs {fmtNum(s.pTx.ma, 1)} txns/mo, <Sig p={s.pTx.p} />) or churn ({fmtPct(s.pChurn.pb)} vs {fmtPct(s.pChurn.pa)}, <Sig p={s.pChurn.p} />). That is not proof of zero effect, and membership is self-selected, so no causal claim; it does suggest the <Concept name="Carrot-and-Stick" /> is not visibly tied to the wallet. Test Pay-linked Prime benefits.</>,
    },
    {
      tab: 'ltv', q: 'Q3 LTV',
      t: <>Transaction throughput (our LTV proxy: txns × ticket × tenure, not profit) is <Concept name="Pareto Principle">Pareto-concentrated</Concept>: top 20% of users hold <b>{fmtPct(s.top20, 0)}</b> of it. Demographics show no significant association with it (tier ANOVA p = {fmtNum(s.ltvTier.p, 3)}, η² = {fmtPct(s.ltvTier.eta2, 2)}); the proxy tracks behaviour by construction. Rank by throughput decile rather than city or income.</>,
    },
    {
      tab: 'cashback', q: 'Q4 Cashback',
      t: <>Cashback utilisation shows <b>no detectable association</b> with behaviour (max |r| with frequency, ticket, engagement, churn = {s.cbR.toFixed(3)}); observational data cannot rule out a causal effect. Hypothesised “mercenary” users ({fmtInt(s.merc.length)}, heavy cashback, low engagement; hand-set thresholds) churn at {fmtPct(churnRate(s.merc))} vs {fmtPct(churnRate(s.util))} for utility-led loyalists (<Sig p={s.mu.p} />): no sign that heavier utilisation goes with extra loyalty, consistent with <Concept name="Mental Accounting">free-money</Concept> discounting. A randomised test is needed to establish causality.</>,
    },
    {
      tab: 'offers', q: 'Q5 Offers',
      t: <>Personalise on <b>value × cashback reliance</b>: status and recognition for whales (<Concept name="Endowment Effect" />), bill/UPI AutoPay habit bridges for the core (<Concept name="Status Quo Bias" />), scratch-card <Concept name="Variable Ratio Reinforcement">variable rewards</Concept> instead of flat cashback, and caps for mercenaries. The returns shown are scenario estimates under assumed effects; each play must be proven with an A/B holdout before scaling.</>,
    },
  ];

  return (
    <>
      <div className="hero">
        <Card>
          <SourceLine />
          <div className="hero-num" style={{ marginTop: 6 }}>The Red Pill</div>
          <p className="lede" style={{ marginTop: 10 }}>
            The <Concept name="Red Pill vs Blue Pill">blue-pill</Concept> narrative says Prime locks users in, cashback builds habits and the right demographics carry value.
            The 5,000-user sample says otherwise: <b>no recorded attribute explains churn, Prime shows no detectable link to Pay usage, and cashback utilisation shows no detectable link to behaviour</b> (associations, not causal tests), while
            <b> {fmtPct(s.top20, 0)} of transaction throughput sits with 20% of users</b>. The evidence points less to too little cashback than to <b>cashback that is not targeted</b>, a hypothesis to test.
          </p>
          {isFiltered && <p className="lede" style={{ fontSize: 12, color: 'var(--text-muted)' }}>This headline describes the full 5,000-user sample. The findings and figures below follow your active filters.</p>}
          <p className="lede">
            Strategy in one line, to be validated by experiment: <b>stop paying for transactions, start paying for habits, and protect high-throughput users.</b>
          </p>
        </Card>
        <Card title="Data integrity check" subtitle="Read before quoting rupee figures">
          <div className="stats">
            <div className="stat"><span>Rows analysed</span><b>{fmtInt(rows.length)}</b><small>14 columns validated{dropped ? ` · ${fmtInt(dropped)} rows dropped (${describeIssues(issues)})` : '; no duplicate IDs, out-of-range values or unknown categories'}</small></div>
            <div className="stat"><span>Implied spend &gt; income</span><b>{fmtPct(s.overSpend / rows.length, 0)}</b><small>{fmtInt(s.overSpend)} users</small></div>
          </div>
          <Callout tone="warn" title="Treat ₹ as an index">
            Implied monthly GMV (txns × ticket) exceeds stated monthly income for {fmtPct(s.overSpend / rows.length, 0)} of users, and features are near-independent, which is typical of a synthetic case dataset.
            We therefore use <b>relative</b> comparisons (shares, ratios, ranks, p-values) for conclusions and present ₹ LTV as a <b>throughput index</b>, not literal rupees.
          </Callout>
        </Card>
      </div>

      <SectionTitle title="Five findings, one per case question" />
      <Card>
        {findings.map((f, i) => (
          <div className="finding" key={f.q}>
            <span className="fn">{i + 1}</span>
            <div>
              <b>{f.q}.</b> {f.t}{' '}
              <button className="toggle-table" onClick={() => goTo(f.tab)}>Open analysis →</button>
            </div>
          </div>
        ))}
      </Card>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <MacroPanel
          title="Market backdrop: UPI & the wallet war"
          items={[
            <>UPI processes roughly <b>20 billion transactions a month</b> (NPCI, 2025), making it India's default retail payment rail.</>,
            <><b>PhonePe + Google Pay ≈ 80%+</b> of UPI volume; Amazon Pay is a low-single-digit-share player fighting for the default slot.</>,
            <><b>Zero MDR on UPI P2M</b>: no direct take on core UPI flow; profits come from cards/credit, bill-pay, merchant services and Amazon commerce.</>,
            <>Implication: Amazon Pay cannot out-subsidise the leaders. It must win on <b>ecosystem integration</b> (Prime + Amazon checkout + bills).</>,
          ]}
        />
        <MacroPanel
          title="Prime as a carrot-and-stick machine"
          items={[
            <><b>Carrot:</b> free fast delivery, Prime Video/Music, deal early access, higher Amazon Pay ICICI card rewards for Prime members.</>,
            <><b>Stick:</b> an annual fee (~₹1,499) creates <Concept name="Sunk Cost Fallacy">sunk-cost</Concept> pressure and <Concept name="Loss Aversion">loss-averse</Concept> renewal.</>,
            <>Global evidence links paid membership to higher shopping frequency. In the CSV, that effect shows <b>no detectable</b> spill-over into Amazon Pay usage (an association; not proof of zero effect).</>,
            <>Opportunity: make Pay the <b>engine of Prime value</b> (Pay-earned Prime credits, Prime-only bill-pay perks).</>,
          ]}
        />
      </div>
    </>
  );
}

function SourceLine() {
  return <span className="src-tag sample">5,000-User Sample Analytics · Executive synthesis</span>;
}
