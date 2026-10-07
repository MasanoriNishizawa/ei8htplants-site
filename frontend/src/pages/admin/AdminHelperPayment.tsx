import { useEffect, useState } from 'react'
import { api, computeFinances, type Event, type EventFinances } from '../../lib/api'

const SERIF = "'Cormorant Garamond', 'Noto Serif JP', serif"

function fmt(n: number) {
  return n.toLocaleString('ja-JP')
}

/** 日付文字列から年度（4月始まり）を返す。例: 2026-02-01 → 2025 */
function fiscalYear(dateStr: string): number {
  const d = new Date(dateStr)
  const month = d.getMonth() + 1
  return month >= 4 ? d.getFullYear() : d.getFullYear() - 1
}

/**
 * 手伝い支払い集計ページ。
 * 手伝いありのイベントの売上利益分（WS売上を除く）を年度（4〜3月）で合計し、
 * 12で割った金額を翌期の月額支払いとして表示する。
 */
export default function AdminHelperPayment() {
  const [events, setEvents] = useState<Event[]>([])
  const [finances, setFinances] = useState<EventFinances[]>([])
  const [loading, setLoading] = useState(true)

  // 過去イベントを含む全データを並列取得
  useEffect(() => {
    Promise.all([
      api.events.list(true),
      api.events.getAllFinances(),
    ]).then(([evs, fins]) => {
      setEvents(evs)
      setFinances(fins)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p>

  const eventMap = new Map(events.map(e => [e.id, e]))

  // 年度別の手伝い支払い額（salesShare: WS売上を除く売上利益×20%）を集計
  const helperByYear = new Map<number, {
    events: { name: string; date: string; salesShare: number }[]
    total: number
  }>()

  finances.forEach(fin => {
    const event = eventMap.get(fin.event_id)
    if (!event?.start_date || !fin.payment_flag) return

    const fy = fiscalYear(event.start_date)
    // salesShare のみ集計（wsShare はWS収支ページで管理）
    const computed = computeFinances(fin, event.has_workshop ?? false)

    if (!helperByYear.has(fy)) helperByYear.set(fy, { events: [], total: 0 })
    const entry = helperByYear.get(fy)!
    entry.events.push({ name: event.name, date: event.start_date, salesShare: computed.salesShare })
    entry.total += computed.salesShare
  })

  // 年度を降順（新しい順）にソート
  const years = [...helperByYear.keys()].sort((a, b) => b - a)

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 300, marginBottom: 8 }}>
        支払い集計
      </h1>
      <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 32, lineHeight: 1.8 }}>
        手伝いありのイベントの売上利益分（WS売上を除く）を年度（4〜3月）で合計。翌期の月額支払い = 年間合計 ÷ 12。
      </p>

      {years.length === 0 ? (
        <p style={{ color: '#aaa', fontSize: 14 }}>手伝いありのイベントがありません。</p>
      ) : years.map(fy => {
        const entry = helperByYear.get(fy)!
        const monthly = Math.round(entry.total / 12)
        const sortedEvents = [...entry.events].sort((a, b) => a.date.localeCompare(b.date))
        return (
          <div key={fy} style={{ marginBottom: 36 }}>
            <h2 style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 20, margin: '0 0 12px', color: 'var(--c-ink)' }}>
              {fy}年度（{fy}/4〜{fy + 1}/3）
            </h2>

            {/* イベント別内訳 */}
            <div style={{ border: '1px solid #dddde8', borderRadius: 4, marginBottom: 12, overflow: 'hidden' }}>
              {sortedEvents.map((ev, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 16px', fontSize: 14,
                  borderBottom: i < sortedEvents.length - 1 ? '1px solid #f0f0f5' : 'none',
                }}>
                  <span>
                    {ev.name}
                    <span style={{ fontSize: 12, color: 'var(--c-muted)', marginLeft: 8 }}>{ev.date}</span>
                  </span>
                  <span style={{ color: '#4a6741', fontWeight: 500 }}>{fmt(ev.salesShare)} 円</span>
                </div>
              ))}
            </div>

            {/* 年間合計・翌期月額支払い */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, padding: '14px 18px', background: '#f9f9fb', border: '1px solid #dddde8', borderRadius: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--c-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>年間合計</div>
                <div style={{ fontSize: 22, fontWeight: 600, fontFamily: SERIF }}>{fmt(entry.total)} 円</div>
              </div>
              <div style={{ flex: 1, padding: '14px 18px', background: '#f0f5ee', border: '1px solid #b8d4ae', borderRadius: 4 }}>
                <div style={{ fontSize: 11, color: '#4a6741', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                  {fy + 1}年度 月額支払い
                </div>
                <div style={{ fontSize: 22, fontWeight: 600, fontFamily: SERIF, color: '#2d5a27' }}>{fmt(monthly)} 円/月</div>
                <div style={{ fontSize: 11, color: '#4a6741', marginTop: 4 }}>{fmt(entry.total)} 円 ÷ 12</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
