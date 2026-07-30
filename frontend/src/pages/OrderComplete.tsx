import { Link } from 'react-router-dom'
import PageMeta from '../components/PageMeta'

const SERIF = "'Noto Serif JP', 'Hiragino Mincho ProN', serif"
const SANS = "'Noto Sans JP', sans-serif"

export default function OrderComplete() {
  return (
    <>
      <PageMeta title="ご注文ありがとうございます | ei8ht plants" description="ご注文を受け付けました。" />
      <div style={{ background: '#faf9f7', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 24px' }}>
        <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>

          {/* チェックマーク */}
          <div style={{ width: 64, height: 64, border: '1px solid #c8c0b0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 36px' }}>
            <svg width="24" height="17" viewBox="0 0 24 17" fill="none">
              <path d="M1 8.5L8.5 16L23 1" stroke="#717171" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <p style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '3px', color: '#aaa', margin: '0 0 16px', textTransform: 'uppercase' }}>
            Order Confirmed
          </p>
          <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 300, letterSpacing: '0.06em', margin: '0 0 28px', color: '#1c1c1c', lineHeight: 1.4 }}>
            ご注文ありがとうございます
          </h1>

          <div style={{ background: '#fff', border: '1px solid #e8e3da', padding: '28px 32px', marginBottom: 36, textAlign: 'left' }}>
            <p style={{ fontFamily: SANS, fontSize: 14, color: '#3a3a3a', lineHeight: 2, margin: '0 0 16px' }}>
              ご注文を受け付けました。<br />
              ご登録いただいたメールアドレスに確認メールをお送りします。
            </p>
            <p style={{ fontFamily: SANS, fontSize: 13, color: '#717171', lineHeight: 2, margin: 0 }}>
              発送が完了しましたら、改めてメールでお知らせいたします。<br />
              ご不明な点は <Link to="/contact" style={{ color: '#717171' }}>お問い合わせフォーム</Link> よりご連絡ください。
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to="/shop"
              style={{
                padding: '13px 32px', background: '#1c1c1c', color: '#fff',
                textDecoration: 'none', fontFamily: SANS, fontSize: 13, letterSpacing: '2px',
              }}
            >
              ショップに戻る
            </Link>
            <Link
              to="/"
              style={{
                padding: '13px 32px', border: '1px solid #e8e3da', color: '#717171',
                textDecoration: 'none', fontFamily: SANS, fontSize: 13, letterSpacing: '2px',
                background: '#fff',
              }}
            >
              トップへ
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
