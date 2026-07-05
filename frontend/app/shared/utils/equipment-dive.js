export function normalizeName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function sortNamedCollection(collection) {
  if (!Array.isArray(collection)) return [];
  return [...collection]
    .filter((item) => typeof item?.name === "string" && item.name.trim())
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true }));
}

export function parseServiceDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
  return item?.name || [item?.brand, item?.model, item?.category || item?.type].filter(Boolean).join(" ") || "Unnamed equipment";
}

export function serviceStatusForDive(item, diveDateSource) {
  const diveDate = parseServiceDate(diveDateSource);
  const serviceDate = parseServiceDate(item?.last_service_date || item?.last_serviced_at);
  const interval = Number.parseInt(item?.service_interval_months, 10);
  if (!diveDate || !serviceDate || !Number.isFinite(interval) || interval <= 0) {
    return { status: "unknown", label: "Service data missing" };
  }
  const dueDate = addMonths(serviceDate, interval);
  if (serviceDate > diveDate) {
    return { status: "unknown", label: "Service date after dive" };
  }
  if (diveDate > dueDate) {
    return { status: "overdue", label: `Overdue ${dueDate.toISOString().slice(0, 10)}` };
  }
  return { status: dueDate <= addMonths(diveDate, 1) ? "due_soon" : "serviced", label: `OK until ${dueDate.toISOString().slice(0, 10)}` };
}


