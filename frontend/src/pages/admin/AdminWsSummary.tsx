import { useEffect, useState } from 'react'
import { api, type Event, type EventFinances } from '../../lib/api'
import { fiscalYear } from '../../lib/finance'
import { formatYen } from '../../lib/format'
import { WS_MATERIAL_COST_YEN } from '../../lib/constants'
import { failMessage } from './errorMessage'

/** 見出しの明朝体 */
const SERIF = "'Cormorant Garamond', 'Noto Serif JP', serif"

/** エラーの帯の見た目（ほかの管理画面と同じ赤い帯） */
const errorBoxStyle: React.CSSProperties = {
  color: '#c0392b', fontSize: 13, margin: '0 0 16px', padding: '8px 14px',
  background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0',
}

/** 集計表の 1 行（イベント 1 件分） */
interface WsRow {
  /** イベントの id */
  eventId: string
  /** イベント名 */
  name: string
  /** 開始日（YYYY-MM-DD） */
  date: string
  /** WS の参加人数 */
  participants: number
  /** 手伝いへの金額（参加人数 × 資材費 WS_MATERIAL_COST_YEN） */
  amount: number
  /** 支払い済みなら true */
  paymentDone: boolean
  /** 支払い済みの更新時にそのまま PUT するための元の収支データ */
  fin: EventFinances
}

/**
 * ワークショップ収支集計ページ。イベント別件数・金額・支払い済みを管理する
 * @returns 年度ごとの集計表（支払い済みのチェックボックスつき）
 */
export default function AdminWsSummary() {
  /** 全イベント（過去分を含む） */
  const [events, setEvents] = useState<Event[]>([])
  /** 全イベントの収支 */
  const [finances, setFinances] = useState<EventFinances[]>([])
  /** 読み込み中なら true */
  const [loading, setLoading] = useState(true)
  /** 支払い済みを保存しているイベントの id（保存中はそのチェックボックスを押せなくする） */
  const [saving, setSaving] = useState<string | null>(null)
  /** 読み込み・保存の失敗の文言。null なら出さない */
  const [error, setError] = useState<string | null>(null)

  // 過去イベントを含む全データを並列取得する（失敗したら「データがありません」と誤表示しないよう文言を出す）
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

  /**
   * 支払い済みのチェックを切り替えて DB を更新する
   * 1. 収支データの ws_payment_done を反転して保存する
   * 2. 保存できたら画面の状態も更新する（失敗したら文言を出し、チェックは元のまま）
   * 3. 成功・失敗どちらでも保存中の表示を解く
   * @param row - 切り替える行
   */
  const togglePayment = async (row: WsRow) => {
    setSaving(row.eventId)
    setError(null)
    try {
      // 1. 保存
      /** 支払い済みを反転した収支データ（ほかの項目は元のまま送る） */
      const updated = { ...row.fin, ws_payment_done: !row.paymentDone }
      await api.events.saveFinances(row.eventId, updated)
      // 2. 画面の状態も更新
      setFinances(prev => prev.map(f => f.event_id === row.eventId ? { ...f, ws_payment_done: !row.paymentDone } : f))
    } catch (e: unknown) {
      setError(failMessage('支払い状況の保存に失敗しました', e))
    } finally {
      // 3. 保存中の表示を解く
      setSaving(null)
    }
  }

  if (loading) return <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p>

  /** イベントの id → イベント */
  const eventMap = new Map(events.map(e => [e.id, e]))

  /** 年度 → その年度の WS 参加者ありのイベントの行 */
  const rowsByYear = new Map<number, WsRow[]>()

  // 収支ごとに年度別の行へ振り分ける
  finances.forEach(fin => {
    // 1. 開始日がない・WS なし・参加者 0 人のイベントは対象外
    const event = eventMap.get(fin.event_id)
    if (!event?.start_date || !event.has_workshop || fin.ws_participants <= 0) return

    // 2. 開始日から年度（4〜3月）を決め、その年度の行に足す
    /** このイベントの年度 */
    const fy = fiscalYear(event.start_date)
    if (!rowsByYear.has(fy)) rowsByYear.set(fy, [])
    rowsByYear.get(fy)!.push({
      eventId: event.id,
      name: event.name,
      date: event.start_date,
      participants: fin.ws_participants,
      amount: fin.ws_participants * WS_MATERIAL_COST_YEN,
      paymentDone: fin.ws_payment_done ?? false,
      fin,
    })
  })

  /** 表を出す年度（新しい順） */
  const years = [...rowsByYear.keys()].sort((a, b) => b - a)

  /** 表の見出しのセルの見た目 */
  const thStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 12, fontWeight: 500,
    color: 'var(--c-muted)', textAlign: 'left', borderBottom: '1px solid #dddde8',
    whiteSpace: 'nowrap',
  }
  /** 表の中身のセルの見た目 */
  const tdStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 14, borderBottom: '1px solid #f0f0f5',
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 300, marginBottom: 8 }}>
        ワークショップ集計
      </h1>
      {/* 金額の計算方法の説明 */}
      <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 32, lineHeight: 1.8 }}>
        WSありのイベントの参加件数・手伝い金額（{formatYen(WS_MATERIAL_COST_YEN, 'suffix')}×件数）と支払い状況を管理します。
      </p>

      {/* 読み込み・保存の失敗 */}
      {error && <p role="alert" style={errorBoxStyle}>{error}</p>}

      {/* 年度ごとの表（読み込みに失敗したときは「データがありません」を出さない） */}
      {years.length === 0 ? (error ? null : (
        <p style={{ color: '#aaa', fontSize: 14 }}>ワークショップのデータがありません。</p>
      )) : years.map(fy => {
        // その年度の行（開催日の古い順）と、件数・金額・支払い済みの合計
        /** この年度の行（開催日の古い順） */
        const rows = [...rowsByYear.get(fy)!].sort((a, b) => a.date.localeCompare(b.date))
        /** 参加人数の合計 */
        const totalParticipants = rows.reduce((s, r) => s + r.participants, 0)
        /** 手伝いへの金額の合計 */
        const totalAmount = rows.reduce((s, r) => s + r.amount, 0)
        /** そのうち支払い済みの金額 */
        const paidAmount = rows.filter(r => r.paymentDone).reduce((s, r) => s + r.amount, 0)

        return (
          <div key={fy} style={{ marginBottom: 40 }}>
            <h2 style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 20, margin: '0 0 12px', color: 'var(--c-ink)' }}>
              {fy}年度（{fy}/4〜{fy + 1}/3）
            </h2>

            {/* テーブル */}
            <div style={{ border: '1px solid #dddde8', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f9f9fb' }}>
                  <tr>
                    <th style={thStyle}>イベント名</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>件数</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>金額</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>支払い済み</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.eventId} style={{ background: row.paymentDone ? '#f6faf5' : '#fff' }}>
                      <td style={tdStyle}>
                        {row.name}
                        <span style={{ fontSize: 12, color: 'var(--c-muted)', marginLeft: 8 }}>{row.date}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--c-muted)' }}>
                        {row.participants} 人
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500, color: '#7a5a30' }}>
                        {formatYen(row.amount, 'suffixSpaced')}
                      </td>
                      {/* 支払い済みのチェック（このイベントを保存中は押せない） */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={row.paymentDone}
                          disabled={saving === row.eventId}
                          onChange={() => togglePayment(row)}
                          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#4a6741' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* 合計行 */}
                <tfoot>
                  <tr style={{ background: '#f9f9fb', borderTop: '1px solid #dddde8' }}>
                    <td style={{ ...tdStyle, fontWeight: 500, borderBottom: 'none' }}>合計</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500, borderBottom: 'none' }}>{totalParticipants} 人</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#7a5a30', borderBottom: 'none' }}>{formatYen(totalAmount, 'suffixSpaced')}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontSize: 12, color: 'var(--c-muted)', borderBottom: 'none' }}>
                      支払済 {formatYen(paidAmount, 'suffixSpaced')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
