// PostCSS の設定。CSS に Tailwind を展開し、古いブラウザ向けの接頭辞（-webkit- など）を自動で付ける
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
