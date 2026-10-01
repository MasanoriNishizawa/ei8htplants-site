import { useT } from '../lib/lang'
import PageMeta from '../components/PageMeta'

const SERIF = "'Cormorant Garamond', 'Noto Serif JP', serif"
const SANS = "'Noto Sans JP', sans-serif"
const BG = '#faf9f7'

const rows: { label: string; labelEn: string; value: string | string[]; valueEn: string | string[] }[] = [
  { label: '販売業者', labelEn: 'Seller', value: 'ei8ht plants', valueEn: 'ei8ht plants' },
  { label: '運営責任者', labelEn: 'Representative', value: '西澤 政徳', valueEn: 'Masanori Nishizawa' },
  { label: '所在地', labelEn: 'Address', value: '埼玉県入間市高倉4丁目9番地', valueEn: '4-9 Takakura, Iruma, Saitama, Japan' },
  {
    label: '連絡先',
    labelEn: 'Contact',
    value: [
      'メールアドレス：info@ei8htplants.com',
      'お問い合わせフォーム：https://ei8htplants.com/contact',
      '※ 電話番号は消費者からの請求により遅滞なく開示いたします。',
    ],
    valueEn: [
      'Email: info@ei8htplants.com',
      'Contact form: https://ei8htplants.com/contact',
      '※ Phone number will be disclosed promptly upon request by a consumer.',
    ],
  },
  { label: '販売価格', labelEn: 'Prices', value: '各商品ページに記載（税込）', valueEn: 'Listed on each product page (tax included)' },
  {
    label: '商品代金以外の必要料金',
    labelEn: 'Additional Fees',
    value: [
      '送料：お届け先の都道府県により異なります（¥1,000〜¥1,800）',
      '送料はご注文手続き時に都道府県を選択後に確定されます。',
    ],
    valueEn: [
      'Shipping: varies by destination prefecture (¥1,000–¥1,800)',
      'Shipping cost is confirmed after selecting a prefecture during checkout.',
    ],
  },
  {
    label: '支払方法',
    labelEn: 'Payment Methods',
    value: 'クレジットカード決済（Visa / Mastercard / American Express / JCB）',
    valueEn: 'Credit card (Visa / Mastercard / American Express / JCB)',
  },
  { label: '支払時期', labelEn: 'Payment Timing', value: 'ご注文確定と同時に決済が行われます。', valueEn: 'Payment is charged upon order confirmation.' },
  { label: '商品の引渡し時期', labelEn: 'Delivery', value: 'ご注文確認後、3〜5営業日以内に発送いたします。', valueEn: 'Orders are shipped within 3–5 business days of confirmation.' },
  {
    label: '返品・キャンセルについて',
    labelEn: 'Returns & Cancellations',
    value: [
      '【お客様都合による返品・キャンセル】',
      '決済完了後のキャンセル・返品はお承りしておりません。',
      '',
      '【不良品・破損の場合】',
      '商品の不良・破損・誤配送があった場合は、到着後7日以内に上記連絡先へお問い合わせください。',
      '確認後、交換または返金にて対応いたします。',
      '返送料はei8ht plantsが負担いたします。',
    ],
    valueEn: [
      '[Customer-initiated returns / cancellations]',
      'Cancellations and returns are not accepted after payment is completed.',
      '',
      '[Defective or damaged items]',
      'If an item arrives defective, damaged, or incorrectly shipped, please contact us within 7 days of receipt.',
      'We will arrange an exchange or refund upon confirmation.',
      'Return shipping costs will be covered by ei8ht plants.',
    ],
  },
  { label: '販売数量', labelEn: 'Stock', value: '各商品ページに記載の在庫数の範囲内', valueEn: 'Within the stock quantity shown on each product page' },
]

export default function LegalPage() {
  const t = useT()
  return (
    <>
      <PageMeta title={t('特定商取引法に基づく表示 | ei8ht plants', 'Specified Commercial Transaction Act | ei8ht plants')} description={t('ei8ht plants 特定商取引法に基づく表示', 'ei8ht plants – Specified Commercial Transaction Act disclosure')} />

      <div style={{ background: BG, minHeight: '100vh' }}>
        <div style={{ borderBottom: '1px solid #e8e3da', background: '#fff' }}>
          <div style={{ maxWidth: 800, margin: '0 auto', padding: '52px 24px 44px' }}>
            <p style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '3px', textTransform: 'uppercase', color: '#aaa', margin: '0 0 12px' }}>
              Legal
            </p>
            <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(22px, 3.5vw, 32px)', fontWeight: 300, margin: 0, color: '#1c1c1c', letterSpacing: '0.04em', lineHeight: 1.4 }}>
              {t('特定商取引法に基づく表示', 'Specified Commercial Transaction Act')}
            </h1>
          </div>
        </div>

        <div style={{ maxWidth: 800, margin: '0 auto', padding: '56px 24px 100px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {rows.map((row) => {
                const renderLines = (val: string | string[]) =>
                  Array.isArray(val)
                    ? val.map((line, i) =>
                        line === '' ? <br key={i} /> : <span key={i} style={{ display: 'block' }}>{line}</span>
                      )
                    : val
                return (
                  <tr key={row.label} style={{ borderBottom: '1px solid #e8e3da' }}>
                    <th style={{
                      fontFamily: SANS, fontSize: 13, fontWeight: 500, color: '#1c1c1c',
                      textAlign: 'left', verticalAlign: 'top',
                      padding: '22px 24px 22px 0',
                      width: '30%', whiteSpace: 'nowrap',
                    }}>
                      {t(row.label, row.labelEn)}
                    </th>
                    <td style={{
                      fontFamily: SANS, fontSize: 14, color: '#3a3a3a',
                      lineHeight: 2, padding: '22px 0',
                    }}>
                      {t(<>{renderLines(row.value)}</>, <>{renderLines(row.valueEn)}</>)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
