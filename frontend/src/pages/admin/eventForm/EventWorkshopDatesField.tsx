import { formatJaMonthDayDow } from '../../../lib/localDate'
import type { SessionInput } from '../eventTime'
import type { DailySessions } from './wsSchedule'
import WsSessionRows from './WsSessionRows'

/** 「実施する日を選ぶ」の編集欄に渡す値と操作 */
interface EventWorkshopDatesFieldProps {
  /** 開催期間の全部の日（YYYY-MM-DD。チェックの選択肢） */
  eventDates: string[]
  /** 選んでいる実施日（開催期間に入っている日だけ・日付の昇順） */
  selectedDates: string[]
  /** 日付 → その日の時間枠 */
  dailySessions: DailySessions
  /**
   * その日の「自動設定」を押せるか（その日の開催時間、または共通の開催時間に「開始〜終了」があるか）
   * @param date - 日付（YYYY-MM-DD）
   * @returns 押せるなら true
   */
  canAutoSet: (date: string) => boolean
  /** 項目名の共通スタイル */
  labelStyle: React.CSSProperties
  /** 時間欄・定員欄の共通スタイル */
  inputStyle: React.CSSProperties
  /** 実施日のチェックの切り替えを親へ通知する */
  onToggleDate: (date: string, checked: boolean) => void
  /** その日に空の枠を 1 行足す */
  onAddSession: (date: string) => void
  /** その日の枠を開催時間から自動で作る */
  onAutoSetSessions: (date: string) => void
  /** ほかの日（from）の枠を、その日（to）にコピーする */
  onCopySessions: (to: string, from: string) => void
  /** その日の指定位置の枠を消す */
  onRemoveSession: (date: string, index: number) => void
  /** その日の指定位置の枠の時間・定員を変える */
  onSessionChange: (date: string, index: number, key: keyof SessionInput, value: string | number) => void
  /** その日の指定位置の枠を 1 つ上（-1）・1 つ下（1）へ動かす */
  onMoveSession: (date: string, index: number, direction: -1 | 1) => void
  /** その日の枠を時間順に並べ直す */
  onSortSessions: (date: string) => void
}

/**
 * ワークショップを「実施する日を選ぶ」ときの編集欄。
 * 1. 開催期間の日をチェックで選ぶ（1 日以上。最後の 1 日は外せない）
 * 2. 選んだ日ごとに、時間枠（時間・定員）の一覧と「自動設定」「ほかの日の枠をコピー」「+ 追加」を出す
 * 値の保持・自動生成・保存は親フォーム（EventForm.tsx）が行う
 * @param props - 開催日・選んだ日・日ごとの枠・スタイル・親へ通知する操作
 * @returns 実施日の選択と日ごとの時間枠の編集欄
 */
export default function EventWorkshopDatesField({
  eventDates,
  selectedDates,
  dailySessions,
  canAutoSet,
  labelStyle,
  inputStyle,
  onToggleDate,
  onAddSession,
  onAutoSetSessions,
  onCopySessions,
  onRemoveSession,
  onSessionChange,
  onMoveSession,
  onSortSessions,
}: EventWorkshopDatesFieldProps) {
  /**
   * 実施日のチェック 1 つ分の見た目: 枠線つきの小さな札にし、選んでいる日は緑の枠・薄い緑の背景にする
   * @param checked - その日を選んでいるか
   * @param locked - 最後の 1 日で外せないか（外せないときはカーソルを「できない」形にする）
   * @returns 札（label）のスタイル
   */
  const dateChipStyle = (checked: boolean, locked: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', fontSize: 13,
    border: `1px solid ${checked ? '#4a6741' : '#dddde8'}`, borderRadius: 4,
    background: checked ? '#f0f5ee' : '#ffffff', cursor: locked ? 'not-allowed' : 'pointer', color: 'var(--c-body)',
  })
  /**
   * その日の「自動設定」ボタンの見た目: 緑の枠線だけのボタン。押せないときは薄くする
   * @param enabled - 押せるか（その日の開催時間に「開始〜終了」があるか）
   * @returns ボタンのスタイル
   */
  const autoButtonStyle = (enabled: boolean): React.CSSProperties => ({
    padding: '6px 12px', background: 'none', color: '#4a6741', border: '1px solid #4a6741',
    borderRadius: 2, fontSize: 13, cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.4,
  })
  /**
   * 「時間順に並べる」ボタンの見た目: 枠線だけの控えめなボタン。押せないときは薄くする
   * @param enabled - 押せるか（その日の枠が 2 件以上）
   * @returns ボタンのスタイル
   */
  const sortButtonStyle = (enabled: boolean): React.CSSProperties => ({
    padding: '6px 12px', background: 'none', color: 'var(--c-body)', border: '1px solid #c8d8c0',
    borderRadius: 2, fontSize: 13, cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.4,
  })
  /** + 追加ボタン: 緑の背景・白い文字 */
  const addButtonStyle: React.CSSProperties = {
    padding: '6px 14px', background: '#4a6741', color: '#fff', border: 'none', borderRadius: 2, fontSize: 13, cursor: 'pointer',
  }
  /** コピー元を選ぶ select: 枠線つきの小さな選択欄（スマホ幅では行いっぱいまで縮む） */
  const copySelectStyle: React.CSSProperties = {
    padding: '6px 8px', border: '1px solid #dddde8', borderRadius: 2, fontSize: 13, background: '#ffffff',
    fontFamily: 'inherit', color: 'var(--c-body)', maxWidth: '100%',
  }

  return (
    <div style={{ /* 日を選ぶ欄全体: 共通の枠の欄と同じ薄い緑の箱 */ padding: 20, background: '#f8faf6', border: '1px solid #c8d8c0', borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. 実施日のチェック（開催期間の日を並べ、狭い画面では折り返す） */}
      <div>
        <p id="ws-dates-label" style={{ ...labelStyle, margin: '0 0 8px', fontSize: 14, fontWeight: 500 }}>実施する日（1日以上）</p>
        <div role="group" aria-labelledby="ws-dates-label" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {eventDates.map((date) => {
            /** この日を選んでいるか */
            const checked = selectedDates.includes(date)
            /** 最後の 1 日なので外せないか */
            const locked = checked && selectedDates.length === 1
            return (
              <label key={date} style={dateChipStyle(checked, locked)} title={locked ? '実施する日は1日以上必要です' : undefined}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={(event) => onToggleDate(date, event.target.checked)}
                />
                {formatJaMonthDayDow(date)}
              </label>
            )
          })}
        </div>
      </div>

      {/* 2. 選んだ日ごとの時間枠（日付の見出し・操作ボタン・枠の行） */}
      {selectedDates.map((date) => {
        /** この日の時間枠 */
        const sessions = dailySessions[date] ?? []
        /** 見出し・読み上げに使う日付の表示（例: 11月3日（日）） */
        const dateLabel = formatJaMonthDayDow(date)
        /** コピー元に選べるほかの日（枠が1件以上ある日だけ） */
        const copySources = selectedDates.filter((d) => d !== date && (dailySessions[d] ?? []).length > 0)
        /** この日の自動設定を押せるか */
        const autoEnabled = canAutoSet(date)
        return (
          <section key={date} aria-label={`${dateLabel}の時間枠`} style={{ /* 1 日分の箱: 白い背景に細い枠線 */ background: '#ffffff', border: '1px solid #dde6d8', borderRadius: 4, padding: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--c-ink)' }}>{dateLabel}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {/* 時間順に並べる（枠が 1 件以下なら押せない） */}
                <button
                  type="button"
                  onClick={() => onSortSessions(date)}
                  disabled={sessions.length <= 1}
                  aria-label={`${dateLabel}の枠を時間順に並べる`}
                  style={sortButtonStyle(sessions.length > 1)}
                >
                  時間順に並べる
                </button>
                <button
                  type="button"
                  onClick={() => onAutoSetSessions(date)}
                  disabled={!autoEnabled}
                  aria-label={`${dateLabel}の枠を自動設定`}
                  style={autoButtonStyle(autoEnabled)}
                >
                  自動設定
                </button>
                {/* ほかの日に枠があるときだけ、コピー元を選ぶ欄を出す（選んだらすぐコピーし、選択は空に戻す） */}
                {copySources.length > 0 && (
                  <select
                    aria-label={`${dateLabel}にほかの日の枠をコピー`}
                    value=""
                    onChange={(event) => { if (event.target.value) onCopySessions(date, event.target.value) }}
                    style={copySelectStyle}
                  >
                    <option value="">ほかの日の枠をコピー</option>
                    {copySources.map((d) => (
                      <option key={d} value={d}>{formatJaMonthDayDow(d)}の枠</option>
                    ))}
                  </select>
                )}
                <button type="button" onClick={() => onAddSession(date)} aria-label={`${dateLabel}に枠を追加`} style={addButtonStyle}>
                  + 追加
                </button>
              </div>
            </div>
            {/* 枠が無ければ時間指定なしの案内、あれば時間・定員の行 */}
            <WsSessionRows
              sessions={sessions}
              labelPrefix={`${dateLabel}の`}
              inputStyle={inputStyle}
              emptyText="枠なし（時間指定なしで予約受付）"
              onRemove={(index) => onRemoveSession(date, index)}
              onChange={(index, key, value) => onSessionChange(date, index, key, value)}
              onMove={(index, direction) => onMoveSession(date, index, direction)}
            />
          </section>
        )
      })}
    </div>
  )
}
