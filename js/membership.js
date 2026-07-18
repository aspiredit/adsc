/**
 * Membership section — Monthly / Annual billing toggle.
 *
 * Each tier's price, note, and JoinIt signup link swap when the billing tab
 * changes. All the signup links live in TIERS so there is a single place to
 * update them. Tiers with no monthly option (annualOnly) keep their annual
 * price/link under the Monthly tab and show an "Annual only" note.
 *
 * Collapsible benefit lists use native <details>/<summary> in the markup, so
 * they work without this script. pickPlan() (pure) is unit-tested in
 * tests/membership.test.js.
 */

export const JOINIT_BASE = "https://app.joinit.com/o/autism-dads-social-club/";

// Per-tier billing plans. Each `link` is the exact JoinIt plan checkout URL.
// Site tier names map to JoinIt plans as: circle -> "Circle Membership",
// charter -> "Basic Membership", free -> "Free Subscription".
export const TIERS = {
  circle: {
    monthly: { price: "$30", unit: "/month", note: "Billed monthly", link: JOINIT_BASE + "TkScJFhs66P4wuhWd" },
    annual: { price: "$360", unit: "/year", note: "or $30/month", link: JOINIT_BASE + "cThqGAcFKynXb9n42" },
  },
  charter: {
    // JoinIt "Basic Membership". Annual ($50) saves $10 vs. 12 × $5/month.
    monthly: { price: "$5", unit: "/month", note: "Billed monthly", link: JOINIT_BASE + "FHPnJoNRLqEnmKtxz" },
    annual: { price: "$50", unit: "/year", note: "Save $10 vs. monthly · or $5/month", link: JOINIT_BASE + "kKccT8wdo2H8G59xf" },
  },
  free: {
    monthly: { price: "Free", unit: "", note: "Support with your time and presence", link: JOINIT_BASE + "b9Ytm8dBnzAyNGBCN" },
    annual: { price: "Free", unit: "", note: "Support with your time and presence", link: JOINIT_BASE + "b9Ytm8dBnzAyNGBCN" },
  },
};

/**
 * Resolve a tier's plan for the chosen billing period. Falls back to the annual
 * plan when a tier has no entry for the requested period.
 */
export function pickPlan(tierId, billing) {
  const tier = TIERS[tierId];
  if (!tier) return null;
  return tier[billing] || tier.annual || null;
}

function applyPlan(tierEl, billing) {
  const tierId = tierEl.dataset.tier;
  const plan = pickPlan(tierId, billing);
  if (!plan) return;

  const priceEl = tierEl.querySelector(".tier-price");
  const noteEl = tierEl.querySelector(".tier-monthly");
  const ctaEl = tierEl.querySelector(".tier-cta");

  if (priceEl) priceEl.innerHTML = `${plan.price}<small>${plan.unit}</small>`;
  if (noteEl) noteEl.textContent = plan.note || " ";
  if (ctaEl && plan.link) ctaEl.setAttribute("href", plan.link);
  tierEl.classList.toggle("is-annual-only", billing === "monthly" && !!plan.annualOnly);
}

export function init() {
  const root = document.querySelector("[data-membership]");
  if (!root) return;
  const tabs = Array.from(root.querySelectorAll(".billing-tab"));
  const tiers = Array.from(root.querySelectorAll(".tier[data-tier]"));
  if (!tabs.length || !tiers.length) return;

  function select(billing) {
    tabs.forEach((t) => {
      const on = t.dataset.billing === billing;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    tiers.forEach((t) => applyPlan(t, billing));
  }

  tabs.forEach((t) => t.addEventListener("click", () => select(t.dataset.billing)));

  const initial = tabs.find((t) => t.classList.contains("is-active")) || tabs[0];
  select(initial.dataset.billing);
}
