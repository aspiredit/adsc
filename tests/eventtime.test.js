import { describe, it, expect } from "vitest";
import {
  chicagoOffsetMinutes,
  formatOffset,
  toChicagoIso,
  eventStartIso,
  eventEndIso,
  normalizeEvent,
  formatTimeRangeCT,
} from "../js/eventtime.js";

describe("chicago timezone offset", () => {
  it("is CDT (-300) in summer", () => {
    expect(chicagoOffsetMinutes("2026-06-06T18:30")).toBe(-300);
  });
  it("is CST (-360) in winter", () => {
    expect(chicagoOffsetMinutes("2026-01-15T18:30")).toBe(-360);
  });
  it("formats offsets", () => {
    expect(formatOffset(-300)).toBe("-05:00");
    expect(formatOffset(-360)).toBe("-06:00");
  });
});

describe("toChicagoIso (date, time)", () => {
  it("combines date and time with the summer CT offset", () => {
    expect(toChicagoIso("2026-06-06", "18:30")).toBe("2026-06-06T18:30:00-05:00");
  });
  it("combines date and time with the winter CT offset", () => {
    expect(toChicagoIso("2026-01-15", "18:30")).toBe("2026-01-15T18:30:00-06:00");
  });
  it("returns empty when either part is missing", () => {
    expect(toChicagoIso("2026-06-06", "")).toBe("");
    expect(toChicagoIso("", "18:30")).toBe("");
  });
});

describe("eventStartIso / eventEndIso", () => {
  it("derives ISO from separate date/time fields", () => {
    const ev = { date: "2026-07-16", start_time: "18:30", end_time: "19:30" };
    expect(eventStartIso(ev)).toBe("2026-07-16T18:30:00-05:00");
    expect(eventEndIso(ev)).toBe("2026-07-16T19:30:00-05:00");
  });
  it("falls back to legacy starts_at/ends_at", () => {
    const ev = { starts_at: "2026-07-16T18:30:00-05:00", ends_at: "2026-07-16T19:30:00-05:00" };
    expect(eventStartIso(ev)).toBe("2026-07-16T18:30:00-05:00");
    expect(eventEndIso(ev)).toBe("2026-07-16T19:30:00-05:00");
  });
  it("returns empty end when no end is set", () => {
    expect(eventEndIso({ date: "2026-07-16", start_time: "18:30" })).toBe("");
  });
});

describe("normalizeEvent", () => {
  it("fills starts_at/ends_at from separate fields without dropping others", () => {
    const out = normalizeEvent({ id: "x", title: "T", date: "2026-07-16", start_time: "18:30", end_time: "19:30" });
    expect(out.starts_at).toBe("2026-07-16T18:30:00-05:00");
    expect(out.ends_at).toBe("2026-07-16T19:30:00-05:00");
    expect(out.title).toBe("T");
  });
  it("leaves a legacy record's starts_at intact", () => {
    const out = normalizeEvent({ id: "x", starts_at: "2026-07-16T18:30:00-05:00" });
    expect(out.starts_at).toBe("2026-07-16T18:30:00-05:00");
  });
});

describe("formatTimeRangeCT", () => {
  it("shows a start–end range", () => {
    const ev = normalizeEvent({ date: "2026-07-16", start_time: "18:30", end_time: "19:30" });
    const range = formatTimeRangeCT(ev);
    expect(range).toMatch(/6:30/);
    expect(range).toMatch(/7:30/);
    expect(range).toContain("–");
  });
  it("shows just the start when there is no end", () => {
    const ev = normalizeEvent({ date: "2026-07-16", start_time: "18:30" });
    expect(formatTimeRangeCT(ev)).toMatch(/6:30/);
    expect(formatTimeRangeCT(ev)).not.toContain("–");
  });
});
