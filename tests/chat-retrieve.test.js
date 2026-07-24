import { describe, it, expect } from "vitest";
import { cosineSimilarity, topK } from "../worker/retrieve.js";

// A tiny hand-built fixture with KNOWN 2-D geometry so the expected ranking is
// obvious. The query is the unit vector along the x-axis, [1, 0]; each chunk's
// cosine similarity to it is just its (normalized) x-component:
//
//   a  [1, 0]      → 1.0   (identical direction, best match)
//   b  [0.8, 0.6]  → 0.8   (unit vector 37° off x-axis)
//   c  [0, 1]      → 0.0   (orthogonal)
//   zero [0, 0]    → 0.0   (degenerate: no direction → defined as 0, not NaN)
//   d  [-1, 0]     → -1.0  (opposite direction, worst match)
//
// Expected full ranking (desc score, ties broken by original index): a, b, c,
// zero, d — "c" precedes "zero" because they tie at 0 and c has the lower index.
const QUERY = [1, 0];

const CHUNKS = [
  { id: "blog:a#0", source_type: "blog", source_id: "a", title: "Alpha", url: "blog/detail.html?slug=a", text: "alpha text", embedding: [1, 0] },
  { id: "blog:b#0", source_type: "blog", source_id: "b", title: "Beta", url: "blog/detail.html?slug=b", text: "beta text", embedding: [0.8, 0.6] },
  { id: "faq:c#0", source_type: "faq", source_id: "c", title: "Gamma", url: "faq.html#c", text: "gamma text", embedding: [0, 1] },
  { id: "faq:zero#0", source_type: "faq", source_id: "zero", title: "Zero", url: "faq.html#zero", text: "zero text", embedding: [0, 0] },
  { id: "event:d#0", source_type: "event", source_id: "d", title: "Delta", url: "events.html#d", text: "delta text", embedding: [-1, 0] },
];

describe("cosineSimilarity", () => {
  it("returns 1 for identical direction", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([2, 0], [5, 0])).toBeCloseTo(1, 10); // magnitude-invariant
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("returns -1 for opposite direction", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });

  it("returns a known intermediate value", () => {
    // [1,0] · [0.8,0.6] = 0.8, and [0.8,0.6] is a unit vector.
    expect(cosineSimilarity([1, 0], [0.8, 0.6])).toBeCloseTo(0.8, 10);
  });

  it("returns 0 (never NaN) for a zero-magnitude vector", () => {
    const s = cosineSimilarity([1, 0], [0, 0]);
    expect(s).toBe(0);
    expect(Number.isNaN(s)).toBe(false);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it("returns 0 for mismatched lengths or non-arrays", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0])).toBe(0);
    expect(cosineSimilarity(null, [1, 0])).toBe(0);
  });
});

describe("topK", () => {
  it("ranks a query closest to the known best chunk first", () => {
    const results = topK(QUERY, CHUNKS, 5);
    expect(results.map((r) => r.id)).toEqual([
      "blog:a#0",   // score 1
      "blog:b#0",   // score 0.8
      "faq:c#0",    // score 0 (lower index than the zero chunk)
      "faq:zero#0", // score 0
      "event:d#0",  // score -1
    ]);
  });

  it("attaches a numeric score and reflects the known geometry", () => {
    const [best, second] = topK(QUERY, CHUNKS, 2);
    expect(best.score).toBeCloseTo(1, 10);
    expect(second.score).toBeCloseTo(0.8, 10);
    expect(typeof best.score).toBe("number");
  });

  it("limits the result count to k", () => {
    const results = topK(QUERY, CHUNKS, 2);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id)).toEqual(["blog:a#0", "blog:b#0"]);
  });

  it("returns all chunks (ranked) when k >= chunks.length", () => {
    expect(topK(QUERY, CHUNKS, 99)).toHaveLength(CHUNKS.length);
    expect(topK(QUERY, CHUNKS, CHUNKS.length)).toHaveLength(CHUNKS.length);
  });

  it("returns [] for empty chunks", () => {
    expect(topK(QUERY, [], 5)).toEqual([]);
  });

  it("does not produce NaN scores for a zero embedding", () => {
    const results = topK(QUERY, CHUNKS, 5);
    for (const r of results) {
      expect(Number.isNaN(r.score)).toBe(false);
    }
    const zero = results.find((r) => r.id === "faq:zero#0");
    expect(zero.score).toBe(0);
  });

  it("includes the chunk metadata and OMITS the raw embedding", () => {
    const [best] = topK(QUERY, CHUNKS, 1);
    expect(best).toMatchObject({
      id: "blog:a#0",
      source_type: "blog",
      source_id: "a",
      title: "Alpha",
      url: "blog/detail.html?slug=a",
      text: "alpha text",
    });
    expect(best).toHaveProperty("score");
    expect(best).not.toHaveProperty("embedding");
    // The source chunk object must not be mutated (embedding still present).
    expect(CHUNKS[0]).toHaveProperty("embedding");
  });

  it("is deterministic across repeated runs", () => {
    const a = topK(QUERY, CHUNKS, 5).map((r) => r.id);
    const b = topK(QUERY, CHUNKS, 5).map((r) => r.id);
    expect(a).toEqual(b);
  });
});
