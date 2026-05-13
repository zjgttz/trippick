import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#FF2442",
          50: "#FFE7EB",
          100: "#FFCAD3",
          200: "#FFB0BE",
          300: "#FF8294",
          400: "#FF536B",
          500: "#FF2442",
          600: "#E91E3A",
          700: "#C71732",
        },
        accent: {
          DEFAULT: "#FFB800",
          50: "#FFF4D6",
          100: "#FFE9A3",
          200: "#FFDB70",
          500: "#FFB800",
          600: "#E5A600",
        },
        ink: {
          900: "#1A1A1A",
          800: "#2E2E2E",
          700: "#4A4A4A",
          600: "#5F5F5F",
          500: "#7A7A7A",
          400: "#A0A0A0",
          300: "#C7C7C7",
          200: "#DCDCDC",
          100: "#F2F2F2",
          50: "#F8F8F8",
        },
        warn: {
          distance: "#F97316",
          opinion: "#EAB308",
          overload: "#EF4444",
          prereq: "#3B82F6",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "sans-serif",
        ],
      },
      transitionTimingFunction: {
        // Linear-style easing：起手快，落地缓
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-up-delay-1": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both",
        "fade-up-delay-2": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.16s both",
        "fade-up-delay-3": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.24s both",
        "fade-in": "fade-in 0.4s ease-out both",
        "scale-in": "scale-in 0.2s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
