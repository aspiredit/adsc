import { describe, it, expect, beforeEach } from "vitest";
import {
  pickPastEvents,
  formatArchiveDate,
  renderArchive,
} from "../js/archive.js";

const HOUR_MS = 60 * 60 * 1000;
const now = new Date("2026-06-15T19:00:00-05:00");

function makeEvent(id, isoStart, type = "meetup") {
  return {
    id,
    title: id.replace(/-/g, " "),
    type,
    starts_at: isoStart,
    location: "x",
    description: "",
    flyer: "",
    status: "scheduled",
    draft: false,
  };
}

function isoOffset(ms) {
  return new Date(now.getTime() + ms).toISOString();
}

describe("pickPastEvents", () => {
  it("returns events with starts_at + 12h <= now, sorted newest-first", () => {
    const events = [
      makeEvent("a-recent-past", isoOffset(-13 * HOUR_MS)),
      makeEvent("b-old", isoOffset(-30 * 24 * HOUR_MS)),
      makeEvent("c-upcoming", isoOffset(HOUR_MS)),
      makeEvent("d-grace", isoOffset(-3 * HOUR_MS)),
    ];
    const past = pickPastEvents(events, now);
    expect(past.map((e) => e.id)).toEqual(["a-recent-past", "b-old"]);
  });

  it("returns empty array when no past events exist", () => {
    const events = [makeEvent("future", isoOffset(HOUR_MS))];
    expect(pickPastEvents(events, now)).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(pickPastEvents([], now)).toEqual([]);
  });
});

describe("formatArchiveDate", () => {
  it("formats as 'Month Day, Year' in Central Time", () => {
    const formatted = formatArchiveDate("2026-06-13T18:30:00-05:00");
    expect(formatted).toContain("June");
    expect(formatted).toContain("13");
    expect(formatted).toContain("2026");
  });
});

describe("renderArchive (DOM)", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="archive-grid"></div>`;
  });

  it("renders one card per past event", () => {
    const events = [
      makeEvent("ev-a", isoOffset(-13 * HOUR_MS)),
      makeEvent("ev-b", isoOffset(-30 * 24 * HOUR_MS)),
    ];
    renderArchive(events);
    const cards = document.querySelectorAll(".archive-card");
    expect(cards).toHaveLength(2);
  });

  it("each card carries a PAST badge", () => {
    const events = [makeEvent("ev-a", isoOffset(-13 * HOUR_MS))];
    renderArchive(events);
    expect(document.querySelector(".archive-card .archive-past-badge")).not.toBeNull();
    expect(
      document.querySelector(".archive-card .archive-past-badge").textContent.toLowerCase()
    ).toContain("past");
  });

  it("renders empty state when no events", () => {
    renderArchive([]);
    expect(document.querySelector(".archive-card")).toBeNull();
    expect(document.body.textContent.toLowerCase()).toContain("no past events");
  });

  it("cards include the event title and date", () => {
    const events = [makeEvent("ev-a", "2025-12-31T18:30:00-06:00")];
    renderArchive(events);
    const card = document.querySelector(".archive-card");
    expect(card.textContent).toContain("ev a");
    expect(card.textContent).toContain("December");
    expect(card.textContent).toContain("2025");
  });
});
