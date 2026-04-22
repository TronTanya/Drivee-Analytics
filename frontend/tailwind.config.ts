import type { Config } from "tailwindcss";

/**
 * Drivee Analytics Notebook — Tailwind theme extensions.
 * Spec: DESIGN_SYSTEM.md
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f6fbe7",
          100: "#edf9cf",
          200: "#e1f8ab",
          300: "#d2f774",
          400: "#c4f34e",
          500: "#b9ff31",
          DEFAULT: "#97db00",
          600: "#97db00",
          700: "#7aa700",
          800: "#5e8400",
          900: "#3e5c00"
        },
        surface: {
          canvas: "#f3f4f6",
          page: "#f3f4f6",
          card: "#ffffff",
          muted: "#f7f8fa"
        },
        border: {
          subtle: "#e2e8f0",
          DEFAULT: "#cfd4dd"
        },
        foreground: {
          DEFAULT: "#111111",
          secondary: "#5b6472",
          muted: "#7a8391"
        },
        success: {
          soft: "#eefcf4",
          DEFAULT: "#18a15f",
          bold: "#12814c"
        },
        warning: {
          soft: "#fffbeb",
          DEFAULT: "#d97706",
          bold: "#b45309"
        },
        danger: {
          soft: "#fff1f2",
          DEFAULT: "#e11d48",
          bold: "#be123c"
        },
        info: {
          soft: "#f0f9ff",
          DEFAULT: "#0284c7",
          bold: "#0369a1"
        },
        chart: {
          1: "#111111",
          2: "#97db00",
          3: "#5b6472",
          4: "#0ea5e9",
          5: "#f59e0b",
          6: "#8b94a4"
        }
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      fontSize: {
        display: ["1.875rem", { lineHeight: "2.25rem", fontWeight: "600" }],
        "heading-1": ["1.5rem", { lineHeight: "2rem", fontWeight: "600" }],
        "heading-2": ["1.25rem", { lineHeight: "1.75rem", fontWeight: "600" }],
        "heading-3": ["1rem", { lineHeight: "1.5rem", fontWeight: "600" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.25rem" }]
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(15 23 42 / 0.04)",
        soft: "0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.06)",
        card: "0 4px 12px 0 rgb(15 23 42 / 0.06), 0 1px 2px 0 rgb(15 23 42 / 0.04)",
        modal: "0 12px 40px 0 rgb(15 23 42 / 0.12), 0 4px 12px 0 rgb(15 23 42 / 0.08)"
      },
      borderRadius: {
        control: "0.5rem",
        card: "0.75rem",
        panel: "1rem"
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.72" }
        }
      },
      animation: {
        "pulse-soft": "pulse-soft 1.8s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
