import type { CSSProperties } from 'react'

/** 日本語・英語の表示値から現在の言語の文言を選ぶ翻訳関数 */
type Translate = <T>(ja: T, en: T) => T

/** 予約フォームの参加人数と参加者情報を表示するための値・スタイル・通知関数 */
interface ReserveCustomerFieldsProps {
  /** 入力欄の id をページ内で一意にする接頭辞 */
  uid: string
  /** 現在の参加人数 */
  participants: number
  /** 現在の参加者名 */
  name: string
  /** 現在のメールアドレス */
  email: string
  /** 現在の電話番号 */
  phone: string
  /** 植物を持ち込むか */
  bringPlant: boolean
  /** 鉢を持ち込むか */
  bringPot: boolean
  /** 備考 */
  note: string
  /** イベントに時間枠があるか */
  expectsSessions: boolean
  /** 時間枠が未選択などの理由で参加人数欄を無効にするか */
  participantsDisabled: boolean
  /** 選択中の時間枠 ID */
  selectedSessionId: string
  /** 選択中の時間枠の残席数 */
  selectedRemaining: number
  /** 参加人数入力の上限 */
  maxParticipants: number
  /** 氏名の最大文字数 */
  nameMaxLength: number
  /** 電話番号の最大文字数 */
  phoneMaxLength: number
  /** 備考の最大文字数 */
  noteMaxLength: number
  /** 共通の入力欄スタイル */
  inputStyle: CSSProperties
  /** 共通の項目名スタイル */
  labelStyle: CSSProperties
  /** セクション見出しのスタイル */
  sectionLabel: CSSProperties
  /** 日本語・英語の文言を選ぶ関数 */
  t: Translate
  /** 参加人数の変更を親フォームへ通知する */
  onParticipantsChange: (value: number) => void
  /** 参加者名の変更を親フォームへ通知する */
  onNameChange: (value: string) => void
  /** メールアドレスの変更を親フォームへ通知する */
  onEmailChange: (value: string) => void
  /** 電話番号の変更を親フォームへ通知する */
  onPhoneChange: (value: string) => void
  /** 植物を持ち込む状態の変更を親フォームへ通知する */
  onBringPlantChange: (value: boolean) => void
  /** 鉢を持ち込む状態の変更を親フォームへ通知する */
  onBringPotChange: (value: boolean) => void
  /** 備考の変更を親フォームへ通知する */
  onNoteChange: (value: string) => void
}

/**
 * 参加人数と予約者の入力欄を表示し、編集値を親フォームへ通知する。
 * 1. 参加人数欄は親から受け取った時間枠・残席条件をそのまま表示へ反映する
 * 2. 必須属性・入力形式・アクセシビリティ属性を付けた参加者情報欄を既存順で表示する
 * 3. state、入力可否の判定、予約送信は親に委ねる
 * @param props - 予約フォームの値・表示条件・スタイル・変更通知関数
 * @returns 参加人数と参加者情報の入力欄
 */
export default function ReserveCustomerFields({
  uid,
  participants,
  name,
  email,
  phone,
  bringPlant,
  bringPot,
  note,
  expectsSessions,
  participantsDisabled,
  selectedSessionId,
  selectedRemaining,
  maxParticipants,
  nameMaxLength,
  phoneMaxLength,
  noteMaxLength,
  inputStyle,
  labelStyle,
  sectionLabel,
  t,
  onParticipantsChange,
  onNameChange,
  onEmailChange,
  onPhoneChange,
  onBringPlantChange,
  onBringPotChange,
  onNoteChange,
}: ReserveCustomerFieldsProps) {
  return (
    <>
      {/* 参加人数。時間枠ありなら残席数を上限にした選択肢、時間枠なしなら数値入力にする */}
      <div style={{ marginBottom: 20, opacity: participantsDisabled ? 0.4 : 1, transition: 'opacity 0.2s' }}>
        <label htmlFor={`${uid}-participants`} style={labelStyle}>
          {t('参加人数', 'Participants')} <span aria-hidden="true" style={{ color: '#c0392b' }}>*</span>
        </label>
        {expectsSessions ? (
          <select
            id={`${uid}-participants`}
            disabled={participantsDisabled}
            style={{ ...inputStyle, width: 120, cursor: participantsDisabled ? 'not-allowed' : 'default' }}
            value={participants}
            onChange={(event) => onParticipantsChange(Number(event.target.value))}
          >
            {selectedSessionId && selectedRemaining > 0
              ? Array.from({ length: Math.min(selectedRemaining, maxParticipants) }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>{t(`${count} 名`, `${count}`)}</option>
                ))
              : <option value={1}>—</option>
            }
          </select>
        ) : (
          <input
            id={`${uid}-participants`}
            required
            type="number"
            min={1}
            max={maxParticipants}
            style={{ ...inputStyle, width: 100 }}
            value={participants}
            onChange={(event) => onParticipantsChange(Number(event.target.value))}
          />
        )}
      </div>

      <p style={sectionLabel}>{t('お客様情報', 'Your Information')}</p>

      {/* 氏名・メールアドレスは必須、電話番号は任意 */}
      <div style={{ marginBottom: 20 }}>
        <label htmlFor={`${uid}-name`} style={labelStyle}>
          {t('お名前', 'Name')} <span aria-hidden="true" style={{ color: '#c0392b' }}>*</span>
        </label>
        <input
          id={`${uid}-name`}
          required
          autoComplete="name"
          maxLength={nameMaxLength}
          style={inputStyle}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label htmlFor={`${uid}-email`} style={labelStyle}>
          {t('メールアドレス', 'Email')} <span aria-hidden="true" style={{ color: '#c0392b' }}>*</span>
        </label>
        <input
          id={`${uid}-email`}
          required
          type="email"
          autoComplete="email"
          style={inputStyle}
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label htmlFor={`${uid}-phone`} style={labelStyle}>{t('電話番号（任意）', 'Phone (optional)')}</label>
        <input
          id={`${uid}-phone`}
          type="tel"
          autoComplete="tel"
          maxLength={phoneMaxLength}
          style={inputStyle}
          value={phone}
          onChange={(event) => onPhoneChange(event.target.value)}
          placeholder="090-0000-0000"
        />
      </div>

      {/* 植物と鉢の持ち込み希望を、既存のアクセシブルなグループとしてまとめる */}
      <div style={{ marginBottom: 20 }}>
        <p id={`${uid}-bring`} style={{ ...labelStyle, margin: '0 0 6px' }}>
          {t('持ち込み（任意）', 'Bring your own (optional)')}
        </p>
        <div role="group" aria-labelledby={`${uid}-bring`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 15 }}>
            <input
              type="checkbox"
              checked={bringPlant}
              onChange={(event) => onBringPlantChange(event.target.checked)}
              style={{ width: 18, height: 18, accentColor: '#4a6741' }}
            />
            {t('植物を持ち込む', 'Bring a plant')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 15 }}>
            <input
              type="checkbox"
              checked={bringPot}
              onChange={(event) => onBringPotChange(event.target.checked)}
              style={{ width: 18, height: 18, accentColor: '#4a6741' }}
            />
            {t('鉢を持ち込む', 'Bring a pot')}
          </label>
        </div>
      </div>

      <div style={{ marginBottom: 0 }}>
        <label htmlFor={`${uid}-note`} style={labelStyle}>{t('備考（任意）', 'Notes (optional)')}</label>
        <textarea
          id={`${uid}-note`}
          rows={4}
          maxLength={noteMaxLength}
          style={{ ...inputStyle, resize: 'vertical' }}
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </div>
    </>
  )
}
