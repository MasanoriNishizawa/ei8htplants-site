import type { SessionInput } from '../eventTime'

/** ワークショップ設定とセッション一覧の表示に必要な値・操作通知 */
interface EventWorkshopFieldProps {
  /** イベントにワークショップがあるか */
  hasWorkshop: boolean
  /** ワークショップの予約が必要か */
  requiresReservation: boolean
  /** 表示中のワークショップセッション */
  sessions: SessionInput[]
  /** 自動設定ボタンを利用できる開催時間か */
  canAutoSetSessions: boolean
  /** 親フォームで共通利用する見出しラベルのスタイル */
  labelStyle: React.CSSProperties
  /** 時間欄と定員欄で共通して使う親フォームの入力スタイル */
  inputStyle: React.CSSProperties
  /** ワークショップ有無の変更を親へ通知する */
  onWorkshopChange: (hasWorkshop: boolean) => void
  /** 予約要否の変更を親へ通知する */
  onReservationChange: (requiresReservation: boolean) => void
  /** セッション追加を親へ通知する */
  onAddSession: () => void
  /** 開催時間に基づく自動設定を親へ通知する */
  onAutoSetSessions: () => void
  /** 指定位置のセッション削除を親へ通知する */
  onRemoveSession: (index: number) => void
  /** 指定位置のセッション入力変更を親へ通知する */
  onSessionChange: (index: number, key: keyof SessionInput, value: string | number) => void
}

/**
 * ワークショップの有無・予約要否と各セッションの入力欄を表示し、編集内容を親へ通知する。
 * 入力値の保持、自動生成、保存、未保存判定は親フォームが担当する。
 * @param props - 表示値、入力スタイル、自動設定可否、親へ通知する操作関数
 * @returns ワークショップ設定とセッション入力欄
 */
export default function EventWorkshopField({
  hasWorkshop,
  requiresReservation,
  sessions,
  canAutoSetSessions,
  labelStyle,
  inputStyle,
  onWorkshopChange,
  onReservationChange,
  onAddSession,
  onAutoSetSessions,
  onRemoveSession,
  onSessionChange,
}: EventWorkshopFieldProps) {
  /** セッション時間入力のスタイル。親から受け取った共通入力設定に横方向の伸縮を足す */
  const sessionTimeInputStyle: React.CSSProperties = { ...inputStyle, flex: 1 }
  /** セッション定員入力のスタイル。時間入力と区別できる固定幅・右寄せにする */
  const sessionCapacityInputStyle: React.CSSProperties = { ...inputStyle, width: 70, textAlign: 'right' }
  /** 自動設定ボタンのスタイル。従来の色・余白を保ち、利用可否を透過度で示す */
  const autoSetButtonStyle: React.CSSProperties = {
    padding: '6px 14px', background: 'none', color: '#4a6741', border: '1px solid #4a6741',
    borderRadius: 2, fontSize: 13, cursor: 'pointer', opacity: canAutoSetSessions ? 1 : 0.4,
  }
  /** セッション追加ボタンのスタイル。既存の緑背景・白文字を保つ */
  const addButtonStyle: React.CSSProperties = {
    padding: '6px 16px', background: '#4a6741', color: '#fff', border: 'none',
    borderRadius: 2, fontSize: 13, cursor: 'pointer',
  }
  /** セッション行を削除するボタンのスタイル。行の高さと赤い文字色を保つ */
  const removeButtonStyle: React.CSSProperties = {
    padding: '0 10px', height: 40, border: '1px solid #dddde8', borderRadius: 4,
    background: 'none', cursor: 'pointer', color: '#c0392b', flexShrink: 0,
  }

  return (
    <>
      {/* 1. WS の有無と予約要否を既存のラベル・チェックボックスで表示する */}
      <div style={{ display: 'flex', gap: 20 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
          <input type="checkbox" checked={hasWorkshop} onChange={(event) => onWorkshopChange(event.target.checked)} />
          ワークショップあり
        </label>
        {hasWorkshop && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={requiresReservation} onChange={(event) => onReservationChange(event.target.checked)} />
            予約必要
          </label>
        )}
      </div>

      {/* 2. WS がある場合だけ、セッションの自動設定・追加・編集・削除を表示する */}
      {hasWorkshop && (
        <div style={{ padding: '20px', background: '#f8faf6', border: '1px solid #c8d8c0', borderRadius: 4 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8 }}>
            <p style={{ ...labelStyle, margin: 0, fontSize: 14, fontWeight: 500 }}>WSセッション（各回の時間・定員）</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onAutoSetSessions} disabled={!canAutoSetSessions} style={autoSetButtonStyle}>
                自動設定
              </button>
              <button type="button" onClick={onAddSession} style={addButtonStyle}>
                + 追加
              </button>
            </div>
          </div>
          {/* 3. セッションが空の場合は時間指定なしで予約受付する従来の案内を表示する */}
          {sessions.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--c-muted)', margin: 0 }}>セッションなし（時間指定なしで予約受付）</p>
          )}
          {/* 4. 行の順番を保ち、時間・定員の編集と削除を親の state 更新へ渡す */}
          {sessions.map((session, index) => (
            <div key={index} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input
                type="text"
                aria-label={`${index + 1}回目の時間`}
                placeholder="例: 10:00〜11:30"
                value={session.time_label}
                onChange={(event) => onSessionChange(index, 'time_label', event.target.value)}
                style={sessionTimeInputStyle}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 13, color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>定員</span>
                <input
                  type="number"
                  min={1}
                  aria-label={`${index + 1}回目の定員`}
                  value={session.max_participants}
                  onChange={(event) => onSessionChange(index, 'max_participants', Number(event.target.value))}
                  style={sessionCapacityInputStyle}
                />
                <span style={{ fontSize: 13, color: 'var(--c-muted)' }}>名</span>
              </div>
              <button type="button" onClick={() => onRemoveSession(index)} aria-label={`${index + 1}回目のセッションを消す`} style={removeButtonStyle}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
