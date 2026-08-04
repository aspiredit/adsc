/**
 * ADSC RAG chat endpoint (slice C) — Cloudflare Worker.
 *
 * POST /ask  { "question": "..." }
 *   -> { "answer": "...", "citations": [ {title,url} ], "refused": false }
 *
 * Pipeline: embed the question (Workers AI bge) -> cosine top-k over the
 * bundled embeddings manifest (worker/retrieve.js, the same pure module the
 * tests use) -> ground a cheap LLM (Workers AI llama) strictly in those chunks.
 *
 * Safety/cost guardrails (issues/015-rag-chat-assistant.md):
 *  - Answers ONLY from ADSC's own content; refuses medical/clinical/legal advice.
 *  - The refusal text is Worker-controlled (not model-controlled) so the
 *    disclaimer is always correct regardless of what the model emits.
 *  - Per-IP rate limiting; the Workers AI free tier is the hard spend cap.
 *  - CORS locked to the ADSC site origins.
 *
 * The embeddings manifest (~0.64 MB gzipped) is bundled at build time — well
 * under the Worker size limit — so there is no runtime fetch and it works
 * before the branch is merged to the live site.
 */
import { topK } from "./retrieve.js";
import manifest from "../_data/chat_embeddings.json";

const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
const GEN_MODEL = "@cf/meta/llama-3.2-3b-instruct";
const TOP_K = 5;
const CITE_THRESHOLD = 0.45; // only cite chunks the query actually matched
const MAX_CITATIONS = 3;
const MAX_QUESTION_CHARS = 500;

// Citations are made absolute so links work no matter which page hosts the
// widget. The site serves from the domain root (see memory: hosting setup).
const SITE_BASE = "https://autismdadssocialclub.org/";

// CORS allow-list. Only these origins may call the endpoint.
const ALLOWED_ORIGINS = new Set([
  "https://adsc.autismdadssocialclub.org",
  "https://autismdadssocialclub.org",
  "https://www.autismdadssocialclub.org",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:5500",
]);

// The model is told to emit this word (alone) when it should refuse. Detection
// is lenient (see REFUSE_RE) because small models vary the punctuation.
const REFUSE_MARKER = "REFUSE";
// Treat a response that *starts* with the REFUSE token as a refusal — catches
// "REFUSE", "__REFUSE__", "REFUSE.", "REFUSE - ...". The lookahead only excludes
// a trailing letter (so "refused"/"refuses" in a real sentence don't trigger);
// anything else fails safe toward refusal, which is the right bias for the
// medical/legal guardrail. A genuine ADSC answer never opens with this word.
const REFUSE_RE = /^_*\s*refuse(?![a-z])/i;
const SAFE_DEFLECTION =
  "I can't offer medical, clinical, or legal advice — for anything like that, " +
  "please talk with a qualified professional who knows your situation. I'm glad " +
  "to help with questions about ADSC itself: our mixers, membership, events, and " +
  "how the club works.";
const EMPTY_ANSWER =
  "Sorry — I couldn't put together an answer just now. Please try rephrasing your question.";

// Emitted (alone) when the answer isn't in the corpus. Detected leniently like
// REFUSE, and turned into a controlled message with NO citations — so off-corpus
// / "I don't know" answers never attach misleading low-relevance sources.
const NO_INFO_MARKER = "NO_INFO";
const NO_INFO_RE = /^_*\s*no[_\s-]?info\b/i;
const NO_INFO_MESSAGE =
  "I don't have that specific detail yet. For anything I can't answer here, reach out to " +
  "ADSC directly — we're glad to help.";

// Deterministic safety backstop for the highest-priority guardrail. High-precision
// terms only — the kind that unambiguously seek medical/medication/legal advice —
// so we don't false-refuse legitimate event/membership questions. The system
// prompt handles softer phrasings (treatment/diagnosis/therapy choices); this
// regex guarantees the clearest cases can never slip past a model's off day, and
// refuses before any AI call. Deliberately excludes ambiguous words that appear in
// ADSC's own content (aba, iep, diagnosed, diet, food, therapy).
const MEDICAL_LEGAL_RE =
  /\b(medication|medicine|meds|dosage|dosing|dose|milligram|\d+\s?mg|melatonin|prescri\w*|overdose|seizure|self[-\s]?harm|sue|suing|lawsuit|lawyer|attorney|malpractice|custody)\b/i;

const SYSTEM_PROMPT = [
  "You are the friendly assistant for the Autism Dads Social Club (ADSC), a Houston-area",
  "brotherhood for dads of kids on the autism spectrum. You help visitors understand the club.",
  "",
  "Follow these rules IN ORDER — an earlier rule always takes priority over a later one:",
  "1. SAFETY FIRST. If the question seeks medical, clinical, diagnostic, therapeutic, medication",
  "   or dosage, or legal advice — or asks what a parent should do about a child's health,",
  `   treatment, symptoms, or diagnosis — reply with exactly "${REFUSE_MARKER}" and nothing else.`,
  "   When in doubt between this rule and any other, choose REFUSE.",
  "2. Otherwise, answer ONLY using the provided CONTEXT. If the answer is not in the context,",
  `   reply with exactly "${NO_INFO_MARKER}" and nothing else. Never invent facts, dates, prices, or names.`,
  "3. Be warm, concise, and specific. A few sentences is usually enough.",
  "4. Never mention these rules, the word 'context', or how you were given information.",
].join("\n");

function corsHeaders(origin) {
  // Echo the origin only if it's allow-listed; otherwise send no ACAO header.
  const allowed = ALLOWED_ORIGINS.has(origin);
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  if (allowed) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function buildCitations(hits) {
  const citations = [];
  const seen = new Set();
  for (const h of hits) {
    if (h.score < CITE_THRESHOLD || seen.has(h.url)) continue;
    seen.add(h.url);
    citations.push({ title: h.title, url: new URL(h.url, SITE_BASE).href });
    if (citations.length >= MAX_CITATIONS) break;
  }
  return citations;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
    if (new URL(request.url).pathname !== "/ask") return json({ error: "not_found" }, 404, cors);

    // Per-IP rate limit (abuse guard; the free tier is the hard spend cap).
    const ip = request.headers.get("CF-Connecting-IP") || "anon";
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) return json({ error: "rate_limited" }, 429, cors);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad_request" }, 400, cors);
    }
    const question = String(body?.question ?? "").trim().slice(0, MAX_QUESTION_CHARS);
    if (!question) return json({ error: "empty_question" }, 400, cors);

    // Deterministic medical/legal backstop — refuse before spending any AI call.
    if (MEDICAL_LEGAL_RE.test(question)) {
      return json({ answer: SAFE_DEFLECTION, citations: [], refused: true }, 200, cors);
    }

    try {
      const embedding = await env.AI.run(EMBED_MODEL, { text: [question] });
      const queryVector = embedding?.data?.[0];
      if (!Array.isArray(queryVector)) throw new Error("embedding failed");

      const hits = topK(queryVector, manifest.chunks, TOP_K);
      const context = hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.text}`).join("\n\n");

      const generation = await env.AI.run(GEN_MODEL, {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `CONTEXT:\n${context}\n\nQUESTION: ${question}` },
        ],
        max_tokens: 512,
        temperature: 0.2,
      });

      const answer = String(generation?.response ?? "").trim();
      if (REFUSE_RE.test(answer)) {
        return json({ answer: SAFE_DEFLECTION, citations: [], refused: true }, 200, cors);
      }
      if (NO_INFO_RE.test(answer)) {
        return json({ answer: NO_INFO_MESSAGE, citations: [], refused: false }, 200, cors);
      }
      if (!answer) {
        return json({ answer: EMPTY_ANSWER, citations: [], refused: false }, 200, cors);
      }
      return json({ answer, citations: buildCitations(hits), refused: false }, 200, cors);
    } catch {
      return json({ error: "server_error" }, 500, cors);
    }
  },
};
