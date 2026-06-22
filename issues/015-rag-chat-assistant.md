---
id: 015
title: Context-aware RAG chat assistant (Gen-AI, minimal cost)
type: Epic
status: Backlog (parked)
depends_on: 011
---

## Why

A dad who just got a diagnosis lands on the site at 11pm with questions. A grounded, context-aware chat assistant can answer them instantly from ADSC's *own* content (blog, FAQ, events, about/board) — building trust faster than making them hunt. It must be **accurate (grounded + cited), safe (no medical/legal advice), and cheap**. Parked "good-to-have" on the sidelines; additive, with **no change to the current site**.

## What

A chat widget (bubble) backed by a small serverless RAG endpoint. Because the corpus is tiny (~33 blog posts + FAQ + events), **no vector database is needed**: a build step precomputes embeddings of content chunks into a JSON file in the repo; at query time the endpoint embeds the question, does in-memory similarity, retrieves top-k chunks, and asks a **cheap LLM** (e.g., Gemini Flash / Claude Haiku) for an answer **grounded only in those chunks, with citations** back to the source.

**Recommended backend:** Cloudflare **Worker + Workers AI** (most generous free tier). It is **decoupled from DNS/hosting** — it runs on a free `*.workers.dev` URL called via CORS, so it needs **no domain migration**. If/when DNS moves to Cloudflare (see the domain-migration plan), it can optionally be promoted to a same-origin route (`/api/chat`) for no-CORS + zone rate-limiting — an enhancement, not a requirement.

Tracer-bullet vertical slices (TDD on AFK slices):

- [ ] **A. Content embedding build step** (AFK, TDD) — chunk blog/FAQ/events/about content and precompute an embeddings manifest committed to the repo (mirrors `build_manifests.py`); unit-tested chunker. *Blocked by: 011*
- [ ] **B. Retrieval core** (AFK, TDD) — pure cosine-similarity top-k over the embeddings manifest; unit-tested ranking. *Blocked by: A*
- [ ] **C. Serverless RAG endpoint** (HITL) — Cloudflare Worker: embed question → retrieve → call cheap LLM → return grounded answer + citations; **guardrail system prompt**, **rate limiting**, and a **spend cap**. Needs a Cloudflare account + model API secret. *Blocked by: B*
- [ ] **D. Chat widget UI** (AFK) — embeddable bubble on the site that calls the endpoint, renders the answer with source links and loading/error states; additive, no layout change; CORS handling for `workers.dev`. *Blocked by: C*
- [ ] **E. Safety & cost guardrail pass** (HITL) — verify it **refuses/deflects medical & legal advice** with a visible disclaimer, citations are correct, rate-limit/spend-cap hold under abuse, and update the privacy policy. *Blocked by: D*
- [ ] **F. (Optional) Same-origin route + custom domain** (HITL) — only if DNS moves to Cloudflare: serve the Worker at `/api/chat` for no-CORS + zone rate-limiting. *Blocked by: D*

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
