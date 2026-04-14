/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./index.html"],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: "#1a1a1a",
          border: "#333333",
          text: "#cccccc",
        },
      },
    },
  },
  plugins: [],
};
