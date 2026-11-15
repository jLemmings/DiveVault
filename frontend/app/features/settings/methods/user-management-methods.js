import { emptyInviteDraft } from "~/shared/utils/settings-profile.js";

// Instance owner user management: registration setting, invites, activation, roles and deletion.
export function createUserManagementMethods() {
  return {
    async fetchUserManagement() {
      if (!this.canManageUsers) {
        return;
      }
      this.manageUsersLoading = true;
      this.manageUsersError = "";
      try {
        const [settingsResponse, usersResponse] = await Promise.all([
          this.authenticatedFetch("/api/auth/settings"),
          this.authenticatedFetch("/api/users")
        ]);
        if (!settingsResponse.ok) {
          throw new Error(await this.readErrorResponse(settingsResponse, "Could not load authentication settings."));
        }
        if (!usersResponse.ok) {
          throw new Error(await this.readErrorResponse(usersResponse, "Could not load the user directory."));
        }
        const settingsPayload = await settingsResponse.json().catch(() => ({}));
        const usersPayload = await usersResponse.json().catch(() => ({}));
        this.authSettings = {
          public_registration_enabled: Boolean(settingsPayload?.public_registration_enabled),
          owner_user_id: settingsPayload?.owner_user_id || "",
          user_count: Number(settingsPayload?.user_count || 0),
          initialized: Boolean(settingsPayload?.initialized)
        };
        this.authUsers = Array.isArray(usersPayload?.users) ? usersPayload.users : [];
      } catch (error) {
        this.manageUsersError = error?.message || "Could not load user management.";
      } finally {
        this.manageUsersLoading = false;
      }
    },
    async savePublicRegistrationSetting() {
      this.manageUsersSaving = true;
      this.manageUsersError = "";
      this.manageUsersStatus = "";
      try {
        const response = await this.authenticatedFetch("/api/auth/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_registration_enabled: Boolean(this.authSettings.public_registration_enabled)
          })
        });
        if (!response.ok) {
          throw new Error(await this.readErrorResponse(response, "Could not update public registration."));
        }
        const payload = await response.json().catch(() => ({}));
        this.authSettings = {
          public_registration_enabled: Boolean(payload?.public_registration_enabled),
          owner_user_id: payload?.owner_user_id || "",
          user_count: Number(payload?.user_count || this.authUsers.length),
          initialized: Boolean(payload?.initialized)
        };
        this.manageUsersStatus = this.authSettings.public_registration_enabled
          ? "Public registration enabled."
          : "Public registration disabled.";
      } catch (error) {
        this.manageUsersError = error?.message || "Could not update public registration.";
      } finally {
        this.manageUsersSaving = false;
      }
    },
    async createUserInvite() {
      this.inviteSubmitting = true;
      this.manageUsersError = "";
      this.manageUsersStatus = "";
      try {
        const response = await this.authenticatedFetch("/api/auth/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.inviteDraft)
        });
        if (!response.ok) {
          throw new Error(await this.readErrorResponse(response, "Could not create the invitation."));
        }
        const payload = await response.json().catch(() => ({}));
        const inviteUrl = String(payload?.invite_url || "");
        this.latestInviteUrl = inviteUrl.startsWith("/") ? `${window.location.origin}${inviteUrl}` : inviteUrl;
        this.manageUsersStatus = `Invitation created for ${this.inviteDraft.email.trim()}.`;
        this.inviteDraft = {
          ...emptyInviteDraft(),
          role: this.inviteDraft.role,
          expires_in_days: this.inviteDraft.expires_in_days
        };
        await this.fetchUserManagement();
      } catch (error) {
        this.manageUsersError = error?.message || "Could not create the invitation.";
      } finally {
        this.inviteSubmitting = false;
      }
    },
    async copyLatestInviteUrl() {
      if (!this.latestInviteUrl || !navigator?.clipboard?.writeText) {
        this.manageUsersError = "Clipboard access is unavailable in this browser.";
        return;
      }
      try {
        await navigator.clipboard.writeText(this.latestInviteUrl);
        this.manageUsersStatus = "Invitation link copied.";
        this.manageUsersError = "";
      } catch {
        this.manageUsersError = "Could not copy the invitation link.";
      }
    },
    async toggleManagedUserActive(user) {
      if (!user?.id || user.id === this.ownerUserId) {
        return;
      }
      this.manageUsersSaving = true;
      this.manageUsersError = "";
      this.manageUsersStatus = "";
      try {
        const response = await this.authenticatedFetch(`/api/users/${user.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: !user.is_active })
        });
        if (!response.ok) {
          throw new Error(await this.readErrorResponse(response, "Could not update the user status."));
        }
        const payload = await response.json().catch(() => ({}));
        const updatedUser = payload?.user || user;
        this.manageUsersStatus = updatedUser.is_active ? `Reactivated ${updatedUser.email}.` : `Deactivated ${updatedUser.email}.`;
        await this.fetchUserManagement();
      } catch (error) {
        this.manageUsersError = error?.message || "Could not update the user status.";
      } finally {
        this.manageUsersSaving = false;
      }
    },
    async toggleManagedUserRole(user) {
      if (!user?.id || user.id === this.ownerUserId) {
        return;
      }
      const nextRole = user.role === "admin" ? "user" : "admin";
      this.manageUsersSaving = true;
      this.manageUsersError = "";
      this.manageUsersStatus = "";
      try {
        const response = await this.authenticatedFetch(`/api/users/${user.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: nextRole })
        });
        if (!response.ok) {
          throw new Error(await this.readErrorResponse(response, "Could not update the user role."));
        }
        this.manageUsersStatus = `${user.email} is now ${nextRole}.`;
        await this.fetchUserManagement();
      } catch (error) {
        this.manageUsersError = error?.message || "Could not update the user role.";
      } finally {
        this.manageUsersSaving = false;
      }
    },
    async deleteManagedUser(user) {
      if (!user?.id || user.id === this.ownerUserId) {
        return;
      }
      const confirmed = window.confirm(`Delete ${user.email}? This cannot be undone.`);
      if (!confirmed) {
        return;
      }
      this.manageUsersSaving = true;
      this.manageUsersError = "";
      this.manageUsersStatus = "";
      try {
        const response = await this.authenticatedFetch(`/api/users/${user.id}`, {
          method: "DELETE"
        });
        if (!response.ok) {
          throw new Error(await this.readErrorResponse(response, "Could not delete the user."));
        }
        this.manageUsersStatus = `${user.email} was removed.`;
        await this.fetchUserManagement();
      } catch (error) {
        this.manageUsersError = error?.message || "Could not delete the user.";
      } finally {
        this.manageUsersSaving = false;
      }
    }
  };
}
