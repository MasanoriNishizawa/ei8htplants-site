import type { CartItem } from '../lib/cart'
import { formatYen } from '../lib/format'

/** 注文内容サマリーに必要な表示データと操作をまとめた型 */
interface CheckoutOrderSummaryProps {
  /** 商品ごとの価格・画像・数量 */
  items: CartItem[]
  /** 商品金額の小計 */
  subtotal: number
  /** 送料を含めた合計 */
  total: number
  /** 選択中のお届け先都道府県 */
  prefecture: string
  /** 取得した送料。未確定なら null */
  shippingFee: number | null
  /** 送料取得の状態 */
  shippingStatus: 'idle' | 'loading' | 'error'
  /** 送料を再取得する操作 */
  onRetryShipping: () => void
  /** 日本語と英語を切り替える翻訳関数 */
  t: (ja: string, en: string) => string
  /** 見出しなどに使う明朝体の指定 */
  serif: string
  /** 本文に使うゴシック体の指定 */
  sans: string
}

/** 注文商品の一覧、小計、送料、合計を表示する。送料の再取得操作は親へ渡す。
 * @param props 注文内容、送料状態、翻訳関数、書体、送料再取得操作
 * @returns 注文内容サマリーの表示
 */
export default function CheckoutOrderSummary({
  items,
  subtotal,
  total,
  prefecture,
  shippingFee,
  shippingStatus,
  onRetryShipping,
  t,
  serif,
  sans,
}: CheckoutOrderSummaryProps) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e8e3da', padding: 28 }}>
      {/* 注文概要を白い面と境界線で区切り、項目ごとの余白を整える */}
      <p style={{ fontFamily: serif, fontSize: 14, color: '#1c1c1c', margin: '0 0 20px', letterSpacing: '0.05em', borderBottom: '1px solid #e8e3da', paddingBottom: 12 }}>
        {t('ご注文内容', 'Order Summary')}
      </p>
      {/* 商品画像・商品名・数量・商品ごとの金額を横並びで表示する一覧 */}
      <div style={{ marginBottom: 20 }}>
        {items.map((i) => (
          <div key={i.product.id} style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-start' }}>
            <div style={{ width: 60, height: 60, flexShrink: 0, background: '#f0ede8', overflow: 'hidden' }}>
              {i.product.image_urls[0] && (
                <img src={i.product.image_urls[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: sans, fontSize: 13, color: '#1c1c1c', margin: '0 0 3px', lineHeight: 1.5 }}>{i.product.name}</p>
              <p style={{ fontFamily: sans, fontSize: 12, color: '#aaa', margin: 0 }}>× {i.quantity}</p>
            </div>
            <p style={{ fontFamily: serif, fontSize: 14, color: '#1c1c1c', margin: 0, whiteSpace: 'nowrap' }}>{formatYen(i.product.price * i.quantity)}</p>
          </div>
        ))}
      </div>
      {/* 小計・送料・合計と、送料の確認状態や再取得操作を表示する金額欄 */}
      <div style={{ borderTop: '1px solid #e8e3da', paddingTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontFamily: sans, fontSize: 13, color: '#717171' }}>
          <span>{t('小計', 'Subtotal')}</span><span>{formatYen(subtotal)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, fontFamily: sans, fontSize: 13, color: '#717171' }}>
          <span>{t('送料', 'Shipping')}{prefecture ? `（${prefecture}）` : ''}</span>
          <span>{shippingFee !== null ? formatYen(shippingFee) : '—'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: serif, fontSize: 19, color: '#1c1c1c' }}>
          <span>{t('合計', 'Total')}</span>
          <span>{shippingFee !== null ? formatYen(total) : '—'}</span>
        </div>
        {/* 送料が未確定のときの案内。未選択・取得中・取得失敗で文言を分ける */}
        {shippingFee === null && shippingStatus !== 'error' && (
          <p style={{ fontFamily: sans, fontSize: 11, color: '#aaa', marginTop: 6, textAlign: 'right' }}>
            {shippingStatus === 'loading'
              ? t('送料を確認中...', 'Calculating shipping...')
              : t('都道府県選択後に確定', 'Determined after selecting prefecture')}
          </p>
        )}
        {shippingStatus === 'error' && (
          <div role="alert" style={{ marginTop: 6, textAlign: 'right' }}>
            <p style={{ fontFamily: sans, fontSize: 11, color: '#c0392b', margin: '0 0 6px', lineHeight: 1.7 }}>
              {t('送料を取得できませんでした。通信状況をご確認ください。', 'Could not get the shipping fee. Please check your connection.')}
            </p>
            {/* 送料の再取得ボタン（文字だけの小さなボタン） */}
            <button
              type="button"
              onClick={onRetryShipping}
              style={{ fontFamily: sans, fontSize: 11, color: '#1c1c1c', background: 'none', border: '1px solid #ddd', padding: '4px 12px', cursor: 'pointer' }}
            >
              {t('送料を再取得', 'Retry shipping')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
