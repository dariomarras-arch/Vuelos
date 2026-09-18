import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          50: "#f5f7fa",
          100: "#e9edf3",
          200: "#cfd8e3",
          300: "#a9b8cc",
          400: "#7c8fab",
          500: "#5c718f",
          600: "#475873",
          700: "#39475e",
          800: "#252e3d",
          850: "#1a2129",
          900: "#12161d",
          950: "#0a0d12",
        },
        accent: {
          400: "#5eead4",
          500: "#2dd4bf",
          600: "#14b8a6",
        },
        opp: {
          exceptional: "#2dd4bf",
          great: "#4ade80",
          interesting: "#a3e635",
          normal: "#94a3b8",
          high: "#f87171",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(10,13,18,0.4), 0 0 0 1px rgba(255,255,255,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
