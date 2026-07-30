/**
 * Offline tests for the RAG Worker (slice C). We drive the exported fetch
 * handler with a mocked env — a fake Workers AI binding and a fake rate
 * limiter — so the whole request path (CORS, rate limit, validation, embed →
 * retrieve → generate, refusal, citations) is covered without any network or
 * Cloudflare account.
 *
 * See: worker/index.js, issues/015-rag-chat-assistant.md
 */
import { describe, it, expect } from "vitest";
import worker from "../worker/index.js";
import manifest from "../_data/chat_embeddings.json";

const ALLOWED_ORIGIN = "https://adsc.autismdadssocialclub.org";

// A query vector identical to the first chunk's embedding → that chunk scores
// ~1.0, so the success path yields a real, above-threshold citation.
const MATCHING_VECTOR = manifest.chunks[0].embedding;

/** Build a mock env. `gen` is the text the LLM "returns"; `allowed` gates the limiter. */
function mockEnv({ gen = "Here is a grounded answer.", allowed = true } = {}) {
  return {
    AI: {
      async run(model, opts) {
        if (model.includes("bge")) return { data: [MATCHING_VECTOR] };
        return { response: gen }; // llama
      },
    },
    RATE_LIMITER: {
      async limit() {
        return { success: allowed };
      },
    },
  };
}

function ask(body, { origin = ALLOWED_ORIGIN, method = "POST", path = "/ask" } = {}) {
  return new Request(`https://adsc-chat.workers.dev${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: origin },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("RAG worker", () => {
  it("answers a grounded question with citations", async () => {
    const res = await worker.fetch(ask({ question: "How do the mixers work?" }), mockEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
    const data = await res.json();
    expect(data.refused).toBe(false);
    expect(data.answer).toBe("Here is a grounded answer.");
    expect(Array.isArray(data.citations)).toBe(true);
    expect(data.citations.length).toBeGreaterThan(0);
    // Citations are absolute URLs back to the site.
    expect(data.citations[0].url).toMatch(/^https:\/\/adsc\.autismdadssocialclub\.org\//);
    expect(data.citations[0]).toHaveProperty("title");
  });

  // Small models vary the punctuation, so the refusal detector must catch every
  // form the model actually emits, not just the exact token we asked for.
  it.each(["REFUSE", "__REFUSE__", "REFUSE.", "REFUSE - I can't help with that"])(
    "treats a %j response as a refusal with a Worker-controlled deflection",
    async (gen) => {
      const res = await worker.fetch(
        ask({ question: "What medication should my child take?" }),
        mockEnv({ gen }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.refused).toBe(true);
      expect(data.citations).toEqual([]);
      expect(data.answer).toMatch(/can't offer medical, clinical, or legal advice/i);
      expect(data.answer.toUpperCase()).not.toContain("REFUSE");
    },
  );

  it("does not misfire refusal on a normal answer containing 'refused'", async () => {
    const res = await worker.fetch(
      ask({ question: "What is ADSC?" }),
      mockEnv({ gen: "Many dads refused to give up hope, and ADSC was born." }),
    );
    const data = await res.json();
    expect(data.refused).toBe(false);
    expect(data.answer).toMatch(/refused to give up/);
  });

  it("returns 429 when rate limited", async () => {
    const res = await worker.fetch(ask({ question: "hi" }), mockEnv({ allowed: false }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("rate_limited");
  });

  it("rejects an empty question with 400", async () => {
    const res = await worker.fetch(ask({ question: "   " }), mockEnv());
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON with 400", async () => {
    const req = new Request("https://adsc-chat.workers.dev/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
      body: "{not json",
    });
    const res = await worker.fetch(req, mockEnv());
    expect(res.status).toBe(400);
  });

  it("handles CORS preflight and only echoes allow-listed origins", async () => {
    const ok = await worker.fetch(ask(undefined, { method: "OPTIONS" }), mockEnv());
    expect(ok.status).toBe(204);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);

    const bad = await worker.fetch(
      ask({ question: "hi" }, { origin: "https://evil.example.com" }),
      mockEnv(),
    );
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBe(null);
  });

  it("404s unknown paths and 405s non-POST methods", async () => {
    expect((await worker.fetch(ask({}, { path: "/other" }), mockEnv())).status).toBe(404);
    expect((await worker.fetch(ask(undefined, { method: "GET" }), mockEnv())).status).toBe(405);
  });
});
