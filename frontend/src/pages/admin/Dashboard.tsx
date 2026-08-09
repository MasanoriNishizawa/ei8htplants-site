import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../../lib/api'

const ITEMS = [
  { to: '/admin/events', label: 'イベント管理', desc: 'イベントの追加・編集・削除' },
  { to: '/admin/gallery', label: 'ギャラリー管理', desc: '画像のアップロード・削除' },
  { to: '/admin/stockists', label: '取扱店管理', desc: '取扱店の追加・編集' },
  { to: '/admin/reservations', label: 'WS予約一覧', desc: 'ワークショップ予約の確認・ステータス管理' },
  { to: '/admin/collaborations', label: 'コラボレーション', desc: 'コラボ記事の追加・削除' },
  { to: '/admin/contacts', label: 'お問い合わせ', desc: 'お問い合わせ内容の確認' },
  { to: '/admin/products', label: '商品管理', desc: '商品の追加・編集・在庫管理' },
  { to: '/admin/orders', label: '注文管理', desc: '注文の確認・発送ステータス管理' },
  { to: '/admin/articles', label: '記事管理', desc: 'Journalの記事作成・編集・公開' },
]

interface Stats {
  unreadContacts: number
  pendingReservations: number
  activeEvents: number
  pendingOrders: number
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const location = useLocation()

  useEffect(() => {
    api.stats().then(setStats).catch(() => {})
  }, [location.key])

  const statCards = [
    { label: '未読お問い合わせ', value: stats?.unreadContacts ?? '-', to: '/admin/contacts', urgent: (stats?.unreadContacts ?? 0) > 0 },
    { label: '未確認の予約', value: stats?.pendingReservations ?? '-', to: '/admin/reservations', urgent: (stats?.pendingReservations ?? 0) > 0 },
    { label: '未発送の注文', value: stats?.pendingOrders ?? '-', to: '/admin/orders', urgent: (stats?.pendingOrders ?? 0) > 0 },
    { label: '公開中のイベント', value: stats?.activeEvents ?? '-', to: '/admin/events', urgent: false },
  ]

  return (
    <div>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, marginBottom: 24 }}>ダッシュボード</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 40 }}>
        {statCards.map(({ label, value, to, urgent }) => (
          <Link key={to} to={to} style={{ textDecoration: 'none', display: 'block', padding: '20px 24px', background: urgent ? '#fff8f0' : '#ffffff', border: `1px solid ${urgent ? '#e8c870' : '#dddde8'}`, borderRadius: 4 }}>
            <div style={{ fontSize: 32, fontWeight: 200, color: urgent ? '#c0392b' : '#1c2417', marginBottom: 6, lineHeight: 1 }}>
              {value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-muted)', letterSpacing: 0.5 }}>{label}</div>
          </Link>
        ))}
      </div>

      <p style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 16px' }}>管理メニュー</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {ITEMS.map(({ to, label, desc }) => (
          <Link key={to} to={to} style={{ display: 'block', padding: 24, background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, textDecoration: 'none', color: 'var(--c-ink)' }}>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 13, color: 'var(--c-muted)' }}>{desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
