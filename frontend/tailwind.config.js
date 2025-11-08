/** @type {import('tailwindcss').Config} */
const config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eef6ff",
          100: "#d9e9ff",
          200: "#b7d4ff",
          300: "#87b6ff",
          400: "#5490ff",
          500: "#2f6dff",
          600: "#154cf2",
          700: "#103ccc",
          800: "#1233a3",
          900: "#142f80",
        },
      },
    },
  },
  plugins: [],
};

export default config;

