import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ivory: {
          50: "#fcfaf7",
          100: "#f8f4ee",
          200: "#ede6d8",
          300: "#e3d9c8",
        },
        parchment: {
          50: "#fcfaf7",
          100: "#f8f4ee",
          200: "#ede6d8",
        },
        gold: {
          400: "#d4b06a",
          500: "#c9a15a",
          600: "#b8862f",
        },
        ink: {
          DEFAULT: "#172033",
          muted: "#6b7280",
        },
        charcoal: {
          DEFAULT: "#172033",
          muted: "#6b7280",
        },
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', "Georgia", "serif"],
        sans: ['"Manrope"', '"Source Sans 3"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        soft: "0 4px 24px -4px rgba(23, 32, 51, 0.06)",
        card: "0 12px 40px -12px rgba(23, 32, 51, 0.1)",
        "card-hover":
          "0 20px 48px -16px rgba(23, 32, 51, 0.14), 0 0 0 1px rgba(201, 161, 90, 0.12)",
        glass:
          "0 8px 32px -8px rgba(23, 32, 51, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.65)",
        glow: "0 4px 20px -4px rgba(201, 161, 90, 0.45)",
        "glow-lg": "0 8px 28px -4px rgba(201, 161, 90, 0.55)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "hero-drift": {
          "0%": { transform: "scale(1.02)" },
          "100%": { transform: "scale(1.05)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.75s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        "fade-up-delay-1": "fade-up 0.75s cubic-bezier(0.22, 1, 0.36, 1) 0.1s forwards",
        "fade-up-delay-2": "fade-up 0.75s cubic-bezier(0.22, 1, 0.36, 1) 0.2s forwards",
        "fade-up-delay-3": "fade-up 0.75s cubic-bezier(0.22, 1, 0.36, 1) 0.3s forwards",
        "hero-drift": "hero-drift 28s ease-in-out infinite alternate",
      },
    },
  },
  plugins: [],
};

export default config;
