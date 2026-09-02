import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dae6ff",
          200: "#bcd2ff",
          300: "#8eb5ff",
          400: "#598dff",
          500: "#3366ff",
          600: "#1b4af5",
          700: "#1438e2",
          800: "#1730b6",
          900: "#192e8f"
        }
      }
    }
  },
  plugins: []
} satisfies Config;
