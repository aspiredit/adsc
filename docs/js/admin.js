/**
 * On-site Events admin (docs/admin/events.html).
 *
 * A static-site "mini CMS" for events: it reads and writes docs/_data/events.json
 * directly through the GitHub Contents API using a fine-grained Personal Access
 * Token that the admin pastes in (stored only in this browser's localStorage —
 * never committed). After a save, the normal Pages deploy (~1 min) publishes it,
 * and the existing calendar picks it up automatically.
 *
 * Security model: the page is public HTML, but it can do nothing without a valid
 * token scoped to Contents:write on this one repo. Treat the token like a
 * password; use "Forget token" on shared computers; revoke it anytime in GitHub.
 *
 * Pure helpers (slug/id/timezone/event-building/list mutation) are exported and
 * unit-tested in tests/admin.test.js. DOM glue lives in init().
 */

const REPO_OWNER = "aspiredit";
const REPO_NAME = "adsc";
const BRANCH = "main";
const EVENTS_PATH = "docs/_data/events.json";
const FLYER_DIR = "docs/assets/events";
const TOKEN_KEY = "adsc_gh_token";
const API = "https://api.github.com";

const EVENT_TYPES = [
  { value: "meetup", label: "Dads-only meetup" },
  { value: "family_event", label: "Family event (bring kids)" },
  { value: "fundraiser", label: "Fundraiser" },
  { value: "other", label: "Other" },
];
const STATUSES = [
  { value: "scheduled", label: "Scheduled" },
  { value: "cancelled", label: "Cancelled (show banner)" },
  { value: "postponed", label: "Postponed (show banner)" },
];

// ---------- pure helpers ----------

export function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function makeEventId(dateStr, title) {
  // dateStr: "YYYY-MM-DD". Mirrors the CMS convention e.g. 2026-06-13-slick-willies.
  const slug = slugify(title) || "event";
  return dateStr ? `${dateStr}-${slug}` : slug;
}

// Minutes that America/Chicago is offset from UTC for a given wall-clock time.
// Negative (e.g. -300 = CDT in summer, -360 = CST in winter). Works regardless
// of the browser's own timezone via the toLocaleString-difference trick.
export function chicagoOffsetMinutes(naiveLocal) {
  const [datePart, timePart = "00:00"] = String(naiveLocal).split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const guess = new Date(Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0));
  const tzWall = new Date(guess.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const utcWall = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((tzWall - utcWall) / 60000);
}

export function formatOffset(minutes) {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

// "2026-06-06T18:30" -> "2026-06-06T18:30:00-05:00" (ISO 8601 with CT offset),
// the exact format the renderer and Pages CMS use.
export function toChicagoIso(naiveLocal) {
  if (!naiveLocal) return "";
  const off = formatOffset(chicagoOffsetMinutes(naiveLocal));
  return `${naiveLocal}:00${off}`;
}

// Build an event record matching docs/_data/events.json's schema. Optional
// fields are omitted when empty so the file stays clean.
export function buildEventObject(form) {
  const datePart = (form.datetime || "").split("T")[0] || "";
  const event = {
    id: form.id || makeEventId(datePart, form.title),
    title: (form.title || "").trim(),
    type: form.type || "meetup",
    starts_at: toChicagoIso(form.datetime),
    location: (form.location || "").trim(),
    description: (form.description || "").trim(),
    flyer: (form.flyer || "").trim(),
    status: form.status || "scheduled",
    draft: form.draft === true,
  };
  if (form.rsvp_url && form.rsvp_url.trim()) event.rsvp_url = form.rsvp_url.trim();
  if (form.cta_label && form.cta_label.trim()) event.cta_label = form.cta_label.trim();
  return event;
}

// Replace an event with the same id, otherwise append. Returns a new array.
export function upsertEvent(events, event) {
  const list = Array.isArray(events) ? events.slice() : [];
  const idx = list.findIndex((e) => e.id === event.id);
  if (idx >= 0) list[idx] = event;
  else list.push(event);
  return list;
}

export function deleteEventById(events, id) {
  return (Array.isArray(events) ? events : []).filter((e) => e.id !== id);
}

export function sortByStartDesc(events) {
  return (Array.isArray(events) ? events.slice() : []).sort((a, b) =>
    String(b.starts_at || "").localeCompare(String(a.starts_at || ""))
  );
}

export function validateEventForm(form) {
  const errors = [];
  if (!form.title || !form.title.trim()) errors.push("Title is required.");
  if (!form.datetime) errors.push("Date & time is required.");
  if (!form.location || !form.location.trim()) errors.push("Location is required.");
  return errors;
}

// base64 <-> UTF-8 string (browser-safe).
export function encodeBase64Utf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
export function decodeBase64Utf8(b64) {
  return decodeURIComponent(escape(atob(String(b64).replace(/\s/g, ""))));
}

// ---------- GitHub API ----------

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghGetFile(token, path) {
  const url = `${API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`;
  const res = await fetch(url, { headers: authHeaders(token), cache: "no-store" });
  if (res.status === 404) return { sha: null, json: { events: [] } };
  if (!res.ok) throw new Error(`GitHub read failed (${res.status}). Check the token and its permissions.`);
  const data = await res.json();
  return { sha: data.sha, json: JSON.parse(decodeBase64Utf8(data.content)) };
}

async function ghPutFile(token, path, contentStr, sha, message) {
  const url = `${API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const body = {
    message,
    content: encodeBase64Utf8(contentStr),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, { method: "PUT", headers: authHeaders(token), body: JSON.stringify(body) });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`GitHub write failed (${res.status}). ${detail.slice(0, 180)}`);
  }
  return res.json();
}

async function ghPutBinary(token, path, base64Content, message) {
  const url = `${API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ message, content: base64Content, branch: BRANCH }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Flyer upload failed (${res.status}). ${detail.slice(0, 180)}`);
  }
  return res.json();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]); // strip data: prefix
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- DOM glue ----------

function el(id) {
  return document.getElementById(id);
}

function setMsg(node, text, kind = "") {
  if (!node) return;
  node.textContent = text || "";
  node.dataset.kind = kind;
}

function optionsHtml(items, selected) {
  return items
    .map((o) => `<option value="${o.value}"${o.value === selected ? " selected" : ""}>${o.label}</option>`)
    .join("");
}

function fmtWhen(starts_at) {
  if (!starts_at) return "";
  const d = new Date(starts_at);
  if (Number.isNaN(d.getTime())) return starts_at;
  return d.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function renderList(container, events, onDelete) {
  container.innerHTML = "";
  const list = sortByStartDesc(events);
  if (list.length === 0) {
    container.innerHTML = `<p class="admin-empty">No events yet.</p>`;
    return;
  }
  for (const ev of list) {
    const row = document.createElement("div");
    row.className = "admin-row";
    const draftTag = ev.draft ? ` <span class="admin-tag">draft</span>` : "";
    const statusTag = ev.status && ev.status !== "scheduled" ? ` <span class="admin-tag admin-tag--warn">${ev.status}</span>` : "";
    row.innerHTML = `
      <div class="admin-row-main">
        <strong>${ev.title || "(untitled)"}</strong>${draftTag}${statusTag}
        <div class="admin-row-sub">${fmtWhen(ev.starts_at)} · ${ev.location || ""}</div>
      </div>
      <button type="button" class="admin-del" data-id="${ev.id}">Delete</button>
    `;
    row.querySelector(".admin-del").addEventListener("click", () => onDelete(ev.id));
    container.appendChild(row);
  }
}

export function init() {
  const authPanel = el("admin-auth");
  const appPanel = el("admin-app");
  const form = el("event-form");
  if (!authPanel || !appPanel || !form) return;

  // Populate selects
  el("f-type").innerHTML = optionsHtml(EVENT_TYPES, "meetup");
  el("f-status").innerHTML = optionsHtml(STATUSES, "scheduled");

  let token = "";
  let sha = null;
  let eventsObj = { events: [] };

  const authStatus = el("auth-status");
  const formMsg = el("form-msg");
  const listEl = el("events-list");

  async function connect(candidate, remember) {
    setMsg(authStatus, "Connecting…");
    try {
      const { sha: newSha, json } = await ghGetFile(candidate, EVENTS_PATH);
      token = candidate;
      sha = newSha;
      eventsObj = json && Array.isArray(json.events) ? json : { events: Array.isArray(json) ? json : [] };
      if (remember) localStorage.setItem(TOKEN_KEY, token);
      authPanel.hidden = true;
      appPanel.hidden = false;
      renderList(listEl, eventsObj.events, handleDelete);
      setMsg(authStatus, "");
    } catch (err) {
      setMsg(authStatus, err.message, "error");
    }
  }

  async function persist(message) {
    const contentStr = JSON.stringify(eventsObj, null, 2) + "\n";
    const result = await ghPutFile(token, EVENTS_PATH, contentStr, sha, message);
    sha = result.content.sha; // keep the new sha for the next write
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this event? It will be removed from the live site after the next deploy.")) return;
    setMsg(formMsg, "Deleting…");
    try {
      eventsObj = { ...eventsObj, events: deleteEventById(eventsObj.events, id) };
      await persist(`events: delete ${id} (via admin)`);
      renderList(listEl, eventsObj.events, handleDelete);
      setMsg(formMsg, "Deleted. Live in ~1 minute.", "ok");
    } catch (err) {
      setMsg(formMsg, err.message, "error");
      // reload to recover the correct sha if we drifted
      try { const r = await ghGetFile(token, EVENTS_PATH); sha = r.sha; eventsObj = r.json; renderList(listEl, eventsObj.events, handleDelete); } catch { /* ignore */ }
    }
  }

  el("btn-connect").addEventListener("click", () => {
    const candidate = el("gh-token").value.trim();
    if (!candidate) { setMsg(authStatus, "Paste a token first.", "error"); return; }
    connect(candidate, el("save-token").checked);
  });

  el("btn-logout").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    token = ""; sha = null; eventsObj = { events: [] };
    el("gh-token").value = "";
    appPanel.hidden = true;
    authPanel.hidden = false;
    setMsg(authStatus, "Token forgotten on this device.", "ok");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formValues = {
      title: el("f-title").value,
      type: el("f-type").value,
      datetime: el("f-datetime").value,
      location: el("f-location").value,
      description: el("f-description").value,
      rsvp_url: el("f-rsvp").value,
      cta_label: el("f-cta").value,
      status: el("f-status").value,
      draft: el("f-draft").checked,
      flyer: "",
    };
    const errors = validateEventForm(formValues);
    if (errors.length) { setMsg(formMsg, errors.join(" "), "error"); return; }

    setMsg(formMsg, "Saving…");
    try {
      const datePart = formValues.datetime.split("T")[0];
      const baseId = makeEventId(datePart, formValues.title);

      // Optional flyer upload
      const fileInput = el("f-flyer");
      if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
        const flyerPath = `${FLYER_DIR}/${baseId}.${ext}`;
        const b64 = await fileToBase64(file);
        await ghPutBinary(token, flyerPath, b64, `events: flyer for ${baseId} (via admin)`);
        formValues.flyer = `assets/events/${baseId}.${ext}`; // relative path the renderer expects
      }

      formValues.id = baseId;
      const event = buildEventObject(formValues);
      eventsObj = { ...eventsObj, events: upsertEvent(eventsObj.events, event) };
      await persist(`events: add ${event.id} (via admin)`);
      renderList(listEl, eventsObj.events, handleDelete);
      form.reset();
      el("f-type").value = "meetup";
      el("f-status").value = "scheduled";
      setMsg(formMsg, "Saved! It will appear on the calendar in ~1 minute (hard-refresh the site).", "ok");
    } catch (err) {
      setMsg(formMsg, err.message, "error");
      try { const r = await ghGetFile(token, EVENTS_PATH); sha = r.sha; eventsObj = r.json; renderList(listEl, eventsObj.events, handleDelete); } catch { /* ignore */ }
    }
  });

  // Auto-connect if a token was remembered on this device.
  const saved = localStorage.getItem(TOKEN_KEY);
  if (saved) {
    el("gh-token").value = saved;
    el("save-token").checked = true;
    connect(saved, true);
  }
}
