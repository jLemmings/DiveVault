/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,vue}"],
  theme: {
    extend: {
      colors: {
        background: "#001525",
        surface: "#001525",
        "surface-bright": "#233b50",
        "surface-dim": "#001525",
        "surface-variant": "#1f374b",
        "surface-container": "#062135",
        "surface-container-low": "#021d30",
        "surface-container-lowest": "#000f1d",
        "surface-container-high": "#132c40",
        "surface-container-highest": "#1f374b",
        primary: "#9ccaff",
        "primary-container": "#001a31",
        secondary: "#b3cad6",
        "secondary-container": "#374c56",
        tertiary: "#ffb77d",
        "tertiary-container": "#2b1300",
        "tertiary-fixed": "#ffdcc3",
        "tertiary-fixed-dim": "#ffb77d",
        outline: "#8d9197",
        "outline-variant": "#43474c",
        "on-background": "#cde5ff",
        "on-surface": "#cde5ff",
        "on-surface-variant": "#c3c7cd",
        "on-primary": "#003257",
        "on-secondary": "#1e333d",
        "on-secondary-container": "#a5bcc8",
        "on-tertiary": "#4d2600",
        error: "#ffb4ab",
        "error-container": "#93000a",
        "on-error-container": "#ffdad6"
      },
      fontFamily: {
        headline: ["Space Grotesk", "sans-serif"],
        body: ["Manrope", "sans-serif"],
        label: ["Space Grotesk", "sans-serif"]
      },
      boxShadow: {
        panel: "0 20px 40px rgba(0, 15, 29, 0.32)"
      }
    }
  },
  plugins: []
};
