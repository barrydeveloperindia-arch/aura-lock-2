export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: '#2563eb',
                secondary: '#3b82f6',
                accent: '#6366f1',
                dark: {
                    DEFAULT: '#0f172a',
                    lighter: '#1e293b',
                    border: '#334155'
                }
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'scan': 'scan 2s linear infinite',
            },
            backgroundImage: {
                'mesh': 'radial-gradient(at 0% 0%, rgba(37, 99, 235, 0.15) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(99, 102, 241, 0.1) 0px, transparent 50%)',
            },
            keyframes: {
                scan: {
                    '0%': { top: '0%' },
                    '100%': { top: '100%' }
                }
            }
        },
    },
    plugins: [],
}
