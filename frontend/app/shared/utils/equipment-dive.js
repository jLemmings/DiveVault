import { isCommittedDive, parseDate } from "~/shared/utils/core.js";
import { localDate } from "~/shared/utils/format.js";

const DAY = 86400000;
const MONTH_DAYS = 30.44;
const SOON_DAYS = 31;

export function normalizeName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function sortNamedCollection(collection) {
  if (!Array.isArray(collection)) return [];
  return [...collection]
    .filter((item) => typeof item?.name === "string" && item.name.trim())
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true }));
}

export function addMonths(date, months) {
  const next = new Date(date.getTime());
  const targetMonth = next.getMonth() + months;
  next.setMonth(targetMonth);
  if (next.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    next.setDate(0);
  }
  return next;
}

export function equipmentTitle(item) {
  return item?.name || [item?.brand, item?.model, item?.category || item?.type].filter(Boolean).join(" ") || "";
}

function startOfDay(date) {
  return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : null;
}

// "Mark serviced" stamps last_serviced_at while the form writes last_service_date: the later one counts.
export function lastService(item) {
  const typed = startOfDay(localDate(item?.last_service_date));
  const stamped = startOfDay(parseDate(item?.last_serviced_at));
  if (typed && stamped) return typed > stamped ? typed : stamped;
  return typed || stamped;
}

// Where a piece of gear stands on a given day. The backend stores the schedule and the service dates only,
// so days and dives left are counted here from the logbook.
export function gearService(item, dives, at = new Date()) {
  if (!item || item.track_service === false) return { status: "untracked", urgency: 0, last: null, due: null };
  const day = startOfDay(parseDate(at)) || startOfDay(new Date());
  const last = lastService(item);
  const months = Number.parseInt(item.service_interval_months, 10);
  const limit = Number.parseInt(item.max_dives_before_service, 10);
  const planned = startOfDay(localDate(item.next_service_due));

  let due = planned && (!last || planned > last) ? planned : null;
  if (!due && last && months > 0) due = addMonths(last, months);
  const days = due ? Math.round((due - day) / DAY) : null;

  let divesLeft = null;
  if (limit > 0 && Array.isArray(dives)) {
    const id = String(item.id);
    const since = dives.filter((dive) => {
      const started = startOfDay(parseDate(dive.started_at));
      const used = dive.fields?.logbook?.equipment_ids;
      return (
        isCommittedDive(dive) &&
        started &&
        started <= day &&
        (!last || started > last) &&
        Array.isArray(used) &&
        used.map(String).includes(id)
      );
    }).length;
    divesLeft = limit - since;
  }

  if (days === null && divesLeft === null) return { status: "unknown", urgency: 0, last, due, days, divesLeft };
  const period = months > 0 ? months * MONTH_DAYS : 365;
  const byTime = days === null ? 0 : 1 - days / period;
  const byDives = divesLeft === null ? 0 : 1 - divesLeft / limit;
  const overdue = (days !== null && days < 0) || (divesLeft !== null && divesLeft <= 0);
  const soon = (days !== null && days <= SOON_DAYS) || (divesLeft !== null && divesLeft <= Math.max(1, limit * 0.15));
  return {
    status: overdue ? "overdue" : soon ? "due_soon" : "serviced",
    urgency: overdue ? 1 : Math.min(1, Math.max(0, byTime, byDives)),
    limitedBy: days !== null && days < 0 ? "time" : divesLeft !== null && (days === null || byDives >= byTime) ? "dives" : "time",
    last,
    due,
    days,
    divesLeft
  };
}

// The warning beside gear on a dive. Warnings inform; they never block saving.
export function serviceWarning(item, diveDateSource) {
  if (!item || item.track_service === false) return "";
  const { status, due, last } = gearService(item, null, diveDateSource);
  const diveDay = startOfDay(parseDate(diveDateSource));
  if (status === "overdue") return "Service overdue";
  if (last && diveDay && last > diveDay) return "";
  if (!due && !(Number(item.max_dives_before_service) > 0)) return "Service dates missing";
  return "";
}
