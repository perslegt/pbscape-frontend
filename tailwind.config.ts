import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Simpel OSRS-achtig accent kleurtje voor "gold" / highlights
        gold: "#d4af37",
      },
    },
  },
  plugins: [],
};

export default config;
