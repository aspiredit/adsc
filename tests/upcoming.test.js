import { describe, it, expect, beforeEach } from "vitest";
import {
  pickFeaturedEvent,
  pickUpcomingEvents,
  formatStartCompactCT,
  renderUpcoming,
} from "../docs/js/events.js";

const fixedNow = new Date("2026-06-01T12:00:00-05:00");

const sampleEvents = [
  {
    id: "2026-05-15-past",
    title: "Past Meetup",
    type: "meetup",
    starts_at: "2026-05-15T19:00:00-05:00",
    location: "Old Place",
    status: "scheduled",
    draft: false,
  },
  {
    id: "2026-06-05-near",
    title: "Slick Willie's",
    type: "meetup",
    starts_at: "2026-06-05T19:00:00-05:00",
    location: "Slick Willie's",
    status: "scheduled",
    draft: false,
  },
  {
    id: "2026-06-14-family",
    title: "Summer Kickoff Family Day",
    type: "family_event",
    starts_at: "2026-06-14T13:00:00-05:00",
    location: "Hermann Park · Whole family",
    status: "scheduled",
    draft: false,
  },
  {
    id: "2026-06-28-bowl",
    title: "Dads Social — June Edition",
    type: "meetup",
    starts_at: "2026-06-28T18:30:00-05:00",
    location: "Bowl & Barrel, Sugar Land · Dads only",
    status: "scheduled",
    draft: false,
  },
  {
    id: "2026-07-15-extra",
    title: "Extra Event",
    type: "meetup",
    starts_at: "2026-07-15T19:00:00-05:00",
    location: "Some Place",
    status: "scheduled",
    draft: false,
  },
];

describe("pickUpcomingEvents", () => {
  it("returns upcoming events sorted chronologically, excluding the featured", () => {
    const featured = pickFeaturedEvent(sampleEvents, fixedNow);
    const upcoming = pickUpcomingEvents(sampleEvents, fixedNow, featured.id);
    expect(upcoming.map((e) => e.id)).toEqual([
      "2026-06-14-family",
      "2026-06-28-bowl",
      "2026-07-15-extra",
    ]);
  });

  it("caps the result at 3 events", () => {
    const many = [
      ...sampleEvents,
      {
        id: "2026-08-01-a",
        title: "A",
        type: "meetup",
        starts_at: "2026-08-01T19:00:00-05:00",
        location: "x",
        status: "scheduled",
        draft: false,
      },
      {
        id: "2026-08-02-b",
        title: "B",
        type: "meetup",
        starts_at: "2026-08-02T19:00:00-05:00",
        location: "x",
        status: "scheduled",
        draft: false,
      },
    ];
    const featured = pickFeaturedEvent(many, fixedNow);
    const upcoming = pickUpcomingEvents(many, fixedNow, featured.id);
    expect(upcoming).toHaveLength(3);
  });

  it("returns empty array when only the featured event exists", () => {
    const single = [sampleEvents[1]];
    const featured = pickFeaturedEvent(single, fixedNow);
    expect(pickUpcomingEvents(single, fixedNow, featured.id)).toEqual([]);
  });

  it("returns empty array when no upcoming events exist", () => {
    expect(pickUpcomingEvents([sampleEvents[0]], fixedNow, null)).toEqual([]);
  });

  it("does not include past events", () => {
    const featured = pickFeaturedEvent(sampleEvents, fixedNow);
    const upcoming = pickUpcomingEvents(sampleEvents, fixedNow, featured.id);
    expect(upcoming.find((e) => e.id === "2026-05-15-past")).toBeUndefined();
  });
});

describe("formatStartCompactCT", () => {
  it("returns compact day + month + time format", () => {
    const formatted = formatStartCompactCT("2026-06-14T13:00:00-05:00");
    expect(formatted).toMatch(/^Sun/);
    expect(formatted).toContain("Jun 14");
    expect(formatted).toContain("1:00");
    expect(formatted).toContain("·");
  });
});

describe("renderUpcoming (DOM)", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="rsvp-upcoming">
        <div class="rsvp-upcoming-label">Also Coming Up</div>
        <div class="rsvp-upcoming-grid">
          <div class="upcoming-event">existing</div>
        </div>
      </div>
    `;
  });

  it("populates the grid with one card per event", () => {
    renderUpcoming([sampleEvents[2], sampleEvents[3]]);
    const cards = document.querySelectorAll(".upcoming-event");
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain("Summer Kickoff Family Day");
    expect(cards[1].textContent).toContain("Dads Social — June Edition");
  });

  it("hides the entire .rsvp-upcoming section when the list is empty", () => {
    renderUpcoming([]);
    const section = document.querySelector(".rsvp-upcoming");
    expect(section.hidden).toBe(true);
  });

  it("does not leave stale placeholder cards from the initial markup", () => {
    renderUpcoming([sampleEvents[2]]);
    expect(document.body.textContent).not.toContain("existing");
  });

  it("each card includes an RSVP link", () => {
    renderUpcoming([sampleEvents[2]]);
    const link = document.querySelector(".upcoming-event a");
    expect(link).not.toBeNull();
    expect(link.textContent).toMatch(/RSVP/i);
  });
});
