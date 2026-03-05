import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        jua: ["Jua", "sans-serif"],
        gothic: ["Nanum Gothic", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        wood: {
          darkest: "hsl(var(--wood-darkest))",
          dark: "hsl(var(--wood-dark))",
          base: "hsl(var(--wood-base))",
          light: "hsl(var(--wood-light))",
        },
        parchment: {
          DEFAULT: "hsl(var(--parchment))",
          border: "hsl(var(--parchment-border))",
          text: "hsl(var(--parchment-text))",
        },
        magic: {
          green: "hsl(var(--magic-green))",
          "green-glow": "hsl(var(--magic-green-glow))",
          blue: "hsl(var(--magic-blue))",
          "blue-glow": "hsl(var(--magic-blue-glow))",
          orange: "hsl(var(--magic-orange))",
          "orange-glow": "hsl(var(--magic-orange-glow))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "glow-text": {
          "0%": { textShadow: "0 0 10px rgba(255,255,255,0.2), 3px 3px 0 hsl(20 68% 9%)" },
          "100%": { textShadow: "0 0 30px rgba(255,255,255,0.6), 3px 3px 0 hsl(20 68% 9%)" },
        },
        sway: {
          "0%": { transform: "rotate(-4deg)" },
          "100%": { transform: "rotate(-1deg)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "glow-text": "glow-text 3s infinite alternate",
        sway: "sway 6s infinite alternate ease-in-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
