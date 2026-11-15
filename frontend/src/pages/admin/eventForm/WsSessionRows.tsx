import type { SessionInput } from '../eventTime'

/** 時間枠の行（時間・定員・削除）の一覧に渡す値と操作 */
interface WsSessionRowsProps {
  /** 表示する時間枠 */
  sessions: SessionInput[]
  /** 読み上げ名の頭に付ける文字（日ごとの枠では「11月3日（日）の」。共通の枠では空） */
  labelPrefix?: string
  /** 時間欄と定員欄で共通して使う親フォームの入力スタイル */
  inputStyle: React.CSSProperties
  /** 枠が0件のときに出す案内 */
  emptyText: string
  /** 指定位置の枠を消す */
  onRemove: (index: number) => void
  /** 指定位置の枠の時間・定員を変える */
  onChange: (index: number, key: keyof SessionInput, value: string | number) => void
}

/**
 * ワークショップの時間枠の行（時間の文字列・定員・削除ボタン）を並べて表示する。
 * 共通の枠と、日ごとの枠の両方で使う。値の保持・追加は親が行う
 * @param props - 時間枠・読み上げ名の頭の文字・入力スタイル・枠なしの案内・親へ通知する操作
 * @returns 時間枠の行の一覧（0件なら案内の文）
 */
export default function WsSessionRows({ sessions, labelPrefix = '', inputStyle, emptyText, onRemove, onChange }: WsSessionRowsProps) {
  /** 時間の入力欄: 親の共通スタイルに、横に伸び縮みする設定（基準 160px）を足す。狭い画面では定員・削除が次の行へ回る */
  const timeInputStyle: React.CSSProperties = { ...inputStyle, flex: '1 1 160px', minWidth: 0 }
  /** 定員の入力欄: 時間の欄と見分けられるよう固定幅・右寄せにする */
  const capacityInputStyle: React.CSSProperties = { ...inputStyle, width: 70, textAlign: 'right' }
  /** 行を消すボタン: 入力欄と同じ高さで、赤い文字にする */
  const removeButtonStyle: React.CSSProperties = {
    padding: '0 10px', height: 40, border: '1px solid #dddde8', borderRadius: 4,
    background: 'none', cursor: 'pointer', color: '#c0392b', flexShrink: 0,
  }

  // 1. 枠が無いときは、時間指定なしで予約を受け付けることを案内する
  if (sessions.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--c-muted)', margin: 0 }}>{emptyText}</p>
  }

  // 2. 行の順番を保ち、時間・定員の編集と削除を親へ渡す
  return (
    <>
      {sessions.map((session, index) => (
        // 1 行: 時間・定員・削除を横に並べる（スマホ幅では折り返す）
        <div key={index} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input
            type="text"
            aria-label={`${labelPrefix}${index + 1}回目の時間`}
            placeholder="例: 10:00〜11:30"
            value={session.time_label}
            onChange={(event) => onChange(index, 'time_label', event.target.value)}
            style={timeInputStyle}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 13, color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>定員</span>
            <input
              type="number"
              min={1}
              aria-label={`${labelPrefix}${index + 1}回目の定員`}
              value={session.max_participants}
              onChange={(event) => onChange(index, 'max_participants', Number(event.target.value))}
              style={capacityInputStyle}
            />
            <span style={{ fontSize: 13, color: 'var(--c-muted)' }}>名</span>
          </div>
          <button type="button" onClick={() => onRemove(index)} aria-label={`${labelPrefix}${index + 1}回目のセッションを消す`} style={removeButtonStyle}>
            ×
          </button>
        </div>
      ))}
    </>
  )
}
