import type { EventAdminInfo } from '../../lib/api'
import { SectionBox } from './AdminInfoParts'

/** 出店料支払い方法の選択肢 */
const PAY_METHODS = ['当日現金', '事前振込', 'その他'] as const

/** 宿泊・出店料フォームの表示に必要な値と、親画面へ変更を伝える関数 */
interface EventAdminInfoStayBoothFieldsProps {
  /** 宿泊ホテル名 */
  hotelName: string | null | undefined
  /** 宿泊料金 */
  hotelFee: number | null | undefined
  /** 出店料 */
  boothFee: number | null | undefined
  /** 出店料の支払い方法 */
  boothFeePayMethod: string | null | undefined
  /** 出店料の支払い期限 */
  boothFeeDue: string | null | undefined
  /** 出店料を支払い済みかどうか */
  boothFeePaid: boolean | undefined
  /** 共通フォームの入力欄スタイル */
  inputStyle: React.CSSProperties
  /** 共通フォームのラベルスタイル */
  labelStyle: React.CSSProperties
  /** ホテル名の変更を親画面へ伝える */
  onHotelNameChange: (value: EventAdminInfo['hotel_name']) => void
  /** 宿泊料金の変更を親画面へ伝える */
  onHotelFeeChange: (value: EventAdminInfo['hotel_fee']) => void
  /** 出店料の変更を親画面へ伝える */
  onBoothFeeChange: (value: EventAdminInfo['booth_fee']) => void
  /** 支払い方法の変更を親画面へ伝える */
  onBoothFeePayMethodChange: (value: EventAdminInfo['booth_fee_pay_method']) => void
  /** 支払い期限の変更を親画面へ伝える */
  onBoothFeeDueChange: (value: EventAdminInfo['booth_fee_due']) => void
  /** 支払い済み状態の変更を親画面へ伝える */
  onBoothFeePaidChange: (value: EventAdminInfo['booth_fee_paid']) => void
}

/** 宿泊情報と出店料の入力欄を表示し、編集内容を親画面へ通知する。
 * state や保存処理は持たず、既存の管理情報フォームの表示だけを担当する。
 * @param props 表示値、共通スタイル、各入力値の変更通知関数
 * @returns 宿泊・出店料の入力欄
 */
export default function EventAdminInfoStayBoothFields({
  hotelName,
  hotelFee,
  boothFee,
  boothFeePayMethod,
  boothFeeDue,
  boothFeePaid,
  inputStyle,
  labelStyle,
  onHotelNameChange,
  onHotelFeeChange,
  onBoothFeeChange,
  onBoothFeePayMethodChange,
  onBoothFeeDueChange,
  onBoothFeePaidChange,
}: EventAdminInfoStayBoothFieldsProps) {
  return (
    <>
      {/* 宿泊情報の入力欄 */}
      <SectionBox label="宿泊">
        {/* 宿泊情報の各入力欄を縦に並べ、欄の間を 16px 空ける */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label htmlFor="hotel-name" style={labelStyle}>ホテル名</label>
            <input
              id="hotel-name"
              type="text"
              style={inputStyle}
              value={hotelName ?? ''}
              placeholder="宿泊ホテル名（任意）"
              onChange={(e) => onHotelNameChange(e.target.value || null)}
            />
          </div>
          <div>
            <label htmlFor="hotel-fee" style={labelStyle}>宿泊料金</label>
            {/* 金額欄と円の単位を横並びにし、間隔を 8px 空ける */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* 金額を右寄せし、桁の位置を揃える */}
              <input
                id="hotel-fee"
                type="number"
                min={0}
                style={{ ...inputStyle, textAlign: 'right' }}
                value={hotelFee ?? ''}
                placeholder="0"
                onChange={(e) => onHotelFeeChange(e.target.value === '' ? null : Number(e.target.value))}
              />
              {/* 金額の単位を小さめの muted 色で表示し、縮小させない */}
              <span style={{ fontSize: 13, color: 'var(--c-muted)', flexShrink: 0 }}>円</span>
            </div>
          </div>
        </div>
      </SectionBox>

      {/* 出店料の入力欄 */}
      <SectionBox label="出店料">
        {/* 出店料・支払い方法・期限・支払い状態を縦に並べ、欄の間を 16px 空ける */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label htmlFor="booth-fee" style={labelStyle}>出店料</label>
            {/* 金額欄と円の単位を横並びにし、間隔を 8px 空ける */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* 金額を右寄せし、桁の位置を揃える */}
              <input
                id="booth-fee"
                type="number"
                min={0}
                style={{ ...inputStyle, textAlign: 'right' }}
                value={boothFee ?? ''}
                placeholder="0"
                onChange={(e) => onBoothFeeChange(e.target.value === '' ? null : Number(e.target.value))}
              />
              {/* 金額の単位を小さめの muted 色で表示し、縮小させない */}
              <span style={{ fontSize: 13, color: 'var(--c-muted)', flexShrink: 0 }}>円</span>
            </div>
          </div>
          <div>
            <label htmlFor="booth-fee-pay-method" style={labelStyle}>支払い方法</label>
            <select
              id="booth-fee-pay-method"
              style={inputStyle}
              value={boothFeePayMethod ?? ''}
              onChange={(e) => onBoothFeePayMethodChange(e.target.value || null)}
            >
              <option value="">未設定</option>
              {PAY_METHODS.map((method) => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="booth-fee-due" style={labelStyle}>支払い期限</label>
            <input
              id="booth-fee-due"
              type="date"
              style={inputStyle}
              value={boothFeeDue ?? ''}
              onChange={(e) => onBoothFeeDueChange(e.target.value || null)}
            />
          </div>
          {/* 支払い済みチェックボックス */}
          <div>
            {/* ラベル全体を押せるようにし、余白を設ける。支払い状態に応じて背景色と枠色を変える */}
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              padding: '12px 14px',
              background: boothFeePaid ? '#f0f5ee' : '#ffffff',
              border: `1px solid ${boothFeePaid ? '#b8d4ae' : '#dddde8'}`,
              borderRadius: 4,
              }}>
              {/* チェック状態を見やすい大きさに保ち、緑系のアクセント色を使う */}
              <input
                type="checkbox"
                checked={boothFeePaid ?? false}
                onChange={(e) => onBoothFeePaidChange(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#4a6741', flexShrink: 0 }}
              />
              {/* 支払い済みの状態が分かるよう、チェック状態に応じて文字の太さを変える */}
              <span style={{ fontSize: 14, fontWeight: boothFeePaid ? 500 : 400 }}>
                支払い済み
              </span>
            </label>
          </div>
        </div>
      </SectionBox>
    </>
  )
}
