/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Core backgrounds — very dark, Voicebox-accurate
        ink:    "#090910",   // window background
        panel:  "#0e0e17",   // sidebar / card surface
        panel2: "#13131e",   // elevated surface
        panel3: "#181828",   // input / deeper card
        // Borders — barely-there, like the original
        edge:   "rgba(255,255,255,0.07)",
        edge2:  "rgba(255,255,255,0.12)",
        // Accent — Voicebox bright purple
        accent:  "#7c4dff",
        accent2: "#9d7bff",
        accentDim: "rgba(124,77,255,0.18)",
        // Status
        success: "#34d399",
        warn:    "#fbbf24",
        danger:  "#f87171",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Display"', '"Segoe UI"', "system-ui", "sans-serif"],
        mono: ['"SF Mono"', '"Fira Code"', "monospace"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(124,77,255,0.25)",
        "glow-sm": "0 0 12px rgba(124,77,255,0.18)",
        card: "0 1px 3px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
      },
      backgroundImage: {
        "accent-grad": "linear-gradient(135deg, #7c4dff 0%, #b06bff 100%)",
        "sidebar-grad": "linear-gradient(180deg, #0e0e17 0%, #0b0b14 100%)",
      },
    },
  },
  plugins: [],
};
