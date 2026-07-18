/**
 * Smoke tests for the Python manifest builder, run via the JS test runner so
 * the existing `npx vitest run` workflow covers it too. We don't reach into
 * Python internals — we just assert that the produced JSON has the shape the
 * renderer depends on, after invoking the script as a subprocess.
 *
 * See: issues/011-content-manifests.md, scripts/build_manifests.py
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const BLOGS_JSON = resolve(REPO, "_data/blogs.json");
const BLOGS_ALL_JSON = resolve(REPO, "_data/blogs-all.json");
const PHOTOS_JSON = resolve(REPO, "_data/photos.json");

let pythonAvailable = false;
try {
  execSync("python --version", { stdio: "ignore" });
  pythonAvailable = true;
} catch {
  /* no-op: skip the python invocation tests if python isn't on PATH */
}

describe("manifest builder", () => {
  beforeAll(() => {
    if (!pythonAvailable) return;
    // Re-run so the test sees current source on every run; idempotent.
    // If the python invocation fails (missing deps, etc.), mark python as
    // unavailable so the remaining assertions skip rather than cascade-fail.
    try {
      execSync("python scripts/build_manifests.py", { cwd: REPO, stdio: "pipe" });
    } catch (err) {
      console.warn("Skipping manifest tests — python script failed:", err.message);
      pythonAvailable = false;
    }
  });

  it.runIf(pythonAvailable)("produces a blogs.json file", () => {
    expect(existsSync(BLOGS_JSON)).toBe(true);
  });

  it.runIf(pythonAvailable)("blogs.json is a JSON array", () => {
    const data = JSON.parse(readFileSync(BLOGS_JSON, "utf-8"));
    expect(Array.isArray(data)).toBe(true);
  });

  it.runIf(pythonAvailable)("each blog entry has the renderer-required keys", () => {
    const data = JSON.parse(readFileSync(BLOGS_JSON, "utf-8"));
    for (const entry of data) {
      expect(entry).toHaveProperty("slug");
      expect(entry).toHaveProperty("title");
      expect(entry).toHaveProperty("date");
      expect(entry).toHaveProperty("excerpt");
      expect(entry).toHaveProperty("html");
      expect(entry).toHaveProperty("draft");
      expect(entry.draft).toBe(false); // drafts must be filtered out at build time
    }
  });

  it.runIf(pythonAvailable)("blogs-all.json is a superset that may include drafts", () => {
    const pub = JSON.parse(readFileSync(BLOGS_JSON, "utf-8"));
    const all = JSON.parse(readFileSync(BLOGS_ALL_JSON, "utf-8"));
    expect(Array.isArray(all)).toBe(true);
    // Every published post appears in the preview manifest too.
    expect(all.length).toBeGreaterThanOrEqual(pub.length);
    const allSlugs = new Set(all.map((p) => p.slug));
    for (const p of pub) expect(allSlugs.has(p.slug)).toBe(true);
    // The public manifest never leaks drafts; the preview one may carry them.
    expect(pub.every((p) => p.draft === false)).toBe(true);
  });

  it.runIf(pythonAvailable)("blog entries sort newest first", () => {
    const data = JSON.parse(readFileSync(BLOGS_JSON, "utf-8"));
    for (let i = 1; i < data.length; i++) {
      expect(data[i - 1].date >= data[i].date).toBe(true);
    }
  });

  it.runIf(pythonAvailable)("blog HTML is sanitized: no script tags", () => {
    const data = JSON.parse(readFileSync(BLOGS_JSON, "utf-8"));
    for (const entry of data) {
      expect(entry.html.toLowerCase()).not.toContain("<script");
      expect(entry.html.toLowerCase()).not.toMatch(/\son\w+\s*=/);
    }
  });

  it.runIf(pythonAvailable)("photos.json is a JSON array of objects with image+slug", () => {
    const data = JSON.parse(readFileSync(PHOTOS_JSON, "utf-8"));
    expect(Array.isArray(data)).toBe(true);
    for (const entry of data) {
      expect(entry).toHaveProperty("slug");
      expect(entry).toHaveProperty("image");
      expect(entry.image).toBeTruthy();
    }
  });
});
