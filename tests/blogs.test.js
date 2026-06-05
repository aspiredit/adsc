/**
 * Tests for docs/js/blogs.js — issue 012.
 *
 * Pure-function tests for sort/format/lookup; jsdom-driven tests for
 * the DOM render functions.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  pickLatest,
  formatBlogDate,
  renderBlogCards,
  renderBlogList,
  getPostBySlug,
  renderBlogDetail,
} from "../docs/js/blogs.js";

const samplePost = (overrides = {}) => ({
  slug: "p1",
  title: "Post One",
  date: "2026-05-28",
  author: "Don Lewis",
  cover_image: "/assets/images/cover.png",
  excerpt: "A short summary.",
  html: "<p>Body</p>",
  draft: false,
  ...overrides,
});

describe("pickLatest", () => {
  it("returns up to n posts, newest first", () => {
    const a = samplePost({ slug: "a", date: "2026-01-01" });
    const b = samplePost({ slug: "b", date: "2026-06-01" });
    const c = samplePost({ slug: "c", date: "2026-03-01" });
    expect(pickLatest([a, b, c], 2).map((p) => p.slug)).toEqual(["b", "c"]);
  });

  it("returns all posts when n exceeds length", () => {
    const a = samplePost({ slug: "a", date: "2026-01-01" });
    expect(pickLatest([a], 5)).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(pickLatest([], 3)).toEqual([]);
    expect(pickLatest(null, 3)).toEqual([]);
    expect(pickLatest(undefined, 3)).toEqual([]);
  });
});

describe("formatBlogDate", () => {
  it("formats an ISO date in Central-time-agnostic month-day-year", () => {
    expect(formatBlogDate("2026-05-28")).toBe("May 28, 2026");
  });

  it("returns empty string for invalid/missing input", () => {
    expect(formatBlogDate("")).toBe("");
    expect(formatBlogDate(null)).toBe("");
    expect(formatBlogDate(undefined)).toBe("");
    expect(formatBlogDate("not-a-date")).toBe("");
  });
});

describe("getPostBySlug", () => {
  it("returns the matching post", () => {
    const a = samplePost({ slug: "a" });
    const b = samplePost({ slug: "b" });
    expect(getPostBySlug([a, b], "b")).toBe(b);
  });

  it("returns null when slug is missing or no match", () => {
    expect(getPostBySlug([], "x")).toBeNull();
    expect(getPostBySlug([samplePost()], "missing")).toBeNull();
    expect(getPostBySlug(null, "x")).toBeNull();
  });
});

describe("renderBlogCards (home + list)", () => {
  let container;
  beforeEach(() => {
    container = document.createElement("div");
  });

  it("renders one card per post with title, date, excerpt", () => {
    const posts = [
      samplePost({ slug: "a", title: "First", excerpt: "Foo" }),
      samplePost({ slug: "b", title: "Second", excerpt: "Bar" }),
    ];
    renderBlogCards(container, posts);
    const cards = container.querySelectorAll(".blog-card");
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain("First");
    expect(cards[0].textContent).toContain("May 28, 2026");
    expect(cards[0].textContent).toContain("Foo");
  });

  it("each card links to the detail page with the slug", () => {
    renderBlogCards(container, [samplePost({ slug: "hello-world" })]);
    const link = container.querySelector(".blog-card a");
    expect(link.getAttribute("href")).toContain("hello-world");
  });

  it("renders an empty-state message when posts list is empty (list page)", () => {
    renderBlogList(container, []);
    expect(container.textContent.toLowerCase()).toContain("no posts");
  });

  it("home-section render is a no-op when posts list is empty", () => {
    renderBlogCards(container, []);
    expect(container.children).toHaveLength(0);
  });
});

describe("renderBlogDetail", () => {
  let container;
  beforeEach(() => {
    container = document.createElement("div");
  });

  it("renders title, date, author, and body html", () => {
    renderBlogDetail(container, samplePost({ title: "T", author: "A", html: "<p>Body</p>" }));
    expect(container.textContent).toContain("T");
    expect(container.textContent).toContain("A");
    expect(container.textContent).toContain("May 28, 2026");
    expect(container.querySelector("p").textContent).toBe("Body");
  });

  it("renders an empty-state when post is null", () => {
    renderBlogDetail(container, null);
    expect(container.textContent.toLowerCase()).toContain("not found");
  });
});

describe("preview mode", () => {
  let container;
  beforeEach(() => {
    container = document.createElement("div");
  });

  it("shows a DRAFT badge on draft cards only in preview mode", () => {
    renderBlogCards(container, [samplePost({ draft: true })], { preview: true });
    expect(container.textContent.toLowerCase()).toContain("draft");
  });

  it("does NOT badge drafts when not in preview mode", () => {
    renderBlogCards(container, [samplePost({ draft: true })]);
    expect(container.textContent.toLowerCase()).not.toContain("draft");
  });

  it("carries the preview flag into card links so draft links stay previewable", () => {
    renderBlogCards(container, [samplePost({ slug: "x" })], { preview: true });
    expect(container.querySelector(".blog-card-title a").getAttribute("href")).toContain("preview=1");
  });

  it("shows a preview banner on a draft detail page in preview mode", () => {
    renderBlogDetail(container, samplePost({ draft: true }), "", true);
    expect(container.textContent.toLowerCase()).toContain("not visible to the public");
  });

  it("shows no preview banner for a published post even in preview mode", () => {
    renderBlogDetail(container, samplePost({ draft: false }), "", true);
    expect(container.textContent.toLowerCase()).not.toContain("not visible to the public");
  });
});
