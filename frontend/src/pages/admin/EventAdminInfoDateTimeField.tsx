/** 時刻 select の選択肢（06〜22） */
const HOUR_OPTIONS: string[] = Array.from({ length: 17 }, (_, index) => String(index + 6).padStart(2, '0'))

/** 分 select の選択肢（00〜55、5分刻み） */
const MINUTE_OPTIONS: string[] = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

/** 搬入・搬出の日時入力欄に渡す値と変更通知 */
interface EventAdminInfoDateTimeFieldProps {
  /** 日付 input と label を結び付ける id */
  id: string
  /** 入力欄の項目名 */
  label: string
  /** 選択中の日付（YYYY-MM-DD）。未入力なら空文字 */
  date: string
  /** 選択中の時（HH）。未選択なら空文字 */
  hour: string
  /** 選択中の分（MM）。未選択なら空文字 */
  minute: string
  /** 時刻 select のアクセシブル名 */
  hourLabel: string
  /** 分 select のアクセシブル名 */
  minuteLabel: string
  /** 親で定義した共通入力欄の見た目 */
  inputStyle: React.CSSProperties
  /** 親で定義した共通ラベルの見た目 */
  labelStyle: React.CSSProperties
  /** 日付が変更されたことを親へ通知する */
  onDateChange: (value: string) => void
  /** 時が変更されたことを親へ通知する */
  onHourChange: (value: string) => void
  /** 分が変更されたことを親へ通知する */
  onMinuteChange: (value: string) => void
}

/**
 * 搬入または搬出の日時入力欄を表示し、編集値を親へ通知する。
 * 日時の結合・保存状態は親コンポーネントが引き続き管理する。
 * @param props - ラベル、現在値、値変更時の通知関数
 * @returns 日付 input と時・分 select を含む日時入力 UI
 */
export default function EventAdminInfoDateTimeField({
  id,
  label,
  date,
  hour,
  minute,
  hourLabel,
  minuteLabel,
  inputStyle,
  labelStyle,
  onDateChange,
  onHourChange,
  onMinuteChange,
}: EventAdminInfoDateTimeFieldProps) {
  /** 時・分 select の見た目。スマホでも押しやすいよう高さを 44px 確保する */
  const timeSelectStyle: React.CSSProperties = {
    padding: '10px 8px',
    minHeight: 44,
    border: '1px solid #dddde8',
    borderRadius: 4,
    fontSize: 15,
    fontFamily: 'inherit',
    background: '#ffffff',
  }

  /** 日付 input の見た目。親の共通入力スタイルに既存の横幅と折り返し設定を加える */
  const dateInputStyle: React.CSSProperties = {
    ...inputStyle,
    flex: '1 1 160px',
    minWidth: 0,
  }

  return (
    <div>
      {/* 1. 項目ラベルを日付 input に結び付ける */}
      <label htmlFor={id} style={labelStyle}>{label}</label>
      {/* 2. 日付と時刻を並べ、狭い幅では時刻のまとまりごと折り返す */}
      {/* 狭い幅では日付の下に時・分が折り返すようにする */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input
          id={id}
          type="date"
          style={dateInputStyle}
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
        />
        {/* 時・分は折り返しても離れないよう1つのまとまりにする */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: '0 0 auto' }}>
          <select
            aria-label={hourLabel}
            style={timeSelectStyle}
            value={hour}
            onChange={(event) => onHourChange(event.target.value)}
          >
            <option value="">--</option>
            {HOUR_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          {/* 時と分の区切り記号を薄い文字色で表示する */}
          <span style={{ fontSize: 15, color: 'var(--c-muted)' }}>:</span>
          <select
            aria-label={minuteLabel}
            style={timeSelectStyle}
            value={minute}
            onChange={(event) => onMinuteChange(event.target.value)}
          >
            <option value="">--</option>
            {MINUTE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}
