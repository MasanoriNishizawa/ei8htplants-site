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

/** ワークショップ収支の年度別集計ページ */
export default function AdminWsSummary() {
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

  // 年度別のWS収支（WS売上・手伝い分=WS売上×70%）を集計
  const wsByYear = new Map<number, {
    events: { name: string; date: string; wsSales: number; wsShare: number }[]
    totalWsSales: number
    totalWsShare: number
  }>()

  finances.forEach(fin => {
    const event = eventMap.get(fin.event_id)
    if (!event?.start_date || !event.has_workshop) return

    const computed = computeFinances(fin, true)
    if (computed.wsSales <= 0) return

    const fy = fiscalYear(event.start_date)
    if (!wsByYear.has(fy)) wsByYear.set(fy, { events: [], totalWsSales: 0, totalWsShare: 0 })
    const entry = wsByYear.get(fy)!
    entry.events.push({ name: event.name, date: event.start_date, wsSales: computed.wsSales, wsShare: computed.wsShare })
    entry.totalWsSales += computed.wsSales
    entry.totalWsShare += computed.wsShare
  })

  const years = [...wsByYear.keys()].sort((a, b) => b - a)

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 300, marginBottom: 8 }}>
        ワークショップ収支
      </h1>
      <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 32, lineHeight: 1.8 }}>
        WSありのイベントのWS売上と手伝い分（WS売上×70%）を年度（4〜3月）別に集計します。
      </p>

      {years.length === 0 ? (
        <p style={{ color: '#aaa', fontSize: 14 }}>ワークショップのデータがありません。</p>
      ) : years.map(fy => {
        const entry = wsByYear.get(fy)!
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
                  display: 'grid', gridTemplateColumns: '1fr auto auto',
                  gap: 16, padding: '10px 16px', fontSize: 14, alignItems: 'center',
                  borderBottom: i < sortedEvents.length - 1 ? '1px solid #f0f0f5' : 'none',
                }}>
                  <span>
                    {ev.name}
                    <span style={{ fontSize: 12, color: 'var(--c-muted)', marginLeft: 8 }}>{ev.date}</span>
                  </span>
                  <span style={{ color: 'var(--c-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>WS {fmt(ev.wsSales)} 円</span>
                  <span style={{ color: '#7a5a30', fontWeight: 500, whiteSpace: 'nowrap' }}>手伝い {fmt(ev.wsShare)} 円</span>
                </div>
              ))}
            </div>

            {/* 年間合計 */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, padding: '14px 18px', background: '#f9f9fb', border: '1px solid #dddde8', borderRadius: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--c-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>年間WS売上合計</div>
                <div style={{ fontSize: 22, fontWeight: 600, fontFamily: SERIF }}>{fmt(entry.totalWsSales)} 円</div>
              </div>
              <div style={{ flex: 1, padding: '14px 18px', background: '#f5f0ee', border: '1px solid #d4c4ae', borderRadius: 4 }}>
                <div style={{ fontSize: 11, color: '#7a5a30', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>年間WS手伝い合計</div>
                <div style={{ fontSize: 22, fontWeight: 600, fontFamily: SERIF, color: '#7a5a30' }}>{fmt(entry.totalWsShare)} 円</div>
                <div style={{ fontSize: 11, color: '#7a5a30', marginTop: 4 }}>WS売上 × 70%</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
