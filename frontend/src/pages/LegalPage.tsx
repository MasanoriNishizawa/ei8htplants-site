import PageMeta from '../components/PageMeta'

const SERIF = "'Noto Serif JP', 'Hiragino Mincho ProN', serif"
const SANS = "'Noto Sans JP', sans-serif"
const BG = '#faf9f7'

const rows: { label: string; value: string | string[] }[] = [
  { label: '販売業者', value: 'ei8ht plants' },
  { label: '運営責任者', value: '西澤 政徳' },
  { label: '所在地', value: '埼玉県入間市高倉4丁目9番地' },
  {
    label: '連絡先',
    value: [
      'メールアドレス：info@ei8htplants.com',
      'お問い合わせフォーム：https://ei8htplants.com/contact',
      '※ 電話番号は消費者からの請求により遅滞なく開示いたします。',
    ],
  },
  { label: '販売価格', value: '各商品ページに記載（税込）' },
  {
    label: '商品代金以外の必要料金',
    value: [
      '送料：お届け先の都道府県により異なります（¥1,000〜¥1,800）',
      '送料はご注文手続き時に都道府県を選択後に確定されます。',
    ],
  },
  { label: '支払方法', value: 'クレジットカード決済（Visa / Mastercard / American Express / JCB）' },
  { label: '支払時期', value: 'ご注文確定と同時に決済が行われます。' },
  { label: '商品の引渡し時期', value: 'ご注文確認後、3〜5営業日以内に発送いたします。' },
  {
    label: '返品・キャンセルについて',
    value: [
      '【お客様都合による返品・キャンセル】',
      '決済完了後のキャンセル・返品はお承りしておりません。',
      '',
      '【不良品・破損の場合】',
      '商品の不良・破損・誤配送があった場合は、到着後7日以内に上記連絡先へお問い合わせください。',
      '確認後、交換または返金にて対応いたします。',
      '返送料はei8ht plantsが負担いたします。',
    ],
  },
  { label: '販売数量', value: '各商品ページに記載の在庫数の範囲内' },
]

export default function LegalPage() {
  return (
    <>
      <PageMeta title="特定商取引法に基づく表示 | ei8ht plants" description="ei8ht plants 特定商取引法に基づく表示" />

      <div style={{ background: BG, minHeight: '100vh' }}>
        <div style={{ borderBottom: '1px solid #e8e3da', background: '#fff' }}>
          <div style={{ maxWidth: 800, margin: '0 auto', padding: '52px 24px 44px' }}>
            <p style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '3px', textTransform: 'uppercase', color: '#aaa', margin: '0 0 12px' }}>
              Legal
            </p>
            <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(22px, 3.5vw, 32px)', fontWeight: 300, margin: 0, color: '#1c1c1c', letterSpacing: '0.04em', lineHeight: 1.4 }}>
              特定商取引法に基づく表示
            </h1>
          </div>
        </div>

        <div style={{ maxWidth: 800, margin: '0 auto', padding: '56px 24px 100px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} style={{ borderBottom: '1px solid #e8e3da' }}>
                  <th style={{
                    fontFamily: SANS, fontSize: 13, fontWeight: 500, color: '#1c1c1c',
                    textAlign: 'left', verticalAlign: 'top',
                    padding: '22px 24px 22px 0',
                    width: '30%', whiteSpace: 'nowrap',
                  }}>
                    {row.label}
                  </th>
                  <td style={{
                    fontFamily: SANS, fontSize: 14, color: '#3a3a3a',
                    lineHeight: 2, padding: '22px 0',
                  }}>
                    {Array.isArray(row.value)
                      ? row.value.map((line, i) =>
                          line === ''
                            ? <br key={i} />
                            : <span key={i} style={{ display: 'block' }}>{line}</span>
                        )
                      : row.value
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
