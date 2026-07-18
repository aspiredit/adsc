import { describe, it, expect } from "vitest";
import {
  slugify,
  makeEventId,
  buildEventObject,
  upsertEvent,
  deleteEventById,
  sortByStartDesc,
  validateEventForm,
  makeFlierId,
  buildFlierObject,
  validateFlierForm,
  encodeBase64Utf8,
  decodeBase64Utf8,
} from "../js/admin.js";

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

describe("buildEventObject", () => {
  it("builds a record with separate date/start/end fields", () => {
    const ev = buildEventObject({
      title: "June Meetup",
      type: "meetup",
      date: "2026-06-06",
      start_time: "18:30",
      end_time: "19:30",
      location: "Slick Willie's",
      description: "Come hang.",
      status: "scheduled",
      draft: false,
    });
    expect(ev).toMatchObject({
      id: "2026-06-06-june-meetup",
      title: "June Meetup",
      type: "meetup",
      date: "2026-06-06",
      start_time: "18:30",
      end_time: "19:30",
      location: "Slick Willie's",
      status: "scheduled",
      draft: false,
    });
    expect(ev).not.toHaveProperty("starts_at");
  });
  it("omits end_time when blank", () => {
    const ev = buildEventObject({ title: "x", date: "2026-06-06", start_time: "10:00", location: "y" });
    expect(ev).not.toHaveProperty("end_time");
  });
  it("omits optional rsvp/cta when blank", () => {
    const ev = buildEventObject({ title: "x", date: "2026-06-06", start_time: "10:00", location: "y" });
    expect(ev).not.toHaveProperty("rsvp_url");
    expect(ev).not.toHaveProperty("cta_label");
  });
  it("includes optional rsvp/cta when present", () => {
    const ev = buildEventObject({
      title: "x", date: "2026-06-06", start_time: "10:00", location: "y",
      rsvp_url: "https://e.com", cta_label: "RSVP",
    });
    expect(ev.rsvp_url).toBe("https://e.com");
    expect(ev.cta_label).toBe("RSVP");
  });
  it("respects a pre-set id (edit case)", () => {
    const ev = buildEventObject({ id: "fixed-id", title: "x", date: "2026-06-06", start_time: "10:00", location: "y" });
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
  it("requires title, date, start_time, location", () => {
    expect(validateEventForm({})).toHaveLength(4);
  });
  it("passes when required fields are present", () => {
    expect(validateEventForm({ title: "x", date: "2026-06-06", start_time: "10:00", location: "y" })).toEqual([]);
  });
});

describe("fliers", () => {
  it("makeFlierId combines date and caption slug", () => {
    expect(makeFlierId("July Dads Mixer", "2026-07-20")).toBe("2026-07-20-july-dads-mixer");
  });
  it("makeFlierId works without a date", () => {
    expect(makeFlierId("Save the Date", "")).toBe("save-the-date");
  });
  it("buildFlierObject keeps required fields and omits empty optionals", () => {
    const fl = buildFlierObject({ caption: "Mixer", image: "assets/events/flier-x.png", date: "2026-07-20" });
    expect(fl).toMatchObject({ id: "2026-07-20-mixer", image: "assets/events/flier-x.png", caption: "Mixer", date: "2026-07-20" });
    expect(fl).not.toHaveProperty("link");
    expect(fl).not.toHaveProperty("expiry");
  });
  it("buildFlierObject includes an optional expiry", () => {
    const fl = buildFlierObject({ caption: "Mixer", image: "x.png", expiry: "2026-07-26" });
    expect(fl.expiry).toBe("2026-07-26");
  });
  it("buildFlierObject includes an optional link", () => {
    const fl = buildFlierObject({ caption: "Mixer", image: "x.png", link: "https://e.com" });
    expect(fl.link).toBe("https://e.com");
  });
  it("validateFlierForm requires caption and image", () => {
    expect(validateFlierForm({})).toHaveLength(2);
    expect(validateFlierForm({ caption: "x", image: "y.png" })).toEqual([]);
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
