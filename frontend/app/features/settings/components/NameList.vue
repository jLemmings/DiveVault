<script>
import { sortNamedCollection } from "~/shared/utils/equipment-dive.js";
import { newEntryId } from "~/shared/utils/settings-profile.js";

const FIND_FROM = 8;

// A list of names that is edited a line at a time. The list is saved whole, as the API expects.
export default {
  name: "NameList",
  props: {
    kind: { type: String, required: true },
    title: { type: String, required: true },
    addLabel: { type: String, required: true },
    empty: { type: String, required: true },
    entries: { type: Array, required: true },
    save: { type: Function, required: true },
    disabled: Boolean
  },
  data() {
    return { editingId: null, name: "", query: "", saving: false, error: "" };
  },
  computed: {
    sorted() {
      return sortNamedCollection(this.entries);
    },
    findable() {
      return this.sorted.length >= FIND_FROM;
    },
    visible() {
      const query = this.findable ? this.query.trim().toLowerCase() : "";
      return this.sorted.filter((entry) => entry.id === this.editingId || entry.name.toLowerCase().includes(query));
    }
  },
  methods: {
    async edit(id, name = "") {
      this.editingId = id;
      this.name = name;
      this.error = "";
      await this.$nextTick();
      this.$el.querySelector(".name-edit input")?.focus();
    },
    async write(list) {
      this.saving = true;
      this.error = "";
      try {
        await this.save(list.map(({ id, name }) => ({ id, name })));
        this.editingId = null;
      } catch (error) {
        this.error = error?.message || "Could not save the list.";
      } finally {
        this.saving = false;
      }
    },
    submit() {
      const name = this.name.trim();
      if (!name) {
        this.error = "Enter a name.";
        return;
      }
      if (this.editingId === "new") this.write([...this.entries, { id: newEntryId(this.kind), name }]);
      else this.write(this.entries.map((entry) => (entry.id === this.editingId ? { ...entry, name } : entry)));
    },
    remove(entry) {
      if (!window.confirm(this.$tx("Remove {name}? Dives already logged keep the name.", { name: entry.name }))) return;
      this.write(this.entries.filter((item) => item.id !== entry.id));
    }
  }
};
</script>

<template>
  <section class="stack name-list">
    <h2 class="h2">{{ title }}</h2>
    <label v-if="findable" class="field">{{ $tx("Find a name") }}<input v-model="query" type="search" /></label>
    <p v-if="!entries.length && editingId !== 'new'" class="soft">{{ empty }}</p>
    <ul v-else class="list">
      <li v-for="entry in visible" :key="entry.id">
        <form v-if="editingId === entry.id" class="name-edit" @submit.prevent="submit">
          <label class="field">{{ $tx("Name") }}<input v-model="name" /></label>
          <span class="row name-actions">
            <button class="link" type="submit" :disabled="saving">{{ $tx("Save") }}</button>
            <button type="button" class="link" :disabled="saving" @click="editingId = null">{{ $tx("Cancel") }}</button>
            <button type="button" class="link" :disabled="saving" @click="remove(entry)">{{ $tx("Remove") }}</button>
          </span>
        </form>
        <div v-else class="row between name-line">
          <strong class="wrap-anywhere-text">{{ entry.name }}</strong>
          <button
            type="button"
            class="link"
            :disabled="disabled"
            :aria-label="$tx('Edit {name}', { name: entry.name })"
            @click="edit(entry.id, entry.name)"
          >
            {{ $tx("Edit") }}
          </button>
        </div>
      </li>
      <li v-if="editingId === 'new'" key="new">
        <form class="name-edit" @submit.prevent="submit">
          <label class="field">{{ $tx("Name") }}<input v-model="name" /></label>
          <span class="row name-actions">
            <button class="link" type="submit" :disabled="saving">{{ $tx("Save") }}</button>
            <button type="button" class="link" :disabled="saving" @click="editingId = null">{{ $tx("Cancel") }}</button>
          </span>
        </form>
      </li>
    </ul>
    <p v-if="error" class="warn" role="alert">{{ $tx(error) }}</p>
    <button v-if="editingId !== 'new'" type="button" class="link" :disabled="disabled" @click="edit('new')">{{ addLabel }}</button>
  </section>
</template>

<style>
.name-list {
  flex: 1 1 250px;
  min-width: 0;
}

.name-line {
  flex-wrap: nowrap;
}

.name-actions {
  gap: 0 18px;
}
</style>
