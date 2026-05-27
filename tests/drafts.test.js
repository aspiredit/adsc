import { describe, it, expect, beforeEach } from "vitest";
import {
  isPreviewMode,
  filterDrafts,
  showPreviewBanner,
} from "../docs/js/events.js";

const drafts = [
  { id: "a", title: "Live A", starts_at: "2026-12-01T19:00:00-05:00", draft: false },
  { id: "b", title: "Draft B", starts_at: "2026-12-02T19:00:00-05:00", draft: true },
  { id: "c", title: "Live C", starts_at: "2026-12-03T19:00:00-05:00", draft: false },
  { id: "d", title: "Draft D", starts_at: "2026-12-04T19:00:00-05:00", draft: true },
];

describe("isPreviewMode", () => {
  it("returns false for empty query string", () => {
    expect(isPreviewMode("")).toBe(false);
  });

  it("returns false when other params are present without preview", () => {
    expect(isPreviewMode("?utm_source=foo")).toBe(false);
  });

  it("returns true when preview=true is present", () => {
    expect(isPreviewMode("?preview=true")).toBe(true);
  });

  it("returns true even when other params are also present", () => {
    expect(isPreviewMode("?utm=x&preview=true&y=z")).toBe(true);
  });

  it("returns false for preview=false", () => {
    expect(isPreviewMode("?preview=false")).toBe(false);
  });

  it("is case-sensitive on the value (preview=TRUE returns false)", () => {
    expect(isPreviewMode("?preview=TRUE")).toBe(false);
  });
});

describe("filterDrafts", () => {
  it("excludes draft events by default", () => {
    const ids = filterDrafts(drafts, false).map((e) => e.id);
    expect(ids).toEqual(["a", "c"]);
  });

  it("includes draft events when previewMode is true", () => {
    const ids = filterDrafts(drafts, true).map((e) => e.id);
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });

  it("treats missing draft field as not-a-draft (defensive)", () => {
    const withMissing = [{ id: "x", title: "x", starts_at: "2026-12-01T19:00:00-05:00" }];
    expect(filterDrafts(withMissing, false)).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(filterDrafts([], false)).toEqual([]);
  });
});

describe("showPreviewBanner (DOM)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("inserts a banner element at the top of body", () => {
    showPreviewBanner();
    const banner = document.querySelector("[data-preview-banner]");
    expect(banner).not.toBeNull();
    expect(banner.textContent.toLowerCase()).toContain("preview");
    expect(document.body.firstElementChild).toBe(banner);
  });

  it("is idempotent — calling twice does not insert two banners", () => {
    showPreviewBanner();
    showPreviewBanner();
    expect(document.querySelectorAll("[data-preview-banner]")).toHaveLength(1);
  });
});
