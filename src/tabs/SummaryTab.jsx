import React, { useMemo } from 'react';
import { Card, Callout } from '../components/ui.jsx';
import { SectionTitle, Concept, MacroPanel, Sig } from '../components/narrative.jsx';
import { welch, propTest, chiSquare, anova } from '../lib/stats.js';
import { churnRate, mean, sum, pearson, groupBy, fmtPct, fmtInt, fmtNum, fmtINRShort, TIERS, GENDERS, AGE_BRACKETS, INCOME_Q } from '../lib/data.js';
import { personaOf } from './CashbackTab.jsx';

export default function SummaryTab({ rows, goTo }) {
  const s = useMemo(() => {
    const act = rows.filter((r) => !r.churned), ch = rows.filter((r) => r.churned);
    const feats = ['tenure', 'engagement', 'support', 'nps', 'age', 'income', 'txns', 'atv', 'cashback'];
    const churnTests = feats.map((k) => welch(act, ch, k));
    const cats = [
      chiSquare(rows, (r) => r.tier, TIERS), chiSquare(rows, (r) => r.gender, GENDERS),
      chiSquare(rows, (r) => r.ageB, AGE_BRACKETS), chiSquare(rows, (r) => r.incQ, INCOME_Q),
    ];
    const minChurnP = Math.min(...churnTests.map((t) => t.p), ...cats.map((c) => c.p));
    const sigChurn = churnTests.filter((t) => t.p < 0.05).length + cats.filter((c) => c.p < 0.05).length;
    const prime = rows.filter((r) => r.prime), non = rows.filter((r) => !r.prime);
    const pChurn = propTest(non, prime);
    const pTx = welch(non, prime, 'txns');
    const sorted = [...rows].sort((a, b) => b.ltv - a.ltv);
    const total = sum(rows, 'ltv');
    const top20 = sum(sorted.slice(0, Math.round(rows.length * 0.2)), 'ltv') / total;
    const ltvTier = anova(groupBy(rows, (r) => r.tier, TIERS), 'ltv');
    const cbR = Math.max(...['txns', 'atv', 'engagement', 'churned'].map((k) => Math.abs(pearson(rows, 'cashback', k))));
    const merc = rows.filter((r) => personaOf(r, 60, 7, 4) === 'mercenary');
    const util = rows.filter((r) => personaOf(r, 60, 7, 4) === 'utility');
    const mu = propTest(util, merc);
    const overSpend = rows.filter((r) => r.gmv > r.income).length;
    return { sigChurn, nTests: churnTests.length + cats.length, minChurnP, pChurn, pTx, top20, ltvTier, cbR, merc, util, overSpend, mu };
  }, [rows]);

  const findings = [
    {
      tab: 'churn', q: 'Q1 Churn',
      t: <>Churn ({fmtPct(churnRate(rows))}) is <b>not profile-driven</b>. {s.sigChurn} of {s.nTests} Welch/χ² tests reach p &lt; .05 (smallest p = {fmtNum(s.minChurnP, 3)}). Engagement, NPS, support, tenure, income and tier look identical for churned and active users. Retention must become <b>event-triggered</b> (failed payments, refund delays, rival offers).</>,
    },
    {
      tab: 'prime', q: 'Q2 Prime',
      t: <>Prime does <b>not</b> lift Pay frequency ({fmtNum(s.pTx.mb, 1)} vs {fmtNum(s.pTx.ma, 1)} txns/mo, <Sig p={s.pTx.p} />) or loyalty (churn {fmtPct(s.pChurn.pb)} vs {fmtPct(s.pChurn.pa)}, <Sig p={s.pChurn.p} />). The <Concept name="Carrot-and-Stick" /> sits on shopping, not on the wallet: wire Pay usage into Prime benefits.</>,
    },
    {
      tab: 'ltv', q: 'Q3 LTV',
      t: <>Value is <Concept name="Pareto Principle">Pareto-concentrated</Concept>: top 20% of users hold <b>{fmtPct(s.top20, 0)}</b> of the LTV pool. But it is <b>behavioural, not demographic</b>: tier ANOVA p = {fmtNum(s.ltvTier.p, 3)}, η² = {fmtPct(s.ltvTier.eta2, 2)}. Segment by value decile, not by city or income.</>,
    },
    {
      tab: 'cashback', q: 'Q4 Cashback',
      t: <>Cashback shows <b>no behavioural return</b> (max |r| with frequency, ticket, engagement, churn = {s.cbR.toFixed(3)}). Mercenary deal-seekers ({fmtInt(s.merc.length)} users, heavy cashback, low engagement) churn at {fmtPct(churnRate(s.merc))} vs {fmtPct(churnRate(s.util))} for utility-led loyalists (<Sig p={s.mu.p} />): the subsidy buys no extra loyalty. Cashback acts as <Concept name="Mental Accounting">free-money</Concept> discounting, not habit formation.</>,
    },
    {
      tab: 'offers', q: 'Q5 Offers',
      t: <>Personalise on <b>value × cashback reliance</b>: status and recognition for whales (<Concept name="Endowment Effect" />), bill/UPI AutoPay habit bridges for the core (<Concept name="Status Quo Bias" />), scratch-card <Concept name="Variable Ratio Reinforcement">variable rewards</Concept> instead of flat cashback, and caps for mercenaries. Fund it by cutting blanket cashback; prove it with A/B holdouts.</>,
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
            The 5,000-user sample says otherwise: <b>churn is demographically random, Prime doesn't move the wallet, and cashback buys no behaviour</b>, while
            <b> {fmtPct(s.top20, 0)} of value sits with 20% of users</b>. Amazon Pay's problem is not too little cashback; it is <b>cashback aimed at the wrong people for the wrong reason</b>.
          </p>
          <p className="lede">
            Strategy in one line: <b>stop paying for transactions, start paying for habits, and protect value, not demographics.</b>
          </p>
        </Card>
        <Card title="Data integrity check" subtitle="Read before quoting rupee figures">
          <div className="stats">
            <div className="stat"><span>Rows analysed</span><b>{fmtInt(rows.length)}</b><small>14 columns, 0 nulls</small></div>
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
            <>Global evidence links paid membership to higher shopping frequency. The CSV shows that effect does <b>not</b> spill into Amazon Pay usage on its own.</>,
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
