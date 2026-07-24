#!/usr/bin/env python3
"""
Build the RAG chunk manifest for the chat assistant from existing site content.

The chat assistant grounds its answers in ADSC's own content. This script is the
first, fully-offline half of slice A: it reads the blog manifest, the homepage
FAQ, and the events manifest, splits them into small plain-text chunks, and
writes a single bare JSON array (`_data/chat_chunks.json`) that the embed step
(slice A2) later turns into vectors. No network, no API keys — deterministic and
idempotent so the offline test suite never depends on Cloudflare.

Runs on every push via `.github/workflows/ci.yml`. Safe to run locally.

See: issues/015-rag-chat-assistant.md (frozen "Data contracts"),
     scripts/build_manifests.py (idioms mirrored here).
"""
from __future__ import annotations
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

import bleach

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "_data"
BLOGS_JSON = DATA_DIR / "blogs.json"
EVENTS_JSON = DATA_DIR / "events.json"
INDEX_HTML = REPO_ROOT / "index.html"
CHUNKS_OUT = DATA_DIR / "chat_chunks.json"

# URL patterns — verified against the real codebase, not guessed:
#   blog  -> js/blogs.js detailHref(): "blog/post.html?slug=<slug>"
#            (the contract's example said "detail.html"; the live route is
#            post.html — see report notes)
#   faq   -> index.html <section class="faq"> has NO id anchor, so we link to
#            the page itself.
#   event -> index.html <section class="calendar-section" id="events"> renders
#            events.json, so events anchor to "#events".
BLOG_URL = "blog/post.html?slug={slug}"
FAQ_URL = "index.html"
EVENT_URL = "index.html#events"

# Chunk sizing for blog bodies (characters). "roughly 400-900, never splitting
# mid-sentence if avoidable" — see the slice A1 brief.
CHUNK_MIN = 400
CHUNK_MAX = 900

# Block-level tags whose boundaries mark a paragraph break when we flatten HTML
# to text. Converting these to blank lines keeps words from running together
# ("foo</p><p>bar" -> "foo\n\nbar", not "foobar") before we strip the tags.
_BLOCK_CLOSE = re.compile(
    r"</(?:p|h[1-6]|li|ul|ol|blockquote|pre|div|figure|figcaption|tr)\s*>",
    re.IGNORECASE,
)
_BR = re.compile(r"<br\s*/?>", re.IGNORECASE)
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
_WS_RUN = re.compile(r"[ \t]+")
_SLUG_STRIP = re.compile(r"[^a-z0-9]+")


def slugify(text: str) -> str:
    """Lower-case, hyphenated slug of arbitrary text (for FAQ source ids)."""
    slug = _SLUG_STRIP.sub("-", text.strip().lower()).strip("-")
    return slug or "item"


def html_to_text(html: str) -> str:
    """Flatten sanitized HTML to plain text, preserving paragraph breaks.

    Block boundaries and <br> become newlines first; then bleach strips every
    remaining tag. The result carries no HTML — the guarantee the widget and
    tests depend on.
    """
    if not html:
        return ""
    text = _BR.sub("\n", html)
    text = _BLOCK_CLOSE.sub("\n\n", text)
    text = bleach.clean(text, tags=[], attributes={}, strip=True)
    return text


def normalize_paragraphs(text: str) -> list[str]:
    """Split flattened text into cleaned, non-empty paragraphs."""
    paragraphs = []
    for block in text.split("\n\n"):
        collapsed = _WS_RUN.sub(" ", block.replace("\n", " ")).strip()
        if collapsed:
            paragraphs.append(collapsed)
    return paragraphs


def split_long_paragraph(paragraph: str) -> list[str]:
    """Break an oversized paragraph on sentence boundaries, staying <= CHUNK_MAX."""
    parts = []
    cur = ""
    for sentence in _SENTENCE_SPLIT.split(paragraph):
        if not sentence:
            continue
        if not cur:
            cur = sentence
        elif len(cur) + 1 + len(sentence) <= CHUNK_MAX:
            cur = f"{cur} {sentence}"
        else:
            parts.append(cur)
            cur = sentence
    if cur:
        parts.append(cur)
    return parts


def chunk_text(text: str) -> list[str]:
    """Group paragraphs into ~CHUNK_MIN..CHUNK_MAX blocks without cutting sentences."""
    chunks = []
    cur = ""
    for paragraph in normalize_paragraphs(text):
        if len(paragraph) > CHUNK_MAX:
            if cur:
                chunks.append(cur)
                cur = ""
            chunks.extend(split_long_paragraph(paragraph))
            continue
        if not cur:
            cur = paragraph
        elif len(cur) + 2 + len(paragraph) <= CHUNK_MAX:
            cur = f"{cur}\n\n{paragraph}"
        else:
            chunks.append(cur)
            cur = paragraph
    if cur:
        chunks.append(cur)
    return chunks


def chunk_record(source_type: str, source_id: str, ordinal: int, title: str,
                 url: str, text: str) -> dict[str, Any]:
    """Assemble one chunk record in the frozen data-contract shape."""
    return {
        "id": f"{source_type}:{source_id}#{ordinal}",
        "source_type": source_type,
        "source_id": source_id,
        "title": title,
        "url": url,
        "text": text,
    }


def build_blog_chunks() -> list[dict[str, Any]]:
    if not BLOGS_JSON.exists():
        print(f"  (no {BLOGS_JSON.name}; skipping blogs)")
        return []
    posts = json.loads(BLOGS_JSON.read_text(encoding="utf-8"))
    records = []
    for post in posts:
        if post.get("draft") is True:
            continue  # defensive; blogs.json is published-only already
        slug = post.get("slug", "")
        title = post.get("title", "").strip() or slug
        url = BLOG_URL.format(slug=slug)
        pieces = chunk_text(html_to_text(post.get("html", "")))
        if not pieces:  # body-less post: fall back to the excerpt so it's findable
            excerpt = (post.get("excerpt", "") or "").strip()
            pieces = [excerpt] if excerpt else []
        for ordinal, text in enumerate(pieces):
            records.append(chunk_record("blog", slug, ordinal, title, url, text))
        print(f"  + blog {slug} ({len(pieces)} chunk{'s' if len(pieces) != 1 else ''})")
    return records


class FaqParser(HTMLParser):
    """Extract (question, answer) pairs from <details class="faq-item"> blocks.

    Scoped to the single <section class="faq"> so board/advisor <details>
    elsewhere on the page are ignored. <br> inside answers becomes a space.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_faq_section = False
        self._section_depth = 0
        self.in_item = False
        self.in_summary = False
        self.in_answer = False
        self._question_parts: list[str] = []
        self._answer_parts: list[str] = []
        self.pairs: list[tuple[str, str]] = []

    @staticmethod
    def _has_class(attrs: list[tuple[str, str | None]], name: str) -> bool:
        for key, value in attrs:
            if key == "class" and value and name in value.split():
                return True
        return False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "section":
            if self._has_class(attrs, "faq"):
                self.in_faq_section = True
                self._section_depth = 1
            elif self.in_faq_section:
                self._section_depth += 1
            return
        if not self.in_faq_section:
            return
        if tag == "details" and self._has_class(attrs, "faq-item"):
            self.in_item = True
            self._question_parts = []
            self._answer_parts = []
        elif tag == "summary" and self.in_item:
            self.in_summary = True
        elif tag == "div" and self.in_item and self._has_class(attrs, "faq-answer"):
            self.in_answer = True
        elif tag == "br" and self.in_answer:
            self._answer_parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag == "section" and self.in_faq_section:
            self._section_depth -= 1
            if self._section_depth <= 0:
                self.in_faq_section = False
            return
        if not self.in_faq_section:
            return
        if tag == "summary":
            self.in_summary = False
        elif tag == "div" and self.in_answer:
            self.in_answer = False
        elif tag == "details" and self.in_item:
            question = _WS_RUN.sub(" ", "".join(self._question_parts)).strip()
            answer = _WS_RUN.sub(" ", "".join(self._answer_parts)).strip()
            if question and answer:
                self.pairs.append((question, answer))
            self.in_item = False

    def handle_data(self, data: str) -> None:
        if self.in_summary:
            self._question_parts.append(data)
        elif self.in_answer:
            self._answer_parts.append(data)


def build_faq_chunks() -> list[dict[str, Any]]:
    if not INDEX_HTML.exists():
        print(f"  (no {INDEX_HTML.name}; skipping FAQ)")
        return []
    parser = FaqParser()
    parser.feed(INDEX_HTML.read_text(encoding="utf-8"))
    records = []
    for question, answer in parser.pairs:
        source_id = slugify(question)
        text = f"Q: {question}\nA: {answer}"
        records.append(chunk_record("faq", source_id, 0, question, FAQ_URL, text))
        print(f"  + faq {source_id}")
    return records


def build_event_chunks() -> list[dict[str, Any]]:
    if not EVENTS_JSON.exists():
        print(f"  (no {EVENTS_JSON.name}; skipping events)")
        return []
    data = json.loads(EVENTS_JSON.read_text(encoding="utf-8"))
    events = data.get("events", []) if isinstance(data, dict) else []
    records = []
    for event in events:
        if event.get("draft") is True:
            continue
        event_id = event.get("id", "")
        title = (event.get("title", "") or "").strip()
        lines = [title] if title else []
        date = (event.get("date", "") or "").strip()
        start = (event.get("start_time", "") or "").strip()
        end = (event.get("end_time", "") or "").strip()
        when = date
        if start and end:
            when = f"{date} from {start} to {end}".strip()
        elif start:
            when = f"{date} at {start}".strip()
        if when:
            lines.append(f"When: {when}")
        location = (event.get("location", "") or "").strip()
        if location:
            lines.append(f"Where: {location}")
        description = (event.get("description", "") or "").strip()
        if description:
            lines.append("")
            lines.append(_WS_RUN.sub(" ", description.replace("\n", " ")).strip())
        text = "\n".join(lines).strip()
        records.append(chunk_record("event", event_id, 0, title or event_id, EVENT_URL, text))
        print(f"  + event {event_id}")
    return records


def main() -> int:
    print("Building chat chunks for", CHUNKS_OUT.relative_to(REPO_ROOT))
    records: list[dict[str, Any]] = []
    print("Blogs:")
    blog_records = build_blog_chunks()
    print("FAQ:")
    faq_records = build_faq_chunks()
    print("Events:")
    event_records = build_event_chunks()
    records = blog_records + faq_records + event_records
    # Deterministic ordering independent of dict/file iteration quirks: sort by
    # source_type, then source_id, then ordinal. Running the build twice yields
    # byte-identical output.
    records.sort(key=lambda r: (r["source_type"], r["source_id"], int(r["id"].rsplit("#", 1)[1])))
    CHUNKS_OUT.write_text(
        json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(
        f"  ->{CHUNKS_OUT.relative_to(REPO_ROOT)} "
        f"({len(records)} chunks: {len(blog_records)} blog, "
        f"{len(faq_records)} faq, {len(event_records)} event)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
