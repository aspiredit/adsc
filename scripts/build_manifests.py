#!/usr/bin/env python3
"""
Build JSON manifests for blog posts and photos from individual markdown files.

The browser can't enumerate files in a directory, and Pages CMS writes each
record as its own .md file. This script assembles those into a single JSON
manifest per content type, which the renderer fetches once.

Runs on every push that touches `_data/{blogs,photos}/**` via
`.github/workflows/build-manifests.yml`. Idempotent — safe to run locally.

See: issues/011-content-manifests.md, ADR-0001 (Pages CMS), ADR-0002 (CSR).
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path
from typing import Any

import bleach
import markdown
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "_data"
BLOGS_DIR = DATA_DIR / "blogs"
PHOTOS_DIR = DATA_DIR / "photos"
BLOGS_OUT = DATA_DIR / "blogs.json"          # public: published posts only
BLOGS_ALL_OUT = DATA_DIR / "blogs-all.json"  # preview: includes drafts (?preview=true)
PHOTOS_OUT = DATA_DIR / "photos.json"

# Sanitization allow-list — conservative. Markdown produces these tags; anything
# else (script, iframe, on* handlers, style attrs) gets stripped silently.
ALLOWED_TAGS = [
    "p", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "em", "b", "i", "u", "s", "del", "ins", "mark",
    "ul", "ol", "li",
    "blockquote", "pre", "code",
    "a", "img",
    "table", "thead", "tbody", "tr", "th", "td",
    "sup", "sub",
    "figure", "figcaption",
]
ALLOWED_ATTRS = {
    "a": ["href", "title", "rel", "target"],
    "img": ["src", "alt", "title", "loading"],
    "th": ["align"],
    "td": ["align"],
}
ALLOWED_PROTOCOLS = ["http", "https", "mailto"]

DATE_PREFIX = re.compile(r"^(\d{4}-\d{2}-\d{2})-(.+)\.md$")


def split_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """Parse `--- yaml --- body` style frontmatter. Returns ({}, text) if absent."""
    if not text.startswith("---"):
        return {}, text
    # find the closing --- on its own line
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    fm_text = text[3:end].strip()
    body = text[end + 4 :].lstrip("\n")
    try:
        fm = yaml.safe_load(fm_text) or {}
    except yaml.YAMLError as exc:
        print(f"  ! YAML parse error: {exc}", file=sys.stderr)
        fm = {}
    if not isinstance(fm, dict):
        fm = {}
    return fm, body


def slug_and_date_from_filename(path: Path) -> tuple[str, str | None]:
    """`2026-05-28-foo.md` → ('foo', '2026-05-28'). Plain `foo.md` → ('foo', None)."""
    match = DATE_PREFIX.match(path.name)
    if match:
        return match.group(2), match.group(1)
    return path.stem, None


def render_markdown(body: str) -> str:
    """Markdown → sanitized HTML."""
    if not body.strip():
        return ""
    html = markdown.markdown(
        body,
        extensions=["tables", "fenced_code", "sane_lists"],
        output_format="html",
    )
    return bleach.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRS,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
    )


def normalize_asset(value: str) -> str:
    """Make a CMS media path relative to the site root.

    Pages CMS writes media as absolute paths ('/assets/images/...'), which only
    resolve when the site is served from the domain root. This site is served
    from a subpath (…/adsc/), so an absolute '/assets' 404s. Strip the
    leading slash to make it root-relative ('assets/images/...'); the renderer
    then prepends the correct depth prefix per page. External URLs are left as-is.
    """
    v = (value or "").strip()
    if not v or v.startswith(("http://", "https://", "//")):
        return v
    return v.lstrip("/")


def build_blog_entry(path: Path) -> dict[str, Any] | None:
    slug, fname_date = slug_and_date_from_filename(path)
    text = path.read_text(encoding="utf-8")
    fm, body = split_frontmatter(text)
    # NOTE: drafts are kept here (with draft=True) so the preview manifest can
    # render them. The PUBLIC manifest filters them out — see build_blog_manifests.
    date_value = fm.get("date") or fname_date
    # yaml may parse a bare date into a date object; coerce to ISO string
    date_str = date_value.isoformat() if hasattr(date_value, "isoformat") else str(date_value or "")
    return {
        "slug": slug,
        "title": fm.get("title", "").strip() or slug.replace("-", " ").title(),
        "date": date_str,
        "author": fm.get("author", "").strip(),
        "author_initials": fm.get("author_initials", "").strip(),
        "cover_image": normalize_asset(fm.get("cover_image", "")),
        "excerpt": fm.get("excerpt", "").strip(),
        "html": render_markdown(body),
        "meta_description": fm.get("meta_description", "").strip(),
        "meta_image": fm.get("meta_image", "").strip(),
        "draft": fm.get("draft") is True,
    }


def build_photo_entry(path: Path) -> dict[str, Any] | None:
    slug, fname_date = slug_and_date_from_filename(path)
    text = path.read_text(encoding="utf-8")
    fm, _ = split_frontmatter(text)
    image = normalize_asset(fm.get("image", ""))
    if not image:
        return None  # photo with no image is meaningless; skip silently
    date_value = fm.get("date") or fname_date
    date_str = date_value.isoformat() if hasattr(date_value, "isoformat") else str(date_value or "")
    return {
        "slug": slug,
        "title": fm.get("title", "").strip(),
        "image": image,
        "caption": fm.get("caption", "").strip(),
        "date": date_str,
    }


def build_manifest(src_dir: Path, builder, out_path: Path) -> int:
    if not src_dir.exists():
        print(f"  (no {src_dir.name}/ directory; writing empty manifest)")
        out_path.write_text("[]\n", encoding="utf-8")
        return 0
    entries = []
    for path in sorted(src_dir.glob("*.md")):
        entry = builder(path)
        if entry is None:
            print(f"  - skipped (draft or invalid): {path.name}")
            continue
        entries.append(entry)
        print(f"  + {path.name}")
    # Sort newest first by date string (ISO sorts lexicographically)
    entries.sort(key=lambda e: e.get("date", ""), reverse=True)
    out_path.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return len(entries)


def build_blog_manifests() -> tuple[int, int]:
    """Build both blog manifests from _data/blogs/.

    Writes two files:
      blogs.json      — published posts only (what the public site loads)
      blogs-all.json  — every post incl. drafts (loaded only in ?preview=true)

    Drafts are kept out of the public file by design (privacy + smaller payload)
    but available in the preview file so authors can review unpublished work
    rendered with the real site theme.
    """
    if not BLOGS_DIR.exists():
        print(f"  (no {BLOGS_DIR.name}/ directory; writing empty manifests)")
        BLOGS_OUT.write_text("[]\n", encoding="utf-8")
        BLOGS_ALL_OUT.write_text("[]\n", encoding="utf-8")
        return 0, 0

    all_entries = []
    for path in sorted(BLOGS_DIR.glob("*.md")):
        entry = build_blog_entry(path)
        if entry is None:
            print(f"  - skipped (invalid): {path.name}")
            continue
        all_entries.append(entry)
        flag = " (draft)" if entry["draft"] else ""
        print(f"  + {path.name}{flag}")
    all_entries.sort(key=lambda e: e.get("date", ""), reverse=True)

    published = [e for e in all_entries if not e["draft"]]
    BLOGS_OUT.write_text(json.dumps(published, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    BLOGS_ALL_OUT.write_text(json.dumps(all_entries, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return len(published), len(all_entries) - len(published)


def main() -> int:
    print("Building blog manifests from", BLOGS_DIR.relative_to(REPO_ROOT))
    n_pub, n_draft = build_blog_manifests()
    print(f"  ->{BLOGS_OUT.relative_to(REPO_ROOT)} ({n_pub} published)")
    print(f"  ->{BLOGS_ALL_OUT.relative_to(REPO_ROOT)} ({n_pub + n_draft} total, {n_draft} draft)")
    print()
    print("Building photo manifest from", PHOTOS_DIR.relative_to(REPO_ROOT))
    n_photos = build_manifest(PHOTOS_DIR, build_photo_entry, PHOTOS_OUT)
    print(f"  ->{PHOTOS_OUT.relative_to(REPO_ROOT)} ({n_photos} photos)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
