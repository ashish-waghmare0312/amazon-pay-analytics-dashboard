// Behavioural-economics lexicon used across the narrative. Hover any concept chip to see the definition.
export const LEXICON = {
  'Red Pill vs Blue Pill': 'Blue pill = the comforting surface average or industry folklore. Red pill = the uncomfortable truth that appears only once you segment and test.',
  'Carrot-and-Stick': 'Pairing a reward for the desired behaviour (carrot) with a felt cost of leaving (stick) — e.g. Prime perks + losing them on lapse.',
  'Sunk Cost Fallacy': 'People keep using something because they have already paid for it (an annual Prime fee), not because of marginal value.',
  'Loss Aversion': 'Losses loom ~2× larger than equal gains (Kahneman & Tversky). "Don\'t lose your ₹150 cashback" beats "Earn ₹150".',
  'Mental Accounting': 'Money is treated as non-fungible: cashback sits in a "free money" account and is spent more freely, often inside the same wallet.',
  'Variable Ratio Reinforcement': 'Rewards on an unpredictable schedule (scratch cards) create the most persistent behaviour — and the most mercenary if overused.',
  'Habit Loop': 'Cue → craving → response → reward (Duhigg / Eyal). Recurring bills and UPI scan-and-pay are natural cues to anchor.',
  'Status Quo Bias': 'Defaults stick. Being the saved/default payment method is worth more than any single offer.',
  'Endowment Effect': 'People value what they own more — a pre-loaded, visible balance (Amazon Pay balance, Prime status) feels like theirs to lose.',
  'Diminishing Marginal Utility': 'Each extra rupee of cashback buys less behaviour change; the 5th offer moves users far less than the 1st.',
  'Hyperbolic Discounting': 'Immediate rewards are over-weighted vs. delayed ones; instant cashback beats points redeemable later.',
  'Goal-Gradient Effect': 'Effort accelerates as people approach a goal — progress bars toward a cashback tier increase frequency.',
  'Mercenary vs Utility-led': 'Mercenary users transact only when subsidised; utility-led users transact because it is the easiest way to pay.',
  'Pareto Principle': 'A minority of customers (~20%) generate the majority (~60–80%) of value.',
  'Survivorship Bias': 'Studying only customers who stayed hides why others left; tenure-based LTV over-credits long-lived segments.',
};

export const conceptDef = (name) => LEXICON[name] || '';
