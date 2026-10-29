import type { CSSProperties } from 'react'
import { INPUT_MAX_LENGTH } from '../lib/constants'

/** お客様情報・お届け先で扱う入力値 */
export interface CheckoutCustomerFieldValues {
  /** お客様の氏名 */
  name: string
  /** 注文連絡先のメールアドレス */
  email: string
  /** お客様の電話番号 */
  phone: string
  /** お届け先の郵便番号 */
  postalCode: string
  /** お届け先の都道府県 */
  prefecture: string
  /** お届け先の市区町村 */
  city: string
  /** お届け先の番地・建物名 */
  addressLine1: string
  /** お届け先の建物名・部屋番号 */
  addressLine2: string
  /** 注文に関する備考 */
  note: string
}

/** 入力欄から親画面へ通知できるフィールド名 */
export type CheckoutCustomerFieldName = keyof CheckoutCustomerFieldValues

/** お客様情報・お届け先の入力欄を描画するための値と操作 */
interface CheckoutCustomerFieldsProps {
  /** 制御コンポーネントに表示する入力値 */
  values: CheckoutCustomerFieldValues
  /** label と入力欄を結び付ける id の先頭部分 */
  uid: string
  /** 日本語と英語を切り替える翻訳関数 */
  t: (ja: string, en: string) => string
  /** 入力値の変更を親画面へ知らせる */
  onChange: (field: CheckoutCustomerFieldName, value: string) => void
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
 * お客様情報とお届け先の入力欄を表示する制御コンポーネント。
 * 1. 親画面から受け取った値を各欄へ表示する。
 * 2. 入力変更をフィールド名と値で親画面へ通知する。
 * @param props 表示値、id の接頭辞、翻訳関数、入力変更通知
 * @returns 注文フォームに置くお客様情報・お届け先の要素
 */
export default function CheckoutCustomerFields({ values, uid, t, onChange }: CheckoutCustomerFieldsProps) {
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
  /** 「お客様情報」「お届け先」の区切り見出しの見た目 */
  const sectionTitle: CSSProperties = {
    fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 16, fontWeight: 400, color: '#1c1c1c',
    borderBottom: '1px solid #e8e3da', paddingBottom: 12, marginBottom: 20, letterSpacing: '0.05em',
  }

  return (
    <>
      {/* お客様情報の氏名・メールアドレス・電話番号を、既存の順序と間隔で入力する */}
      <p style={sectionTitle}>{t('お客様情報', 'Customer Information')}</p>
      <div style={{ marginBottom: 16 }}>
        <label htmlFor={`${uid}-name`} style={labelStyle}>{t('お名前 *', 'Full Name *')}</label>
        <input id={`${uid}-name`} required autoComplete="name" maxLength={INPUT_MAX_LENGTH.name} style={inputStyle} value={values.name} onChange={(e) => onChange('name', e.target.value)} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label htmlFor={`${uid}-email`} style={labelStyle}>{t('メールアドレス *', 'Email Address *')}</label>
        <input id={`${uid}-email`} required type="email" autoComplete="email" style={inputStyle} value={values.email} onChange={(e) => onChange('email', e.target.value)} />
      </div>
      <div style={{ marginBottom: 32 }}>
        <label htmlFor={`${uid}-phone`} style={labelStyle}>{t('電話番号', 'Phone Number')}</label>
        <input id={`${uid}-phone`} type="tel" autoComplete="tel" maxLength={INPUT_MAX_LENGTH.phone} style={inputStyle} value={values.phone} onChange={(e) => onChange('phone', e.target.value)} />
      </div>

      {/* お届け先の住所・備考を、既存の順序と入力属性で表示する */}
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
      <div style={{ marginBottom: 32 }}>
        <label htmlFor={`${uid}-note`} style={labelStyle}>{t('備考', 'Notes')}</label>
        <textarea id={`${uid}-note`} maxLength={INPUT_MAX_LENGTH.note} style={{ ...inputStyle, height: 80, resize: 'vertical' }} value={values.note} onChange={(e) => onChange('note', e.target.value)} />
      </div>
    </>
  )
}
