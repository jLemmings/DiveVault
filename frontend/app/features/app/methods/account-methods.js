import { replaceSessionToken } from "~/shared/composables/auth.js";
import { updatePassword } from "~/shared/api/auth.js";

// Account menus, sign-out and password change for the app shell.
export function createAccountMethods() {
  return {
    setSearchText(value) {
      this.searchText = value;
    },
    toggleMobileAccountMenu() {
      this.mobileAccountMenuOpen = !this.mobileAccountMenuOpen;
    },
    closeMobileAccountMenu() {
      this.mobileAccountMenuOpen = false;
      this.desktopAccountMenuOpen = false;
    },
    toggleDesktopAccountMenu() {
      this.desktopAccountMenuOpen = !this.desktopAccountMenuOpen;
    },
    closeDesktopAccountMenu() {
      this.desktopAccountMenuOpen = false;
    },
    async openMobileSettings() {
      this.closeMobileAccountMenu();
      this.closeDesktopAccountMenu();
      await this.setView("settings");
    },
    async signOutUser() {
      this.closeMobileAccountMenu();
      this.closeDesktopAccountMenu();
      if (typeof this.authSignOut !== "function") {
        return;
      }
      await this.authSignOut({ redirectUrl: "/" });
    },
    openPasswordDialog() {
      this.closeMobileAccountMenu();
      this.closeDesktopAccountMenu();
      this.passwordDialogOpen = true;
      this.passwordError = "";
      this.passwordStatus = "";
      this.passwordForm = {
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      };
    },
    closePasswordDialog() {
      this.passwordDialogOpen = false;
      this.passwordSubmitting = false;
      this.passwordError = "";
      this.passwordStatus = "";
      this.passwordForm = {
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      };
    },
    async submitPasswordChange() {
      this.passwordSubmitting = true;
      this.passwordError = "";
      this.passwordStatus = "";
      const currentPassword = this.passwordForm.currentPassword;
      const newPassword = this.passwordForm.newPassword;
      const confirmPassword = this.passwordForm.confirmPassword;
      if (!currentPassword || !newPassword) {
        this.passwordError = "Current password and new password are required.";
        this.passwordSubmitting = false;
        return;
      }
      if (newPassword.length < 8) {
        this.passwordError = "New password must be at least 8 characters.";
        this.passwordSubmitting = false;
        return;
      }
      if (newPassword !== confirmPassword) {
        this.passwordError = "New password confirmation does not match.";
        this.passwordSubmitting = false;
        return;
      }
      try {
        const response = await updatePassword(this.apiClient(), {
          current_password: currentPassword,
          new_password: newPassword
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        // The backend revokes all other sessions and returns a fresh token.
        replaceSessionToken(payload?.token);
        this.passwordStatus = "Password updated. Other devices have been signed out.";
        window.setTimeout(() => {
          if (this.passwordDialogOpen) {
            this.closePasswordDialog();
          }
        }, 900);
      } catch (error) {
        this.passwordError = error?.message || "Could not update the password.";
      } finally {
        this.passwordSubmitting = false;
      }
    }
  };
}
