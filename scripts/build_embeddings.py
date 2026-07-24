#!/usr/bin/env python3
"""
Embed the chat chunks into vectors — the second half of slice A (slice A2).

Reads `_data/chat_chunks.json` (produced by build_chat_index.py), sends each
chunk's text to Cloudflare Workers AI (`@cf/baai/bge-base-en-v1.5`) in batches,
and writes `_data/chat_embeddings.json` — the tiny in-repo "vector DB" the
Worker loads at query time. No vector database needed; the corpus is ~180
chunks (see issues/015-rag-chat-assistant.md).

Credentials come from the environment, never from a committed file (this is a
public repo):
  CLOUDFLARE_ACCOUNT_ID   required for a real run
  CLOUDFLARE_API_TOKEN    required for a real run (scope: Workers AI, Read)

Offline test mode (no network, no credentials):
  ADSC_EMBED_FAKE=1       generate deterministic pseudo-embeddings instead of
                          calling the API. FOR TESTS ONLY — never commit a
                          manifest built this way.
  ADSC_EMBED_OUT=<path>   override the output path (tests write to a temp file).

See: issues/015-rag-chat-assistant.md (frozen "Data contracts"),
     scripts/build_chat_index.py (produces the input),
     worker/retrieve.js (consumes the output at query time).
"""
from __future__ import annotations
import hashlib
import json
import math
import os
import random
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "_data"
CHUNKS_IN = DATA_DIR / "chat_chunks.json"
EMB_OUT = DATA_DIR / "chat_embeddings.json"

MODEL = "@cf/baai/bge-base-en-v1.5"
DIM = 768                # bge-base-en-v1.5 output dimensionality
BATCH = 50               # texts per API call (bge tolerates ~100; 50 is safe)
API_TMPL = "https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{model}"


def load_env_file(path: Path) -> None:
    """Populate os.environ from a local .env file (no dependency).

    Simple `KEY=value` lines; `#` comments and blanks ignored. Existing
    environment variables win, so an explicit export or CI secret always
    overrides the file. Missing file is a silent no-op.
    """
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def fake_embedding(text: str, dim: int = DIM) -> list[float]:
    """Deterministic unit-length pseudo-embedding for offline tests.

    Seeded from a hash of the text so a given chunk always maps to the same
    vector across runs and platforms (random.Random(int) is deterministic).
    This is NOT a real embedding — it exists only so the manifest-shape test
    can run the full pipeline without a token. Never commit a manifest built
    from these vectors.
    """
    seed = int.from_bytes(hashlib.sha256(text.encode("utf-8")).digest()[:8], "big")
    rng = random.Random(seed)
    vec = [rng.uniform(-1.0, 1.0) for _ in range(dim)]
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def embed_batch_remote(texts: list[str], account: str, token: str) -> list[list[float]]:
    """Embed a batch of texts via the Workers AI REST API. Raises on failure."""
    url = API_TMPL.format(account=account, model=MODEL)
    payload = json.dumps({"text": texts}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.load(resp)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"Workers AI HTTP {exc.code}: {detail}") from exc
    if not body.get("success", False):
        raise RuntimeError(f"Workers AI error: {body.get('errors')}")
    data = body.get("result", {}).get("data")
    if not isinstance(data, list) or len(data) != len(texts):
        raise RuntimeError("Workers AI returned an unexpected result shape")
    return data


def embed_texts(texts: list[str], *, fake: bool, account: str, token: str) -> list[list[float]]:
    """Embed all texts, batching real API calls. Fake mode stays fully offline."""
    if fake:
        return [fake_embedding(t) for t in texts]
    vectors: list[list[float]] = []
    for start in range(0, len(texts), BATCH):
        batch = texts[start : start + BATCH]
        vectors.extend(embed_batch_remote(batch, account, token))
        print(f"  + embedded {min(start + BATCH, len(texts))}/{len(texts)}")
    return vectors


def build_manifest(chunks: list[dict[str, Any]], vectors: list[list[float]],
                   built: str) -> dict[str, Any]:
    """Assemble the frozen embeddings-manifest shape."""
    if len(chunks) != len(vectors):
        raise RuntimeError("chunk/vector count mismatch")
    dim = len(vectors[0]) if vectors else DIM
    if any(len(v) != dim for v in vectors):
        raise RuntimeError("inconsistent embedding dimensionality")
    return {
        "model": MODEL,
        "dim": dim,
        "built": built,
        "chunks": [{**chunk, "embedding": vec} for chunk, vec in zip(chunks, vectors)],
    }


def main() -> int:
    load_env_file(REPO_ROOT / ".env")
    fake = bool(os.environ.get("ADSC_EMBED_FAKE"))
    out_path = Path(os.environ.get("ADSC_EMBED_OUT", EMB_OUT))
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")

    if not CHUNKS_IN.exists():
        print(f"  ! missing {CHUNKS_IN.relative_to(REPO_ROOT)} — run build_chat_index.py first",
              file=sys.stderr)
        return 1
    chunks = json.loads(CHUNKS_IN.read_text(encoding="utf-8"))

    if not fake and (not account or not token):
        print("  ! CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set "
              "(or ADSC_EMBED_FAKE=1 for offline tests)", file=sys.stderr)
        return 2

    mode = "FAKE (offline test)" if fake else f"Workers AI {MODEL}"
    print(f"Embedding {len(chunks)} chunks via {mode}")
    texts = [c["text"] for c in chunks]
    vectors = embed_texts(texts, fake=fake, account=account, token=token)

    manifest = build_manifest(chunks, vectors, built=date.today().isoformat())
    out_path.write_text(
        json.dumps(manifest, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"  ->{out_path} ({len(manifest['chunks'])} chunks, dim {manifest['dim']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
