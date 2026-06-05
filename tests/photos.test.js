/**
 * Tests for docs/js/photos.js — issue 013.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  pickLatestPhotos,
  renderPhotoTiles,
  openLightbox,
  closeLightbox,
  encodePhotoUrl,
} from "../docs/js/photos.js";

const samplePhoto = (overrides = {}) => ({
  slug: "p1",
  title: "A photo",
  image: "/assets/images/sample.png",
  caption: "",
  date: "2026-05-28",
  ...overrides,
});

describe("pickLatestPhotos", () => {
  it("returns up to n photos, newest first by date", () => {
    const a = samplePhoto({ slug: "a", date: "2026-01-01" });
    const b = samplePhoto({ slug: "b", date: "2026-06-01" });
    const c = samplePhoto({ slug: "c", date: "2026-03-01" });
    expect(pickLatestPhotos([a, b, c], 2).map((p) => p.slug)).toEqual(["b", "c"]);
  });

  it("returns empty array for invalid input", () => {
    expect(pickLatestPhotos(null, 6)).toEqual([]);
    expect(pickLatestPhotos(undefined, 6)).toEqual([]);
    expect(pickLatestPhotos([], 6)).toEqual([]);
  });
});

describe("encodePhotoUrl", () => {
  it("URL-encodes spaces in filenames", () => {
    const url = "/assets/images/Screenshot 2026-05-28 192846-1.png";
    expect(encodePhotoUrl(url)).toBe("/assets/images/Screenshot%202026-05-28%20192846-1.png");
  });

  it("leaves already-safe URLs intact", () => {
    expect(encodePhotoUrl("/assets/images/clean.png")).toBe("/assets/images/clean.png");
  });

  it("handles empty / missing input", () => {
    expect(encodePhotoUrl("")).toBe("");
    expect(encodePhotoUrl(null)).toBe("");
  });
});

describe("renderPhotoTiles", () => {
  let container;
  beforeEach(() => {
    container = document.createElement("div");
  });

  it("renders one tile per photo", () => {
    const photos = [samplePhoto({ slug: "a" }), samplePhoto({ slug: "b" })];
    renderPhotoTiles(container, photos);
    expect(container.querySelectorAll(".photo-tile")).toHaveLength(2);
  });

  it("each tile has an img with the encoded src", () => {
    renderPhotoTiles(container, [samplePhoto({ image: "/assets/images/A B.png" })]);
    const img = container.querySelector(".photo-tile img");
    expect(img.getAttribute("src")).toBe("/assets/images/A%20B.png");
  });

  it("no-op when photos list is empty", () => {
    renderPhotoTiles(container, []);
    expect(container.children).toHaveLength(0);
  });

  it("each tile is a button (keyboard accessible)", () => {
    renderPhotoTiles(container, [samplePhoto()]);
    expect(container.querySelector(".photo-tile").tagName).toBe("BUTTON");
  });
});

describe("openLightbox / closeLightbox", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    closeLightbox(); // make sure no residual modal between tests
    document.body.innerHTML = "";
  });

  it("opens a lightbox element with the photo's image", () => {
    const photo = samplePhoto({ image: "/assets/images/x.png", title: "Title", caption: "cap" });
    openLightbox(photo, [photo]);
    const lb = document.querySelector(".photo-lightbox");
    expect(lb).toBeTruthy();
    expect(lb.querySelector("img").getAttribute("src")).toBe("/assets/images/x.png");
    expect(lb.textContent).toContain("Title");
    expect(lb.textContent).toContain("cap");
  });

  it("closeLightbox removes the lightbox", () => {
    openLightbox(samplePhoto(), [samplePhoto()]);
    expect(document.querySelector(".photo-lightbox")).toBeTruthy();
    closeLightbox();
    expect(document.querySelector(".photo-lightbox")).toBeNull();
  });

  it("locks body scroll while open and restores on close", () => {
    expect(document.body.classList.contains("lightbox-open")).toBe(false);
    openLightbox(samplePhoto(), [samplePhoto()]);
    expect(document.body.classList.contains("lightbox-open")).toBe(true);
    closeLightbox();
    expect(document.body.classList.contains("lightbox-open")).toBe(false);
  });
});
