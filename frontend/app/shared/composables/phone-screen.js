const PHONE_QUERY = "(max-width: 700px)";

// For the few places where a phone gets different markup rather than different styling.
export const phoneScreen = {
  data() {
    return { isPhone: window.matchMedia(PHONE_QUERY).matches };
  },
  mounted() {
    this.phoneQuery = window.matchMedia(PHONE_QUERY);
    this.onPhoneChange = (event) => {
      this.isPhone = event.matches;
    };
    this.phoneQuery.addEventListener("change", this.onPhoneChange);
  },
  beforeUnmount() {
    this.phoneQuery?.removeEventListener("change", this.onPhoneChange);
  }
};
