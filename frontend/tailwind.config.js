/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        shield: {
          50:  "#f0f9ff",
          100: "#e0f2fe",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          900: "#0c4a6e",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "fade-in":      "fadeIn 0.4s ease-out",
        "slide-up":     "slideUp 0.5s ease-out",
        "slide-in-right": "slideInRight 0.4s ease-out",
        "glow-pulse":   "glowPulse 2s ease-in-out infinite",
        "float":        "float 6s ease-in-out infinite",
        "scan-line":    "scanLine 2s linear infinite",
        "count-up":     "countUp 1s ease-out",
        "shimmer":      "shimmer 2s linear infinite",
      },
      keyframes: {
        fadeIn:       { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp:      { from: { opacity: "0", transform: "translateY(20px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        slideInRight: { from: { opacity: "0", transform: "translateX(20px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        glowPulse:    { "0%,100%": { boxShadow: "0 0 20px rgba(14,165,233,0.3)" }, "50%": { boxShadow: "0 0 40px rgba(14,165,233,0.6)" } },
        float:        { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
        scanLine:     { from: { transform: "translateY(-100%)" }, to: { transform: "translateY(100vh)" } },
        shimmer:      { from: { backgroundPosition: "-200% 0" }, to: { backgroundPosition: "200% 0" } },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "grid-pattern": "linear-gradient(rgba(14,165,233,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,0.05) 1px, transparent 1px)",
        "shimmer-gradient": "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)",
      },
      backgroundSize: {
        "grid": "40px 40px",
      },
      boxShadow: {
        "glow-sky":  "0 0 30px rgba(14,165,233,0.25)",
        "glow-red":  "0 0 30px rgba(239,68,68,0.25)",
        "glow-emerald": "0 0 30px rgba(52,211,153,0.25)",
        "card":      "0 4px 24px rgba(0,0,0,0.4)",
        "card-hover":"0 8px 40px rgba(0,0,0,0.6)",
      },
    },
  },
  plugins: [],
};
