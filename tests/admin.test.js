import { describe, it, expect } from "vitest";
import {
  slugify,
  makeEventId,
  chicagoOffsetMinutes,
  formatOffset,
  toChicagoIso,
  buildEventObject,
  upsertEvent,
  deleteEventById,
  sortByStartDesc,
  validateEventForm,
  encodeBase64Utf8,
  decodeBase64Utf8,
} from "../docs/js/admin.js";

describe("slugify", () => {
  it("lowercases, trims, and dashes", () => {
    expect(slugify("  Slick Willie's, Bellaire ")).toBe("slick-willies-bellaire");
  });
  it("collapses repeats and strips edges", () => {
    expect(slugify("Hello -- World!!")).toBe("hello-world");
  });
  it("returns empty for empty input", () => {
    expect(slugify("")).toBe("");
  });
});

describe("makeEventId", () => {
  it("combines date and slug like the CMS convention", () => {
    expect(makeEventId("2026-06-13", "Slick Willie's")).toBe("2026-06-13-slick-willies");
  });
  it("falls back to 'event' when title is blank", () => {
    expect(makeEventId("2026-06-13", "")).toBe("2026-06-13-event");
  });
});

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

describe("toChicagoIso", () => {
  it("produces ISO 8601 with the summer CT offset", () => {
    expect(toChicagoIso("2026-06-06T18:30")).toBe("2026-06-06T18:30:00-05:00");
  });
  it("produces ISO 8601 with the winter CT offset", () => {
    expect(toChicagoIso("2026-01-15T18:30")).toBe("2026-01-15T18:30:00-06:00");
  });
  it("returns empty for empty input", () => {
    expect(toChicagoIso("")).toBe("");
  });
});

describe("buildEventObject", () => {
  it("builds a record matching the events schema", () => {
    const ev = buildEventObject({
      title: "June Meetup",
      type: "meetup",
      datetime: "2026-06-06T18:30",
      location: "Slick Willie's",
      description: "Come hang.",
      status: "scheduled",
      draft: false,
    });
    expect(ev).toMatchObject({
      id: "2026-06-06-june-meetup",
      title: "June Meetup",
      type: "meetup",
      starts_at: "2026-06-06T18:30:00-05:00",
      location: "Slick Willie's",
      status: "scheduled",
      draft: false,
    });
  });
  it("omits optional rsvp/cta when blank", () => {
    const ev = buildEventObject({ title: "x", datetime: "2026-06-06T10:00", location: "y" });
    expect(ev).not.toHaveProperty("rsvp_url");
    expect(ev).not.toHaveProperty("cta_label");
  });
  it("includes optional rsvp/cta when present", () => {
    const ev = buildEventObject({
      title: "x", datetime: "2026-06-06T10:00", location: "y",
      rsvp_url: "https://e.com", cta_label: "RSVP",
    });
    expect(ev.rsvp_url).toBe("https://e.com");
    expect(ev.cta_label).toBe("RSVP");
  });
  it("respects a pre-set id (edit case)", () => {
    const ev = buildEventObject({ id: "fixed-id", title: "x", datetime: "2026-06-06T10:00", location: "y" });
    expect(ev.id).toBe("fixed-id");
  });
});

describe("list mutations", () => {
  const base = [
    { id: "a", title: "A", starts_at: "2026-06-01T10:00:00-05:00" },
    { id: "b", title: "B", starts_at: "2026-06-03T10:00:00-05:00" },
  ];
  it("appends a new event", () => {
    const out = upsertEvent(base, { id: "c", title: "C" });
    expect(out.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
  it("replaces an existing event by id", () => {
    const out = upsertEvent(base, { id: "b", title: "B2" });
    expect(out.find((e) => e.id === "b").title).toBe("B2");
    expect(out).toHaveLength(2);
  });
  it("does not mutate the input array", () => {
    upsertEvent(base, { id: "c" });
    expect(base).toHaveLength(2);
  });
  it("deletes by id", () => {
    expect(deleteEventById(base, "a").map((e) => e.id)).toEqual(["b"]);
  });
  it("sorts newest first", () => {
    expect(sortByStartDesc(base).map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("validateEventForm", () => {
  it("requires title, datetime, location", () => {
    expect(validateEventForm({})).toHaveLength(3);
  });
  it("passes when required fields are present", () => {
    expect(validateEventForm({ title: "x", datetime: "2026-06-06T10:00", location: "y" })).toEqual([]);
  });
});

describe("base64 utf-8 round trip", () => {
  it("survives unicode (em dash, accents)", () => {
    const s = '{"events":[{"title":"Café — Azul ñ"}]}';
    expect(decodeBase64Utf8(encodeBase64Utf8(s))).toBe(s);
  });
  it("tolerates whitespace/newlines in base64 (GitHub API format)", () => {
    const b64 = encodeBase64Utf8("hello");
    const withNewlines = b64.slice(0, 2) + "\n" + b64.slice(2);
    expect(decodeBase64Utf8(withNewlines)).toBe("hello");
  });
});
