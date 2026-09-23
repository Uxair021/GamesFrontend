/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cabinet: {
          green: "#0b3d24",
          "green-light": "#136b3f",
          gold: "#e8c15a",
        },
        // /home1 /home2 /home3 (ported from a separate GameFun project) — kept under its own
        // "brand" namespace so it can't collide with any of this app's existing color usage.
        brand: {
          green: "#8cc800",
          blue: "#0070dc",
          red: "#e60000",
          yellow: "#ffea00",
          orange: "#ff9f0a",
        },
      },
      fontFamily: {
        // Same reasoning as the `brand` colors above — scoped to /home1-3, not applied globally.
        ui: ['"Sora"', "ui-sans-serif", "system-ui", "sans-serif"],
        title: ['"Space Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
        stats: ['"Rajdhani"', "ui-sans-serif", "system-ui", "sans-serif"],
        jackpot: ['"Orbitron"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      // The source GameFun project runs Tailwind v4, whose default spacing/max-width scales are
      // denser than v3's — these fill in the specific extra steps its /home1-3 markup uses (v3's
      // default scale skips straight from 14/16/20/24/28... with no 15/17/18/21/22/105) so those
      // classes resolve to the same pixel values here instead of silently doing nothing.
      spacing: {
        15: "3.75rem",
        17: "4.25rem",
        18: "4.5rem",
        21: "5.25rem",
        22: "5.5rem",
        105: "26.25rem",
      },
      maxWidth: {
        "8xl": "88rem",
      },
      keyframes: {
        "celebration-in": {
          "0%": { opacity: "0", transform: "scale(0.6)" },
          "60%": { opacity: "1", transform: "scale(1.08)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        sparkle: {
          "0%, 100%": { opacity: "0.4", transform: "scale(0.9)" },
          "50%": { opacity: "1", transform: "scale(1.15)" },
        },
      },
      animation: {
        "celebration-in": "celebration-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        sparkle: "sparkle 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
