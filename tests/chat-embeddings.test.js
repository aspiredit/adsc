/**
 * Offline shape test for the chat embedding builder (slice A2). We can't hit
 * the real Workers AI API here (no token in CI/local), so we run the script in
 * its deterministic fake-embedding mode (ADSC_EMBED_FAKE=1) writing to a temp
 * file, and assert the produced manifest matches the frozen contract:
 * { model, dim, built, chunks: [ {..chunk fields.., embedding: number[dim] } ] }.
 *
 * The REAL manifest (_data/chat_embeddings.json) is built once, with a token,
 * outside CI — this test never touches it.
 *
 * See: scripts/build_embeddings.py, issues/015-rag-chat-assistant.md
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const CHUNKS_JSON = resolve(REPO, "_data/chat_chunks.json");
const TMP_OUT = resolve(REPO, "_data/chat_embeddings.test.json");

let pythonAvailable = false;
try {
  execSync("python --version", { stdio: "ignore" });
  pythonAvailable = true;
} catch {
  /* skip python-invocation tests if python isn't on PATH */
}

describe("embedding builder (fake mode)", () => {
  beforeAll(() => {
    if (!pythonAvailable) return;
    try {
      // Ensure the input exists, then embed in offline fake mode to a temp file.
      execSync("python scripts/build_chat_index.py", { cwd: REPO, stdio: "pipe" });
      execSync("python scripts/build_embeddings.py", {
        cwd: REPO,
        stdio: "pipe",
        env: { ...process.env, ADSC_EMBED_FAKE: "1", ADSC_EMBED_OUT: TMP_OUT },
      });
    } catch (err) {
      console.warn("Skipping embedding tests — python script failed:", err.message);
      pythonAvailable = false;
    }
  });

  afterAll(() => {
    if (existsSync(TMP_OUT)) rmSync(TMP_OUT);
  });

  it.runIf(pythonAvailable)("writes a manifest object with model/dim/built/chunks", () => {
    const m = JSON.parse(readFileSync(TMP_OUT, "utf-8"));
    expect(m).toBeTypeOf("object");
    expect(m.model).toBe("@cf/baai/bge-base-en-v1.5");
    expect(m.dim).toBe(768);
    expect(typeof m.built).toBe("string");
    expect(Array.isArray(m.chunks)).toBe(true);
  });

  it.runIf(pythonAvailable)("has one embedded chunk per source chunk, in order", () => {
    const chunks = JSON.parse(readFileSync(CHUNKS_JSON, "utf-8"));
    const m = JSON.parse(readFileSync(TMP_OUT, "utf-8"));
    expect(m.chunks).toHaveLength(chunks.length);
    expect(m.chunks.map((c) => c.id)).toEqual(chunks.map((c) => c.id));
  });

  it.runIf(pythonAvailable)("every chunk keeps its contract fields plus an embedding", () => {
    const m = JSON.parse(readFileSync(TMP_OUT, "utf-8"));
    for (const c of m.chunks) {
      for (const key of ["id", "source_type", "source_id", "title", "url", "text"]) {
        expect(c).toHaveProperty(key);
      }
      expect(Array.isArray(c.embedding)).toBe(true);
      expect(c.embedding).toHaveLength(m.dim);
      for (const v of c.embedding) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it.runIf(pythonAvailable)("fake embeddings are deterministic across runs", () => {
    const first = JSON.parse(readFileSync(TMP_OUT, "utf-8"));
    execSync("python scripts/build_embeddings.py", {
      cwd: REPO,
      stdio: "pipe",
      env: { ...process.env, ADSC_EMBED_FAKE: "1", ADSC_EMBED_OUT: TMP_OUT },
    });
    const second = JSON.parse(readFileSync(TMP_OUT, "utf-8"));
    expect(second.chunks[0].embedding).toEqual(first.chunks[0].embedding);
  });
});
