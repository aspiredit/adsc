import { describe, it, expect, beforeEach } from "vitest";
import { renderFlyer, renderFeatured } from "../docs/js/events.js";

const eventWithFlyer = {
  id: "with-flyer",
  title: "Slick Willie's",
  type: "meetup",
  starts_at: "2026-06-13T18:30:00-05:00",
  location: "Slick Willie's",
  flyer: "/assets/events/with-flyer.png",
  status: "scheduled",
  draft: false,
};

const eventWithoutFlyer = {
  id: "no-flyer",
  title: "Hermann Park Hangout",
  type: "family_event",
  starts_at: "2026-06-14T13:00:00-05:00",
  location: "Hermann Park",
  flyer: "",
  status: "scheduled",
  draft: false,
};

describe("renderFlyer (pure HTML string)", () => {
  it("returns an <img> with src and alt when flyer is set", () => {
    const html = renderFlyer(eventWithFlyer);
    // Absolute CMS paths are normalized to relative so they resolve on the subpath host.
    expect(html).toContain('src="assets/events/with-flyer.png"');
    expect(html).toContain('alt="Slick Willie&#039;s"');
    expect(html).toContain('loading="lazy"');
  });

  it("returns a typographic fallback when flyer is empty string", () => {
    const html = renderFlyer(eventWithoutFlyer);
    expect(html).not.toContain("<img");
    expect(html).toContain("flyer-fallback");
    expect(html).toContain("Hermann Park Hangout");
    expect(html).toContain("flyer-type-pill");
    expect(html.toLowerCase()).toContain("family event");
  });

  it("returns a typographic fallback when flyer is undefined", () => {
    const noField = { ...eventWithoutFlyer, flyer: undefined };
    const html = renderFlyer(noField);
    expect(html).not.toContain("<img");
    expect(html).toContain("flyer-fallback");
  });

  it("escapes HTML in title and flyer path", () => {
    const xss = {
      ...eventWithoutFlyer,
      title: '<script>alert("x")</script>',
    };
    const html = renderFlyer(xss);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("renderFeatured includes the flyer slot", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="rsvp-featured"></div>
      <button id="rsvp-submit">x</button>
    `;
  });

  it("inserts an <img> when event has flyer", () => {
    renderFeatured(eventWithFlyer);
    const img = document.querySelector(".rsvp-featured img");
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe("assets/events/with-flyer.png");
  });

  it("inserts typographic fallback when event has no flyer", () => {
    renderFeatured(eventWithoutFlyer);
    expect(document.querySelector(".rsvp-featured img")).toBeNull();
    expect(document.querySelector(".rsvp-featured .flyer-fallback")).not.toBeNull();
  });
});
