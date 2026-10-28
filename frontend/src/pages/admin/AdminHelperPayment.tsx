import { useEffect, useState } from 'react'
import { api, type Event, type EventFinances } from '../../lib/api'
import { computeFinances, fiscalYear } from '../../lib/finance'
import { formatYen } from '../../lib/format'
import { failMessage } from './errorMessage'

/** 見出しの明朝体 */
const SERIF = "'Cormorant Garamond', 'Noto Serif JP', serif"

/** 年間合計を何か月で割って月額にするか（翌年度の 12 か月で払う） */
const MONTHS_PER_YEAR = 12

/**
 * 手伝い支払い集計ページ。
 * 手伝いありのイベントの売上利益分（WS売上を除く）を年度（4〜3月）で合計し、
 * 12で割った金額を翌期の月額支払いとして表示する。
 * @returns 年度ごとのイベント別内訳・年間合計・翌年度の月額
 */
export default function AdminHelperPayment() {
  /** 全イベント（過去分を含む） */
  const [events, setEvents] = useState<Event[]>([])
  /** 全イベントの収支 */
  const [finances, setFinances] = useState<EventFinances[]>([])
  /** 読み込み中なら true */
  const [loading, setLoading] = useState(true)
  /** 読み込みの失敗の文言。null なら出さない */
  const [error, setError] = useState<string | null>(null)

  // 過去イベントを含む全データを並列取得する（失敗したら「イベントがありません」と誤表示しないよう文言を出す）
  useEffect(() => {
    Promise.all([
      api.events.list(true),
      api.events.getAllFinances(),
    ]).then(([evs, fins]) => {
      setEvents(evs)
      setFinances(fins)
    }).catch((e: unknown) => {
      setError(failMessage('データの読み込みに失敗しました', e))
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p>
  if (error) {
    return <p role="alert" style={{ color: '#c0392b', fontSize: 13, padding: '8px 14px', background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0' }}>{error}</p>
  }

  /** イベントの id → イベント */
  const eventMap = new Map(events.map(e => [e.id, e]))

  /** 年度 → その年度の手伝い支払い額（salesShare: WS売上を除く売上利益 × HELPER_SALES_SHARE_RATE）の内訳と合計 */
  const helperByYear = new Map<number, {
    /** イベントごとの内訳（イベント名・開始日・手伝いへの支払い額） */
    events: { name: string; date: string; salesShare: number }[]
    /** 年度の合計（円） */
    total: number
  }>()

  // 収支ごとに年度別の内訳へ足し込む
  finances.forEach(fin => {
    // 1. 対応するイベントが見つからない・開始日がない・手伝いなし（payment_flag が false）は対象外
    const event = eventMap.get(fin.event_id)
    if (!event?.start_date || !fin.payment_flag) return

    // 2. 開始日から年度（4〜3月）を決め、収支を計算する
    /** このイベントの年度 */
    const fy = fiscalYear(event.start_date)
    // salesShare のみ集計（wsShare はWS収支ページで管理）
    /** このイベントの収支の計算結果 */
    const computed = computeFinances(fin, event.has_workshop ?? false)

    // 3. 年度の内訳に追加し、合計に足す
    if (!helperByYear.has(fy)) helperByYear.set(fy, { events: [], total: 0 })
    /** この年度の内訳と合計 */
    const entry = helperByYear.get(fy)!
    entry.events.push({ name: event.name, date: event.start_date, salesShare: computed.salesShare })
    entry.total += computed.salesShare
  })

  /** 表示する年度の一覧（新しい順） */
  const years = [...helperByYear.keys()].sort((a, b) => b - a)

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 300, marginBottom: 8 }}>
        支払い集計
      </h1>
      {/* 計算方法の説明 */}
      <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 32, lineHeight: 1.8 }}>
        手伝いありのイベントの売上利益分（WS売上を除く）を年度（4〜3月）で合計。翌期の月額支払い = 年間合計 ÷ {MONTHS_PER_YEAR}。
      </p>

      {/* 年度ごとの内訳と合計 */}
      {years.length === 0 ? (
        <p style={{ color: '#aaa', fontSize: 14 }}>手伝いありのイベントがありません。</p>
      ) : years.map(fy => {
        /** この年度の内訳と合計 */
        const entry = helperByYear.get(fy)!
        // 翌年度の月額（年間合計 ÷ 12 を四捨五入）と、開催日の古い順の内訳
        const monthly = Math.round(entry.total / MONTHS_PER_YEAR)
        // 年度内の開催履歴を日付順に並べ、画面上の明細順を安定させる。
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
                  <span style={{ color: '#4a6741', fontWeight: 500 }}>{formatYen(ev.salesShare, 'suffixSpaced')}</span>
                </div>
              ))}
            </div>

            {/* 年間合計・翌期月額支払い */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, padding: '14px 18px', background: '#f9f9fb', border: '1px solid #dddde8', borderRadius: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--c-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>年間合計</div>
                <div style={{ fontSize: 22, fontWeight: 600, fontFamily: SERIF }}>{formatYen(entry.total, 'suffixSpaced')}</div>
              </div>
              <div style={{ flex: 1, padding: '14px 18px', background: '#f0f5ee', border: '1px solid #b8d4ae', borderRadius: 4 }}>
                <div style={{ fontSize: 11, color: '#4a6741', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                  {fy + 1}年度 月額支払い
                </div>
                <div style={{ fontSize: 22, fontWeight: 600, fontFamily: SERIF, color: '#2d5a27' }}>{formatYen(monthly, 'suffixSpaced')}/月</div>
                <div style={{ fontSize: 11, color: '#4a6741', marginTop: 4 }}>{formatYen(entry.total, 'suffixSpaced')} ÷ {MONTHS_PER_YEAR}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
