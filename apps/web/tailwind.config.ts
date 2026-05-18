import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        system: {
          bg: "#06070D",
          card: "#10131F",
          border: "#1F2937",
          purple: "#7C3AED",
          cyan: "#22D3EE",
          success: "#22C55E",
          danger: "#EF4444",
          warning: "#F59E0B",
          text: "#F8FAFC",
          muted: "#94A3B8"
        }
      },
      boxShadow: {
        glow: "0 0 24px rgba(124, 58, 237, 0.26)",
        cyan: "0 0 18px rgba(34, 211, 238, 0.22)"
      },
      fontFamily: {
        display: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "SFMono-Regular", "Consolas", "monospace"]
      }
    }
  },
  plugins: []
} satisfies Config;
