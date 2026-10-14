import { useEffect, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { api, type Event, type EventAdminInfo, type EventFinancesBody } from '../../lib/api'

/** フォームの初期値。全フィールドを null/false で初期化する */
const BLANK: EventAdminInfo = {
  carry_in_time: null,
  carry_out_time: null,
  hotel_name: null,
  hotel_fee: null,
  booth_fee: null,
  booth_fee_pay_method: null,
  booth_fee_due: null,
  booth_fee_paid: false,
  notes: null,
}

/** saveFinances 呼び出し時に finData が null だった場合に使う収支の初期値 */
const BLANK_FIN: EventFinancesBody = {
  sales: 0,
  booth_fee: 0,
  distance: 0,
  gas_price: 160,
  expressway_toll: 0,
  accommodation: 0,
  ws_participants: 0,
  payment_flag: false,
  ws_payment_done: false,
  other_expenses: 0,
  other_expenses_note: null,
  notes: null,
}

/** 出店料支払い方法の選択肢 */
const PAY_METHODS = ['当日現金', '事前振込', 'その他'] as const

/** 時 select の選択肢（06〜22） */
const HOUR_OPTIONS: string[] = Array.from({ length: 17 }, (_, i) => String(i + 6).padStart(2, '0'))

/** 分 select の選択肢（00〜55、5分刻み） */
const MINUTE_OPTIONS: string[] = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

/**
 * イベント管理情報（搬入・搬出・宿泊・出店料）を入力・保存するページ
 * URL: /admin/events/:id/admin-info
 */
export default function EventAdminInfo() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  // 遷移元のパスを取得。未設定時はイベント編集画面へ戻る
  const backTo: string = (location.state as { from?: string } | null)?.from ?? `/admin/events/${id ?? ''}/edit`

  const [event, setEvent] = useState<Event | null>(null)
  const [form, setForm] = useState<EventAdminInfo>(BLANK)
  /** EventFinances から取得した収支データ。保存時に booth_fee / accommodation を同期するために保持する */
  const [finData, setFinData] = useState<EventFinancesBody | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  /** 保存成功メッセージの表示フラグ。3秒後に自動で消える */
  const [saved, setSaved] = useState(false)
  /** 読み込み・保存エラーのメッセージ。null なら非表示 */
  const [error, setError] = useState<string | null>(null)

  // 搬入日時を日付・時・分に分けて管理するローカル state（EventAdminInfo 型には含まれない）
  const [carryInDate, setCarryInDate] = useState<string>('')
  const [carryInHour, setCarryInHour] = useState<string>('')
  const [carryInMin, setCarryInMin] = useState<string>('')
  // 搬出日時を日付・時・分に分けて管理するローカル state（EventAdminInfo 型には含まれない）
  const [carryOutDate, setCarryOutDate] = useState<string>('')
  const [carryOutHour, setCarryOutHour] = useState<string>('')
  const [carryOutMin, setCarryOutMin] = useState<string>('')

  // 1. イベント情報・管理情報・収支データを並行取得してフォームに反映する
  useEffect(() => {
    if (!id) return
    Promise.all([
      api.events.get(id),
      api.events.getAdminInfo(id),
      api.events.getFinances(id),
    ]).then(([ev, info, fin]) => {
      setEvent(ev)
      // 収支データを state に保持する（保存時の同期用）
      const finBody: EventFinancesBody = {
        sales: fin.sales,
        booth_fee: fin.booth_fee,
        distance: fin.distance,
        gas_price: fin.gas_price,
        expressway_toll: fin.expressway_toll,
        accommodation: fin.accommodation,
        ws_participants: fin.ws_participants,
        payment_flag: fin.payment_flag,
        ws_payment_done: fin.ws_payment_done,
        other_expenses: fin.other_expenses,
        other_expenses_note: fin.other_expenses_note,
        notes: fin.notes,
      }
      setFinData(finBody)
      setForm({
        carry_in_time: info.carry_in_time ?? null,
        carry_out_time: info.carry_out_time ?? null,
        hotel_name: info.hotel_name ?? null,
        // 管理情報に値がなければ収支の出店料を初期値として使う
        booth_fee: info.booth_fee ?? (finBody.booth_fee !== 0 ? finBody.booth_fee : null),
        booth_fee_pay_method: info.booth_fee_pay_method ?? null,
        booth_fee_due: info.booth_fee_due ?? null,
        booth_fee_paid: info.booth_fee_paid ?? false,
        // 管理情報に値がなければ収支の宿泊費を初期値として使う
        hotel_fee: info.hotel_fee ?? (finBody.accommodation !== 0 ? finBody.accommodation : null),
        notes: info.notes ?? null,
      })

      // 搬入日時を YYYY-MM-DDTHH:MM 形式から日付・時・分に分割してローカル state に反映する
      if (info.carry_in_time) {
        const sepIdx = info.carry_in_time.indexOf('T')
        setCarryInDate(sepIdx !== -1 ? info.carry_in_time.slice(0, sepIdx) : '')
        const timePart = sepIdx !== -1 ? info.carry_in_time.slice(sepIdx + 1) : ''
        const [h, m] = timePart.split(':')
        setCarryInHour(h ?? '')
        setCarryInMin(m ? m.slice(0, 2) : '')
      } else {
        setCarryInDate(''); setCarryInHour(''); setCarryInMin('')
      }
      // 搬出日時も同様に分割する
      if (info.carry_out_time) {
        const sepIdx = info.carry_out_time.indexOf('T')
        setCarryOutDate(sepIdx !== -1 ? info.carry_out_time.slice(0, sepIdx) : '')
        const timePart = sepIdx !== -1 ? info.carry_out_time.slice(sepIdx + 1) : ''
        const [h, m] = timePart.split(':')
        setCarryOutHour(h ?? '')
        setCarryOutMin(m ? m.slice(0, 2) : '')
      } else {
        setCarryOutDate(''); setCarryOutHour(''); setCarryOutMin('')
      }
    }).catch(() => {
      // 読み込み失敗時にエラーメッセージを表示する
      setError('データの読み込みに失敗しました。ページを再読み込みしてください。')
    }).finally(() => setLoading(false))
  }, [id])

  /**
   * フォームの特定フィールドを更新するヘルパー
   * @param key - 更新するフィールド名
   * @param value - 新しい値
   */
  const set = <K extends keyof EventAdminInfo>(key: K, value: EventAdminInfo[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  /**
   * 日付・時・分を結合して carry_in_time / carry_out_time に保存する値を返す
   * 3つすべて入力されている場合のみ YYYY-MM-DDTHH:MM 形式の文字列を返し、1つでも欠けていれば null を返す
   * @param date - YYYY-MM-DD 形式の日付文字列
   * @param hour - HH 形式の時文字列
   * @param min - MM 形式の分文字列
   * @returns YYYY-MM-DDTHH:MM 形式の文字列、または null
   */
  const combineDateTime = (date: string, hour: string, min: string): string | null => {
    if (date && hour && min) return `${date}T${hour}:${min}`
    return null
  }

  // 2. 保存ボタン押下時の処理
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      // 1. 管理情報を保存する
      await api.events.saveAdminInfo(id, form)
      // 2. 収支データ（出店料・宿泊費）を管理情報の値で上書きして同期する。
      //    finData が未取得（null）のときは空の初期値をベースにする
      const baseFinData = finData ?? BLANK_FIN
      await api.events.saveFinances(id, {
        ...baseFinData,
        booth_fee: form.booth_fee ?? 0,
        accommodation: form.hotel_fee ?? 0,
      })
      setSaved(true)
      // 3秒後に保存済みメッセージを消す
      setTimeout(() => setSaved(false), 3000)
    } catch {
      // 保存失敗時にエラーメッセージを表示する
      setError('保存に失敗しました。もう一度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid #dddde8',
    borderRadius: 4,
    fontSize: 15,
    fontFamily: 'inherit',
    background: '#ffffff',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontSize: 13,
    letterSpacing: 1,
    color: 'var(--c-body)',
  }

  if (loading) return <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p>

  return (
    <>
    {/* 読み込み・保存エラーを画面上部に表示する */}
    {error && (
      <p style={{ color: '#c0392b', background: '#fdf2f2', border: '1px solid #f5c6cb', borderRadius: 4, padding: '12px 16px', marginBottom: 16, fontSize: 14 }}>
        {error}
      </p>
    )}
    <div style={{ maxWidth: 580 }}>
      {/* 戻るリンク */}
      <div style={{ marginBottom: 24 }}>
        <Link to={backTo} style={{ fontSize: 13, color: 'var(--c-muted)', textDecoration: 'none' }}>
          &larr; 戻る
        </Link>
      </div>

      <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, marginBottom: 4 }}>
        イベント管理情報
      </h2>
      {event && (
        <p style={{ fontSize: 14, color: 'var(--c-muted)', marginBottom: 28 }}>
          {event.name} &mdash; {event.start_date}
        </p>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* 搬入・搬出 */}
        <SectionBox label="搬入・搬出">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 搬入日時: 日付 input・時 select・分 select を組み合わせる */}
            <div>
              <label style={labelStyle}>搬入日時</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="date"
                  style={{ ...inputStyle, flex: 1 }}
                  value={carryInDate}
                  onChange={(e) => {
                    setCarryInDate(e.target.value)
                    set('carry_in_time', combineDateTime(e.target.value, carryInHour, carryInMin))
                  }}
                />
                <select
                  style={{ padding: '10px 8px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 15, fontFamily: 'inherit', background: '#ffffff' }}
                  value={carryInHour}
                  onChange={(e) => {
                    setCarryInHour(e.target.value)
                    set('carry_in_time', combineDateTime(carryInDate, e.target.value, carryInMin))
                  }}
                >
                  <option value="">--</option>
                  {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                <span style={{ fontSize: 15, color: 'var(--c-muted)' }}>:</span>
                <select
                  style={{ padding: '10px 8px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 15, fontFamily: 'inherit', background: '#ffffff' }}
                  value={carryInMin}
                  onChange={(e) => {
                    setCarryInMin(e.target.value)
                    set('carry_in_time', combineDateTime(carryInDate, carryInHour, e.target.value))
                  }}
                >
                  <option value="">--</option>
                  {MINUTE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            {/* 搬出日時: 日付 input・時 select・分 select を組み合わせる */}
            <div>
              <label style={labelStyle}>搬出日時</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="date"
                  style={{ ...inputStyle, flex: 1 }}
                  value={carryOutDate}
                  onChange={(e) => {
                    setCarryOutDate(e.target.value)
                    set('carry_out_time', combineDateTime(e.target.value, carryOutHour, carryOutMin))
                  }}
                />
                <select
                  style={{ padding: '10px 8px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 15, fontFamily: 'inherit', background: '#ffffff' }}
                  value={carryOutHour}
                  onChange={(e) => {
                    setCarryOutHour(e.target.value)
                    set('carry_out_time', combineDateTime(carryOutDate, e.target.value, carryOutMin))
                  }}
                >
                  <option value="">--</option>
                  {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                <span style={{ fontSize: 15, color: 'var(--c-muted)' }}>:</span>
                <select
                  style={{ padding: '10px 8px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 15, fontFamily: 'inherit', background: '#ffffff' }}
                  value={carryOutMin}
                  onChange={(e) => {
                    setCarryOutMin(e.target.value)
                    set('carry_out_time', combineDateTime(carryOutDate, carryOutHour, e.target.value))
                  }}
                >
                  <option value="">--</option>
                  {MINUTE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
          </div>
        </SectionBox>

        {/* 宿泊 */}
        <SectionBox label="宿泊">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>ホテル名</label>
              <input
                type="text"
                style={inputStyle}
                value={form.hotel_name ?? ''}
                placeholder="宿泊ホテル名（任意）"
                onChange={(e) => set('hotel_name', e.target.value || null)}
              />
            </div>
            <div>
              <label style={labelStyle}>宿泊料金</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  style={{ ...inputStyle, textAlign: 'right' }}
                  value={form.hotel_fee ?? ''}
                  placeholder="0"
                  onChange={(e) => set('hotel_fee', e.target.value === '' ? null : Number(e.target.value))}
                />
                <span style={{ fontSize: 13, color: 'var(--c-muted)', flexShrink: 0 }}>円</span>
              </div>
            </div>
          </div>
        </SectionBox>

        {/* 出店料 */}
        <SectionBox label="出店料">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>出店料</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  style={{ ...inputStyle, textAlign: 'right' }}
                  value={form.booth_fee ?? ''}
                  placeholder="0"
                  onChange={(e) => set('booth_fee', e.target.value === '' ? null : Number(e.target.value))}
                />
                <span style={{ fontSize: 13, color: 'var(--c-muted)', flexShrink: 0 }}>円</span>
              </div>
            </div>
            <div>
              <label style={labelStyle}>支払い方法</label>
              <select
                style={inputStyle}
                value={form.booth_fee_pay_method ?? ''}
                onChange={(e) => set('booth_fee_pay_method', e.target.value || null)}
              >
                <option value="">未設定</option>
                {PAY_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>支払い期限</label>
              <input
                type="date"
                style={inputStyle}
                value={form.booth_fee_due ?? ''}
                onChange={(e) => set('booth_fee_due', e.target.value || null)}
              />
            </div>
            {/* 支払い済みチェックボックス */}
            <div>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                padding: '12px 14px',
                background: form.booth_fee_paid ? '#f0f5ee' : '#ffffff',
                border: `1px solid ${form.booth_fee_paid ? '#b8d4ae' : '#dddde8'}`,
                borderRadius: 4,
              }}>
                <input
                  type="checkbox"
                  checked={form.booth_fee_paid ?? false}
                  onChange={(e) => set('booth_fee_paid', e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#4a6741', flexShrink: 0 }}
                />
                <span style={{ fontSize: 14, fontWeight: form.booth_fee_paid ? 500 : 400 }}>
                  支払い済み
                </span>
              </label>
            </div>
          </div>
        </SectionBox>

        {/* メモ */}
        <SectionBox label="メモ">
          <textarea
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value || null)}
            rows={4}
            placeholder="予約が必要なことや注意事項"
            style={{ width: '100%', padding: '10px 14px', border: 'none', borderRadius: 0, fontSize: 14, fontFamily: 'inherit', background: 'transparent', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
          />
        </SectionBox>

        {/* 保存ボタン */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '12px 32px',
              background: 'var(--c-ink)',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: saving ? 'default' : 'pointer',
              fontSize: 15,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '保存中...' : '保存する'}
          </button>
          {/* 保存成功時に3秒間表示するフィードバック */}
          {saved && (
            <span style={{ fontSize: 14, color: '#4a6741' }}>保存しました</span>
          )}
        </div>
      </form>
    </div>
    </>
  )
}

/**
 * フォームのセクションを囲む枠コンポーネント
 * @param label - セクション見出し
 * @param children - セクション内のコンテンツ
 */
function SectionBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: 2, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, padding: '16px' }}>
        {children}
      </div>
    </div>
  )
}
