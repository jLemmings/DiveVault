export function createManualDiveDraft() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return {
    date: localDate.toISOString().slice(0, 10),
    time: localDate.toISOString().slice(11, 16),
    durationMinutes: "45",
    maxDepthM: "",
    temperatureC: "",
    tankVolumeL: "",
    beginPressureBar: "",
    endPressureBar: "",
    site: "",
    buddy: "",
    guide: "",
    weatherDescription: "",
    visibility: "",
    wetsuitDescription: "",
    weightDescription: "",
    notes: "",
    // null until touched: the usual kit is ticked for a new dive.
    equipment_ids: null
  };
}
