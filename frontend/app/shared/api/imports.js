import { importCsvUrl, importSubsurfaceUrl } from "./endpoints.js";

export function uploadCsv(api, formData, { dryRun = false, timeoutMs } = {}) {
  return api.request(
    importCsvUrl({ dryRun }),
    {
      method: "POST",
      body: formData
    },
    { timeoutMs }
  );
}

export function uploadSubsurface(api, formData, { dryRun = false, timeoutMs } = {}) {
  return api.request(
    importSubsurfaceUrl({ dryRun }),
    {
      method: "POST",
      body: formData
    },
    { timeoutMs }
  );
}
