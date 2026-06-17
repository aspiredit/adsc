import { describe, it, expect } from "vitest";
import { wrapIndex } from "../docs/js/testimonials.js";

describe("wrapIndex", () => {
  it("returns the same index when in range", () => {
    expect(wrapIndex(2, 5)).toBe(2);
  });
  it("wraps past the end to the start", () => {
    expect(wrapIndex(5, 5)).toBe(0);
    expect(wrapIndex(6, 5)).toBe(1);
  });
  it("wraps before the start to the end (negative)", () => {
    expect(wrapIndex(-1, 5)).toBe(4);
    expect(wrapIndex(-6, 5)).toBe(4);
  });
  it("is safe for zero-length", () => {
    expect(wrapIndex(3, 0)).toBe(0);
  });
});
