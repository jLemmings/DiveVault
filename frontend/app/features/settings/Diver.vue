<script>
import { defineAsyncComponent } from "vue";
import { licensePdfUrl } from "~/shared/api/endpoints.js";
import { localDate, shortDate } from "~/shared/utils/format.js";
import { MAX_LICENSE_BYTES, bytesToBase64, slugFromName } from "~/shared/utils/settings-profile.js";
import TideLine from "~/shared/components/chart/TideLine.vue";
import SeaSwell from "~/shared/components/chart/SeaSwell.vue";
import ChartNote from "~/shared/components/chart/ChartNote.vue";
import ChartDialog from "~/shared/components/chart/ChartDialog.vue";
import AccountNav from "./components/AccountNav.vue";
import NameList from "./components/NameList.vue";
import CardDialog from "./components/CardDialog.vue";
import DetailsDialog from "./components/DetailsDialog.vue";

const LicensePdfPreview = defineAsyncComponent(() => import("~/shared/components/LicensePdfPreview.vue"));
const CARD_FIELDS = ["id", "company", "certification_name", "student_number", "certification_date", "instructor_number"];
const FIND_CARDS_FROM = 6;

export default {
  name: "DiverView",
  components: { TideLine, SeaSwell, ChartNote, ChartDialog, AccountNav, NameList, CardDialog, DetailsDialog, LicensePdfPreview },
  props: {
    api: { type: Object, required: true },
    profile: { type: Object, required: true },
    loaded: Boolean,
    loadError: { type: String, default: "" },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    saveProfile: { type: Function, required: true },
    profileUpdated: { type: Function, required: true }
  },
  emits: ["retry", "password", "sign-out"],
  data() {
    return {
      status: "",
      error: "",
      editingDetails: false,
      editingCard: null,
      cardSaving: false,
      cardError: "",
      cardQuery: "",
      hasPdf: {},
      uploadingId: null,
      attachingId: null,
      pdf: null,
      sharing: { enabled: false, slug: "" },
      sharingSaving: false
    };
  },
  computed: {
    shownEmail() {
      return this.profile.email || this.email;
    },
    cards() {
      return Array.isArray(this.profile.licenses) ? this.profile.licenses : [];
    },
    shownCards() {
      const query = this.cardQuery.trim().toLowerCase();
      if (this.cards.length < FIND_CARDS_FROM || !query) return this.cards;
      return this.cards.filter((card) =>
        [card.certification_name, card.company, card.student_number, card.instructor_number].join(" ").toLowerCase().includes(query)
      );
    },
    cardFinder() {
      return this.cards.length >= FIND_CARDS_FROM;
    },
    publicUrl() {
      const slug = this.profile.public_slug;
      return this.profile.public_dives_enabled && slug ? `${window.location.origin}/public/${slug}` : "";
    }
  },
  watch: {
    profile: {
      immediate: true,
      handler(profile) {
        this.sharing = { enabled: Boolean(profile.public_dives_enabled), slug: profile.public_slug || slugFromName(this.name) };
        this.findPdfs();
      }
    }
  },
  methods: {
    cardDate(value) {
      return localDate(value) && /^\d{4}-\d{2}-\d{2}/.test(value) ? shortDate(value) : value;
    },
    request(...args) {
      return this.api.request(...args);
    },
    // The profile doesn't say which cards have a PDF, so each is asked and only the answer's status is read.
    async findPdfs() {
      for (const card of this.cards) {
        if (card.id in this.hasPdf) continue;
        if (card.pdf) {
          this.hasPdf[card.id] = true;
          continue;
        }
        try {
          const response = await this.api.request(licensePdfUrl(card.id));
          this.hasPdf[card.id] = response.ok;
          response.body?.cancel().catch(() => {});
        } catch {
          // Not knowing only means the card offers "Attach" rather than "Open".
        }
      }
    },
    async run(action, fallback) {
      this.status = "";
      this.error = "";
      try {
        this.status = await action();
      } catch (error) {
        this.error = error?.message || fallback;
      }
    },
    async saveList(key, list) {
      await this.saveProfile({ [key]: list });
      this.status = "List saved.";
    },
    detailsSaved() {
      this.editingDetails = false;
      this.status = "Details saved.";
    },
    async writeCards(list, message) {
      this.cardSaving = true;
      this.cardError = "";
      try {
        await this.saveProfile({ licenses: list.map((card) => Object.fromEntries(CARD_FIELDS.map((key) => [key, card[key] || ""]))) });
        this.editingCard = null;
        this.status = message;
      } catch (error) {
        this.cardError = error?.message || "Could not save the card.";
      } finally {
        this.cardSaving = false;
      }
    },
    saveCard(next) {
      const exists = this.cards.some((card) => card.id === next.id);
      this.writeCards(exists ? this.cards.map((card) => (card.id === next.id ? next : card)) : [...this.cards, next], "Card saved.");
    },
    removeCard(card) {
      const title = card.certification_name || card.company;
      if (!window.confirm(this.$tx("Remove {card}? This cannot be undone.", { card: title }))) return;
      const rest = this.cards.filter((entry) => entry.id !== card.id);
      this.writeCards(rest, "Card removed.");
    },
    attach(card) {
      this.editingCard = null;
      this.attachingId = card.id;
      this.$refs.pdfInput.click();
    },
    async uploadPdf(event) {
      const file = event.target.files?.[0];
      const id = this.attachingId;
      event.target.value = "";
      if (!file || !id) return;
      await this.run(async () => {
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Choose a PDF file.");
        if (file.size > MAX_LICENSE_BYTES) throw new Error("The PDF must be 10 MB or smaller.");
        this.uploadingId = id;
        try {
          const profile = await this.api.json(licensePdfUrl(id), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              content_type: "application/pdf",
              data_b64: bytesToBase64(new Uint8Array(await file.arrayBuffer()))
            })
          });
          this.hasPdf[id] = true;
          this.profileUpdated(profile);
          return "PDF attached.";
        } finally {
          this.uploadingId = null;
        }
      }, "Could not attach the PDF.");
    },
    openPdf(card) {
      this.pdf = { title: card.certification_name || card.company, file: { preview_url: card.pdf?.preview_url || licensePdfUrl(card.id) } };
    },
    async saveSharing() {
      this.sharingSaving = true;
      await this.run(async () => {
        const slug = slugFromName(this.sharing.slug);
        if (this.sharing.enabled && !slug) throw new Error("Enter a link name.");
        await this.saveProfile({ public_dives_enabled: this.sharing.enabled, public_slug: slug });
        return this.sharing.enabled ? "Your logbook is public." : "Your logbook is private.";
      }, "Could not save sharing.");
      this.sharingSaving = false;
    },
    async copyLink() {
      await this.run(async () => {
        if (!navigator.clipboard?.writeText) throw new Error("Copying isn't available in this browser.");
        await navigator.clipboard.writeText(this.publicUrl);
        return "Link copied.";
      }, "Could not copy the link.");
    }
  }
};
</script>

<template>
  <section class="page diver">
    <sea-swell />
    <div class="topside">
      <div>
        <h1 class="h1">{{ name }}</h1>
        <p class="soft big wrap-anywhere-text">{{ shownEmail }}</p>
      </div>
      <div class="row">
        <button type="button" class="link" :disabled="!loaded" @click="editingDetails = true">{{ $tx("Edit details") }}</button>
        <button type="button" class="link" @click="$emit('password')">{{ $tx("Change password") }}</button>
        <button type="button" class="link" @click="$emit('sign-out')">{{ $tx("Sign out") }}</button>
      </div>
    </div>
    <tide-line />
    <account-nav current="diver" />
    <div v-if="!loaded && loadError" class="note bad" role="alert">
      <p>{{ $tx(loadError) }}</p>
      <button type="button" class="link" @click="$emit('retry')">{{ $tx("Try again") }}</button>
    </div>
    <chart-note :status="status" :error="error" />

    <section class="mid pad stack">
      <div class="row between">
        <h2 class="h2">{{ $tx("Certification cards") }}</h2>
        <button type="button" class="btn line" :disabled="!loaded" @click="editingCard = { card: null }">{{ $tx("Add a card") }}</button>
      </div>
      <label v-if="cardFinder" class="field card-find">{{ $tx("Find a card") }}<input v-model="cardQuery" type="search" /></label>
      <p v-if="loaded && !cards.length" class="big">{{ $tx("Keep your cards here, with the PDF, for the next dive centre that asks.") }}</p>
      <ul v-else class="row cert-cards">
        <li v-for="card in shownCards" :key="card.id" class="stack cert-card">
          <p class="h2 wrap-anywhere-text">{{ card.certification_name || card.company }}</p>
          <dl class="kv">
            <template v-if="card.company">
              <dt>{{ $tx("Agency") }}</dt>
              <dd>{{ card.company }}</dd>
            </template>
            <template v-if="card.student_number">
              <dt>{{ $tx("Diver no.") }}</dt>
              <dd>{{ card.student_number }}</dd>
            </template>
            <template v-if="card.instructor_number">
              <dt>{{ $tx("Instructor") }}</dt>
              <dd>{{ card.instructor_number }}</dd>
            </template>
            <template v-if="card.certification_date">
              <dt>{{ $tx("Certified") }}</dt>
              <dd>{{ cardDate(card.certification_date) }}</dd>
            </template>
          </dl>
          <div class="row">
            <button v-if="hasPdf[card.id]" type="button" class="link" @click="openPdf(card)">{{ $tx("Open PDF") }}</button>
            <button v-else type="button" class="link" :disabled="uploadingId !== null" @click="attach(card)">
              {{ uploadingId === card.id ? $tx("Attaching…") : $tx("Attach PDF") }}
            </button>
            <button type="button" class="link" @click="editingCard = { card }">{{ $tx("Edit") }}</button>
          </div>
        </li>
      </ul>
      <input ref="pdfInput" hidden type="file" accept="application/pdf,.pdf" @change="uploadPdf" />
    </section>

    <div class="cols pad diver-people">
      <name-list
        kind="buddy"
        :title="$tx('Buddies')"
        :add-label="$tx('Add a buddy')"
        :empty="$tx('Saved buddies are offered when you log.')"
        :entries="profile.buddies || []"
        :disabled="!loaded"
        :save="(list) => saveList('buddies', list)"
      />
      <name-list
        kind="guide"
        :title="$tx('Guides and instructors')"
        :add-label="$tx('Add a guide')"
        :empty="$tx('Saved guides are offered when you log.')"
        :entries="profile.guides || []"
        :disabled="!loaded"
        :save="(list) => saveList('guides', list)"
      />
      <form class="stack diver-sharing" @submit.prevent="saveSharing">
        <h2 class="h2">{{ $tx("Public logbook") }}</h2>
        <label class="check">
          <input v-model="sharing.enabled" type="checkbox" :disabled="!loaded" />{{ $tx("Anyone with the link can see my dives") }}
        </label>
        <label class="field">{{ $tx("Link name") }}<input v-model="sharing.slug" autocapitalize="none" :disabled="!loaded" /></label>
        <p v-if="sharing.enabled" class="soft small">{{ $tx("Dive notes, buddy and guide names can be seen too.") }}</p>
        <div class="row">
          <button class="btn" type="submit" :disabled="!loaded || sharingSaving">
            {{ sharingSaving ? $tx("Saving…") : $tx("Save sharing") }}
          </button>
          <template v-if="publicUrl">
            <button type="button" class="link" @click="copyLink">{{ $tx("Copy link") }}</button>
            <a class="link" :href="publicUrl" target="_blank" rel="noreferrer">{{ $tx("See it") }}</a>
          </template>
        </div>
      </form>
    </div>

    <details-dialog
      v-if="editingDetails"
      :name="name"
      :email="shownEmail"
      :save="saveProfile"
      @close="editingDetails = false"
      @saved="detailsSaved"
    />
    <card-dialog
      v-if="editingCard"
      :card="editingCard.card"
      :has-pdf="Boolean(editingCard.card && hasPdf[editingCard.card.id])"
      :saving="cardSaving"
      :error="cardError"
      @close="
        editingCard = null;
        cardError = '';
      "
      @save="saveCard"
      @remove="removeCard"
      @attach="attach"
    />
    <chart-dialog v-if="pdf" :title="pdf.title" wide @close="pdf = null">
      <license-pdf-preview :pdf="pdf.file" :authenticated-fetch="request" />
    </chart-dialog>
  </section>
</template>

<style>
.cert-cards {
  align-items: stretch;
}

.cert-card {
  flex: 1 1 280px;
  max-width: 382px;
  min-height: 226px;
  justify-content: space-between;
  padding: 20px 22px;
  border-radius: 14px;
}

.cert-card .kv {
  gap: 2px 12px;
}

.card-find {
  max-width: 280px;
}

.diver-people {
  gap: 28px 56px;
  padding-bottom: 110px;
}

.diver-sharing {
  flex: 1 1 320px;
  min-width: 0;
}

@media (max-width: 700px) {
  .diver-people {
    padding-bottom: 60px;
  }
}
</style>
