import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Event, type EventFinances } from '../../lib/api'
import { computeFinances } from '../../lib/finance'
import { formatYen } from '../../lib/format'
import { failMessage } from './errorMessage'

/**
 * 全イベントの収支サマリーを一覧表示し、各イベントの収支と全体集計を確認できるページ
 * @returns 合計の欄とイベントごとの収支の表
 */
export default function AdminFinances() {
  /** 全イベント（今後と過去を合わせて開始日の新しい順） */
  const [events, setEvents] = useState<Event[]>([])
  /** イベントの id → 収支データ（収支を登録していないイベントは入らない） */
  const [financeMap, setFinanceMap] = useState<Map<string, EventFinances>>(new Map())
  /** 読み込み中なら true */
  const [loading, setLoading] = useState(true)
  /** 読み込みの失敗の文言。null なら出さない */
  const [error, setError] = useState<string | null>(null)

  // 全イベントと収支データを同時取得し、event_id をキーにしたマップを作成する
  useEffect(() => {
    // 1. 今後・過去のイベントと、登録済みの収支データを並行して取得する
    Promise.all([
      api.events.list(false),
      api.events.list(true),
      api.events.getAllFinances(),
    ]).then(([upcoming, past, finances]) => {
      // 2. 今後と過去を合わせ、開始日の新しい順に並べ替える
      /** 今後と過去を合わせ、開始日の新しい順にしたイベント */
      const all = [...past, ...upcoming].sort(
        (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
      )
      setEvents(all)
      // 3. 収支データを event_id で引けるマップにして、画面へ反映する
      setFinanceMap(new Map(finances.map((f) => [f.event_id, f])))
    }).catch((e: unknown) => {
      // 4. 取得に失敗したら画面用のエラー文を設定する
      setError(failMessage('収支の読み込みに失敗しました', e))
    }).finally(() => {
      // 5. 成功・失敗にかかわらず読み込み表示を終了する
      setLoading(false)
    })
  }, [])

  /** 表の行（イベント・収支データ・計算結果。収支未登録なら fin と computed は null） */
  const rows = events.map((ev) => {
    /** このイベントの収支データ */
    const fin = financeMap.get(ev.id)
    /** 収支の計算結果（支出合計・収支など） */
    const computed = fin ? computeFinances(fin, ev.has_workshop) : null
    return { ev, fin: fin ?? null, computed }
  })

  // 収支を登録済みのイベントだけで、売上・支出・収支を合計する
  /** 収支を登録済みの行 */
  const registered = rows.filter((r) => r.computed !== null)
  /** 売上の合計 */
  const totalSales = registered.reduce((s, r) => s + (r.fin?.sales ?? 0), 0)
  /** 支出の合計 */
  const totalExpense = registered.reduce((s, r) => s + (r.computed?.totalExpense ?? 0), 0)
  /** 収支の合計（黒字なら緑、赤字なら赤で出す） */
  const totalNet = registered.reduce((s, r) => s + (r.computed?.net ?? 0), 0)
  /** WS 資材費の合計（収支の計算で売上から引いている。lib/finance.ts の computeFinances） */
  const totalWsCost = registered.reduce((s, r) => s + (r.computed?.wsCost ?? 0), 0)
  /** 手伝いへの支払いの合計（支払いフラグありのイベントだけ。赤字のイベントではマイナスになることがある） */
  const totalPayment = registered.reduce((s, r) => s + (r.computed?.paymentAmount ?? 0), 0)
  /**
   * 収支合計の計算の内訳の文（computeFinances の式どおり: 売上 − 支出 − WS 資材費 − 手伝いへの支払い）。
   * 0 円の項目は省き、マイナスの支払い（赤字の分担）は「＋」で足す形にする
   */
  const netBreakdown = [
    `売上 ${formatYen(totalSales, 'suffixSpaced')}`,
    `− 支出 ${formatYen(totalExpense, 'suffixSpaced')}`,
    ...(totalWsCost !== 0 ? [`− WS 資材費 ${formatYen(totalWsCost, 'suffixSpaced')}`] : []),
    ...(totalPayment > 0 ? [`− 手伝いへの支払い ${formatYen(totalPayment, 'suffixSpaced')}`] : []),
    ...(totalPayment < 0 ? [`＋ 手伝いの赤字の分担 ${formatYen(-totalPayment, 'suffixSpaced')}`] : []),
  ].join(' ')

  /** 表のセルの共通の見た目 */
  const cellStyle: React.CSSProperties = {
    padding: '12px 14px',
    fontSize: 14,
    borderBottom: '1px solid #f0f0f5',
    verticalAlign: 'middle',
  }
  /** 金額のセルの見た目（右寄せ・桁をそろえる） */
  const numCell: React.CSSProperties = {
    ...cellStyle,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  }

  return (
    <div>
      <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, marginBottom: 24 }}>
        収支一覧
      </h2>

      {/* 読み込みの失敗 */}
      {error && (
        <p role="alert" style={{ color: '#c0392b', fontSize: 13, margin: '0 0 16px', padding: '8px 14px', background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0' }}>{error}</p>
      )}

      {/* 登録済みのイベントの合計 */}
      {registered.length > 0 && (
        <div style={{
          display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28,
          padding: '16px 20px',
          background: totalNet >= 0 ? '#f0f5ee' : '#fdf0ee',
          border: `1px solid ${totalNet >= 0 ? '#b8d4ae' : '#f0b8ae'}`,
          borderRadius: 4,
        }}>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 4 }}>売上合計</div>
            <div style={{ fontSize: 18, fontWeight: 500, fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif" }}>{formatYen(totalSales, 'suffixSpaced')}</div>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 4 }}>支出合計</div>
            <div style={{ fontSize: 18, fontWeight: 500, fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif" }}>{formatYen(totalExpense, 'suffixSpaced')}</div>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 4 }}>収支合計</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: totalNet >= 0 ? '#2d5a27' : '#c0392b', fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif" }}>
              {totalNet >= 0 ? '+' : ''}{formatYen(totalNet, 'suffixSpaced')}
            </div>
          </div>
          <div style={{ alignSelf: 'flex-end', fontSize: 11, color: 'var(--c-muted)' }}>
            {registered.length} イベント登録済み
          </div>
          {/* 収支合計の計算の内訳（売上 − 支出 だけでは合わないため、引いている項目を小さく示す） */}
          <p style={{ flexBasis: '100%', margin: 0, fontSize: 12, color: 'var(--c-muted)', lineHeight: 1.7 }}>
            収支合計 = {netBreakdown}
            <br />
            WS 売上は売上に含めて入力するため、別に足していません。手伝いへの支払いは「支払対象: あり」のイベントの分です。
          </p>
        </div>
      )}

      {/* イベントごとの収支の表 */}
      {loading ? (
        <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4 }}>
            <thead>
              <tr style={{ background: '#f8f8fa' }}>
                <th style={{ ...cellStyle, fontWeight: 500, textAlign: 'left', fontSize: 12, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase' }}>イベント</th>
                <th style={{ ...cellStyle, fontWeight: 500, textAlign: 'left', fontSize: 12, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase' }}>日付</th>
                <th style={{ ...numCell, fontWeight: 500, fontSize: 12, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase' }}>売上</th>
                <th style={{ ...numCell, fontWeight: 500, fontSize: 12, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase' }}>支出</th>
                <th style={{ ...numCell, fontWeight: 500, fontSize: 12, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase' }}>収支</th>
                <th style={{ ...cellStyle, fontWeight: 500, textAlign: 'center', fontSize: 12, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>支払対象</th>
                <th style={{ ...cellStyle, fontWeight: 500, textAlign: 'center', fontSize: 12, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>WS支払</th>
                {/* 編集リンクの列（見出しは読み上げだけ。スマホでは右端に固定する: index.css の .admin-sticky-col） */}
                <th className="admin-sticky-col" style={{ ...cellStyle, width: 60, background: '#f8f8fa' }}>
                  <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ ev, fin, computed }) => (
                <tr key={ev.id} style={{ borderBottom: '1px solid #f0f0f5' }}>
                  {/* イベント名・開催日・売上・支出・収支（収支未登録は —） */}
                  <td style={{ ...cellStyle, fontWeight: 500 }}>{ev.name}</td>
                  <td style={{ ...cellStyle, color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>
                    {ev.start_date}{ev.end_date && ev.end_date !== ev.start_date ? ` 〜 ${ev.end_date}` : ''}
                  </td>
                  <td style={{ ...numCell, color: fin ? 'inherit' : 'var(--c-muted)' }}>
                    {fin ? formatYen(fin.sales, 'suffixSpaced') : '—'}
                  </td>
                  <td style={{ ...numCell, color: computed ? '#c0392b' : 'var(--c-muted)' }}>
                    {computed ? formatYen(computed.totalExpense, 'suffixSpaced') : '—'}
                  </td>
                  <td style={{ ...numCell, fontWeight: computed ? 600 : 400, color: computed ? (computed.net >= 0 ? '#2d5a27' : '#c0392b') : 'var(--c-muted)', fontFamily: computed ? "'Cormorant Garamond', 'Noto Serif JP', serif" : 'inherit', fontSize: computed ? 16 : 14 }}>
                    {computed ? `${computed.net >= 0 ? '+' : ''}${formatYen(computed.net, 'suffixSpaced')}` : '—'}
                  </td>
                  {/* 手伝いフラグ（payment_flag）の有無を表示する */}
                  <td style={{ ...cellStyle, textAlign: 'center' }}>
                    {fin ? (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500,
                        background: fin.payment_flag ? '#e8f5e4' : '#f5f5f7',
                        color: fin.payment_flag ? '#2d5a27' : '#aaa',
                        border: `1px solid ${fin.payment_flag ? '#b8d4ae' : '#dddde8'}`,
                        whiteSpace: 'nowrap',
                      }}>
                        {fin.payment_flag ? 'あり' : 'なし'}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--c-muted)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                  {/* WSありのイベントのみ支払い済みフラグを表示する */}
                  <td style={{ ...cellStyle, textAlign: 'center' }}>
                    {ev.has_workshop && fin ? (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500,
                        background: fin.ws_payment_done ? '#e8f5e4' : '#fdf0ee',
                        color: fin.ws_payment_done ? '#2d5a27' : '#c0392b',
                        border: `1px solid ${fin.ws_payment_done ? '#b8d4ae' : '#f0b8ae'}`,
                        whiteSpace: 'nowrap',
                      }}>
                        {fin.ws_payment_done ? '済' : '未'}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--c-muted)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                  {/* このイベントの収支の編集画面へ（戻り先は収支一覧）。スマホでは右端に固定する */}
                  <td className="admin-sticky-col" style={{ ...cellStyle, whiteSpace: 'nowrap', background: '#ffffff' }}>
                    <Link to={`/admin/events/${ev.id}/finances`} state={{ from: '/admin/finances' }} style={{ padding: '6px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 12, color: '#4a6741', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                      編集
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
