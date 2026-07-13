import { describe, it, expect, beforeEach } from "vitest";
import { pickFlierEvents, renderFliers } from "../docs/js/events.js";

const now = new Date("2026-06-01T12:00:00-05:00");

const events = [
  { id: "past", title: "Past", type: "meetup", starts_at: "2026-05-01T19:00:00-05:00", flyer: "assets/events/past.jpg" },
  { id: "future-flier", title: "Summer Mixer", type: "meetup", starts_at: "2026-06-20T19:00:00-05:00", flyer: "assets/events/mixer.jpg" },
  { id: "future-noflier", title: "No Flier", type: "meetup", starts_at: "2026-06-21T19:00:00-05:00" },
];

describe("pickFlierEvents", () => {
  it("returns only upcoming events that have a flyer", () => {
    const ids = pickFlierEvents(events, now).map((e) => e.id);
    expect(ids).toEqual(["future-flier"]);
  });
  it("returns empty when nothing upcoming has a flyer", () => {
    expect(pickFlierEvents([events[0], events[2]], now)).toEqual([]);
  });
});

describe("renderFliers (DOM)", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="event-fliers"><div class="container"><div class="fliers-grid"></div></div></section>
    `;
  });

  it("renders one flier card per event with the image and caption", () => {
    renderFliers([events[1]]);
    const cards = document.querySelectorAll(".flier-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].querySelector("img").getAttribute("src")).toContain("mixer.jpg");
    expect(cards[0].querySelector(".flier-caption").textContent).toContain("Summer Mixer");
  });

  it("hides the section when there are no fliers", () => {
    renderFliers([]);
    const section = document.querySelector("#event-fliers");
    expect(section.style.display).toBe("none");
    expect(document.querySelector(".flier-card")).toBeNull();
  });

  it("strips a leading slash from CMS-absolute flyer paths", () => {
    renderFliers([{ id: "x", title: "X", starts_at: "2026-06-20T19:00:00-05:00", flyer: "/assets/events/x.png" }]);
    const src = document.querySelector(".flier-card img").getAttribute("src");
    expect(src).toBe("assets/events/x.png");
  });
});
