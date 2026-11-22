<script>
import { cliAuthApproveUrl } from "~/shared/api/endpoints.js";
import { uploadCsv, uploadSubsurface } from "~/shared/api/imports.js";
import { requireJson } from "~/shared/api/client.js";
import { dayMonthTime, formatNumber, metres, minutes } from "~/shared/utils/format.js";
import { PATHS } from "~/routing/routes.js";
import TideLine from "~/shared/components/chart/TideLine.vue";
import SeaSwell from "~/shared/components/chart/SeaSwell.vue";
import ChartNote from "~/shared/components/chart/ChartNote.vue";
import ChartLink from "~/shared/components/ChartLink.vue";

const ACCEPTED = ".csv,.xml,.ssrf,.zip,.gz,text/csv,application/xml,text/xml,application/zip,application/gzip";
const UPLOAD_TIMEOUT_MS = 30000;

// Browsers leave .ssrf untyped and Windows has its own names for ZIP and gzip, which the server refuses.
async function prepareFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    return { kind: "csv", body: new Blob([await file.text()], { type: "text/csv; charset=utf-8" }) };
  }
  let type = "application/xml";
  if (name.endsWith(".zip")) type = "application/zip";
  if (name.endsWith(".gz")) type = "application/gzip";
  return { kind: "subsurface", body: new Blob([file], { type }) };
}

export default {
  name: "ImportFileView",
  components: { TideLine, SeaSwell, ChartNote, ChartLink },
  props: {
    api: { type: Object, required: true },
    // Set when Windows Dive Sync opened the page to ask for approval.
    code: { type: String, default: "" },
    email: { type: String, default: "" },
    refreshDives: { type: Function, required: true }
  },
  data() {
    return {
      paths: PATHS,
      accepted: ACCEPTED,
      fileName: "",
      upload: null,
      preview: null,
      busy: "",
      status: "",
      error: "",
      imported: false,
      approving: false,
      approved: false,
      approveError: ""
    };
  },
  computed: {
    rows() {
      return Array.isArray(this.preview?.dives) ? this.preview.dives : [];
    },
    broken() {
      return this.rows.filter((row) => !row.valid);
    },
    ready() {
      return Number(this.preview?.ready_rows || 0);
    },
    previewHeading() {
      const duplicates = Number(this.preview?.duplicates || 0);
      if (this.broken.length) return this.$tn(this.broken.length, "{count} broken row", "{count} broken rows");
      if (!this.ready) return this.$tx("Every dive in this file is already here");
      if (!duplicates) return this.$tn(this.ready, "{count} dive ready", "{count} dives ready");
      return this.$tn(
        this.ready,
        "{count} dive ready, {duplicates} already in your logbook",
        "{count} dives ready, {duplicates} already in your logbook",
        {
          duplicates
        }
      );
    }
  },
  methods: {
    dayMonthTime,
    formatNumber,
    metres,
    minutes,
    outcome(row) {
      if (!row.valid) return { text: row.errors?.join("; ") || this.$tx("Broken row"), tone: "warn" };
      if (row.duplicate) return { text: this.$tx("Skipped, already logged"), tone: "soft" };
      if (!String(row.site || "").trim()) return { text: this.$tx("Waits in Imports"), tone: "warn" };
      return { text: this.$tx("Goes into the logbook"), tone: "" };
    },
    async send(dryRun) {
      const post = this.upload.kind === "csv" ? uploadCsv : uploadSubsurface;
      return requireJson(await post(this.api, this.upload.body, { dryRun, timeoutMs: UPLOAD_TIMEOUT_MS }));
    },
    async selectFile(event) {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      Object.assign(this, { fileName: file.name, preview: null, upload: null, status: "", error: "", imported: false, busy: "reading" });
      try {
        this.upload = await prepareFile(file);
        const payload = await this.send(true);
        this.preview = payload?.summary || payload;
      } catch (error) {
        this.error = error?.message || "Could not read that file.";
      } finally {
        this.busy = "";
      }
    },
    async confirmImport() {
      this.busy = "importing";
      this.error = "";
      try {
        const payload = await this.send(false);
        const result = payload?.summary || payload || {};
        const count = Number(result.inserted ?? 0);
        this.status = count ? this.$tn(count, "{count} dive imported.", "{count} dives imported.") : "No new dives were in that file.";
        this.imported = true;
        this.preview = null;
        this.upload = null;
        await this.refreshDives({ quiet: true });
      } catch (error) {
        this.error = error?.message || "Could not import that file.";
      } finally {
        this.busy = "";
      }
    },
    async approve() {
      this.approving = true;
      this.approveError = "";
      try {
        await this.api.json(cliAuthApproveUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: this.code })
        });
        this.approved = true;
      } catch (error) {
        this.approveError = error?.message || "Could not approve Dive Sync.";
      } finally {
        this.approving = false;
      }
    }
  }
};
</script>

<template>
  <section class="page import-file">
    <sea-swell />
    <div class="topside">
      <div>
        <h1 class="h1">{{ $tx("Bring dives aboard") }}</h1>
        <p class="soft big">{{ $tx("From your dive computer, a CSV or Subsurface.") }}</p>
      </div>
    </div>
    <tide-line />
    <div class="shoal pad cols import-sources">
      <section class="main stack">
        <h2 class="h2">{{ $tx("From a file") }}</h2>
        <p>{{ $tx("CSV, or Subsurface as XML, SSRF, gzip or ZIP. Nothing is saved until you have seen the preview.") }}</p>
        <div class="row">
          <button type="button" class="btn" :class="{ line: fileName }" :disabled="Boolean(busy)" @click="$refs.file.click()">
            {{ fileName ? $tx("Choose another file") : $tx("Choose a file") }}
          </button>
          <strong v-if="fileName" class="wrap-anywhere-text">{{ fileName }}</strong>
          <span v-if="busy === 'reading'" role="status">{{ $tx("Reading the file…") }}</span>
          <input ref="file" hidden type="file" :accept="accepted" @change="selectFile" />
        </div>
      </section>
      <section class="side stack">
        <h2 class="h2">{{ $tx("From your dive computer") }}</h2>
        <p v-if="approved" role="status">{{ $tx("Dive Sync is allowed. Go back to the Windows app to carry on.") }}</p>
        <template v-else-if="code">
          <p>
            {{ $tx("Windows Dive Sync is asking to add dives to") }} <strong class="wrap-anywhere-text">{{ email }}</strong>.
            {{ $tx("Only allow it if you just started it yourself.") }}
          </p>
          <p v-if="approveError" class="warn" role="alert">{{ $tx(approveError) }}</p>
          <div class="row">
            <button type="button" class="btn" :disabled="approving" @click="approve">
              {{ approving ? $tx("Allowing…") : $tx("Allow Dive Sync") }}
            </button>
            <chart-link class="link" :to="paths.importFile">{{ $tx("Not now") }}</chart-link>
          </div>
        </template>
        <p v-else>{{ $tx("Open Windows Dive Sync and choose Sign In. It brings you here to allow it, then sends your dives.") }}</p>
      </section>
    </div>
    <chart-note :status="status" :error="error">
      <span v-if="imported" class="row">
        <chart-link class="link" :to="paths.imports">{{ $tx("Open Imports") }}</chart-link>
        <chart-link class="link" :to="paths.logbook">{{ $tx("Open the logbook") }}</chart-link>
      </span>
    </chart-note>

    <template v-if="preview">
      <section class="pad stack">
        <div class="row between">
          <div>
            <h2 class="h2">{{ previewHeading }}</h2>
            <p class="soft">{{ $tx("Duplicates are skipped. Dives without a site wait in Imports.") }}</p>
          </div>
          <button type="button" class="btn" :disabled="Boolean(busy) || !ready || broken.length > 0" @click="confirmImport">
            {{ busy === "importing" ? $tx("Importing…") : $tn(ready, "Import {count} dive", "Import {count} dives") }}
          </button>
        </div>
        <div class="scroll">
          <table class="log">
            <thead>
              <tr>
                <th>{{ $tx("Row") }}</th>
                <th>{{ $tx("Date") }}</th>
                <th>{{ $tx("Site") }}</th>
                <th class="n">{{ $tx("Max depth") }}</th>
                <th class="n">{{ $tx("Time") }}</th>
                <th class="n">{{ $tx("Samples") }}</th>
                <th>{{ $tx("What will happen") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in rows" :key="index">
                <td>{{ row.row_number || row.source_id }}</td>
                <td>{{ dayMonthTime(row.started_at) }}</td>
                <td :class="row.site ? 'site' : 'soft'">{{ row.site || $tx("No site") }}</td>
                <td class="n">{{ metres(row.max_depth_m) }}</td>
                <td class="n">{{ minutes(row.duration_seconds) }}</td>
                <td class="n">{{ formatNumber(row.sample_count || 0) }}</td>
                <td class="free" :class="outcome(row).tone">{{ outcome(row).text }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="soft">{{ $tn(rows.length, "{count} row checked", "{count} rows checked") }}</p>
      </section>
      <section v-if="broken.length" class="mid pad stack broken-row" role="alert">
        <h2 class="h3 warn">{{ $tx("This file has a broken row") }}</h2>
        <p>
          {{
            $tx(
              "Row {row} of {file} can't be read ({reason}), so none of the file can be imported. Fix that row, then choose the file again.",
              {
                row: broken[0].row_number,
                file: fileName,
                reason: (broken[0].errors || []).join("; ")
              }
            )
          }}
        </p>
      </section>
    </template>
  </section>
</template>

<style>
.import-sources {
  gap: 20px 56px;
}

.import-file {
  padding-bottom: 130px;
}

.broken-row {
  gap: 6px;
}
</style>
