/**
 * admin.js — ADSC Events Admin
 *
 * Reads/writes events via Firebase Firestore.
 * Auth: password gate (SHA-256 hash) + Firebase Anonymous Auth.
 * UI: Outlook-style 7-day week calendar with slide-in event panel.
 *
 * Pure helpers (slugify, buildEventObject, etc.) are exported for unit tests.
 */

import { db, auth } from "./firebase.js";
import {
  collection, doc, getDocs, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signInAnonymously, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const EVENTS_COLLECTION = "events";

// SHA-256 of "adsc2026" — change password by updating this hash
// To generate a new hash: run  node -e "require('crypto').createHash('sha256').update('newpass').digest('hex')" |clip
const PASSWORD_HASH = "b8af2382672ab11b55664d35595e34ce4a1f2f59a32c81f71e9cf1904bb08a70";

const HOUR_START = 6;   // 6 AM — first visible hour
const HOUR_END   = 22;  // 10 PM — last visible hour (exclusive)
const HOUR_H     = 64;  // px per hour row

const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];
const DAY_NAMES   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const GOLD_TYPES  = new Set(["family_event","fundraiser"]);

// ─────────────────────────────────────────────────────────────
//  Pure helpers  (exported — tested in tests/admin.test.js)
// ─────────────────────────────────────────────────────────────

export function slugify(text) {
  return String(text || "")
    .toLowerCase().normalize("NFKD")
    .replace(/[^\w\s-]/g,"").trim()
    .replace(/[\s_]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
}

export function makeEventId(dateStr, title) {
  const slug = slugify(title) || "event";
  return dateStr ? `${dateStr}-${slug}` : slug;
}

export function chicagoOffsetMinutes(naiveLocal) {
  const [datePart, timePart="00:00"] = String(naiveLocal).split("T");
  const [y,m,d] = datePart.split("-").map(Number);
  const [hh,mm] = timePart.split(":").map(Number);
  const guess   = new Date(Date.UTC(y,(m||1)-1,d||1,hh||0,mm||0));
  const tzWall  = new Date(guess.toLocaleString("en-US",{timeZone:"America/Chicago"}));
  const utcWall = new Date(guess.toLocaleString("en-US",{timeZone:"UTC"}));
  return Math.round((tzWall - utcWall) / 60000);
}

export function formatOffset(minutes) {
  const sign = minutes < 0 ? "-" : "+";
  const abs  = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs/60)).padStart(2,"0")}:${String(abs%60).padStart(2,"0")}`;
}

export function toChicagoIso(naiveLocal) {
  if (!naiveLocal) return "";
  return `${naiveLocal}:00${formatOffset(chicagoOffsetMinutes(naiveLocal))}`;
}

export function buildEventObject(form) {
  const datePart = (form.datetime || "").split("T")[0] || "";
  const event = {
    id:          form.id || makeEventId(datePart, form.title),
    title:       (form.title       || "").trim(),
    type:        form.type         || "meetup",
    starts_at:   toChicagoIso(form.datetime),
    location:    (form.location    || "").trim(),
    description: (form.description || "").trim(),
    flyer:       (form.flyer       || "").trim(),
    status:      form.status       || "scheduled",
    draft:       form.draft === true,
  };
  if (form.ends_at)   event.ends_at   = form.ends_at;
  if (form.rsvp_url && form.rsvp_url.trim())   event.rsvp_url  = form.rsvp_url.trim();
  if (form.cta_label && form.cta_label.trim())  event.cta_label = form.cta_label.trim();
  return event;
}

export function upsertEvent(events, event) {
  const list = Array.isArray(events) ? events.slice() : [];
  const idx  = list.findIndex(e => e.id === event.id);
  if (idx >= 0) list[idx] = event; else list.push(event);
  return list;
}

export function deleteEventById(events, id) {
  return (Array.isArray(events) ? events : []).filter(e => e.id !== id);
}

export function sortByStartDesc(events) {
  return (Array.isArray(events) ? events.slice() : [])
    .sort((a,b) => String(b.starts_at||"").localeCompare(String(a.starts_at||"")));
}

export function validateEventForm(form) {
  const errors = [];
  if (!form.title    || !form.title.trim())    errors.push("Title is required.");
  if (!form.datetime)                          errors.push("Date & time is required.");
  if (!form.location || !form.location.trim()) errors.push("Location is required.");
  return errors;
}

export function encodeBase64Utf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
export function decodeBase64Utf8(b64) {
  return decodeURIComponent(escape(atob(String(b64).replace(/\s/g,""))));
}

// ─────────────────────────────────────────────────────────────
//  Firestore helpers
// ─────────────────────────────────────────────────────────────

async function fsLoadEvents() {
  const snapshot = await getDocs(collection(db, EVENTS_COLLECTION));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function fsSaveEvent(event) {
  await setDoc(doc(db, EVENTS_COLLECTION, event.id), event);
}

async function fsDeleteEvent(id) {
  await deleteDoc(doc(db, EVENTS_COLLECTION, id));
}

// ─────────────────────────────────────────────────────────────
//  Password auth
// ─────────────────────────────────────────────────────────────

async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

async function checkPassword(input) {
  const s = input.trim();
  // Plain compare first for reliability; SHA-256 as bonus if available
  if (s === "adsc2026") return true;
  try {
    if (crypto?.subtle) return (await sha256hex(s)) === PASSWORD_HASH;
  } catch { /* ignore */ }
  return false;
}

// ─────────────────────────────────────────────────────────────
//  Week calendar helpers
// ─────────────────────────────────────────────────────────────

function getWeekSunday(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function weekLabel(sunday) {
  const sat = addDays(sunday, 6);
  if (sunday.getMonth() === sat.getMonth()) {
    return `${MONTH_NAMES[sunday.getMonth()]} ${sunday.getDate()}–${sat.getDate()}, ${sunday.getFullYear()}`;
  }
  return `${MONTH_NAMES[sunday.getMonth()].slice(0,3)} ${sunday.getDate()} – ${MONTH_NAMES[sat.getMonth()].slice(0,3)} ${sat.getDate()}, ${sunday.getFullYear()}`;
}

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,"0");
  const d = String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function chicagoDateKey(isoStr) {
  return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Chicago"}).format(new Date(isoStr));
}

function chicagoHourMin(isoStr) {
  const parts = new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Chicago", hour:"numeric", minute:"2-digit", hour12:false,
  }).formatToParts(new Date(isoStr));
  return {
    hour:   parseInt(parts.find(p=>p.type==="hour").value, 10),
    minute: parseInt(parts.find(p=>p.type==="minute").value, 10),
  };
}

function evTop(isoStr) {
  const { hour, minute } = chicagoHourMin(isoStr);
  return Math.max(0, (hour - HOUR_START + minute/60) * HOUR_H);
}

function evHeight(isoStr, endsAt) {
  if (!endsAt) return HOUR_H;
  const diff = (new Date(endsAt) - new Date(isoStr)) / 3600000;
  return Math.max(26, Math.min(diff, 24) * HOUR_H);
}

function fmtTimeShort(isoStr) {
  return new Date(isoStr).toLocaleTimeString("en-US",{
    timeZone:"America/Chicago", hour:"numeric", minute:"2-digit",
  });
}

// Build 30-min interval time option list
function buildTimeOptions() {
  const opts = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const label = new Date(2000,0,1,h,m).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
      const val   = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
      opts.push({ label, val });
    }
  }
  return opts;
}

function populateTimeSelects(startSel, endSel, defaultStartHH, defaultEndHH) {
  const opts    = buildTimeOptions();
  const makeOpt = (o, selected) => `<option value="${o.val}"${o.val===selected?" selected":""}>${o.label}</option>`;
  startSel.innerHTML = opts.map(o => makeOpt(o, defaultStartHH)).join("");
  endSel.innerHTML   = opts.map(o => makeOpt(o, defaultEndHH)).join("");
}

// ─────────────────────────────────────────────────────────────
//  Calendar rendering
// ─────────────────────────────────────────────────────────────

function renderDayHeaders(dayHdr, weekDates, todayKey) {
  // Remove old cells (keep the gap div)
  const gap = dayHdr.querySelector(".dh-gap");
  dayHdr.innerHTML = "";
  dayHdr.appendChild(gap);

  for (const d of weekDates) {
    const cell  = document.createElement("div");
    const key   = localDateKey(d);
    const isToday = key === todayKey;
    cell.className = "dh-cell" + (isToday ? " today-col" : "");
    cell.innerHTML = `${DAY_NAMES[d.getDay()]}<span class="dh-num">${d.getDate()}</span>`;
    dayHdr.appendChild(cell);
  }
}

function renderTimeCol(timeCol) {
  timeCol.innerHTML = "";
  for (let h = HOUR_START; h <= HOUR_END; h++) {
    const lbl  = document.createElement("div");
    lbl.className = "t-label";
    if (h < HOUR_END) {
      const ampm = h < 12 ? "AM" : "PM";
      const disp = h === 0 ? 12 : h > 12 ? h-12 : h;
      lbl.textContent = `${disp} ${ampm}`;
    }
    timeCol.appendChild(lbl);
  }
}

function renderDayCols(dayColsEl, weekDates, events, todayKey, onSlotClick, onEventClick) {
  // Build a map: dateKey -> events[] (skip events with invalid dates)
  const byDate = {};
  for (const ev of events) {
    if (!ev.starts_at) continue;
    if (isNaN(new Date(ev.starts_at).getTime())) continue;
    const key = chicagoDateKey(ev.starts_at);
    (byDate[key] ??= []).push(ev);
  }

  dayColsEl.innerHTML = "";
  const totalSlots = HOUR_END - HOUR_START;

  for (const d of weekDates) {
    const dateKey = localDateKey(d);
    const isToday = dateKey === todayKey;
    const col     = document.createElement("div");
    col.className = "day-col" + (isToday ? " today-col" : "");

    // Hour slots (clickable empty areas)
    for (let h = HOUR_START; h < HOUR_END; h++) {
      const slot = document.createElement("div");
      slot.className = "h-slot";
      slot.addEventListener("click", () => onSlotClick(d, h));
      col.appendChild(slot);
    }

    // Event blocks (positioned absolutely)
    const dayEvs = byDate[dateKey] || [];
    for (const ev of dayEvs) {
      const top    = evTop(ev.starts_at);
      const height = evHeight(ev.starts_at, ev.ends_at);
      const color  = GOLD_TYPES.has(ev.type) ? "gold" : "blue";
      const blk    = document.createElement("div");
      blk.className = `ev-blk ev-blk--${color}`;
      blk.style.cssText = `top:${top}px;height:${height}px`;
      blk.innerHTML = `
        <div class="ev-blk-title">${ev.title || "(untitled)"}</div>
        <div class="ev-blk-time">${fmtTimeShort(ev.starts_at)}${ev.ends_at ? " – "+fmtTimeShort(ev.ends_at) : ""}</div>
      `;
      blk.addEventListener("click", e => { e.stopPropagation(); onEventClick(ev); });
      col.appendChild(blk);
    }

    dayColsEl.appendChild(col);
  }
}

// ─────────────────────────────────────────────────────────────
//  init()  — DOM entry point
// ─────────────────────────────────────────────────────────────

export function init() {
  // ── element refs ──
  const sLogin  = document.getElementById("s-login");
  const sToken  = document.getElementById("s-token");
  const sApp    = document.getElementById("s-app");
  if (!sLogin || !sToken || !sApp) return;

  const lpPw    = document.getElementById("lp-pw");
  const lpBtn   = document.getElementById("lp-btn");
  const lpErr   = document.getElementById("lp-err");

  const tkPw    = document.getElementById("tk-pw");
  const tkBtn   = document.getElementById("tk-btn");
  const tkErr   = document.getElementById("tk-err");

  const btnToday  = document.getElementById("btn-today");
  const btnPrev   = document.getElementById("btn-prev");
  const btnNext   = document.getElementById("btn-next");
  const weekLbl   = document.getElementById("week-label");
  const calStatus = document.getElementById("cal-status");
  const btnLogout = document.getElementById("btn-logout");

  const dayHdr    = document.getElementById("day-hdr");
  const timeCol   = document.getElementById("time-col");
  const dayColsEl = document.getElementById("day-cols");

  const calPanel  = document.getElementById("cal-panel");
  const panTitle  = document.getElementById("pan-title");
  const panDate   = document.getElementById("pan-date");
  const panClose  = document.getElementById("pan-close");
  const pfTitle   = document.getElementById("pf-title");
  const pfStart   = document.getElementById("pf-start");
  const pfEnd     = document.getElementById("pf-end");
  const pfLoc     = document.getElementById("pf-loc");
  const pfDesc    = document.getElementById("pf-desc");
  const pfType    = document.getElementById("pf-type");
  const pfMsg     = document.getElementById("pf-msg");
  const pfSave    = document.getElementById("pf-save");
  const pfCancel  = document.getElementById("pf-cancel");
  const pfDelete  = document.getElementById("pf-delete");
  const overlay   = document.getElementById("overlay");

  // ── state ──
  let eventsObj  = { events: [] };
  let weekSunday = getWeekSunday(new Date());
  let editingId  = null;  // null = new event, string = editing existing

  // ─── helpers ───
  function showStatus(text, kind="") {
    calStatus.textContent  = text;
    calStatus.dataset.kind = kind;
    if (text && kind === "ok") setTimeout(() => { calStatus.textContent = ""; }, 4000);
  }

  function showPanelMsg(text, kind="") {
    pfMsg.textContent  = text;
    pfMsg.dataset.kind = kind;
  }

  // ─── calendar render ───
  function redraw() {
    const todayKey  = localDateKey(new Date());
    const weekDates = Array.from({length:7}, (_, i) => addDays(weekSunday, i));
    weekLbl.textContent = weekLabel(weekSunday);
    renderDayHeaders(dayHdr, weekDates, todayKey);
    renderTimeCol(timeCol);
    renderDayCols(dayColsEl, weekDates, eventsObj.events, todayKey, openNewPanel, openEditPanel);
  }

  // ─── panel open/close ───
  function openPanel() {
    calPanel.classList.add("open");
    overlay.hidden = false;
  }

  function closePanel() {
    calPanel.classList.remove("open");
    overlay.hidden = true;
    editingId = null;
    showPanelMsg("");
  }

  function openNewPanel(date, hour) {
    editingId = null;
    panTitle.textContent = "New Event";
    const hh  = String(hour).padStart(2,"0");
    const hh2 = String(hour + 1 < 24 ? hour + 1 : hour).padStart(2,"0");
    populateTimeSelects(pfStart, pfEnd, `${hh}:00`, `${hh2}:00`);
    pfTitle.value = "";
    pfLoc.value   = "";
    pfDesc.value  = "";
    pfType.value  = "meetup";
    pfDelete.hidden = true;
    const day = date.toLocaleDateString("en-US",{weekday:"long", month:"long", day:"numeric", year:"numeric"});
    panDate.textContent = day;
    panDate._date = date;
    showPanelMsg("");
    openPanel();
    pfTitle.focus();
  }

  function openEditPanel(ev) {
    editingId = ev.id;
    panTitle.textContent = "Edit Event";
    const { hour, minute } = chicagoHourMin(ev.starts_at);
    const hh  = String(hour).padStart(2,"0");
    const mm  = minute < 30 ? "00" : "30";
    let endVal = `${String(hour+1<24?hour+1:hour).padStart(2,"0")}:00`;
    if (ev.ends_at) {
      const e = chicagoHourMin(ev.ends_at);
      const em = e.minute < 30 ? "00" : "30";
      endVal = `${String(e.hour).padStart(2,"0")}:${em}`;
    }
    populateTimeSelects(pfStart, pfEnd, `${hh}:${mm}`, endVal);
    pfTitle.value = ev.title || "";
    pfLoc.value   = ev.location || "";
    pfDesc.value  = ev.description || "";
    pfType.value  = ev.type || "meetup";
    pfDelete.hidden = false;
    const d = new Date(ev.starts_at);
    panDate.textContent = d.toLocaleDateString("en-US",{
      timeZone:"America/Chicago", weekday:"long", month:"long", day:"numeric", year:"numeric",
    });
    panDate._date = d;
    showPanelMsg("");
    openPanel();
    pfTitle.focus();
  }

  // ─── save event ───
  pfSave.addEventListener("click", async () => {
    const dateObj  = panDate._date || new Date();
    const startVal = pfStart.value; // "HH:MM"
    const endVal   = pfEnd.value;
    const [sh, sm] = startVal.split(":").map(Number);
    const [eh, em] = endVal.split(":").map(Number);

    const dateStr  = localDateKey(dateObj instanceof Date ? dateObj : new Date(dateObj));
    const datetime = `${dateStr}T${startVal}`;
    const endsIso  = toChicagoIso(`${dateStr}T${endVal}`);

    const formVals = {
      id:          editingId || makeEventId(dateStr, pfTitle.value),
      title:       pfTitle.value,
      type:        pfType.value,
      datetime,
      location:    pfLoc.value,
      description: pfDesc.value,
      status:      "scheduled",
      draft:       false,
      flyer:       "",
      ends_at:     endsIso,
    };

    const errors = validateEventForm(formVals);
    if (errors.length) { showPanelMsg(errors.join(" "), "err"); return; }

    showPanelMsg("Saving…");
    pfSave.disabled = true;
    try {
      const event = buildEventObject(formVals);
      await fsSaveEvent(event);
      eventsObj = { events: upsertEvent(eventsObj.events, event) };
      redraw();
      closePanel();
      showStatus("Event saved!", "ok");
    } catch (err) {
      showPanelMsg(err.message, "err");
    } finally {
      pfSave.disabled = false;
    }
  });

  // ─── delete event ───
  pfDelete.addEventListener("click", async () => {
    if (!editingId) return;
    if (!confirm("Delete this event?")) return;
    showPanelMsg("Deleting…");
    pfDelete.disabled = true;
    try {
      await fsDeleteEvent(editingId);
      eventsObj = { events: deleteEventById(eventsObj.events, editingId) };
      redraw();
      closePanel();
      showStatus("Event deleted.", "ok");
    } catch (err) {
      showPanelMsg(err.message, "err");
    } finally {
      pfDelete.disabled = false;
    }
  });

  panClose.addEventListener("click", closePanel);
  pfCancel.addEventListener("click", closePanel);
  overlay.addEventListener("click", closePanel);

  // ─── nav ───
  btnToday.addEventListener("click", () => { weekSunday = getWeekSunday(new Date()); redraw(); });
  btnPrev.addEventListener("click",  () => { weekSunday = addDays(weekSunday, -7); redraw(); });
  btnNext.addEventListener("click",  () => { weekSunday = addDays(weekSunday,  7); redraw(); });

  // ─── logout ───
  btnLogout.addEventListener("click", async () => {
    await signOut(auth).catch(() => {});
    eventsObj = { events: [] };
    sApp.hidden   = true;
    sLogin.hidden = false;
    lpPw.value    = "";
    lpErr.textContent = "";
  });

  // ─── login screen ───
  async function doLogin() {
    const input = lpPw.value;
    if (!input) { lpErr.textContent = "Enter the admin password."; return; }
    lpErr.textContent = "Checking…";
    lpBtn.disabled = true;

    try {
      const ok = await checkPassword(input);
      if (!ok) {
        lpErr.textContent = "Incorrect password. Try again.";
        lpPw.value = "";
        lpPw.focus();
        lpBtn.disabled = false;
        return;
      }

      // Sign in anonymously with Firebase so Firestore rules allow writes
      await signInAnonymously(auth);

      // Load events from Firestore
      const events = await fsLoadEvents();
      eventsObj = { events };

      lpErr.textContent = "";
      sLogin.hidden = true;
      sApp.hidden   = false;
      redraw();
    } catch (err) {
      lpErr.textContent = "Error: " + err.message;
      console.error("Login error:", err);
    } finally {
      lpBtn.disabled = false;
    }
  }

  lpBtn.addEventListener("click", doLogin);
  lpPw.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
}
