import { Link } from 'react-router-dom'
import PageMeta from '../components/PageMeta'

export default function OrderComplete() {
  return (
    <>
      <PageMeta title="ご注文完了 | ei8ht plants" description="ご注文ありがとうございます。" />
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '80px 24px 100px', textAlign: 'center' }}>
        <p style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: '#8a9a7e', margin: '0 0 20px' }}>ei8ht plants</p>
        <div style={{ width: 56, height: 56, border: '1.5px solid #8a9a7e', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px' }}>
          <svg width="22" height="16" viewBox="0 0 22 16" fill="none">
            <path d="M1 8L8 15L21 1" stroke="#8a9a7e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 300, letterSpacing: '0.1em', margin: '0 0 16px', color: '#1c2417' }}>
          ご注文ありがとうございます
        </h1>
        <p style={{ fontSize: 14, color: '#3a4535', lineHeight: 1.9, margin: '0 0 12px' }}>
          ご注文を受け付けました。<br />
          ご登録いただいたメールアドレスに確認メールをお送りします。
        </p>
        <p style={{ fontSize: 13, color: '#8a9a7e', lineHeight: 1.8, margin: '0 0 48px' }}>
          発送が完了しましたら、改めてお知らせいたします。<br />
          ご不明な点は <Link to="/contact" style={{ color: '#8a9a7e' }}>お問い合わせフォーム</Link> よりご連絡ください。
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/shop" style={{ padding: '12px 28px', background: '#1c2417', color: '#fff', textDecoration: 'none', fontSize: 13, letterSpacing: '1.5px' }}>
            ショップに戻る
          </Link>
          <Link to="/" style={{ padding: '12px 28px', border: '1px solid #dddde8', color: '#8a9a7e', textDecoration: 'none', fontSize: 13, letterSpacing: '1.5px' }}>
            トップへ
          </Link>
        </div>
      </div>
    </>
  )
}
