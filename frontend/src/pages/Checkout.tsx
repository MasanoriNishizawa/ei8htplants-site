import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useCart } from '../lib/cart'
import PageMeta from '../components/PageMeta'

const SQUARE_APP_ID = import.meta.env.VITE_SQUARE_APP_ID ?? ''
const SQUARE_LOCATION_ID = import.meta.env.VITE_SQUARE_LOCATION_ID ?? ''
const SQUARE_ENV = import.meta.env.VITE_SQUARE_ENVIRONMENT ?? 'sandbox'
const SQUARE_SDK_URL = SQUARE_ENV === 'production'
  ? 'https://web.squarecdn.com/v1/square.js'
  : 'https://sandbox.web.squarecdn.com/v1/square.js'

const PREFECTURES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県',
  '静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
  '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
  '熊本県','大分県','宮崎県','鹿児島県','沖縄県',
]

const fmt = (n: number) => `¥${n.toLocaleString('ja-JP')}`

type FormState = {
  name: string; email: string; phone: string
  postalCode: string; prefecture: string; city: string
  addressLine1: string; addressLine2: string; note: string
}

const BLANK: FormState = {
  name: '', email: '', phone: '',
  postalCode: '', prefecture: '', city: '',
  addressLine1: '', addressLine2: '', note: '',
}

export default function Checkout() {
  const { items, clear } = useCart()
  const navigate = useNavigate()
  const cardRef = useRef<any>(null)
  const [sdkReady, setSdkReady] = useState(false)
  const [form, setForm] = useState<FormState>(BLANK)
  const [shippingFee, setShippingFee] = useState<number | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Square Web Payments SDK を動的ロード
  useEffect(() => {
    if (!SQUARE_APP_ID) return

    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      setErrorMsg('Square決済はlocalhostでは動作しません。本番サイト（ei8htplants.com）でご確認ください。')
      return
    }

    const timeout = (p: Promise<unknown>, ms: number) =>
      Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])

    let cancelled = false
    const script = document.createElement('script')
    script.src = SQUARE_SDK_URL
    script.onload = async () => {
      if (cancelled) return
      try {
        console.log('[Square] script loaded, Square=', !!(window as any).Square)
        const payments = (window as any).Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID)
        console.log('[Square] payments created')
        const card = await timeout(payments.card(), 10000) as any
        console.log('[Square] card created')
        if (cancelled) { card.destroy?.(); return }
        await timeout(card.attach('#square-card-container'), 10000)
        console.log('[Square] card attached')
        if (cancelled) { card.destroy?.(); return }
        cardRef.current = card
        setSdkReady(true)
      } catch (e: any) {
        console.error('[Square] error:', e)
        if (!cancelled) {
          const msg = e?.message === 'timeout'
            ? 'カード入力フォームの読み込みがタイムアウトしました。ページを再読み込みしてください。'
            : `カード入力フォームの読み込みに失敗しました。(${e?.message ?? 'unknown'})`
          setErrorMsg(msg)
        }
      }
    }
    script.onerror = () => { if (!cancelled) setErrorMsg('決済システムの読み込みに失敗しました。') }
    document.head.appendChild(script)
    return () => {
      cancelled = true
      cardRef.current?.destroy?.()
      cardRef.current = null
      if (document.head.contains(script)) document.head.removeChild(script)
    }
  }, [])

  // 都道府県変更時に送料取得
  useEffect(() => {
    if (!form.prefecture) { setShippingFee(null); return }
    api.shipping.getRate(form.prefecture).then((r) => setShippingFee(r.fee)).catch(() => setShippingFee(null))
  }, [form.prefecture])

  if (items.length === 0) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center' }}>
        <p style={{ color: '#8a9a7e', marginBottom: 20 }}>カートに商品がありません。</p>
        <Link to="/shop" style={{ color: '#1c2417', fontSize: 13, letterSpacing: 1 }}>ショップへ戻る</Link>
      </div>
    )
  }

  const set = <K extends keyof FormState>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v }))

  const subtotal = items.reduce((s, i) => s + i.product.price * i.quantity, 0)
  const total = subtotal + (shippingFee ?? 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cardRef.current || !sdkReady) {
      setErrorMsg('カード入力フォームが準備できていません。')
      return
    }
    if (shippingFee === null) {
      setErrorMsg('都道府県を選択してください。')
      return
    }
    setStatus('loading')
    setErrorMsg('')
    try {
      const result = await cardRef.current.tokenize()
      if (result.status !== 'OK') {
        const msg = result.errors?.map((e: any) => e.message).join(' ') ?? 'カード情報が正しくありません。'
        setErrorMsg(msg)
        setStatus('idle')
        return
      }
      await api.orders.create({
        customer_name: form.name,
        customer_email: form.email,
        customer_phone: form.phone || undefined,
        postal_code: form.postalCode,
        prefecture: form.prefecture,
        city: form.city,
        address_line1: form.addressLine1,
        address_line2: form.addressLine2 || undefined,
        note: form.note || undefined,
        items: items.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
        source_id: result.token,
      })
      clear()
      navigate('/order/complete')
    } catch (err: any) {
      setErrorMsg(err.message ?? '注文処理に失敗しました。もう一度お試しください。')
      setStatus('idle')
    }
  }

  const SERIF = "'Noto Serif JP', 'Hiragino Mincho ProN', serif"
  const SANS = "'Noto Sans JP', sans-serif"
  const BG = '#faf9f7'

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '11px 14px',
    border: '1px solid #ddd', fontSize: 14, fontFamily: SANS,
    color: '#1c1c1c', background: '#fff', outline: 'none', borderRadius: 0,
    WebkitAppearance: 'none', appearance: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontFamily: SANS, fontSize: 11, letterSpacing: '1.5px',
    color: '#aaa', marginBottom: 7,
  }
  const sectionTitle: React.CSSProperties = {
    fontFamily: SERIF, fontSize: 16, fontWeight: 400, color: '#1c1c1c',
    borderBottom: '1px solid #e8e3da', paddingBottom: 12, marginBottom: 20, letterSpacing: '0.05em',
  }

  return (
    <>
      <PageMeta title="ご注文手続き | ei8ht plants" description="ご注文手続き" />
      <div style={{ background: BG, minHeight: '100vh' }}>

        {/* ヘッダー */}
        <div style={{ borderBottom: '1px solid #e8e3da', background: '#fff' }}>
          <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
            <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '3px', color: '#aaa', margin: '0 0 8px', textTransform: 'uppercase' }}>ei8ht plants</p>
            <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 300, margin: 0, color: '#1c1c1c', letterSpacing: '0.06em' }}>ご注文手続き</h1>
          </div>
        </div>

        <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px 80px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 48, alignItems: 'start' }}>

            {/* フォーム */}
            <form onSubmit={handleSubmit}>
              <p style={sectionTitle}>お客様情報</p>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>お名前 *</label>
                <input required style={inputStyle} value={form.name} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>メールアドレス *</label>
                <input required type="email" style={inputStyle} value={form.email} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div style={{ marginBottom: 32 }}>
                <label style={labelStyle}>電話番号</label>
                <input type="tel" style={inputStyle} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              </div>

              <p style={sectionTitle}>お届け先</p>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>郵便番号 *</label>
                <input required style={{ ...inputStyle, maxWidth: 160 }} value={form.postalCode} onChange={(e) => set('postalCode', e.target.value)} placeholder="000-0000" />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>都道府県 *</label>
                <select required style={inputStyle} value={form.prefecture} onChange={(e) => set('prefecture', e.target.value)}>
                  <option value="">選択してください</option>
                  {PREFECTURES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>市区町村 *</label>
                <input required style={inputStyle} value={form.city} onChange={(e) => set('city', e.target.value)} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>番地・建物名 *</label>
                <input required style={inputStyle} value={form.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} />
              </div>
              <div style={{ marginBottom: 32 }}>
                <label style={labelStyle}>建物名・部屋番号</label>
                <input style={inputStyle} value={form.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} />
              </div>
              <div style={{ marginBottom: 32 }}>
                <label style={labelStyle}>備考</label>
                <textarea style={{ ...inputStyle, height: 80, resize: 'vertical' }} value={form.note} onChange={(e) => set('note', e.target.value)} />
              </div>

              <p style={sectionTitle}>お支払い</p>
              <div
                id="square-card-container"
                style={{ border: '1px solid #ddd', padding: '14px 12px', marginBottom: 8, minHeight: 60, background: '#fff' }}
              />
              {!sdkReady && !errorMsg && (
                <p style={{ fontFamily: SANS, fontSize: 12, color: '#aaa', marginBottom: 16 }}>カード入力フォームを読み込み中...</p>
              )}
              {errorMsg && (
                <p style={{ fontFamily: SANS, fontSize: 13, color: '#c0392b', marginBottom: 16, lineHeight: 1.7 }}>{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={status === 'loading' || !sdkReady}
                style={{
                  width: '100%', padding: '16px 0', border: 'none', marginTop: 12,
                  background: status === 'loading' ? '#a0a098' : '#1c1c1c',
                  color: '#fff', fontFamily: SANS, fontSize: 13, letterSpacing: '2px',
                  cursor: status === 'loading' ? 'default' : 'pointer',
                }}
              >
                {status === 'loading' ? '処理中...' : `注文を確定する  ${fmt(total)}`}
              </button>
              <p style={{ fontFamily: SANS, fontSize: 11, color: '#aaa', marginTop: 12, textAlign: 'center', lineHeight: 1.9 }}>
                ご注文確定と同時に決済が行われます。<br />
                カード情報は Square により安全に処理されます。
              </p>
            </form>

            {/* 注文サマリー */}
            <div style={{ background: '#fff', border: '1px solid #e8e3da', padding: 28 }}>
              <p style={{ fontFamily: SERIF, fontSize: 14, color: '#1c1c1c', margin: '0 0 20px', letterSpacing: '0.05em', borderBottom: '1px solid #e8e3da', paddingBottom: 12 }}>
                ご注文内容
              </p>
              <div style={{ marginBottom: 20 }}>
                {items.map((i) => (
                  <div key={i.product.id} style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-start' }}>
                    <div style={{ width: 60, height: 60, flexShrink: 0, background: '#f0ede8', overflow: 'hidden' }}>
                      {i.product.image_urls[0] && (
                        <img src={i.product.image_urls[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontFamily: SANS, fontSize: 13, color: '#1c1c1c', margin: '0 0 3px', lineHeight: 1.5 }}>{i.product.name}</p>
                      <p style={{ fontFamily: SANS, fontSize: 12, color: '#aaa', margin: 0 }}>× {i.quantity}</p>
                    </div>
                    <p style={{ fontFamily: SERIF, fontSize: 14, color: '#1c1c1c', margin: 0, whiteSpace: 'nowrap' }}>{fmt(i.product.price * i.quantity)}</p>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1px solid #e8e3da', paddingTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontFamily: SANS, fontSize: 13, color: '#717171' }}>
                  <span>小計</span><span>{fmt(subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, fontFamily: SANS, fontSize: 13, color: '#717171' }}>
                  <span>送料{form.prefecture ? `（${form.prefecture}）` : ''}</span>
                  <span>{shippingFee !== null ? fmt(shippingFee) : '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SERIF, fontSize: 19, color: '#1c1c1c' }}>
                  <span>合計</span>
                  <span>{shippingFee !== null ? fmt(total) : '—'}</span>
                </div>
                {shippingFee === null && (
                  <p style={{ fontFamily: SANS, fontSize: 11, color: '#aaa', marginTop: 6, textAlign: 'right' }}>都道府県選択後に確定</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
