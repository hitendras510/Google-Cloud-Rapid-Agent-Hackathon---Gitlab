/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0f1729',
          800: '#1b2b4b',
          700: '#243654',
          600: '#2d4166',
          500: '#3a5280',
        },
        accent: {
          orange: '#e8713a',
          teal: '#22d3ae',
          red: '#ef4444',
          blue: '#3b82f6',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
