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
          500: "#FF2442",
          600: "#E91E3A",
        },
        accent: {
          DEFAULT: "#FFB800",
          50: "#FFF4D6",
          500: "#FFB800",
          600: "#E5A600",
        },
        ink: {
          900: "#1A1A1A",
          700: "#4A4A4A",
          500: "#7A7A7A",
          300: "#C7C7C7",
          100: "#F2F2F2",
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
    },
  },
  plugins: [],
};

export default config;
