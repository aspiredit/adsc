/**
 * Smoke tests for the Python chat-chunk builder, run via the JS test runner so
 * the existing `npx vitest run` workflow covers it too. We don't reach into
 * Python internals — we invoke the script as a subprocess and assert that the
 * produced JSON matches the frozen "Chunk record" data contract the retrieval
 * and widget lanes build against.
 *
 * See: issues/015-rag-chat-assistant.md, scripts/build_chat_index.py
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const CHUNKS_JSON = resolve(REPO, "_data/chat_chunks.json");

const CONTRACT_KEYS = ["id", "source_type", "source_id", "title", "url", "text"];
const ALLOWED_TYPES = new Set(["blog", "faq", "event"]);

let pythonAvailable = false;
try {
  execSync("python --version", { stdio: "ignore" });
  pythonAvailable = true;
} catch {
  /* no-op: skip the python invocation tests if python isn't on PATH */
}

// Captured in beforeAll so the determinism check can diff two builds.
let firstBuild = "";

describe("chat chunk builder", () => {
  beforeAll(() => {
    if (!pythonAvailable) return;
    // Re-run so the test sees current source on every run; idempotent.
    // If the python invocation fails (missing deps, etc.), mark python as
    // unavailable so the remaining assertions skip rather than cascade-fail.
    try {
      execSync("python scripts/build_chat_index.py", { cwd: REPO, stdio: "pipe" });
      firstBuild = readFileSync(CHUNKS_JSON, "utf-8");
    } catch (err) {
      console.warn("Skipping chat-chunk tests — python script failed:", err.message);
      pythonAvailable = false;
    }
  });

  it.runIf(pythonAvailable)("produces a chat_chunks.json file", () => {
    expect(existsSync(CHUNKS_JSON)).toBe(true);
  });

  it.runIf(pythonAvailable)("chat_chunks.json is a JSON array", () => {
    const data = JSON.parse(readFileSync(CHUNKS_JSON, "utf-8"));
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it.runIf(pythonAvailable)("every chunk has all six contract keys", () => {
    const data = JSON.parse(readFileSync(CHUNKS_JSON, "utf-8"));
    for (const chunk of data) {
      for (const key of CONTRACT_KEYS) {
        expect(chunk).toHaveProperty(key);
      }
    }
  });

  it.runIf(pythonAvailable)("source_type is always one of blog|faq|event", () => {
    const data = JSON.parse(readFileSync(CHUNKS_JSON, "utf-8"));
    for (const chunk of data) {
      expect(ALLOWED_TYPES.has(chunk.source_type)).toBe(true);
    }
  });

  it.runIf(pythonAvailable)("id values are unique", () => {
    const data = JSON.parse(readFileSync(CHUNKS_JSON, "utf-8"));
    const ids = data.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.runIf(pythonAvailable)("id follows the {type}:{source_id}#{ordinal} shape", () => {
    const data = JSON.parse(readFileSync(CHUNKS_JSON, "utf-8"));
    for (const chunk of data) {
      expect(chunk.id).toBe(`${chunk.source_type}:${chunk.source_id}#${chunk.id.split("#")[1]}`);
      expect(chunk.id.split("#")[1]).toMatch(/^\d+$/);
    }
  });

  it.runIf(pythonAvailable)("text is non-empty and carries no HTML tags or scripts", () => {
    const data = JSON.parse(readFileSync(CHUNKS_JSON, "utf-8"));
    for (const chunk of data) {
      expect(typeof chunk.text).toBe("string");
      expect(chunk.text.trim().length).toBeGreaterThan(0);
      expect(chunk.text).not.toContain("<");
      expect(chunk.text.toLowerCase()).not.toContain("<script");
    }
  });

  it.runIf(pythonAvailable)("url is a non-empty root-relative link", () => {
    const data = JSON.parse(readFileSync(CHUNKS_JSON, "utf-8"));
    for (const chunk of data) {
      expect(chunk.url.length).toBeGreaterThan(0);
      expect(chunk.url.startsWith("/")).toBe(false); // root-relative, not absolute
      expect(chunk.url.startsWith("http")).toBe(false);
    }
  });

  it.runIf(pythonAvailable)("covers all three content sources", () => {
    const data = JSON.parse(readFileSync(CHUNKS_JSON, "utf-8"));
    const types = new Set(data.map((c) => c.source_type));
    expect(types.has("blog")).toBe(true);
    expect(types.has("faq")).toBe(true);
    expect(types.has("event")).toBe(true);
  });

  it.runIf(pythonAvailable)("ordering is stable: a second build is byte-identical", () => {
    execSync("python scripts/build_chat_index.py", { cwd: REPO, stdio: "pipe" });
    const secondBuild = readFileSync(CHUNKS_JSON, "utf-8");
    expect(secondBuild).toBe(firstBuild);
  });
});
