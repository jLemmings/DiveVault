<script>
import { settingsContextComputed, settingsContextMethods } from "./settings-context.js";

export default {
  name: "UserManagementTab",
  inject: ["settingsContext"],
  computed: {
    ...settingsContextComputed([
      "authSettings",
      "authUsers",
      "inviteDraft",
      "inviteSubmitting",
      "latestInviteUrl",
      "manageUsersError",
      "manageUsersLoading",
      "manageUsersSaving",
      "manageUsersStatus",
      "ownerUserId"
    ])
  },
  methods: {
    ...settingsContextMethods([
      "copyLatestInviteUrl",
      "createUserInvite",
      "deleteManagedUser",
      "displayValue",
      "fetchUserManagement",
      "formatDateTime",
      "savePublicRegistrationSetting",
      "toggleManagedUserActive",
      "toggleManagedUserRole"
    ])
  }
};
</script>

<template>
  <div class="settings-panel settings-card">
    <div class="settings-card-header">
      <div>
        <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Manage Users</p>
        <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Invites And Access Control</h4>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Invite new divers, review who can sign in, and control whether self-registration is open on this instance.</p>
      </div>
    </div>

    <div v-if="manageUsersStatus" class="settings-feedback border-primary/20 bg-primary/10 text-primary">{{ manageUsersStatus }}</div>
    <div v-if="manageUsersError" class="settings-feedback border-error/20 bg-error-container/20 text-on-error-container">{{ manageUsersError }}</div>

    <div class="settings-action-grid">
      <div class="settings-action-card">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-3">
              <span class="material-symbols-outlined text-primary">how_to_reg</span>
              <p class="font-headline text-xl font-bold text-on-surface">Public Registration</p>
            </div>
            <p class="mt-3 text-sm leading-6 text-secondary">Keep sign-up closed and use invitations only, or open self-registration for this DiveVault instance.</p>
          </div>
          <span class="settings-chip" :class="authSettings.public_registration_enabled ? 'is-accent' : ''">
            {{ authSettings.public_registration_enabled ? 'Open' : 'Invite only' }}
          </span>
        </div>
        <label class="mt-5 flex items-start gap-4 rounded-2xl border border-primary/10 bg-background/20 px-4 py-4">
          <input v-model="authSettings.public_registration_enabled" type="checkbox" class="mt-1 h-5 w-5 rounded border-primary/20 bg-surface-container-high text-primary focus:ring-primary/30" />
          <div>
            <p class="text-sm font-semibold text-on-surface">Allow direct account creation</p>
            <p class="mt-1 text-sm leading-6 text-secondary">When disabled, new users must come through an invite link from the instance owner.</p>
          </div>
        </label>
        <button @click="savePublicRegistrationSetting" :disabled="manageUsersSaving || manageUsersLoading" class="settings-button settings-button-primary mt-5">
          {{ manageUsersSaving ? 'Saving Access Policy' : 'Save Access Policy' }}
        </button>
      </div>

      <div class="settings-action-card">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-3">
              <span class="material-symbols-outlined text-primary">person_add</span>
              <p class="font-headline text-xl font-bold text-on-surface">Invite User</p>
            </div>
            <p class="mt-3 text-sm leading-6 text-secondary">Create a one-time sign-up link for a second diver or admin on this instance.</p>
          </div>
          <span class="settings-chip">{{ authUsers.length }} users</span>
        </div>
        <div class="mt-5 grid gap-4 md:grid-cols-2">
          <label class="space-y-2 md:col-span-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Email</span>
            <input v-model.trim="inviteDraft.email" type="email" class="settings-input" placeholder="second-user@example.com" />
          </label>
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">First Name</span>
            <input v-model.trim="inviteDraft.first_name" type="text" class="settings-input" placeholder="First name" />
          </label>
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Last Name</span>
            <input v-model.trim="inviteDraft.last_name" type="text" class="settings-input" placeholder="Last name" />
          </label>
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Role</span>
            <select v-model="inviteDraft.role" class="settings-input">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Expires In Days</span>
            <input v-model.number="inviteDraft.expires_in_days" type="number" min="1" max="30" class="settings-input" />
          </label>
        </div>
        <div class="mt-5 flex flex-wrap gap-3">
          <button @click="createUserInvite" :disabled="inviteSubmitting || manageUsersLoading" class="settings-button settings-button-primary">
            {{ inviteSubmitting ? 'Creating Invite' : 'Create Invite' }}
          </button>
          <button v-if="latestInviteUrl" @click="copyLatestInviteUrl" class="settings-button settings-button-secondary">Copy Invite Link</button>
        </div>
        <div v-if="latestInviteUrl" class="mt-5 rounded-2xl border border-primary/10 bg-background/20 px-4 py-4">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Latest Invite Link</p>
          <p class="mt-2 break-all text-sm font-semibold text-primary">{{ latestInviteUrl }}</p>
        </div>
      </div>
    </div>

    <div class="mt-6 space-y-4">
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Current Users</p>
          <p class="mt-2 text-sm text-secondary">The owner account stays protected. Other users can be promoted, disabled, or removed here.</p>
        </div>
        <button @click="fetchUserManagement" :disabled="manageUsersLoading || manageUsersSaving" class="settings-button settings-button-secondary">
          {{ manageUsersLoading ? 'Refreshing' : 'Refresh' }}
        </button>
      </div>

      <div v-if="manageUsersLoading && authUsers.length === 0" class="settings-empty-state">
        <p class="font-headline text-lg font-bold">Loading users</p>
        <p class="mt-2 text-sm text-secondary">Reading the current instance access list.</p>
      </div>

      <div v-else-if="authUsers.length === 0" class="settings-empty-state">
        <p class="font-headline text-lg font-bold">No users found</p>
        <p class="mt-2 text-sm text-secondary">Create an invitation above to add another diver.</p>
      </div>

      <div v-else class="space-y-4">
        <article v-for="user in authUsers" :key="user.id" class="settings-item-card">
          <div class="settings-item-header">
            <div class="min-w-0">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ user.id === ownerUserId ? 'Owner' : 'User' }}</p>
              <h5 class="mt-2 font-headline text-2xl font-bold tracking-tight text-on-surface">{{ user.email }}</h5>
              <div class="settings-chip-row mt-3">
                <span class="settings-chip" :class="user.role === 'admin' ? 'is-accent' : ''">{{ user.role }}</span>
                <span class="settings-chip" :class="user.is_active ? 'is-accent' : ''">{{ user.is_active ? 'Active' : 'Inactive' }}</span>
                <span v-if="user.id === ownerUserId" class="settings-chip">Protected</span>
              </div>
            </div>

            <div v-if="user.id !== ownerUserId" class="settings-toolbar">
              <button @click="toggleManagedUserRole(user)" :disabled="manageUsersSaving" class="settings-button settings-button-secondary">
                {{ user.role === 'admin' ? 'Make User' : 'Make Admin' }}
              </button>
              <button @click="toggleManagedUserActive(user)" :disabled="manageUsersSaving" class="settings-button settings-button-secondary">
                {{ user.is_active ? 'Deactivate' : 'Activate' }}
              </button>
              <button @click="deleteManagedUser(user)" :disabled="manageUsersSaving" class="settings-button settings-button-danger">Delete</button>
            </div>
          </div>

          <div class="settings-detail-grid">
            <div class="settings-info-card">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Name</p>
              <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue([user.first_name, user.last_name].filter(Boolean).join(' ')) }}</p>
            </div>
            <div class="settings-info-card">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Last Login</p>
              <p class="mt-2 text-base font-semibold text-on-surface">{{ formatDateTime(user.last_login_at) }}</p>
            </div>
            <div class="settings-info-card">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Created</p>
              <p class="mt-2 text-base font-semibold text-on-surface">{{ formatDateTime(user.created_at) }}</p>
            </div>
            <div class="settings-info-card">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Updated</p>
              <p class="mt-2 text-base font-semibold text-on-surface">{{ formatDateTime(user.updated_at) }}</p>
            </div>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>


