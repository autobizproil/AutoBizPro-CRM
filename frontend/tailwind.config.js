/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          blue:  '#2398c2',
          green: '#b1e239',
          gray:  '#cfcfcf',
        },
      },
    },
  },
  plugins: [],
}
