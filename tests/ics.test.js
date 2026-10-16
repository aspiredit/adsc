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

describe("eventToICS reminders", () => {
  function alarmBlocks(ics) {
    return ics.split("BEGIN:VALARM").slice(1).map((b) => b.split("END:VALARM")[0]);
  }

  it("attaches both default reminders", () => {
    const blocks = alarmBlocks(eventToICS(baseEvent));
    expect(blocks).toHaveLength(2);
  });

  it("reminds the day before and two hours ahead", () => {
    const ics = eventToICS(baseEvent);
    expect(ics).toContain("TRIGGER:-P1D");
    expect(ics).toContain("TRIGGER:-PT2H");
  });

  it("every alarm is a DISPLAY alarm with a description", () => {
    for (const block of alarmBlocks(eventToICS(baseEvent))) {
      expect(block).toContain("ACTION:DISPLAY");
      expect(block).toMatch(/DESCRIPTION:.+/);
    }
  });

  it("alarm text names the event", () => {
    const ics = eventToICS(baseEvent);
    expect(ics).toContain("DESCRIPTION:Tomorrow: Dads Social — June Edition");
    expect(ics).toContain("DESCRIPTION:Starting soon: Dads Social — June Edition");
  });

  it("escapes punctuation in alarm text", () => {
    const ics = eventToICS({ ...baseEvent, title: "Pool, beers; fun" });
    expect(ics).toContain("DESCRIPTION:Tomorrow: Pool\\, beers\\; fun");
  });

  it("falls back to a generic label when the event has no title", () => {
    const ics = eventToICS({ ...baseEvent, title: undefined });
    expect(ics).toContain("DESCRIPTION:Tomorrow: ADSC event");
    expect(ics).not.toContain("undefined");
  });

  it("event DESCRIPTION still parses ahead of any alarm description", () => {
    const ics = eventToICS(baseEvent);
    const first = ics.split(/\r?\n/).find((l) => l.startsWith("DESCRIPTION:"));
    expect(first).toBe("DESCRIPTION:Pool\\, beers\\, no agenda.");
  });

  it("alarms close before the VEVENT does", () => {
    const ics = eventToICS(baseEvent);
    expect(ics.lastIndexOf("END:VALARM")).toBeLessThan(ics.indexOf("END:VEVENT"));
  });

  it("accepts a custom alarm set", () => {
    const ics = eventToICS(baseEvent, new Date(), [{ trigger: "-PT30M", prefix: "Heads up" }]);
    expect(alarmBlocks(ics)).toHaveLength(1);
    expect(ics).toContain("TRIGGER:-PT30M");
  });

  it("omits alarms entirely when passed an empty set", () => {
    const ics = eventToICS(baseEvent, new Date(), []);
    expect(ics).not.toContain("BEGIN:VALARM");
    expect(ics).toContain("BEGIN:VEVENT");
  });
});
