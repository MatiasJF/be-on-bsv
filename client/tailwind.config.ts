import type { Config } from "tailwindcss";

/**
 * Tailwind config for BE on BSV.
 *
 * The BSVA brand tokens (colors + typefaces) live here. Components must
 * reference these names — never hardcode hex values or font family strings.
 * See CLAUDE.md §5 for the source of these values (BSVA Style Guide §05–§06).
 */
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class", // toggled via <html class="dark"> — dark is default in our app
  theme: {
    extend: {
      colors: {
        bsva: {
          navy: "#1B1EA9",
          blue: "#003FFF",
          cyan: "#00E6FF",
          ice: "#DAE3FF",
          grey: "#EFF0F7",
          soft: "#2D2D31",
          white: "#FFFFFF",
        },
      },
      fontFamily: {
        // Use these names everywhere instead of literal "Chillax" / "Noto Sans".
        display: ['"Chillax"', "system-ui", "sans-serif"],
        body: ['"Noto Sans"', "system-ui", "sans-serif"],
        sans: ['"Noto Sans"', "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "bsva-gradient":
          "linear-gradient(160deg, #1B1EA9 0%, #0a0d4a 50%, #2D2D31 100%)",
        "bsva-gradient-soft":
          "linear-gradient(160deg, rgba(27,30,169,0.85) 0%, rgba(10,13,74,0.85) 60%, rgba(45,45,49,0.92) 100%)",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0, 0, 0, 0.35)",
        "cyan-glow": "0 0 32px rgba(0, 230, 255, 0.35)",
        "blue-glow": "0 0 32px rgba(0, 63, 255, 0.45)",
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "rise": "rise 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
