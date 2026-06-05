import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  pickFeaturedEvent,
  formatStartCT,
  buildCtaLabel,
  renderFeatured,
  resolveFlyer,
} from "../docs/js/events.js";

describe("resolveFlyer", () => {
  it("strips a leading slash so absolute CMS paths resolve on the subpath host", () => {
    expect(resolveFlyer("/assets/events/x.png")).toBe("assets/events/x.png");
  });
  it("leaves already-relative paths untouched", () => {
    expect(resolveFlyer("assets/events/x.png")).toBe("assets/events/x.png");
  });
  it("leaves external URLs untouched", () => {
    expect(resolveFlyer("https://cdn.example/x.png")).toBe("https://cdn.example/x.png");
  });
  it("returns empty for missing flyer", () => {
    expect(resolveFlyer("")).toBe("");
  });
});

const fixedNow = new Date("2026-06-01T12:00:00-05:00");

const sampleEvents = [
  {
    id: "2026-05-15-past",
    title: "Past Meetup",
    type: "meetup",
    starts_at: "2026-05-15T19:00:00-05:00",
    location: "Old Place",
    description: "",
    status: "scheduled",
    draft: false,
  },
  {
    id: "2026-06-20-future",
    title: "Future Family Day",
    type: "family_event",
    starts_at: "2026-06-20T13:00:00-05:00",
    location: "Hermann Park",
    description: "",
    status: "scheduled",
    draft: false,
  },
  {
    id: "2026-06-05-near",
    title: "Nearest Meetup",
    type: "meetup",
    starts_at: "2026-06-05T19:00:00-05:00",
    location: "Slick Willie's",
    description: "",
    cta_label: "Save my seat at Slick Willie's",
    status: "scheduled",
    draft: false,
  },
];

describe("pickFeaturedEvent", () => {
  it("returns the chronologically nearest upcoming event", () => {
    const featured = pickFeaturedEvent(sampleEvents, fixedNow);
    expect(featured?.id).toBe("2026-06-05-near");
  });

  it("returns null when the list is empty", () => {
    expect(pickFeaturedEvent([], fixedNow)).toBeNull();
  });

  it("returns null when all events are in the past", () => {
    const allPast = [sampleEvents[0]];
    expect(pickFeaturedEvent(allPast, fixedNow)).toBeNull();
  });

  it("returns the only upcoming event when there is exactly one", () => {
    const oneUpcoming = [sampleEvents[2]];
    expect(pickFeaturedEvent(oneUpcoming, fixedNow)?.id).toBe("2026-06-05-near");
  });
});

describe("formatStartCT", () => {
  it("formats an ISO datetime with CT suffix", () => {
    const formatted = formatStartCT("2026-06-05T19:00:00-05:00");
    expect(formatted).toMatch(/Friday/);
    expect(formatted).toMatch(/June 5/);
    expect(formatted).toMatch(/7:00/);
    expect(formatted).toMatch(/\(CT\)$/);
  });
});

describe("buildCtaLabel", () => {
  it("returns the event's cta_label when present", () => {
    expect(buildCtaLabel(sampleEvents[2])).toBe("Save my seat at Slick Willie's");
  });

  it("defaults to 'RSVP' when cta_label is missing", () => {
    const noLabel = { ...sampleEvents[1], cta_label: undefined };
    expect(buildCtaLabel(noLabel)).toBe("RSVP");
  });
});

describe("renderFeatured (DOM)", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="rsvp-featured">
        <div class="rsvp-featured-tag">placeholder</div>
        <h3>placeholder</h3>
        <div class="rsvp-featured-when">placeholder</div>
        <div class="rsvp-featured-where">placeholder</div>
        <div class="rsvp-featured-spots">placeholder</div>
      </div>
      <button id="rsvp-submit" type="submit">placeholder</button>
    `;
  });

  it("populates the featured card with event data", () => {
    renderFeatured(sampleEvents[2]);
    const card = document.querySelector(".rsvp-featured");
    expect(card.querySelector("h3").textContent).toBe("Nearest Meetup");
    expect(card.querySelector(".rsvp-featured-where").textContent).toContain("Slick Willie's");
    expect(card.querySelector(".rsvp-featured-when").textContent).toMatch(/\(CT\)$/);
  });

  it("updates the RSVP submit button text from cta_label", () => {
    renderFeatured(sampleEvents[2]);
    expect(document.getElementById("rsvp-submit").textContent).toBe(
      "Save my seat at Slick Willie's"
    );
  });

  it("renders fallback content when event is null", () => {
    renderFeatured(null);
    const card = document.querySelector(".rsvp-featured");
    expect(card.textContent).toMatch(/coming soon/i);
    expect(card.querySelector("h3")).toBeNull();
  });

  it("removes the spots line (deferred from schema) without leaving placeholder text", () => {
    renderFeatured(sampleEvents[2]);
    const spots = document.querySelector(".rsvp-featured-spots");
    expect(spots).toBeNull();
  });

  it("sets a tag label based on event type", () => {
    renderFeatured(sampleEvents[1]);
    const tag = document.querySelector(".rsvp-featured-tag");
    expect(tag.textContent.toLowerCase()).toContain("family");
  });
});
