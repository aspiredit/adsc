import { describe, it, expect, beforeEach } from "vitest";
import { pickFlierEvents, buildFlierList, renderFliers } from "../js/events.js";

const now = new Date("2026-06-01T12:00:00-05:00");

const events = [
  { id: "past", title: "Past", type: "meetup", starts_at: "2026-05-01T19:00:00-05:00", flyer: "assets/events/past.jpg" },
  { id: "future-flier", title: "Summer Mixer", type: "meetup", starts_at: "2026-06-20T19:00:00-05:00", flyer: "assets/events/mixer.jpg" },
  { id: "future-noflier", title: "No Flier", type: "meetup", starts_at: "2026-06-21T19:00:00-05:00" },
];

const standalone = [
  { id: "s-past", caption: "Old Fair", image: "assets/events/old.png", date: "2026-05-01" },
  { id: "s-future", caption: "Future Fair", image: "assets/events/fair.png", date: "2026-06-25" },
  { id: "s-undated", caption: "Undated Flier", image: "/assets/events/nd.png" },
];

describe("pickFlierEvents", () => {
  it("returns only upcoming events that have a flyer", () => {
    expect(pickFlierEvents(events, now).map((e) => e.id)).toEqual(["future-flier"]);
  });
});

describe("buildFlierList", () => {
  it("merges standalone fliers and event flyers", () => {
    const captions = buildFlierList(standalone, pickFlierEvents(events, now), now).map((i) => i.caption);
    expect(captions).toContain("Summer Mixer");
    expect(captions).toContain("Future Fair");
    expect(captions).toContain("Undated Flier");
  });
  it("drops standalone fliers whose date has passed", () => {
    const captions = buildFlierList(standalone, [], now).map((i) => i.caption);
    expect(captions).not.toContain("Old Fair");
  });
  it("keeps undated standalone fliers", () => {
    const captions = buildFlierList(standalone, [], now).map((i) => i.caption);
    expect(captions).toContain("Undated Flier");
  });
  it("resolves leading-slash image paths", () => {
    const item = buildFlierList([standalone[2]], [], now)[0];
    expect(item.image).toBe("assets/events/nd.png");
  });
});

describe("renderFliers (DOM)", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="event-fliers"><div class="container"><div class="fliers-grid"></div></div></section>
    `;
  });

  it("renders one card per flier item with image and caption", () => {
    renderFliers(buildFlierList([standalone[1]], [], now));
    const cards = document.querySelectorAll(".flier-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].querySelector("img").getAttribute("src")).toContain("fair.png");
    expect(cards[0].querySelector(".flier-caption").textContent).toContain("Future Fair");
  });

  it("shows a placeholder (and stays visible) when there are no fliers", () => {
    renderFliers([]);
    const section = document.querySelector("#event-fliers");
    expect(section.style.display).toBe("");
    expect(document.querySelector(".fliers-empty")).not.toBeNull();
    expect(document.querySelector(".flier-card")).toBeNull();
  });
});
