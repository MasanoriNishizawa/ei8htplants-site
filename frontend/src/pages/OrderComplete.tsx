import { Link, useLocation } from 'react-router-dom'
import { useT } from '../lib/lang'
import PageMeta from '../components/PageMeta'

const SERIF = "'Cormorant Garamond', 'Noto Serif JP', serif"
const SANS = "'Noto Sans JP', sans-serif"

export default function OrderComplete() {
  const t = useT()
  const { state } = useLocation()
  const orderId: string | undefined = state?.orderId
  const customerName: string | undefined = state?.customerName
  const customerEmail: string | undefined = state?.customerEmail
  const orderNo = orderId ? orderId.split('-')[0].toUpperCase() : null

  return (
    <>
      <PageMeta title={t('ご注文ありがとうございます | ei8ht plants', 'Thank You for Your Order | ei8ht plants')} description={t('ご注文を受け付けました。', 'Your order has been received.')} />
      <div style={{ background: '#faf9f7', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 24px' }}>
        <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>

          <div style={{ width: 64, height: 64, border: '1px solid #c8c0b0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 36px' }}>
            <svg width="24" height="17" viewBox="0 0 24 17" fill="none">
              <path d="M1 8.5L8.5 16L23 1" stroke="#717171" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <p style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '3px', color: '#aaa', margin: '0 0 16px', textTransform: 'uppercase' }}>
            Order Confirmed
          </p>
          <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 300, letterSpacing: '0.06em', margin: '0 0 28px', color: '#1c1c1c', lineHeight: 1.4 }}>
            {customerName
              ? t(`${customerName} 様、ご注文ありがとうございます`, `Thank you for your order, ${customerName}`)
              : t('ご注文ありがとうございます', 'Thank you for your order')}
          </h1>

          <div style={{ background: '#fff', border: '1px solid #e8e3da', padding: '28px 32px', marginBottom: 36, textAlign: 'left' }}>
            {orderNo && (
              <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #f0ece6' }}>
                <p style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '1.5px', color: '#aaa', margin: '0 0 6px', textTransform: 'uppercase' }}>{t('注文番号', 'Order Number')}</p>
                <p style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 20, color: '#1c1c1c', margin: 0, letterSpacing: '0.1em' }}>{orderNo}</p>
              </div>
            )}
            <p style={{ fontFamily: SANS, fontSize: 14, color: '#3a3a3a', lineHeight: 2, margin: '0 0 12px' }}>
              {t('ご注文を受け付けました。', 'Your order has been received.')}
              {customerEmail && (
                t(
                  <><br /><span style={{ color: '#717171' }}>{customerEmail}</span> に確認メールをお送りします。</>,
                  <><br />A confirmation email will be sent to <span style={{ color: '#717171' }}>{customerEmail}</span>.</>
                )
              )}
              {!customerEmail && t(
                <><br />ご登録いただいたメールアドレスに確認メールをお送りします。</>,
                <><br />A confirmation email will be sent to your registered email address.</>
              )}
            </p>
            <p style={{ fontFamily: SANS, fontSize: 13, color: '#717171', lineHeight: 2, margin: 0 }}>
              {t(
                <>発送が完了しましたら、改めてメールでお知らせいたします。<br />ご不明な点は <Link to="/contact" style={{ color: '#717171' }}>お問い合わせフォーム</Link> よりご連絡ください。</>,
                <>We will notify you by email once your order has shipped.<br />If you have any questions, please <Link to="/contact" style={{ color: '#717171' }}>contact us</Link>.</>
              )}
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
              {t('ショップに戻る', 'Back to Shop')}
            </Link>
            <Link
              to="/"
              style={{
                padding: '13px 32px', border: '1px solid #e8e3da', color: '#717171',
                textDecoration: 'none', fontFamily: SANS, fontSize: 13, letterSpacing: '2px',
                background: '#fff',
              }}
            >
              {t('トップへ', 'Home')}
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
