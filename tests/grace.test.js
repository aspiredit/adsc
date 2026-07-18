import { describe, it, expect } from "vitest";
import {
  isUpcoming,
  pickFeaturedEvent,
  pickUpcomingEvents,
} from "../js/events.js";

const HOUR_MS = 60 * 60 * 1000;
const now = new Date("2026-06-15T19:00:00-05:00");

function makeEvent(id, isoStart) {
  return {
    id,
    title: id,
    type: "meetup",
    starts_at: isoStart,
    location: "x",
    status: "scheduled",
    draft: false,
  };
}

function isoOffset(ms) {
  return new Date(now.getTime() + ms).toISOString();
}

describe("isUpcoming (12hr grace period)", () => {
  it("returns true for future events", () => {
    const event = makeEvent("future", isoOffset(HOUR_MS));
    expect(isUpcoming(event, now)).toBe(true);
  });

  it("returns true for events exactly at now (just started)", () => {
    const event = makeEvent("now", now.toISOString());
    expect(isUpcoming(event, now)).toBe(true);
  });

  it("returns true for events 11h 59m in the past (still within grace)", () => {
    const offset = -(11 * HOUR_MS + 59 * 60 * 1000);
    const event = makeEvent("recent", isoOffset(offset));
    expect(isUpcoming(event, now)).toBe(true);
  });

  it("returns false for events exactly 12h in the past (boundary)", () => {
    const event = makeEvent("boundary", isoOffset(-12 * HOUR_MS));
    expect(isUpcoming(event, now)).toBe(false);
  });

  it("returns false for events 12h 1m in the past (just outside grace)", () => {
    const offset = -(12 * HOUR_MS + 60 * 1000);
    const event = makeEvent("just-past", isoOffset(offset));
    expect(isUpcoming(event, now)).toBe(false);
  });

  it("returns false for events many days in the past", () => {
    const event = makeEvent("ancient", isoOffset(-30 * 24 * HOUR_MS));
    expect(isUpcoming(event, now)).toBe(false);
  });
});

describe("pickFeaturedEvent applies grace window", () => {
  it("includes an event 11h ago as featured (still upcoming)", () => {
    const event = makeEvent("recent", isoOffset(-11 * HOUR_MS));
    expect(pickFeaturedEvent([event], now)?.id).toBe("recent");
  });

  it("excludes an event 13h ago", () => {
    const event = makeEvent("just-past", isoOffset(-13 * HOUR_MS));
    expect(pickFeaturedEvent([event], now)).toBeNull();
  });
});

describe("pickUpcomingEvents applies grace window", () => {
  it("includes recent (in-grace) events but excludes events outside the window", () => {
    const events = [
      makeEvent("ancient", isoOffset(-30 * 24 * HOUR_MS)),
      makeEvent("just-past", isoOffset(-13 * HOUR_MS)),
      makeEvent("in-grace", isoOffset(-3 * HOUR_MS)),
      makeEvent("future", isoOffset(HOUR_MS)),
    ];
    const ids = pickUpcomingEvents(events, now, null).map((e) => e.id);
    expect(ids).toContain("in-grace");
    expect(ids).toContain("future");
    expect(ids).not.toContain("ancient");
    expect(ids).not.toContain("just-past");
  });
});
