import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { formatYen } from '../lib/format'

/** 注文ボタンの表示状態（送信中だけ loading） */
export type CheckoutPaymentStatus = 'idle' | 'loading' | 'error'

/** 支払い表示に親画面から渡す状態と翻訳関数 */
interface CheckoutPaymentSectionProps {
  /** Square カードフォームが初期化済みか */
  sdkReady: boolean
  /** 読み込み・注文処理中に表示するエラー。空文字なら表示しない */
  errorMsg: string
  /** 注文送信の状態 */
  status: CheckoutPaymentStatus
  /** 送料を含めた注文合計 */
  total: number
  /** 日本語と英語を切り替える翻訳関数 */
  t: (ja: React.ReactNode, en: React.ReactNode) => React.ReactNode
  /** 見出し用の書体 */
  serif: string
  /** 本文用の書体 */
  sans: string
}

/**
 * 注文フォーム内の支払い案内と注文確定操作を表示する。
 * Square SDK のカード入力欄は親画面が用意する同じ ID の要素へ取り付ける。
 * 1. 支払い見出し・カードマウント領域・読込案内・エラーを既存順で表示する。
 * 2. キャンセル方針、注文確定ボタン、決済注意書きを続けて表示する。
 * @param props Square の準備状態、エラー、送信状態、合計、翻訳関数、書体
 * @returns 親の form 内に置く支払い表示要素
 */
export default function CheckoutPaymentSection({
  sdkReady,
  errorMsg,
  status,
  total,
  t,
  serif,
  sans,
}: CheckoutPaymentSectionProps) {
  /** 「お支払い」の区切り見出しの見た目 */
  const paymentSectionTitle: CSSProperties = {
    fontFamily: serif, fontSize: 16, fontWeight: 400, color: '#1c1c1c',
    borderBottom: '1px solid #e8e3da', paddingBottom: 12, marginBottom: 20, letterSpacing: '0.05em',
  }

  return (
    <>
      {/* 支払い方法の見出し */}
      <p style={paymentSectionTitle}>{t('お支払い', 'Payment')}</p>
      {/* Square SDK がカード入力欄を取り付ける既存のマウント先 */}
      <div
        id="square-card-container"
        style={{ border: '1px solid #ddd', padding: '14px 12px', marginBottom: 8, minHeight: 60, background: '#fff' }}
      />
      {/* カード入力欄の読み込み中の案内と、エラー文 */}
      {!sdkReady && !errorMsg && (
        <p style={{ fontFamily: sans, fontSize: 12, color: '#aaa', marginBottom: 16 }}>{t('カード入力フォームを読み込み中...', 'Loading card form...')}</p>
      )}
      {errorMsg && (
        <p role="alert" style={{ fontFamily: sans, fontSize: 13, color: '#c0392b', marginBottom: 16, lineHeight: 1.7 }}>{errorMsg}</p>
      )}

      {/* キャンセル不可の案内 */}
      <div style={{ background: '#f9f9f7', border: '1px solid #e8e3da', padding: '14px 18px', marginBottom: 16 }}>
        <p style={{ fontFamily: sans, fontSize: 12, color: '#555', margin: 0, lineHeight: 2 }}>
          {t(
            <>ご注文確定後のキャンセル・返品はお承りしておりません。<br />商品の不良・破損があった場合のみ、到着後7日以内に<Link to="/official/contact" style={{ color: '#1c1c1c' }}>お問い合わせページ</Link>よりご連絡ください。</>,
            <>Cancellations and returns are not accepted after an order is placed.<br />If an item arrives damaged or defective, please <Link to="/official/contact" style={{ color: '#1c1c1c' }}>contact us</Link> within 7 days of receipt.</>
          )}
        </p>
      </div>

      {/* 注文の確定ボタン（合計を添える。送信中・カード入力欄の準備前は押せない） */}
      <button
        type="submit"
        disabled={status === 'loading' || !sdkReady}
        style={{
          width: '100%', padding: '16px 0', border: 'none', marginTop: 4,
          background: status === 'loading' ? '#a0a098' : '#1c1c1c',
          color: '#fff', fontFamily: sans, fontSize: 13, letterSpacing: '2px',
          cursor: status === 'loading' ? 'default' : 'pointer',
        }}
      >
        {status === 'loading' ? t('処理中...', 'Processing...') : t(`注文を確定する  ${formatYen(total)}`, `Place Order  ${formatYen(total)}`)}
      </button>
      <p style={{ fontFamily: sans, fontSize: 11, color: '#aaa', marginTop: 12, textAlign: 'center', lineHeight: 1.9 }}>
        {t(
          <>ご注文確定と同時に決済が行われます。<br />カード情報は Square により安全に処理されます。</>,
          <>Payment is charged upon order confirmation.<br />Your card details are securely handled by Square.</>
        )}
      </p>
    </>
  )
}
