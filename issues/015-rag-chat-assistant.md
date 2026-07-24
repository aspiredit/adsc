---
id: 015
title: Context-aware RAG chat assistant (Gen-AI, minimal cost)
type: Epic
status: In progress (branch `015-rag-chat-assistant`)
depends_on: 011
---

## Why

A dad who just got a diagnosis lands on the site at 11pm with questions. A grounded, context-aware chat assistant can answer them instantly from ADSC's *own* content (blog, FAQ, events, about/board) — building trust faster than making them hunt. It must be **accurate (grounded + cited), safe (no medical/legal advice), and cheap**. Parked "good-to-have" on the sidelines; additive, with **no change to the current site**.

## What

A chat widget (bubble) backed by a small serverless RAG endpoint. Because the corpus is tiny (~33 blog posts + FAQ + events), **no vector database is needed**: a build step precomputes embeddings of content chunks into a JSON file in the repo; at query time the endpoint embeds the question, does in-memory similarity, retrieves top-k chunks, and asks a **cheap LLM** (e.g., Gemini Flash / Claude Haiku) for an answer **grounded only in those chunks, with citations** back to the source.

**Recommended backend:** Cloudflare **Worker + Workers AI** (most generous free tier). It is **decoupled from DNS/hosting** — it runs on a free `*.workers.dev` URL called via CORS, so it needs **no domain migration**. If/when DNS moves to Cloudflare (see the domain-migration plan), it can optionally be promoted to a same-origin route (`/api/chat`) for no-CORS + zone rate-limiting — an enhancement, not a requirement.

## Decisions (locked 2026-07-23)

These were resolved during scoping and are now the plan of record:

- **Model stack: all-Cloudflare.** Workers AI for *both* embeddings (`@cf/baai/bge-base-en-v1.5`) and generation (`@cf/meta/llama-3.1-8b-instruct`). One account, one account-level binding, **no external API key committed** — the strongest reason it's safe to keep in a public repo.
- **Repo: monorepo, this repo.** Build script (`scripts/build_chat_index.py`), Worker source (`worker/`), embeddings manifest (`_data/`), and widget (`js/chat-widget.js`) all live here. The build reads existing `_data/` content, so co-location avoids cross-repo content sync. **Code location ≠ deploy target:** GitHub Pages serves the static site + widget; the Worker deploys independently to Cloudflare via `wrangler`. The site only holds a *pointer* (the `workers.dev` URL).
- **Feasibility: Worker + GitHub Pages confirmed.** Pages serves only static files; the widget is client-side JS that `fetch()`es the Worker cross-origin. The Worker sets `Access-Control-Allow-Origin` locked to the site's domain. No Pages limitation blocks this; a broken Worker cannot take the site down (separate deployment; widget degrades to an error/hidden state).
- **CI added (was missing on `main`).** A new `.github/workflows/ci.yml` runs the full vitest suite + the chat build on every push to the branch and every PR to `main`, guarding the green bar before merge.

## Data contracts (frozen 2026-07-23)

Frozen up front so the parallel lanes (retrieval, widget, Worker scaffold) can be built against a stable interface without waiting on each other. Changing one of these is a deliberate re-freeze, not an incidental edit.

**1. Chunk record** — `_data/chat_chunks.json` is a bare JSON array (mirrors `blogs.json`) of:

```json
{
  "id": "blog:my-slug#0",          // "{source_type}:{source_id}#{ordinal}"
  "source_type": "blog",           // "blog" | "faq" | "event"
  "source_id": "my-slug",
  "title": "Human-readable source title",
  "url": "blog/detail.html?slug=my-slug",  // root-relative link back to the source
  "text": "Plain, sanitized chunk text (no HTML)."
}
```

**2. Embeddings manifest** — `_data/chat_embeddings.json` is an object (carries provenance retrieval needs):

```json
{
  "model": "@cf/baai/bge-base-en-v1.5",
  "dim": 768,
  "built": "2026-07-23",
  "chunks": [ { "...chunk record fields...": "", "embedding": [0.01, -0.02, "…768 floats"] } ]
}
```

**3. Worker API** — `POST /ask`, JSON in/out, CORS locked to the site origin on every response:

```
Request:   { "question": "How do the mixers work?" }
Response:  { "answer": "…grounded text…",
             "citations": [ { "title": "…", "url": "…" } ],
             "refused": false }
Refusal:   { "answer": "…safe deflection + disclaimer…", "citations": [], "refused": true }
429:       { "error": "rate_limited" }      // rate-limit / spend-cap tripped
```

## Execution: one slice at a time, each testable and revertible

Slices are done **strictly in order**; each is **one commit**, gated by **its own vitest test** (mirroring `tests/manifests.test.js`), guarded by CI, and independently `git revert`-able. Everything stays on the branch until slice E; `main` and the live site are never at risk during the build. Slice A is split into **chunk (offline, fully TDD-able)** vs **embed (needs a Cloudflare token)** so the offline test suite never depends on the network.

Tracer-bullet vertical slices (TDD on AFK slices):

- [ ] **0. Scope + CI** (AFK) — record these decisions here; add `ci.yml` running `npm test` + the chat build on this branch and PRs to `main`. *Test: CI green on branch.*
- [ ] **A1. Chunker** (AFK, TDD) — `scripts/build_chat_index.py` chunks blog/FAQ/events content → `_data/chat_chunks.json`, deterministic and network-free, mirroring `build_manifests.py`. *Test: `tests/chat-chunks.test.js` — chunk shape, source citations, no HTML/script leakage, stable ordering. Blocked by: 011.*
- [ ] **A2. Embed** (HITL) — embed chunks via Workers AI → `_data/chat_embeddings.json`. Needs a Cloudflare token; embed tests skip gracefully without one. *Blocked by: A1.*
- [x] **B. Retrieval core** (AFK, TDD) — pure cosine-similarity top-k in `worker/retrieve.js`, dependency-free (runs in the Worker and under vitest). Built against a fixture; wires to real embeddings at A2/C. *Test: `tests/chat-retrieve.test.js` — 14 tests green, offline.*
- [ ] **C. Serverless RAG endpoint** (HITL) — Cloudflare Worker: embed question → retrieve → call Workers AI → return grounded answer + citations; **guardrail system prompt**, **rate limiting**, and a **spend cap**. Needs a Cloudflare account. *Test: Worker unit tests with mocked AI binding. Blocked by: B.*
- [ ] **D. Chat widget UI** (AFK) — embeddable bubble that calls the endpoint, renders the answer with source links and loading/error states; additive, no layout change; CORS to `workers.dev`. *Test: `tests/chat-widget.test.js` — jsdom render, loading/error states. Blocked by: C.*
- [ ] **E. Safety & cost guardrail pass** (HITL) — verify it **refuses/deflects medical & legal advice** with a visible disclaimer, citations are correct, rate-limit/spend-cap hold under abuse, and update the privacy policy. **Merge to `main` happens only after this passes.** *Blocked by: D.*
- [ ] **F. (Optional) Same-origin route + custom domain** (HITL) — only if DNS moves to Cloudflare: serve the Worker at `/api/chat` for no-CORS + zone rate-limiting. *Blocked by: D.*

## Constraints / guardrails

- **Grounded strictly in ADSC content**; cite sources (link to the blog/FAQ).
- **No medical or clinical or legal advice** — refuse and redirect to professionals, with a visible disclaimer. (Highest-priority safety rule for an autism nonprofit.)
- **Rate limiting + hard spend cap** so a bot cannot run up the bill ("minimal cost" is a requirement, not a hope).
- **Privacy**: log questions minimally, no PII; disclose in the privacy policy (shared with issue 014's `/privacy`).
- **Additive**: the chat is an embedded widget; the current site's look/behavior and tests are unchanged.
- **Decoupled** from the domain/DNS/email decisions — works on `workers.dev` today; same-origin is an optional later enhancement.

## Acceptance criteria (epic-level)

- [ ] Build step produces an embeddings manifest from site content (chunker + retrieval unit-tested, TDD).
- [ ] Endpoint returns a grounded answer with citations for an in-corpus question, and a safe deflection for a medical/legal question.
- [ ] Rate limiting + spend cap demonstrably bound cost.
- [ ] Chat widget embeds on the site with **no change to existing layout/behavior**; full test suite stays green.
- [ ] Privacy policy covers chat data handling.

## Blocked by

- 011 (content manifests) — the RAG corpus is built from existing content.
