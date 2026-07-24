// Retrieval core for the RAG chat assistant (slice B).
//
// Pure, dependency-free ES module: no Node-only or Cloudflare-only APIs, so the
// same code runs unchanged inside the Cloudflare Worker and under vitest. The
// corpus is tiny (~33 blog posts + FAQ + events), so there is no vector DB —
// the Worker embeds the question, then this module scores it against the
// precomputed chunk embeddings in memory and returns the top-k matches.
//
// Input chunks come straight from _data/chat_embeddings.json's `chunks` array:
// each is a chunk record { id, source_type, source_id, title, url, text } plus
// an `embedding` number[]. Output strips the raw embedding (the Worker never
// needs to ship 768 floats per chunk back to the client) and adds a `score`.

// Cosine similarity between two equal-length numeric vectors.
//
// cos(a, b) = (a · b) / (||a|| * ||b||). A zero-magnitude vector (all zeros, or
// a missing/empty embedding) has no direction, so similarity is undefined; we
// return 0 rather than divide by zero and leak NaN/Infinity into the ranking.
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    magA += x * x;
    magB += y * y;
  }
  if (magA === 0 || magB === 0) return 0;
  const sim = dot / (Math.sqrt(magA) * Math.sqrt(magB));
  // Guard against any residual NaN (e.g. non-numeric values slipped into a vector).
  return Number.isFinite(sim) ? sim : 0;
}

// Rank `chunks` by cosine similarity to `queryEmbedding` and return the top `k`.
//
// - Each returned element is the chunk's metadata (everything except `embedding`)
//   plus a numeric `score`. The raw embedding is omitted from the output.
// - Sorted descending by score. Ties are broken by original index, so the
//   ordering is fully deterministic across runs.
// - k >= chunks.length returns all chunks, ranked. Empty/invalid input → [].
export function topK(queryEmbedding, chunks, k) {
  if (!Array.isArray(chunks) || chunks.length === 0) return [];

  // Score every chunk, remembering its original index for stable tie-breaking.
  const scored = chunks.map((chunk, index) => ({
    index,
    score: cosineSimilarity(queryEmbedding, chunk?.embedding),
    chunk,
  }));

  // Descending by score; on a tie, the earlier original index wins.
  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  // Clamp k: negative/undefined → 0 results; larger than the corpus → all.
  const count = Math.max(0, Math.min(Number.isFinite(k) ? k : 0, scored.length));

  return scored.slice(0, count).map(({ chunk, score }) => {
    // Strip the raw embedding; keep every other chunk field and attach the score.
    const { embedding, ...metadata } = chunk;
    return { ...metadata, score };
  });
}
