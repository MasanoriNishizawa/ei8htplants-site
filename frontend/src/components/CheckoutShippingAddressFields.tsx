import type { CSSProperties } from 'react'
import { INPUT_MAX_LENGTH } from '../lib/constants'
import type { CheckoutCustomerFieldValues } from './CheckoutCustomerFields'

/** 配送先住所の入力変更を親へ返すフィールド名 */
export type CheckoutShippingAddressFieldName =
  | 'postalCode'
  | 'prefecture'
  | 'city'
  | 'addressLine1'
  | 'addressLine2'

/** 配送先住所の入力欄に表示する値と親への通知 */
interface CheckoutShippingAddressFieldsProps {
  /** 表示する配送先住所の5項目 */
  values: Pick<CheckoutCustomerFieldValues, CheckoutShippingAddressFieldName>
  /** label と入力欄を結び付ける id の先頭部分 */
  uid: string
  /** 日本語と英語を切り替える翻訳関数 */
  t: (ja: string, en: string) => string
  /** 入力値の変更を親画面へ知らせる */
  onChange: (field: CheckoutShippingAddressFieldName, value: string) => void
}

/** 都道府県の選択肢（北から順） */
const PREFECTURES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県',
  '静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
  '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
  '熊本県','大分県','宮崎県','鹿児島県','沖縄県',
]

/**
 * 配送先住所の5項目を、親から受け取った値と通知関数で表示する。
 * 1. ラベル・入力属性・順序を保って住所入力欄を描画する。
 * 2. 入力変更をフィールド名と値で親画面へ返す。
 * @param props 表示値、id の接頭辞、翻訳関数、入力変更通知
 * @returns 親フォームに置く配送先住所の入力要素
 */
export default function CheckoutShippingAddressFields({
  values,
  uid,
  t,
  onChange,
}: CheckoutShippingAddressFieldsProps) {
  /** 配送先の区切り見出しの見た目 */
  const sectionTitle: CSSProperties = {
    fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 16, fontWeight: 400, color: '#1c1c1c',
    borderBottom: '1px solid #e8e3da', paddingBottom: 12, marginBottom: 20, letterSpacing: '0.05em',
  }
  /** 入力欄（枠線のみの四角い欄）に共通する見た目 */
  const inputStyle: CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '11px 14px',
    border: '1px solid #ddd', fontSize: 14, fontFamily: "'Noto Sans JP', sans-serif",
    color: '#1c1c1c', background: '#fff', outline: 'none', borderRadius: 0,
    WebkitAppearance: 'none', appearance: 'none',
  }
  /** 入力欄の上に表示する小さなラベルの見た目 */
  const labelStyle: CSSProperties = {
    display: 'block', fontFamily: "'Noto Sans JP', sans-serif", fontSize: 11, letterSpacing: '1.5px',
    color: '#aaa', marginBottom: 7,
  }

  return (
    <>
      {/* お届け先見出しから建物名・部屋番号までを従来の属性・順序で表示する */}
      <p style={sectionTitle}>{t('お届け先', 'Shipping Address')}</p>
      <div style={{ marginBottom: 16 }}>
        <label htmlFor={`${uid}-postal`} style={labelStyle}>{t('郵便番号 *', 'Postal Code *')}</label>
        <input id={`${uid}-postal`} required autoComplete="postal-code" maxLength={INPUT_MAX_LENGTH.postalCode} style={{ ...inputStyle, maxWidth: 160 }} value={values.postalCode} onChange={(e) => onChange('postalCode', e.target.value)} placeholder="000-0000" />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label htmlFor={`${uid}-prefecture`} style={labelStyle}>{t('都道府県 *', 'Prefecture *')}</label>
        <select id={`${uid}-prefecture`} required style={inputStyle} value={values.prefecture} onChange={(e) => onChange('prefecture', e.target.value)}>
          <option value="">{t('選択してください', 'Select a prefecture')}</option>
          {PREFECTURES.map((prefecture) => <option key={prefecture} value={prefecture}>{prefecture}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label htmlFor={`${uid}-city`} style={labelStyle}>{t('市区町村 *', 'City / Town *')}</label>
        <input id={`${uid}-city`} required maxLength={INPUT_MAX_LENGTH.city} style={inputStyle} value={values.city} onChange={(e) => onChange('city', e.target.value)} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label htmlFor={`${uid}-address1`} style={labelStyle}>{t('番地・建物名 *', 'Street Address *')}</label>
        <input id={`${uid}-address1`} required maxLength={INPUT_MAX_LENGTH.address} style={inputStyle} value={values.addressLine1} onChange={(e) => onChange('addressLine1', e.target.value)} />
      </div>
      <div style={{ marginBottom: 32 }}>
        <label htmlFor={`${uid}-address2`} style={labelStyle}>{t('建物名・部屋番号', 'Building / Apt No.')}</label>
        <input id={`${uid}-address2`} maxLength={INPUT_MAX_LENGTH.address} style={inputStyle} value={values.addressLine2} onChange={(e) => onChange('addressLine2', e.target.value)} />
      </div>
    </>
  )
}
