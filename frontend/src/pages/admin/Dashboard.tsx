import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, type AdminInfoDashboardItem } from '../../lib/api'
import { formatJaDate, formatJaDateTime, formatYen, localToday } from './adminInfoFormat'
import {
  dueStatus,
  formatDueRemaining,
  formatEventPeriod,
  selectPendingPayments,
  selectUpcomingCarryIns,
  UPCOMING_DAYS,
  type DueStatus,
} from './dashboardFormat'

/** 管理メニューのカード（リンク先・名前・説明） */
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

/** 統計カードに出す件数 */
interface Stats {
  unreadContacts: number
  activeEvents: number
  pendingOrders: number
}

/** 未入力の項目に出す文言 */
const EMPTY_TEXT = '未入力'

/** 一覧の見出し（「管理メニュー」と同じ見た目） */
const sectionTitleStyle: React.CSSProperties = { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 12px' }

/** 一覧の1行（リンク）の基本の見た目。スマホ幅で横にはみ出さないよう、長い文字は折り返す */
const rowStyle: React.CSSProperties = {
  display: 'block', padding: '14px 16px', background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4,
  textDecoration: 'none', color: 'var(--c-ink)', overflowWrap: 'anywhere', minWidth: 0,
}

/** 支払い期限の状態ごとの色（行の背景・枠線・強調する文字の色・ラベル） */
const DUE_STYLES: Record<DueStatus, { background: string; border: string; color: string; label: string | null }> = {
  overdue: { background: '#fdf0ee', border: '#e6b0aa', color: '#c0392b', label: '期限切れ' },
  soon: { background: '#fff8f0', border: '#e8c870', color: '#a86b00', label: '期限間近' },
  later: { background: '#ffffff', border: '#dddde8', color: 'var(--c-body)', label: null },
  none: { background: '#ffffff', border: '#dddde8', color: 'var(--c-muted)', label: '期限未設定' },
}

/**
 * 一覧の1項目（「出店料: 14,000円」のような名前と値の組）
 * @param props.label - 項目名
 * @param props.value - 値（null なら「未入力」を薄い色で出す）
 * @param props.color - 値の文字色（強調したいとき）
 * @returns 項目の表示
 */
function Field({ label, value, color }: { label: string; value: string | null; color?: string }) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.6, minWidth: 0 }}>
      <span style={{ color: 'var(--c-muted)', marginRight: 6 }}>{label}</span>
      <span style={{ color: value === null ? 'var(--c-muted)' : color ?? 'var(--c-body)' }}>{value ?? EMPTY_TEXT}</span>
    </div>
  )
}

/**
 * 一覧の読み込み中・失敗・0件のときに出す1行の案内
 * @param props.children - 案内の文
 * @param props.error - 読み込み失敗の表示にするか（赤字）
 * @returns 案内の表示
 */
function ListNotice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return (
    <p style={{ fontSize: 13, color: error ? '#c0392b' : 'var(--c-muted)', margin: 0, padding: '14px 16px', background: '#ffffff', border: '1px dashed #dddde8', borderRadius: 4 }}>
      {children}
    </p>
  )
}

/**
 * 「出店料の支払い」の1行。期限の状態に応じて色を変え、管理情報の確認画面へのリンクにする
 * @param props.item - イベント1件分の管理情報
 * @param props.today - 今日の日付 "YYYY-MM-DD"
 * @returns 1行の表示
 */
function PaymentRow({ item, today }: { item: AdminInfoDashboardItem; today: string }) {
  const status = dueStatus(item.booth_fee_due, today)
  const st = DUE_STYLES[status]
  /** 支払い期限の表示（例: 2026年10月24日（土）（あと3日））。未設定なら null */
  const dueText = item.booth_fee_due
    ? `${formatJaDate(item.booth_fee_due) ?? item.booth_fee_due}${formatDueRemaining(item.booth_fee_due, today) ? `（${formatDueRemaining(item.booth_fee_due, today)}）` : ''}`
    : null
  return (
    <Link
      to={`/admin/events/${item.event_id}/admin-info`}
      state={{ from: '/admin' }}
      data-testid="dashboard-payment-row"
      data-due-status={status}
      style={{ ...rowStyle, background: st.background, border: `1px solid ${st.border}` }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 10px', marginBottom: 6 }}>
        <span style={{ fontWeight: 500 }}>{item.name}</span>
        {st.label && (
          <span style={{ fontSize: 11, letterSpacing: 1, padding: '1px 8px', borderRadius: 999, border: `1px solid ${st.border}`, color: st.color, background: '#ffffff' }}>
            {st.label}
          </span>
        )}
      </div>
      <Field label="開催日" value={formatEventPeriod(item.start_date, item.end_date)} />
      <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 20 }}>
        <Field label="出店料" value={formatYen(item.booth_fee)} />
        <Field label="支払い方法" value={item.booth_fee_pay_method || null} />
      </div>
      <Field label="支払い期限" value={dueText} color={status === 'later' ? undefined : st.color} />
    </Link>
  )
}

/**
 * 「今後の搬入予定」の1行。管理情報の確認画面へのリンクにする
 * @param props.item - イベント1件分の管理情報
 * @returns 1行の表示
 */
function CarryInRow({ item }: { item: AdminInfoDashboardItem }) {
  return (
    <Link
      to={`/admin/events/${item.event_id}/admin-info`}
      state={{ from: '/admin' }}
      data-testid="dashboard-carry-in-row"
      style={rowStyle}
    >
      <div style={{ fontWeight: 500, marginBottom: 6 }}>{item.name}</div>
      <Field label="開催日" value={formatEventPeriod(item.start_date, item.end_date)} />
      <Field label="会場" value={item.location || null} />
      <Field label="搬入" value={formatJaDateTime(item.carry_in_time)} />
      <Field label="搬出" value={formatJaDateTime(item.carry_out_time)} />
      <Field label="ホテル" value={item.hotel_name || null} />
    </Link>
  )
}

/**
 * 管理画面のトップ。ステータス統計カード・出店料の支払い・今後の搬入予定・各管理メニューへのナビゲーションを表示するページ
 * 支払い・搬入の一覧は統計とは別に読み込み、失敗してもほかの部分は表示し続ける
 */
export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  /** ダッシュボード用の管理情報の一覧。読み込み前は null */
  const [infoItems, setInfoItems] = useState<AdminInfoDashboardItem[] | null>(null)
  /** 管理情報の一覧の読み込みに失敗したかどうか */
  const [infoError, setInfoError] = useState(false)
  const location = useLocation()

  // location.key を依存にすることで、ページ遷移のたびに統計を再取得する
  useEffect(() => {
    api.stats().then(setStats).catch(() => {})
  }, [location.key])

  // 支払い・搬入の一覧の元になる管理情報を取得する（統計とは別にして、片方の失敗がもう片方に影響しないようにする）
  useEffect(() => {
    /** 画面を離れたあとに届いた結果で state を更新しないための印 */
    let cancelled = false
    setInfoError(false)
    api.events.getAdminInfoDashboard()
      .then((items) => { if (!cancelled) setInfoItems(items) })
      .catch(() => { if (!cancelled) setInfoError(true) })
    return () => { cancelled = true }
  }, [location.key])

  /** 今日の日付（端末の時刻。期限までの日数と搬入予定の範囲の基準） */
  const today = localToday()
  /** 出店料の支払いが残っているイベント（急ぐ順） */
  const payments = infoItems ? selectPendingPayments(infoItems, today) : []
  /** 今日から UPCOMING_DAYS 日以内に始まるイベント（開始日順） */
  const carryIns = infoItems ? selectUpcomingCarryIns(infoItems, today) : []

  /**
   * 一覧の中身を状態に応じて出し分ける
   * 1. 読み込みに失敗したら、失敗の案内
   * 2. 読み込み中なら、読み込み中の案内
   * 3. 0件なら、0件の案内
   * 4. それ以外は各行を並べる
   * @param rows - 並べる行
   * @param emptyText - 0件のときの案内
   * @returns 一覧の表示
   */
  const renderList = (rows: React.ReactNode[], emptyText: string) => {
    if (infoError) return <ListNotice error>読み込みに失敗しました。時間をおいて再度お試しください。</ListNotice>
    if (infoItems === null) return <ListNotice>読み込み中...</ListNotice>
    if (rows.length === 0) return <ListNotice>{emptyText}</ListNotice>
    return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>{rows}</div>
  }

  const statCards = [
    { label: '未読お問い合わせ', value: stats?.unreadContacts ?? '-', to: '/admin/contacts', urgent: (stats?.unreadContacts ?? 0) > 0 },
    { label: '未発送の注文', value: stats?.pendingOrders ?? '-', to: '/admin/orders', urgent: (stats?.pendingOrders ?? 0) > 0 },
    { label: '公開中のイベント', value: stats?.activeEvents ?? '-', to: '/admin/events', urgent: false },
  ]

  return (
    <div>
      <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, marginBottom: 24 }}>ダッシュボード</h2>

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

      {/* 出店料の支払い（未払いのもの。期限切れ・期限間近を先に出す） */}
      <section aria-labelledby="dashboard-payments-title" style={{ marginBottom: 32 }}>
        <h3 id="dashboard-payments-title" style={sectionTitleStyle}>出店料の支払い</h3>
        {renderList(
          payments.map((item) => <PaymentRow key={item.event_id} item={item} today={today} />),
          '未払いの出店料はありません',
        )}
      </section>

      {/* 今後の搬入予定（今日から UPCOMING_DAYS 日以内に始まるイベント） */}
      <section aria-labelledby="dashboard-carry-in-title" style={{ marginBottom: 40 }}>
        <h3 id="dashboard-carry-in-title" style={sectionTitleStyle}>今後の搬入予定</h3>
        {renderList(
          carryIns.map((item) => <CarryInRow key={item.event_id} item={item} />),
          `今日から${UPCOMING_DAYS}日以内に始まるイベントはありません`,
        )}
      </section>

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
