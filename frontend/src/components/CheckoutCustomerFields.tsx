import type { CSSProperties } from 'react'
import { INPUT_MAX_LENGTH } from '../lib/constants'
import CheckoutShippingAddressFields from './CheckoutShippingAddressFields'

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

      {/* 住所入力は独立部品に委ね、備考は注文情報欄としてこの部品に残す */}
      <CheckoutShippingAddressFields
        values={values}
        uid={uid}
        t={t}
        onChange={onChange}
      />
      <div style={{ marginBottom: 32 }}>
        <label htmlFor={`${uid}-note`} style={labelStyle}>{t('備考', 'Notes')}</label>
        <textarea id={`${uid}-note`} maxLength={INPUT_MAX_LENGTH.note} style={{ ...inputStyle, height: 80, resize: 'vertical' }} value={values.note} onChange={(e) => onChange('note', e.target.value)} />
      </div>
    </>
  )
}
