import { describe, it, expect } from "vitest";
import { pickPlan, TIERS, JOINIT_BASE } from "../js/membership.js";

describe("pickPlan", () => {
  it("returns the monthly plan for a tier that has one", () => {
    const plan = pickPlan("circle", "monthly");
    expect(plan.price).toBe("$30");
    expect(plan.unit).toBe("/month");
    expect(plan.link).toContain(JOINIT_BASE);
  });

  it("returns the annual plan when asked", () => {
    const plan = pickPlan("circle", "annual");
    expect(plan.price).toBe("$360");
    expect(plan.unit).toBe("/year");
  });

  it("returns the charter monthly plan with its own price and link", () => {
    const plan = pickPlan("charter", "monthly");
    expect(plan.price).toBe("$5");
    expect(plan.unit).toBe("/month");
    expect(plan.link).toContain("FHPnJoNRLqEnmKtxz");
  });

  it("uses the corrected charter annual price", () => {
    expect(pickPlan("charter", "annual").price).toBe("$50");
  });

  it("falls back to the annual plan for an unknown billing period", () => {
    const plan = pickPlan("circle", "weekly");
    expect(plan).toBe(TIERS.circle.annual);
  });

  it("returns null for an unknown tier", () => {
    expect(pickPlan("platinum", "annual")).toBeNull();
  });

  it("every configured plan has a JoinIt link", () => {
    for (const tier of Object.values(TIERS)) {
      for (const plan of Object.values(tier)) {
        expect(plan.link).toContain(JOINIT_BASE);
      }
    }
  });
});
