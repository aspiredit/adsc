const PRODID = "-//Autism Dads Social Club//ADSC Events v1//EN";
const SITE_URL = "https://autismdadssocialclub.org/";
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
const CRLF = "\r\n";

// Reminders the member's own calendar app fires. Two of them: one the night
// before (enough lead time to arrange childcare or a ride) and one close
// enough to the start that it catches people mid-day.
export const DEFAULT_ALARMS = [
  { trigger: "-P1D", prefix: "Tomorrow" },
  { trigger: "-PT2H", prefix: "Starting soon" },
];

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

function alarmLines(event, alarms) {
  const title = event.title || "ADSC event";
  return alarms.flatMap((alarm) => [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `TRIGGER:${alarm.trigger}`,
    `DESCRIPTION:${escapeICSText(`${alarm.prefix}: ${title}`)}`,
    "END:VALARM",
  ]);
}

export function eventToICS(event, now = new Date(), alarms = DEFAULT_ALARMS) {
  const start = new Date(event.starts_at);
  // Use the event's real end time when present; otherwise assume a 2-hour block.
  const parsedEnd = event.ends_at ? new Date(event.ends_at) : null;
  const end =
    parsedEnd && !Number.isNaN(parsedEnd.getTime()) && parsedEnd > start
      ? parsedEnd
      : new Date(start.getTime() + DEFAULT_DURATION_MS);
  const uid = `${event.id}@autismdadssocialclub.org`;
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
    `URL:${event.rsvp_url || SITE_URL}`,
    // Alarms sit at the end of the VEVENT so the event's own DESCRIPTION
    // stays the first one a parser meets.
    ...alarmLines(event, alarms),
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
