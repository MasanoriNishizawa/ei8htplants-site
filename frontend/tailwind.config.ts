// Tailwind CSS の設定。画面はほぼインラインスタイルで作っており、Tailwind のクラスはほとんど使っていない
import type { Config } from 'tailwindcss'

/** Tailwind の設定 */
const config: Config = {
  // 使っているクラスを探すファイル（ここに出てくるクラスの CSS だけを作る）
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // 追加の色（bg-card-bg などで使える。サイトの色は index.css の --c-* が正）
      colors: {
        bg: '#f7f3ec',
        'card-bg': '#fffcf6',
        'text-main': '#1c2417',
        'text-sub': '#3a4535',
        'text-muted': '#8a9a7e',
        border: '#ddd4c0',
        link: '#4a6741',
      },
      // 書体（font-serif・font-sans）
      fontFamily: {
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['Noto Sans JP', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      // 角丸（rounded-card・rounded-tag）
      borderRadius: {
        card: '14px',
        tag: '20px',
      },
      // 最大幅（max-w-site）
      maxWidth: {
        site: '1280px',
      },
    },
  },
  plugins: [],
}

export default config
