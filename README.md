# Amazon Pay India · Red Pill Analytics

An interactive case-competition dashboard answering the five Amazon Pay India case questions from a 5,000-customer dataset. It uses **data analytics only**: descriptive and inferential statistics, segmentation, Pareto/decile analysis and scenario levers. There are no ML models.

- **Stack:** React 18 + Vite 5 + Recharts. Everything is static and client-side. The CSV is embedded at build time (`src/data/amazon_pay_india.csv`), so there are no runtime fetches or missing assets.
- **Every number is live.** Every chart, test and simulator recomputes from the rows that match the filter bar (City tier, Prime, Gender, Age, Income quartile, Churn status). Scenario assumptions (take rate, cashback %, persona thresholds) are shared, so changing one on any tab updates every tab.
- **Two labelled sources:** blue tags mark *5,000-User Sample Analytics* (from the CSV). Green tags mark *Macro / Industry Context* (external, approximate, as of 2025).
- **Bring your own CSV:** the **Upload CSV** button re-runs the full analysis on any file with the same 14 columns.

---

## 1. Analytical & Behavioural Blueprint

| Case question | CSV columns | Analytics methods | Behavioural lens | Module |
|---|---|---|---|---|
| **Q1 Churn drivers** | `Churned`, `Tenure months`, `App engagement score`, `Customer support contacts`, `Net promoter score`, `City tier`, `Age`, `Monthly income inr` | Churn rate by segment + Wilson 95% CI; Welch t + Cohen's d (churned vs active); Pearson χ² + Cramér's V; point-biserial r; quintile bin-spread + mutual information; 2–3-way pocket scan with z-scores and a multiple-testing check | Red Pill vs Blue Pill, Habit Loop, Loss Aversion | Churn & Risk |
| **Q2 Prime impact** | `Amazon prime member`, `Avg monthly transactions`, `Avg transaction value inr`, `App engagement score`, `Net promoter score`, `Churned` | Welch t with 95% CI of the difference + Cohen's d; two-proportion z-test; quartile box plots; Prime index (Prime ÷ Non-Prime × 100); churn stratified by tier/age/income/tenure | Carrot-and-Stick, Sunk Cost Fallacy, Endowment Effect, Status Quo Bias | Prime & UPI |
| **Q3 High-LTV segments** | `Avg monthly transactions` × `Avg transaction value inr` × `Tenure months`, plus `City tier`, `Age`, `Monthly income inr`, `Amazon prime member` | LTV proxy; Lorenz curve, Gini, top-10/20% share; decile profiling; Pearson r of attributes with LTV; one-way ANOVA + η²; two-way segment heatmap; take-rate / cashback-cost unit economics with segment churn as attrition | Pareto Principle, Survivorship Bias | LTV & Segments |
| **Q4 Cashback: engagement or deal-seeking** | `Cashback used pct` vs `Avg monthly transactions`, `Avg transaction value inr`, `App engagement score`, `Churned`, `Net promoter score` | Dose–response by 10-pt band (elasticity check); ANOVA / χ² across cashback tiers; Pearson r; engagement × reliance grid; rule-based personas (utility-led, subsidised, mercenary, dormant) with tunable thresholds; cashback cost and GMV per ₹1 by persona | Mental Accounting, Diminishing Marginal Utility, Variable Ratio Reinforcement | Cashback Lab |
| **Q5 Personalised offers** | LTV proxy (derived), `Cashback used pct`, `Net promoter score`, `Customer support contacts`, `Churned` | Value tier × cashback-reliance matrix; distress-signal overlay; per-segment scenario P&L (retained margin + cashback savings − offer cost, ROI); blanket-vs-targeted comparison; A/B power analysis | Goal-Gradient, Variable Ratio Reinforcement, Status Quo Bias, Endowment Effect, Hyperbolic Discounting | Offer Strategy Lab |

### What the 5,000-user sample says (the "Red Pill")

| | Blue pill (comfortable story) | Red pill (tested result) |
|---|---|---|
| Q1 | Disengaged, unhappy, high-support users churn | 0 of 21 Welch/χ² tests significant (smallest p ≈ 0.052, Gender). The only standout single group is Gender = Other (27.8% churn, but n = 97). Churn ≈ 19% elsewhere, so it is **event-driven, not profile-driven** |
| Q2 | Prime's sunk-cost moat lifts Pay usage and loyalty | Prime: 74.8 vs 76.5 txns/mo (p = 0.16); churn 19.7% vs 18.4% (p = 0.27). The carrot-and-stick lands on shopping, **not on the wallet** |
| Q3 | Tier-1, affluent, Prime users carry value | Top 20% of users = **58%** of LTV (Gini ≈ 0.57), but no segment ANOVA is significant (η² < 0.2%). Value is **behavioural, not demographic** |
| Q4 | Cashback builds habits | All \|r\| < 0.02 with frequency, ticket, engagement and churn. Cashback is consumed as "free money" (**mental accounting**) and buys ~zero behaviour |
| Q5 | Raise cashback for everyone | Personalise on **value × reliance**: status for whales, bill/UPI AutoPay habit bridges for the core, scratch cards instead of flat cashback, and caps for mercenaries. Fund it by cutting blanket cashback and prove it with A/B holdouts |

**Data-integrity note:** implied monthly GMV (txns × ticket) exceeds stated monthly income for ~77% of users, and the features are nearly independent, which suggests a synthetic dataset. Conclusions therefore rest on ranks, ratios, effect sizes and p-values, and ₹ LTV is presented as a throughput index.

---

## 2. Project structure

```
amazon-pay-analytics-dashboard/
├── index.html
├── package.json
├── vite.config.js            # React plugin + vendor chunk split
├── vercel.json               # Vercel build settings (Vite, dist/)
├── src/
│   ├── main.jsx
│   ├── App.jsx               # shell: header, filters, KPI strip, tabs
│   ├── styles.css            # design tokens (light/dark), layout
│   ├── narrative.css         # pills, tags, playbook, blueprint styles
│   ├── data/amazon_pay_india.csv   # embedded dataset (5,000 rows)
│   ├── lib/
│   │   ├── data.js           # CSV parser, schema mapping, derived fields, filters
│   │   ├── stats.js          # Welch t, χ², ANOVA, z-tests, quantiles, p-values
│   │   ├── analyses.js       # shared churn test battery + default assumptions
│   │   └── lexicon.js        # behavioural-economics glossary
│   ├── components/
│   │   ├── ui.jsx            # cards, sliders, segmented controls, tooltips
│   │   ├── charts.jsx        # churn-rate bar helpers
│   │   └── narrative.jsx     # Red/Blue pill, source tags, macro panels, box plot
│   └── tabs/
│       ├── SummaryTab.jsx    # executive synthesis
│       ├── ChurnTab.jsx      # Q1
│       ├── PrimeTab.jsx      # Q2
│       ├── LtvTab.jsx        # Q3
│       ├── CashbackTab.jsx   # Q4
│       ├── OfferTab.jsx      # Q5
│       └── BlueprintTab.jsx  # method map + lexicon
```

---

## 3. Run locally

Requires Node.js 18 or later.

```bash
npm install
npm run dev        # http://localhost:5183
npm run build      # production build to dist/
npm run preview    # serve the production build
```

---

## 4. Push to GitHub

Create an **empty** repository on GitHub first (no README or .gitignore), then run:

```bash
git init
git add .
git commit -m "Amazon Pay India analytics dashboard"
git branch -M main
git remote add origin https://github.com/<your-username>/amazon-pay-analytics-dashboard.git
git push -u origin main
```

`node_modules/` and `dist/` are git-ignored.

## 5. Deploy on Vercel

**Option A: Dashboard (recommended)**
1. Go to vercel.com → **Add New… → Project** → import the GitHub repository.
2. Vercel auto-detects **Vite**. The settings in `vercel.json` are build `npm run build` and output `dist`.
3. Click **Deploy**. Every later `git push` to `main` redeploys automatically.

**Option B: CLI**
```bash
npm i -g vercel
vercel          # first run links the project (accept the defaults)
vercel --prod   # production deployment
```

No environment variables are needed. The dataset ships inside the JS bundle.

---

## 6. Method guardrails

- p-values are computed in the browser: Welch t (Satterthwaite df), Pearson χ² (no Yates correction), one-way ANOVA F, and two-proportion z. They match SciPy to three decimals.
- Each p-value is shown with an effect size (Cohen's d, Cramér's V or η²). With n = 5,000, statistical significance alone is not commercial significance.
- Simulator inputs (take rate, cashback %, offer cost, churn reduction) are **assumptions** and are labelled as such. They are not CSV facts.
- Macro / Industry Context figures are approximate, dated 2025, and kept separate from the CSV metrics. Refresh them before presenting.
