import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { COLUMNS } = require("../../../tools/event-table-utils.js");

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(
  here,
  "..",
  "fixtures",
  "events.json"
);

export const fixtureEvents = JSON.parse(
  fs.readFileSync(fixturePath, "utf8")
).map(event => ({
  ...event,
  event_key: eventKey(event)
}));

export const fixtureByName = Object.fromEntries(
  fixtureEvents.map(event => [
    event.event_name,
    event
  ])
);

export function eventKey(event) {
  const eventName =
    normalizeEventNameForKey(event);

  return [
    eventName,
    event.date,
    event.city,
    event.country
  ]
    .map(value => String(value || "").trim())
    .join("|")
    .toLowerCase();
}

function normalizeEventNameForKey(event) {
  const name =
    String(event.event_name || "").trim();
  const distance =
    String(event.distance || "").trim();

  if (
    distance &&
    name.toLowerCase().endsWith(` ${distance.toLowerCase()}`)
  ) {
    return name.slice(0, -distance.length).trim();
  }

  return name;
}

function csvCell(value) {
  const text = String(value ?? "");

  return /[;"\n\r]/.test(text)
    ? `"${text.replace(/"/g, "\"\"")}"`
    : text;
}

export function fixtureEventsCsv(events = fixtureEvents) {
  const rows = [
    COLUMNS.join(";"),
    ...events.map(event =>
      COLUMNS.map(column => csvCell(event[column])).join(";")
    )
  ];

  return `${rows.join("\n")}\n`;
}
