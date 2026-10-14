import { useEffect, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { api, type Event, type EventAdminInfo } from '../../lib/api'

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

/** 出店料支払い方法の選択肢 */
const PAY_METHODS = ['当日現金', '事前振込', 'その他'] as const

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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  /** 保存成功メッセージの表示フラグ。3秒後に自動で消える */
  const [saved, setSaved] = useState(false)
  /** 読み込み・保存エラーのメッセージ。null なら非表示 */
  const [error, setError] = useState<string | null>(null)

  // 1. イベント情報と管理情報を並行取得してフォームに反映する
  useEffect(() => {
    if (!id) return
    Promise.all([
      api.events.get(id),
      api.events.getAdminInfo(id),
    ]).then(([ev, info]) => {
      setEvent(ev)
      setForm({
        carry_in_time: info.carry_in_time ?? null,
        carry_out_time: info.carry_out_time ?? null,
        hotel_name: info.hotel_name ?? null,
        hotel_fee: info.hotel_fee ?? null,
        booth_fee: info.booth_fee ?? null,
        booth_fee_pay_method: info.booth_fee_pay_method ?? null,
        booth_fee_due: info.booth_fee_due ?? null,
        booth_fee_paid: info.booth_fee_paid ?? false,
        notes: info.notes ?? null,
      })
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

  // 2. 保存ボタン押下時の処理
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      await api.events.saveAdminInfo(id, form)
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>搬入日時</label>
              <input
                type="datetime-local"
                style={inputStyle}
                value={form.carry_in_time ?? ''}
                onChange={(e) => set('carry_in_time', e.target.value || null)}
              />
            </div>
            <div>
              <label style={labelStyle}>搬出日時</label>
              <input
                type="datetime-local"
                style={inputStyle}
                value={form.carry_out_time ?? ''}
                onChange={(e) => set('carry_out_time', e.target.value || null)}
              />
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
