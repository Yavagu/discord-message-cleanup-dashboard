/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        discord: {
          blurple: '#7289da',
          'blurple-hover': '#5b6eae',
          green: '#43b581',
          yellow: '#faa61a',
          fuchsia: '#f04747',
          red: '#f04747',
          'red-hover': '#d83c3e',
          dark: {
            bg: '#1e2124',
            card: '#36393e',
            sidebar: '#282b30',
            accent: '#424549',
            hover: '#424549',
            text: '#dcddde',
            muted: '#8e9297'
          }
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace']
      }
    },
  },
  plugins: [],
}
