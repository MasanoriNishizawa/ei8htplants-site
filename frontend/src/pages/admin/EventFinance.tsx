import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, computeFinances, type Event, type EventFinancesBody } from '../../lib/api'

const BLANK: EventFinancesBody = {
  sales: 0,
  booth_fee: 0,
  distance: 0,
  gas_price: 160,
  expressway_toll: 0,
  accommodation: 0,
  ws_participants: 0,
  payment_flag: false,
  other_expenses: 0,
  other_expenses_note: null,
  notes: null,
}

function fmt(n: number) {
  return n.toLocaleString('ja-JP')
}

export default function EventFinance() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [form, setForm] = useState<EventFinancesBody>(BLANK)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.events.get(id),
      api.events.getFinances(id),
    ]).then(([ev, fin]) => {
      setEvent(ev)
      setForm({
        sales: fin.sales,
        booth_fee: fin.booth_fee,
        distance: fin.distance,
        gas_price: fin.gas_price,
        expressway_toll: fin.expressway_toll,
        accommodation: fin.accommodation,
        ws_participants: fin.ws_participants,
        payment_flag: fin.payment_flag,
        other_expenses: fin.other_expenses,
        other_expenses_note: fin.other_expenses_note,
        notes: fin.notes,
      })
    }).finally(() => setLoading(false))
  }, [id])

  const set = <K extends keyof EventFinancesBody>(key: K, value: EventFinancesBody[K]) => {
    setSaved(false)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const computed = computeFinances({ event_id: id ?? '', ...form }, event?.has_workshop ?? false)
  const { transport, wsSales, totalExpense, net, salesShare, wsShare, paymentAmount } = computed

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    setSaving(true)
    await api.events.saveFinances(id, form)
    setSaving(false)
    setSaved(true)
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    border: '1px solid #dddde8',
    borderRadius: 4,
    fontSize: 15,
    fontFamily: 'inherit',
    background: '#ffffff',
    textAlign: 'right',
    width: 130,
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #f0f0f5',
    gap: 16,
  }

  const readonlyVal: React.CSSProperties = {
    fontSize: 15,
    color: '#4a6741',
    fontWeight: 500,
    minWidth: 130,
    textAlign: 'right',
  }

  if (loading) return <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p>

  return (
    <div style={{ maxWidth: 580 }}>
      <div style={{ marginBottom: 24 }}>
        <Link to="/admin/events" style={{ fontSize: 13, color: 'var(--c-muted)', textDecoration: 'none' }}>
          &larr; イベント管理
        </Link>
      </div>

      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, marginBottom: 4 }}>
        収支管理
      </h2>
      {event && (
        <p style={{ fontSize: 14, color: 'var(--c-muted)', marginBottom: 28 }}>
          {event.name} &mdash; {event.start_date}
        </p>
      )}

      <form onSubmit={save}>

        {/* 収入 */}
        <SectionBox label="収入">
          <Row style={rowStyle} label="売上">
            <NumInput value={form.sales} onChange={(v) => set('sales', v)} style={inputStyle} plain />
          </Row>
          {event?.has_workshop && (
            <>
              <Row style={rowStyle} label="WS参加人数">
                <NumInput value={form.ws_participants} onChange={(v) => set('ws_participants', v)} style={inputStyle} unit="人" />
              </Row>
              <Row style={{ ...rowStyle, borderBottom: 'none' }} label={
                <span>WS売上 <Hint>(人数 × ¥1,000)</Hint></span>
              }>
                <span style={readonlyVal}>{fmt(wsSales)} 円</span>
              </Row>
            </>
          )}
          {!event?.has_workshop && <div style={{ height: 2 }} />}
        </SectionBox>

        {/* 支払いフラグ */}
        <div style={{ marginBottom: 20 }}>
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
            padding: '14px 16px',
            background: form.payment_flag ? '#f0f5ee' : '#ffffff',
            border: `1px solid ${form.payment_flag ? '#b8d4ae' : '#dddde8'}`,
            borderRadius: 4,
          }}>
            <input
              type="checkbox"
              checked={form.payment_flag}
              onChange={(e) => set('payment_flag', e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', accentColor: '#4a6741', flexShrink: 0 }}
            />
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>手伝いあり（支払い計算モード）</div>
              <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 3, lineHeight: 1.6 }}>
                ONにすると「支払い金額 = max(0, 売上 - WS売上 - 各支出) × 20% + WS売上 × 70%」で計算します
              </div>
            </div>
          </label>
        </div>

        {/* 支出 */}
        <SectionBox label="支出">
          <Row style={rowStyle} label="出店料">
            <NumInput value={form.booth_fee} onChange={(v) => set('booth_fee', v)} style={inputStyle} plain />
          </Row>
          <Row style={rowStyle} label={<span>距離 <Hint>(片道・km)</Hint></span>}>
            <NumInput value={form.distance} onChange={(v) => set('distance', v)} style={inputStyle} plain />
          </Row>
          <Row style={rowStyle} label={<span>ガソリン単価 <Hint>(円/L)</Hint></span>}>
            <NumInput value={form.gas_price} onChange={(v) => set('gas_price', v)} style={inputStyle} plain />
          </Row>
          <Row style={rowStyle} label={
            <span>移動費 <Hint>(往復{form.distance * 2}km, 10km/L)</Hint></span>
          }>
            <span style={readonlyVal}>{fmt(transport)} 円</span>
          </Row>
          <Row style={rowStyle} label="高速代">
            <NumInput value={form.expressway_toll} onChange={(v) => set('expressway_toll', v)} style={inputStyle} plain />
          </Row>
          <Row style={rowStyle} label="宿泊費">
            <NumInput value={form.accommodation} onChange={(v) => set('accommodation', v)} style={inputStyle} plain />
          </Row>
          {/* その他支出 */}
          <div style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>その他支出</span>
              <NumInput value={form.other_expenses} onChange={(v) => set('other_expenses', v)} style={inputStyle} plain />
            </div>
            <input
              type="text"
              placeholder="内容（任意）"
              value={form.other_expenses_note ?? ''}
              onChange={(e) => set('other_expenses_note', e.target.value || null)}
              style={{ width: '100%', padding: '7px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', background: '#ffffff', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ height: 2 }} />
        </SectionBox>
        <div style={{ textAlign: 'right', paddingRight: 4, fontSize: 13, color: '#c0392b', marginBottom: 20, marginTop: 4 }}>
          支出合計: {fmt(totalExpense)} 円
        </div>

        {/* 収支 */}
        <div style={{
          padding: '18px 22px', borderRadius: 4, marginBottom: form.payment_flag ? 12 : 8,
          background: net >= 0 ? '#f0f5ee' : '#fdf0ee',
          border: `1px solid ${net >= 0 ? '#b8d4ae' : '#f0b8ae'}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontWeight: 500 }}>収支</span>
          <span style={{ fontSize: 22, fontWeight: 600, color: net >= 0 ? '#2d5a27' : '#c0392b', fontFamily: "'Cormorant Garamond', serif" }}>
            {net >= 0 ? '+' : ''}{fmt(net)} 円
          </span>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--c-muted)', marginBottom: form.payment_flag ? 20 : 24 }}>
          {form.payment_flag
            ? `売上 ${fmt(form.sales)} 円 − 支出 ${fmt(totalExpense)} 円 − 支払い ${fmt(paymentAmount)} 円`
            : `売上 ${fmt(form.sales)} 円 − 支出 ${fmt(totalExpense)} 円`
          }
        </div>

        {/* 手伝い支払い金額 */}
        {form.payment_flag && (
          <>
            <div style={{
              padding: '18px 22px', borderRadius: 4, marginBottom: 8,
              background: '#f5f0ee', border: '1px solid #d4c4ae',
            }}>
              <div style={{ fontSize: 12, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
                支払い金額（手伝い分）
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#6a5a45', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>売上利益分 <Hint>(max(0, 売上−WS売上−支出) × 20%)</Hint></span>
                  <span>{fmt(salesShare)} 円</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>WS売上分 <Hint>(WS売上 × 70%)</Hint></span>
                  <span>{fmt(wsShare)} 円</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #d4c4ae', paddingTop: 10 }}>
                <span style={{ fontWeight: 500 }}>合計支払い金額</span>
                <span style={{ fontSize: 22, fontWeight: 600, color: '#7a5a30', fontFamily: "'Cormorant Garamond', serif" }}>
                  {fmt(paymentAmount)} 円
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--c-muted)', marginBottom: 24 }}>
              {`売上利益 ${fmt(Math.max(0, form.sales - wsSales - totalExpense))} 円 × 20% + WS ${fmt(wsSales)} 円 × 70%`}
            </div>
          </>
        )}

        {/* メモ */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
            メモ
          </div>
          <textarea
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value || null)}
            rows={3}
            placeholder="備考・メモ（任意）"
            style={{ width: '100%', padding: '10px 14px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit', background: '#ffffff', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit" disabled={saving} style={{ padding: '12px 32px', background: 'var(--c-ink)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 15 }}>
            {saving ? '保存中...' : '保存'}
          </button>
          {saved && <span style={{ fontSize: 13, color: '#4a6741' }}>保存しました</span>}
        </div>
      </form>
    </div>
  )
}

function SectionBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, letterSpacing: 2, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, padding: '0 16px' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, children, style }: { label: React.ReactNode; children: React.ReactNode; style: React.CSSProperties }) {
  return (
    <div style={style}>
      <span style={{ fontSize: 14 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{children}</div>
    </div>
  )
}

function NumInput({ value, onChange, style, unit = '円', plain = false }: {
  value: number
  onChange: (v: number) => void
  style: React.CSSProperties
  unit?: string
  plain?: boolean
}) {
  const spinStyle: React.CSSProperties = plain
    ? { MozAppearance: 'textfield' } as React.CSSProperties
    : {}
  return (
    <>
      <input
        type={plain ? 'text' : 'number'}
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^0-9]/g, ''))
          onChange(isNaN(n) ? 0 : n)
        }}
        style={{ ...style, ...spinStyle }}
        className={plain ? 'num-plain' : undefined}
      />
      <span style={{ fontSize: 13, color: 'var(--c-muted)' }}>{unit}</span>
    </>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>{children}</span>
}
