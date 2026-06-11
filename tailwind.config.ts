import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        asphalt: "#0E0F11",
        surface: "#17181B",
        raised: "#1E2024",
        line: "#2A2C31",
        chalk: "#F4F2ED",
        muted: "#9B9890",
        game: "#FF5C1A",
        gamedim: "#B23E0F",
        wood: "#D7A36A",
        make: "#7BD88F",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
      },
      borderRadius: { card: "14px" },
    },
  },
  plugins: [],
};
export default config;
