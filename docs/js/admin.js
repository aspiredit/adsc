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

import { eventStartIso, eventEndIso } from "./eventtime.js";

const REPO_OWNER = "aspiredit";
const REPO_NAME = "adsc";
const BRANCH = "main";
const EVENTS_PATH = "docs/_data/events.json";
const FLIERS_PATH = "docs/_data/fliers.json";
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

// Build an event record matching docs/_data/events.json's schema. Date and time
// are stored as SEPARATE fields (date / start_time / end_time); the site derives
// ISO starts_at/ends_at from them at load. Optional fields are omitted when empty.
export function buildEventObject(form) {
  const event = {
    id: form.id || makeEventId(form.date, form.title),
    title: (form.title || "").trim(),
    type: form.type || "meetup",
    date: form.date || "",
    start_time: form.start_time || "",
    end_time: form.end_time || "",
    location: (form.location || "").trim(),
    description: (form.description || "").trim(),
    flyer: (form.flyer || "").trim(),
    status: form.status || "scheduled",
    draft: form.draft === true,
  };
  if (!event.end_time) delete event.end_time;
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
    String(eventStartIso(b) || "").localeCompare(String(eventStartIso(a) || ""))
  );
}

export function validateEventForm(form) {
  const errors = [];
  if (!form.title || !form.title.trim()) errors.push("Title is required.");
  if (!form.date) errors.push("Date is required.");
  if (!form.start_time) errors.push("Start time is required.");
  if (!form.location || !form.location.trim()) errors.push("Location is required.");
  return errors;
}

// ---------- fliers (standalone "save the date" images) ----------

export function makeFlierId(caption, dateStr) {
  const slug = slugify(caption) || "flier";
  return dateStr ? `${dateStr}-${slug}` : slug;
}

export function buildFlierObject(form) {
  const flier = {
    id: form.id || makeFlierId(form.caption, form.date),
    image: (form.image || "").trim(),
    caption: (form.caption || "").trim(),
  };
  if (form.date) flier.date = form.date;
  if (form.link && form.link.trim()) flier.link = form.link.trim();
  return flier;
}

export function validateFlierForm(form) {
  const errors = [];
  if (!form.caption || !form.caption.trim()) errors.push("Caption is required.");
  if (!form.image) errors.push("A flier image is required.");
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

async function ghGetFile(token, path, emptyJson = { events: [] }) {
  const url = `${API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`;
  const res = await fetch(url, { headers: authHeaders(token), cache: "no-store" });
  if (res.status === 404) return { sha: null, json: emptyJson };
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

function fmtWhen(event) {
  const iso = eventStartIso(event);
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const start = d.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
  const endIso = eventEndIso(event);
  if (endIso) {
    const e = new Date(endIso);
    if (!Number.isNaN(e.getTime())) {
      const endTime = e.toLocaleString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" });
      return `${start} – ${endTime}`;
    }
  }
  return start;
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
        <div class="admin-row-sub">${fmtWhen(ev)} · ${ev.location || ""}</div>
      </div>
      <button type="button" class="admin-del" data-id="${ev.id}">Delete</button>
    `;
    row.querySelector(".admin-del").addEventListener("click", () => onDelete(ev.id));
    container.appendChild(row);
  }
}

function renderFliersList(container, fliers, onDelete) {
  container.innerHTML = "";
  const list = Array.isArray(fliers) ? fliers : [];
  if (list.length === 0) {
    container.innerHTML = `<p class="admin-empty">No standalone fliers yet.</p>`;
    return;
  }
  for (const fl of list) {
    const row = document.createElement("div");
    row.className = "admin-row";
    const when = fl.date ? ` · ${fl.date}` : "";
    row.innerHTML = `
      <div class="admin-row-main">
        <strong>${fl.caption || "(no caption)"}</strong>
        <div class="admin-row-sub">${(fl.image || "").replace(/^.*\//, "")}${when}</div>
      </div>
      <button type="button" class="admin-del" data-id="${fl.id}">Delete</button>
    `;
    row.querySelector(".admin-del").addEventListener("click", () => onDelete(fl.id));
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
  let fliersSha = null;
  let fliersObj = { fliers: [] };

  const authStatus = el("auth-status");
  const formMsg = el("form-msg");
  const listEl = el("events-list");
  const flierForm = el("flier-form");
  const flierMsg = el("flier-msg");
  const fliersListEl = el("fliers-list");

  async function connect(candidate, remember) {
    setMsg(authStatus, "Connecting…");
    try {
      const { sha: newSha, json } = await ghGetFile(candidate, EVENTS_PATH);
      token = candidate;
      sha = newSha;
      eventsObj = json && Array.isArray(json.events) ? json : { events: Array.isArray(json) ? json : [] };
      // Fliers live in a second file; tolerate it not existing yet.
      try {
        const fr = await ghGetFile(candidate, FLIERS_PATH, { fliers: [] });
        fliersSha = fr.sha;
        fliersObj = fr.json && Array.isArray(fr.json.fliers) ? fr.json : { fliers: [] };
      } catch { fliersSha = null; fliersObj = { fliers: [] }; }
      if (remember) localStorage.setItem(TOKEN_KEY, token);
      authPanel.hidden = true;
      appPanel.hidden = false;
      renderList(listEl, eventsObj.events, handleDelete);
      if (fliersListEl) renderFliersList(fliersListEl, fliersObj.fliers, handleDeleteFlier);
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

  async function persistFliers(message) {
    const contentStr = JSON.stringify(fliersObj, null, 2) + "\n";
    const result = await ghPutFile(token, FLIERS_PATH, contentStr, fliersSha, message);
    fliersSha = result.content.sha;
  }

  async function reloadFliers() {
    try {
      const r = await ghGetFile(token, FLIERS_PATH, { fliers: [] });
      fliersSha = r.sha;
      fliersObj = r.json && Array.isArray(r.json.fliers) ? r.json : { fliers: [] };
      renderFliersList(fliersListEl, fliersObj.fliers, handleDeleteFlier);
    } catch { /* ignore */ }
  }

  async function handleDeleteFlier(id) {
    if (!window.confirm("Delete this flier? It will be removed from the live site after the next deploy.")) return;
    setMsg(flierMsg, "Deleting…");
    try {
      fliersObj = { ...fliersObj, fliers: deleteEventById(fliersObj.fliers, id) };
      await persistFliers(`fliers: delete ${id} (via admin)`);
      renderFliersList(fliersListEl, fliersObj.fliers, handleDeleteFlier);
      setMsg(flierMsg, "Deleted. Live in ~1 minute.", "ok");
    } catch (err) {
      setMsg(flierMsg, err.message, "error");
      await reloadFliers();
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
    fliersSha = null; fliersObj = { fliers: [] };
    el("gh-token").value = "";
    appPanel.hidden = true;
    authPanel.hidden = false;
    setMsg(authStatus, "Token forgotten on this device.", "ok");
  });

  if (flierForm) {
    flierForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fileInput = el("fl-image");
      const hasFile = !!(fileInput.files && fileInput.files[0]);
      const values = {
        caption: el("fl-caption").value,
        date: el("fl-date").value,
        link: el("fl-link").value,
        image: hasFile ? fileInput.files[0].name : "",
      };
      const errors = validateFlierForm(values);
      if (errors.length) { setMsg(flierMsg, errors.join(" "), "error"); return; }

      setMsg(flierMsg, "Saving…");
      try {
        const baseId = makeFlierId(values.caption, values.date);
        const file = fileInput.files[0];
        const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
        const imgPath = `${FLYER_DIR}/flier-${baseId}.${ext}`;
        const b64 = await fileToBase64(file);
        await ghPutBinary(token, imgPath, b64, `fliers: image for ${baseId} (via admin)`);

        const flier = buildFlierObject({ ...values, id: baseId, image: `assets/events/flier-${baseId}.${ext}` });
        fliersObj = { ...fliersObj, fliers: upsertEvent(fliersObj.fliers, flier) };
        await persistFliers(`fliers: add ${flier.id} (via admin)`);
        renderFliersList(fliersListEl, fliersObj.fliers, handleDeleteFlier);
        flierForm.reset();
        setMsg(flierMsg, "Saved! It appears in “Save the date” in ~1 minute (hard-refresh the site).", "ok");
      } catch (err) {
        setMsg(flierMsg, err.message, "error");
        await reloadFliers();
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formValues = {
      title: el("f-title").value,
      type: el("f-type").value,
      date: el("f-date").value,
      start_time: el("f-start").value,
      end_time: el("f-end").value,
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
      const baseId = makeEventId(formValues.date, formValues.title);

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
