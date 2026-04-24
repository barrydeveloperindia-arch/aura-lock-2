export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0f172a',
        surface: '#1e293b',
        primary: '#3b82f6',
        success: '#10b981',
        error: '#ef4444',
        // Futuristic Theme Extensions
        navy: {
          950: '#020617',
          900: '#0f172a',
        },
        cyan: {
          glow: '#06b6d4',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

