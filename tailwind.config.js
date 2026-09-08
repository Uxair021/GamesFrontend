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
