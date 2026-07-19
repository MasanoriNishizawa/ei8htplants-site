import { Link } from 'react-router-dom'

const ITEMS = [
  { to: '/admin/events', label: 'イベント管理', desc: 'イベントの追加・編集・削除' },
  { to: '/admin/gallery', label: 'ギャラリー管理', desc: '画像のアップロード・削除' },
  { to: '/admin/stockists', label: '取扱店管理', desc: '取扱店の追加・編集' },
  { to: '/admin/reservations', label: 'WS予約一覧', desc: 'ワークショップ予約の確認' },
]

export default function Dashboard() {
  return (
    <div>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, marginBottom: 32 }}>ダッシュボード</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
        {ITEMS.map(({ to, label, desc }) => (
          <Link key={to} to={to} style={{ display: 'block', padding: 24, background: '#fffcf6', border: '1px solid #ddd4c0', borderRadius: 14, textDecoration: 'none', color: '#1c2417' }}>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 13, color: '#8a9a7e' }}>{desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
