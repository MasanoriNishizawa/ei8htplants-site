import EventTimeRangeSelect from '../EventTimeRangeSelect'
import { formatJaMonthDayDow } from '../../../lib/localDate'

/** 日ごとの開催時間入力欄に渡す表示設定と親フォームへの通知関数 */
type EventDailyTimesFieldProps = {
  /** 開催する日付の一覧（YYYY-MM-DD） */
  dates: string[]
  /** 開始日・終了日の比較で複数日と判定されたか */
  isMultiDay: boolean
  /** 複数日で日ごとに開催時間を入力する設定か */
  dailyTimesMode: boolean
  /** 日付ごとの開催時間 */
  dailyTimes: Record<string, string>
  /** 共通の開催時間 */
  time: string
  /** 項目名の共通スタイル */
  labelStyle: React.CSSProperties
  /** 日ごとの入力を有効・無効にする変更を親へ通知する */
  onDailyTimesModeChange: (enabled: boolean) => void
  /** 指定日の開催時間変更を親へ通知する */
  onDailyTimeChange: (date: string, value: string) => void
  /** 共通開催時間の変更を親へ通知する */
  onTimeChange: (value: string) => void
}

/**
 * 開催時間の入力UIを表示し、入力変更を親フォームへ通知する。
 * 1. 複数日イベントでは日ごとの入力切り替えを表示する。
 * 2. 共通または日別の時間選択欄を表示し、変更を親へ通知する。
 * @param props - 日付・入力値・スタイルと親フォームへの変更通知関数
 * @returns 開催時間のラベル、日別切り替え、時間選択欄を含む表示要素
 */
export default function EventDailyTimesField({
  dates,
  isMultiDay,
  dailyTimesMode,
  dailyTimes,
  time,
  labelStyle,
  onDailyTimesModeChange,
  onDailyTimeChange,
  onTimeChange,
}: EventDailyTimesFieldProps) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        {/* 日ごとの入力では各選択欄に日付つきの読み上げ名があるため、ラベルを結ぶのは共通入力だけ */}
        <label htmlFor={dailyTimesMode && isMultiDay ? undefined : 'event-time-start'} style={{ ...labelStyle, marginBottom: 0 }}>開催時間</label>
        {isMultiDay && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--c-body)' }}>
            <input
              type="checkbox"
              checked={dailyTimesMode}
              onChange={(event) => onDailyTimesModeChange(event.target.checked)}
            />
            日ごとに異なる
          </label>
        )}
      </div>
      {dailyTimesMode && isMultiDay ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, background: '#f6f6fa', borderRadius: 4, border: '1px solid #dddde8' }}>
          {dates.map((date) => (
            <div key={date} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, color: 'var(--c-body)', minWidth: 116, flexShrink: 0 }}>{formatJaMonthDayDow(date)}</span>
              <EventTimeRangeSelect
                value={dailyTimes[date] ?? ''}
                onChange={(value) => onDailyTimeChange(date, value)}
                style={{ flex: 1 }}
                labelPrefix={`${formatJaMonthDayDow(date)}の`}
              />
            </div>
          ))}
        </div>
      ) : (
        <EventTimeRangeSelect id="event-time-start" value={time} onChange={onTimeChange} />
      )}
    </div>
  )
}
