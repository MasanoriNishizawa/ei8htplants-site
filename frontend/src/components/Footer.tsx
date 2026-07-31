import { Link, useLocation } from 'react-router-dom'

const SANS = "'Noto Sans JP', sans-serif"

const SHOP_PATHS = ['/shop', '/checkout', '/order']

export default function Footer() {
  const { pathname } = useLocation()
  const showLegal = SHOP_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))

  return (
    <footer style={{ textAlign: 'center', padding: '60px 0', marginTop: 'auto' }}>
      <p style={{ fontSize: 12, marginBottom: 12, color: '#777', lineHeight: 1.6, letterSpacing: '0.5px' }}>
        ※「HABITATSTYLE / ハビタットスタイル」は Shabomaniac! (および THE SUCCULENTIST) の登録商標です。
      </p>
      {showLegal && (
        <div style={{ marginBottom: 16 }}>
          <Link
            to="/legal"
            style={{ fontFamily: SANS, fontSize: 12, color: '#aaa', textDecoration: 'none', letterSpacing: '0.5px' }}
          >
            特定商取引法に基づく表示
          </Link>
        </div>
      )}
      <div style={{ color: '#999', fontSize: 12 }}>
        &copy; 2026 ei8ht plants. All Rights Reserved.
      </div>
    </footer>
  )
}
