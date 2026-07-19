import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f7f3ec',
        'card-bg': '#fffcf6',
        'text-main': '#1c2417',
        'text-sub': '#3a4535',
        'text-muted': '#8a9a7e',
        border: '#ddd4c0',
        link: '#4a6741',
      },
      fontFamily: {
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['Noto Sans JP', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
        tag: '20px',
      },
      maxWidth: {
        site: '1280px',
      },
    },
  },
  plugins: [],
}

export default config
