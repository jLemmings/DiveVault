<script>
import { API_ENDPOINTS } from "~/shared/api/endpoints.js";
import { apiError, parseJson } from "~/shared/api/client.js";
import { normalizeRequiredLogbookFields, logbookRequirementFieldOptions } from "~/shared/utils/core.js";
import { LOCALES } from "~/i18n/locales.js";
import TideLine from "~/shared/components/chart/TideLine.vue";
import ChartNote from "~/shared/components/chart/ChartNote.vue";
import AccountNav from "./components/AccountNav.vue";
import UserAccess from "./components/UserAccess.vue";
import packageJson from "../../../package.json";

const THEMES = [
  { value: "system", label: "Follow the system" },
  { value: "light", label: "Day chart" },
  { value: "dark", label: "Night chart" }
];
const SHOWABLE = ["weather_description", "visibility", "wetsuit_description", "weight_description"];
const LONG_REQUEST_MS = 120000;

function downloadName(disposition, fallback) {
  const match = /filename="?([^";]+)"?/i.exec(disposition || "");
  return match?.[1] || fallback;
}

export default {
  name: "ApplicationSettingsView",
  components: { TideLine, ChartNote, AccountNav, UserAccess },
  props: {
    api: { type: Object, required: true },
    profile: { type: Object, required: true },
    loaded: Boolean,
    loadError: { type: String, default: "" },
    canManageUsers: Boolean,
    locale: { type: String, default: "en" },
    theme: { type: String, default: "system" },
    saveProfile: { type: Function, required: true },
    reloadAccount: { type: Function, required: true }
  },
  emits: ["retry", "locale", "theme"],
  data() {
    return {
      locales: LOCALES,
      themes: THEMES,
      version: packageJson.version,
      pending: null,
      busy: "",
      status: "",
      error: ""
    };
  },
  computed: {
    choices() {
      return this.pending || this.profile;
    },
    required() {
      return normalizeRequiredLogbookFields(this.choices.required_logbook_fields);
    },
    displayed() {
      return Array.isArray(this.choices.logbook_display_fields) ? this.choices.logbook_display_fields : [];
    },
    requirementOptions() {
      return logbookRequirementFieldOptions.map(({ key, label }) => ({ key, label: key === "site" ? "Site" : label }));
    },
    displayOptions() {
      return this.requirementOptions.filter((option) => SHOWABLE.includes(option.key));
    }
  },
  methods: {
    // These ticks save as they change, so there is no button to forget.
    async saveChoice(changes) {
      this.pending = { ...this.profile, ...changes };
      this.status = "";
      this.error = "";
      try {
        await this.saveProfile(changes);
        this.status = "Saved.";
      } catch (error) {
        this.error = error?.message || "Could not save that choice.";
      } finally {
        this.pending = null;
      }
    },
    toggleRequired(key) {
      const next = new Set([...this.required, "site"]);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      this.saveChoice({
        required_logbook_fields: this.requirementOptions.map((option) => option.key).filter((option) => next.has(option))
      });
    },
    toggleDisplayed(key) {
      const next = new Set(this.displayed);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      this.saveChoice({ logbook_display_fields: SHOWABLE.filter((option) => next.has(option)) });
    },
    async run(kind, action, fallback) {
      this.busy = kind;
      this.status = "";
      this.error = "";
      try {
        this.status = await action();
      } catch (error) {
        this.error = error?.message || fallback;
      } finally {
        this.busy = "";
      }
    },
    download(kind) {
      const files = {
        csv: [API_ENDPOINTS.exportsCsv, "divevault-dives.csv"],
        pdf: [API_ENDPOINTS.exportsPdf, "divevault-dives.pdf"],
        backup: [API_ENDPOINTS.backupExport, "divevault-backup.zip"]
      };
      const [url, fallback] = files[kind];
      return this.run(
        kind,
        async () => {
          const response = await this.api.request(url, {}, { timeoutMs: LONG_REQUEST_MS });
          if (!response.ok) throw apiError(await parseJson(response), response);
          const objectUrl = URL.createObjectURL(await response.blob());
          const link = document.createElement("a");
          link.href = objectUrl;
          link.download = downloadName(response.headers.get("Content-Disposition"), fallback);
          document.body.append(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(objectUrl);
          return "Downloaded.";
        },
        "Could not make the download."
      );
    },
    restore(event) {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return undefined;
      if (!window.confirm(this.$tx("Restore {file}? Your lists and gear will be replaced.", { file: file.name }))) return undefined;
      const type = file.name.toLowerCase().endsWith(".json") ? "application/json" : "application/zip";
      return this.run(
        "restore",
        async () => {
          const payload = await this.api.json(
            API_ENDPOINTS.backupImport,
            { method: "POST", headers: { "Content-Type": type }, body: file },
            { timeoutMs: LONG_REQUEST_MS }
          );
          await this.reloadAccount();
          const count = Number(payload?.summary?.dives_inserted ?? 0);
          return this.$tn(count, "Backup restored, with {count} dive added.", "Backup restored, with {count} dives added.");
        },
        "Could not restore that backup."
      );
    }
  }
};
</script>

<template>
  <section class="page">
    <div class="topside">
      <h1 class="h1">{{ $tx("Application, data and access") }}</h1>
    </div>
    <tide-line />
    <account-nav current="application" />
    <div v-if="!loaded && loadError" class="note bad" role="alert">
      <p>{{ $tx(loadError) }}</p>
      <button type="button" class="link" @click="$emit('retry')">{{ $tx("Try again") }}</button>
    </div>
    <chart-note :status="status" :error="error" />

    <section class="mid pad cols settings-band">
      <div class="stack settings-device">
        <h2 class="h2">{{ $tx("On this device") }}</h2>
        <label class="field">
          {{ $tx("Language") }}
          <select :value="locale" @change="$emit('locale', $event.target.value)">
            <option v-for="language in locales" :key="language.code" :value="language.code">{{ language.name }}</option>
          </select>
        </label>
        <label class="field">
          {{ $tx("Theme") }}
          <select :value="theme" @change="$emit('theme', $event.target.value)">
            <option v-for="option in themes" :key="option.value" :value="option.value">{{ $tx(option.label) }}</option>
          </select>
        </label>
      </div>
      <fieldset class="settings-ticks" :disabled="!loaded || pending !== null">
        <legend class="h2">{{ $tx("Required to log a dive") }}</legend>
        <div class="tick-grid">
          <label v-for="option in requirementOptions" :key="option.key" class="check">
            <input
              type="checkbox"
              :checked="option.key === 'site' || required.includes(option.key)"
              :aria-disabled="option.key === 'site' || undefined"
              @click="option.key === 'site' && $event.preventDefault()"
              @change="option.key !== 'site' && toggleRequired(option.key)"
            />{{ $tx(option.label) }}
          </label>
        </div>
      </fieldset>
      <fieldset class="settings-ticks" :disabled="!loaded || pending !== null">
        <legend class="h2">{{ $tx("Show in the logbook") }}</legend>
        <div class="tick-grid">
          <label v-for="option in displayOptions" :key="option.key" class="check">
            <input type="checkbox" :checked="displayed.includes(option.key)" @change="toggleDisplayed(option.key)" />{{ $tx(option.label) }}
          </label>
        </div>
        <label class="check">
          <input
            type="checkbox"
            :checked="choices.equipment_selection_enabled !== false"
            @change="saveChoice({ equipment_selection_enabled: $event.target.checked })"
          />{{ $tx("Let me pick gear when I log") }}
        </label>
      </fieldset>
    </section>

    <section class="shelf pad cols settings-band">
      <div class="stack settings-data">
        <h2 class="h2">{{ $tx("Take your dives with you") }}</h2>
        <p>{{ $tx("The CSV has one row for every recorded sample. The PDF is a one-page summary of up to 33 dives.") }}</p>
        <div class="row">
          <button type="button" class="btn line" :disabled="Boolean(busy)" @click="download('csv')">{{ $tx("Download CSV") }}</button>
          <button type="button" class="btn line" :disabled="Boolean(busy)" @click="download('pdf')">{{ $tx("Download PDF") }}</button>
        </div>
      </div>
      <div class="stack settings-data">
        <h2 class="h2">{{ $tx("Back up") }}</h2>
        <p>{{ $tx("One ZIP with your dives, lists, gear and card PDFs. It leaves out passwords and other users.") }}</p>
        <div class="row">
          <button type="button" class="btn" :disabled="Boolean(busy)" @click="download('backup')">
            {{ busy === "backup" ? $tx("Packing…") : $tx("Download backup") }}
          </button>
        </div>
      </div>
      <div class="stack settings-data">
        <h2 class="h2">{{ $tx("Restore") }}</h2>
        <p>{{ $tx("Replaces your lists and gear. Adds missing dives and leaves existing ones as they are.") }}</p>
        <div class="row">
          <button type="button" class="btn line" :disabled="Boolean(busy)" @click="$refs.backup.click()">
            {{ busy === "restore" ? $tx("Restoring…") : $tx("Choose a backup") }}
          </button>
          <input ref="backup" hidden type="file" accept=".zip,.json,application/zip,application/json" @change="restore" />
        </div>
      </div>
    </section>

    <user-access v-if="canManageUsers" :api="api" />
    <p class="pad soft small app-version">DiveVault v{{ version }}</p>
  </section>
</template>

<style>
.settings-band {
  gap: 22px 56px;
}

.settings-device {
  flex: 1 1 260px;
}

.settings-ticks {
  flex: 1 1 300px;
}

.settings-ticks legend {
  float: left;
  width: 100%;
  padding: 0 0 10px;
}

.tick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  clear: both;
  gap: 0 12px;
}

.settings-data {
  flex: 1 1 290px;
  min-width: 0;
}

.app-version {
  margin-top: auto !important;
  padding: 8px var(--gutter) 16px !important;
}
</style>
