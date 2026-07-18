import { describe, it, expect } from "vitest";
import { eventToICS, escapeICSText } from "../js/ics.js";

const baseEvent = {
  id: "2026-06-13-slick-willies",
  title: "Dads Social — June Edition",
  starts_at: "2026-06-13T18:30:00-05:00",
  location: "Slick Willie's Pool Hall, Bellaire",
  description: "Pool, beers, no agenda.",
};

function field(ics, name) {
  const line = ics.split(/\r?\n/).find((l) => l.startsWith(`${name}:`));
  return line ? line.slice(name.length + 1) : null;
}

describe("escapeICSText", () => {
  it("escapes backslashes, semicolons, commas, and newlines", () => {
    expect(escapeICSText("a, b; c\\d\ne")).toBe("a\\, b\\; c\\\\d\\ne");
  });
  it("returns empty string for nullish input", () => {
    expect(escapeICSText(null)).toBe("");
    expect(escapeICSText(undefined)).toBe("");
  });
});

describe("eventToICS", () => {
  it("returns a string with the required VCALENDAR wrapper", () => {
    const ics = eventToICS(baseEvent);
    expect(ics).toMatch(/^BEGIN:VCALENDAR/);
    expect(ics).toMatch(/END:VCALENDAR\s*$/);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:");
  });

  it("wraps the event in BEGIN/END VEVENT", () => {
    const ics = eventToICS(baseEvent);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
  });

  it("includes UID matching event id", () => {
    const ics = eventToICS(baseEvent);
    expect(field(ics, "UID")).toContain("2026-06-13-slick-willies");
  });

  it("includes SUMMARY equal to event title", () => {
    const ics = eventToICS(baseEvent);
    expect(field(ics, "SUMMARY")).toContain("Dads Social");
  });

  it("includes LOCATION", () => {
    const ics = eventToICS(baseEvent);
    expect(field(ics, "LOCATION")).toContain("Slick Willie");
  });

  it("includes DESCRIPTION (commas escaped per RFC 5545)", () => {
    const ics = eventToICS(baseEvent);
    expect(field(ics, "DESCRIPTION")).toBe("Pool\\, beers\\, no agenda.");
  });

  it("DTSTART is UTC equivalent of starts_at", () => {
    const ics = eventToICS(baseEvent);
    // 2026-06-13T18:30 CDT = 2026-06-13T23:30 UTC
    expect(field(ics, "DTSTART")).toBe("20260613T233000Z");
  });

  it("DTEND defaults to DTSTART + 2 hours", () => {
    const ics = eventToICS(baseEvent);
    // 23:30 UTC + 2h = 01:30 UTC next day
    expect(field(ics, "DTEND")).toBe("20260614T013000Z");
  });

  it("includes a DTSTAMP", () => {
    const ics = eventToICS(baseEvent);
    expect(field(ics, "DTSTAMP")).toMatch(/^\d{8}T\d{6}Z$/);
  });

  it("escapes commas in SUMMARY and DESCRIPTION", () => {
    const tricky = {
      ...baseEvent,
      title: "Pool, beers; fun",
      description: "Line one\nLine two; with semis, and commas",
    };
    const ics = eventToICS(tricky);
    expect(field(ics, "SUMMARY")).toBe("Pool\\, beers\\; fun");
    expect(field(ics, "DESCRIPTION")).toBe("Line one\\nLine two\\; with semis\\, and commas");
  });

  it("emits CRLF line endings (per RFC 5545)", () => {
    const ics = eventToICS(baseEvent);
    expect(ics).toContain("\r\n");
  });

  it("missing description renders DESCRIPTION as empty value, not undefined", () => {
    const noDesc = { ...baseEvent, description: undefined };
    const ics = eventToICS(noDesc);
    expect(ics).not.toContain("undefined");
  });
});
