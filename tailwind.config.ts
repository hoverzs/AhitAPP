import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        warm: {
          bg: "#FAF7F1",
          card: "#FFFDF8",
          soft: "#F8F1E7",
        },
        ivory: {
          50: "#FAF7F1",
          100: "#F8F1E7",
          200: "#EDE4D4",
          300: "#E3D9C8",
        },
        parchment: {
          50: "#FFFDF8",
          100: "#F8F1E7",
          200: "#EDE4D4",
        },
        gold: {
          400: "#D4A84A",
          500: "#C89B3C",
          600: "#B98225",
        },
        amber: {
          deep: "#B98225",
          soft: "#F5E6C8",
        },
        ink: {
          DEFAULT: "#172033",
          muted: "#6F7480",
        },
        sage: {
          soft: "#DDE8D5",
          muted: "#C5D4BC",
        },
        charcoal: {
          DEFAULT: "#172033",
          muted: "#6F7480",
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
        soft: "0 4px 24px -4px rgba(23, 32, 51, 0.07)",
        card:
          "0 18px 45px rgba(23, 32, 51, 0.08), 0 2px 8px rgba(201, 161, 90, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.75)",
        "card-hover":
          "0 22px 52px rgba(23, 32, 51, 0.11), 0 4px 12px rgba(201, 161, 90, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.75)",
        glass:
          "0 8px 32px -8px rgba(23, 32, 51, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.65)",
        glow: "0 4px 20px -4px rgba(200, 155, 60, 0.4)",
        "glow-lg": "0 8px 28px -4px rgba(200, 155, 60, 0.5)",
        premium:
          "0 18px 45px rgba(23, 32, 51, 0.08), 0 2px 8px rgba(201, 161, 90, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.75)",
        "icon-capsule":
          "0 6px 16px rgba(201, 161, 90, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.7)",
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
        "fade-up-delay-1":
          "fade-up 0.75s cubic-bezier(0.22, 1, 0.36, 1) 0.1s forwards",
        "fade-up-delay-2":
          "fade-up 0.75s cubic-bezier(0.22, 1, 0.36, 1) 0.2s forwards",
        "fade-up-delay-3":
          "fade-up 0.75s cubic-bezier(0.22, 1, 0.36, 1) 0.3s forwards",
        "hero-drift": "hero-drift 28s ease-in-out infinite alternate",
      },
    },
  },
  plugins: [],
};

export default config;
