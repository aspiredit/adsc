const PRODID = "-//Autism Dads Social Club//ADSC Events v1//EN";
const SITE_URL = "https://aspiredit.github.io/adsc/";
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
const CRLF = "\r\n";

export function escapeICSText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function formatUTC(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

export function eventToICS(event, now = new Date()) {
  const start = new Date(event.starts_at);
  const end = new Date(start.getTime() + DEFAULT_DURATION_MS);
  const uid = `${event.id}@aspiredit.github.io`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatUTC(now)}`,
    `DTSTART:${formatUTC(start)}`,
    `DTEND:${formatUTC(end)}`,
    `SUMMARY:${escapeICSText(event.title)}`,
    `LOCATION:${escapeICSText(event.location)}`,
    `DESCRIPTION:${escapeICSText(event.description)}`,
    `URL:${SITE_URL}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ];
  return lines.join(CRLF);
}

export function downloadEventICS(event) {
  if (typeof Blob === "undefined" || typeof URL === "undefined") return;
  const ics = eventToICS(event);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${event.id}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
