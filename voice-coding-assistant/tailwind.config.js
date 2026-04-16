/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./voice.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        glass: {
          100: "rgba(255, 255, 255, 0.1)",
          200: "rgba(255, 255, 255, 0.2)",
          300: "rgba(255, 255, 255, 0.3)",
          400: "rgba(255, 255, 255, 0.4)",
        },
        dark: {
          900: "#0a0a0a",
          800: "#1a1a1a",
          700: "#2a2a2a",
        },
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "wave": "wave 1s ease-in-out infinite",
      },
      keyframes: {
        wave: {
          "0%, 100%": { transform: "scaleY(0.5)" },
          "50%": { transform: "scaleY(1)" },
        },
      },
    },
  },
  plugins: [],
};
