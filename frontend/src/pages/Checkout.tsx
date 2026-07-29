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
    const script = document.createElement('script')
    script.src = SQUARE_SDK_URL
    script.onload = async () => {
      try {
        const payments = (window as any).Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID)
        const card = await payments.card()
        await card.attach('#square-card-container')
        cardRef.current = card
        setSdkReady(true)
      } catch (e) {
        setErrorMsg('カード入力フォームの読み込みに失敗しました。')
      }
    }
    script.onerror = () => setErrorMsg('決済システムの読み込みに失敗しました。')
    document.head.appendChild(script)
    return () => {
      cardRef.current?.destroy?.()
      document.head.removeChild(script)
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

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px',
    border: '1px solid #dddde8', fontSize: 15, fontFamily: 'inherit',
    color: '#1c2417', background: '#fff', outline: 'none', borderRadius: 0,
    WebkitAppearance: 'none', appearance: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, letterSpacing: '1.5px',
    textTransform: 'uppercase', color: '#999', marginBottom: 6,
  }
  const sectionTitle: React.CSSProperties = {
    fontSize: 12, letterSpacing: 2, textTransform: 'uppercase',
    color: '#8a9a7e', borderBottom: '1px solid #dddde8',
    paddingBottom: 10, marginBottom: 20,
  }

  return (
    <>
      <PageMeta title="Checkout | ei8ht plants" description="ご注文手続き" />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '60px 24px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <p style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: '#8a9a7e', margin: '0 0 14px' }}>ei8ht plants</p>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 300, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0, color: '#1c2417' }}>Checkout</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 40, alignItems: 'start' }}>
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
            <div style={{ marginBottom: 28 }}>
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
            <div style={{ marginBottom: 28 }}>
              <label style={labelStyle}>建物名・部屋番号</label>
              <input style={inputStyle} value={form.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} />
            </div>
            <div style={{ marginBottom: 28 }}>
              <label style={labelStyle}>備考</label>
              <textarea style={{ ...inputStyle, height: 80, resize: 'vertical' }} value={form.note} onChange={(e) => set('note', e.target.value)} />
            </div>

            <p style={sectionTitle}>お支払い</p>
            <div
              id="square-card-container"
              style={{ border: '1px solid #dddde8', padding: '14px 12px', marginBottom: 8, minHeight: 60, background: sdkReady ? '#fff' : '#f5f5f8' }}
            />
            {!sdkReady && !errorMsg && <p style={{ fontSize: 12, color: '#8a9a7e', marginBottom: 16 }}>カード入力フォームを読み込み中...</p>}

            {errorMsg && (
              <p style={{ fontSize: 13, color: '#c0392b', marginBottom: 16, lineHeight: 1.6 }}>{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={status === 'loading' || !sdkReady}
              style={{
                width: '100%', padding: '15px 0', border: 'none',
                background: status === 'loading' ? '#8a9a7e' : '#1c2417',
                color: '#fff', fontSize: 14, letterSpacing: '2px',
                cursor: status === 'loading' ? 'default' : 'pointer',
                fontFamily: 'inherit', marginTop: 8,
              }}
            >
              {status === 'loading' ? '処理中...' : `注文を確定する ${fmt(total)}`}
            </button>

            <p style={{ fontSize: 11, color: '#8a9a7e', marginTop: 12, textAlign: 'center', lineHeight: 1.8 }}>
              ご注文確定と同時に決済が行われます。<br />
              カード情報は Square により安全に処理されます。
            </p>
          </form>

          {/* 注文サマリー */}
          <div style={{ background: '#f5f5f8', padding: 28, border: '1px solid #dddde8' }}>
            <p style={sectionTitle}>注文内容</p>
            <div style={{ marginBottom: 20 }}>
              {items.map((i) => (
                <div key={i.product.id} style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-start' }}>
                  <div style={{ width: 56, height: 56, flexShrink: 0, background: '#fff', border: '1px solid #dddde8', overflow: 'hidden' }}>
                    {i.product.image_urls[0] ? (
                      <img src={i.product.image_urls[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : null}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, color: '#1c2417', margin: '0 0 2px', lineHeight: 1.4 }}>{i.product.name}</p>
                    <p style={{ fontSize: 12, color: '#8a9a7e', margin: 0 }}>× {i.quantity}</p>
                  </div>
                  <p style={{ fontSize: 14, color: '#1c2417', margin: 0, whiteSpace: 'nowrap' }}>{fmt(i.product.price * i.quantity)}</p>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid #dddde8', paddingTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: '#3a4535' }}>
                <span>小計</span><span>{fmt(subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 13, color: '#3a4535' }}>
                <span>送料{form.prefecture ? `（${form.prefecture}）` : ''}</span>
                <span>{shippingFee !== null ? fmt(shippingFee) : '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 500, color: '#1c2417', fontFamily: "'Cormorant Garamond', serif" }}>
                <span>合計</span>
                <span>{shippingFee !== null ? fmt(total) : '—'}</span>
              </div>
              {shippingFee === null && (
                <p style={{ fontSize: 11, color: '#8a9a7e', marginTop: 6, textAlign: 'right' }}>都道府県選択後に確定</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
