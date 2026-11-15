import type { CSSProperties } from 'react'
import type { Event, WsSession } from '../../lib/api'
import { formatJaMonthDayDow } from '../../lib/localDate'

/**
 * イベント予約画面専用の当日参加モーダルへ渡す表示値と操作。
 * 登録処理や状態の管理は親画面に残し、この部品は既存の入力 UI を表示する。
 */
interface EventWalkinReservationModalProps {
  /** 複数日開催かの判定に使うイベント。 */
  event: Event | null
  /** 参加日（今日）に使える時間枠の一覧（共通の枠＋その日の枠）。空の場合は自由入力欄を表示する。 */
  sessions: WsSession[]
  /** 時間枠を読み込み中か（省略時は false）。読み込み中は登録できない。 */
  sessionsLoading?: boolean
  /** 時間枠の読み込みに失敗したか（省略時は false）。失敗したままでは登録できない。 */
  sessionsFailed?: boolean
  /** 選択中の時間枠 ID。 */
  walkinSession: string
  /** 時間枠が無いイベントで入力する時間。 */
  walkinTime: string
  /** 当日参加の人数。 */
  walkinParticipants: number
  /** 参加日（YYYY-MM-DD）。 */
  walkinDate: string
  /**
   * 参加日に選べる日（ワークショップの実施日。過去・未来の日も含む）。
   * 2 日以上なら選ぶ欄、1 日なら文字で出す。省略時は今までどおり、複数日のイベントだけ参加日を文字で出す
   */
  walkinDates?: string[]
  /** 選んだ参加日を親画面へ伝える（親は枠を取り直し、選んでいた枠を外す）。 */
  onDateChange?: (date: string) => void
  /** 登録処理中かどうか。 */
  walkinSaving: boolean
  /** 登録失敗時にモーダル内へ表示する文言。 */
  walkinError: string
  /** 親画面と共通で使うエラー表示の見た目。 */
  errorBoxStyle: CSSProperties
  /** 背景またはキャンセルボタンからモーダルを閉じる。 */
  onClose: () => void
  /** 選択した時間枠 ID を親画面へ伝える。 */
  onSessionChange: (sessionId: string) => void
  /** 入力した時間を親画面へ伝える。 */
  onTimeChange: (time: string) => void
  /** 入力した人数を親画面へ伝える。 */
  onParticipantsChange: (participants: number) => void
  /** 親画面が所有する登録処理を開始する。 */
  onSubmit: () => void
}

/**
 * イベント予約画面の当日参加入力モーダルを表示する。
 * 1. イベント日数と時間枠に応じた既存の入力 UI を描画する。
 * 2. 入力変更と閉じる・登録操作を親画面へ通知する。
 * @param props - モーダル表示値、共通スタイル、親画面の操作 callback。
 * @returns イベント予約用の当日参加モーダル。
 */
export default function EventWalkinReservationModal(props: EventWalkinReservationModalProps) {
  /** 表示するイベント・時間枠・入力値・親画面から渡された操作 callback。 */
  const {
    event,
    sessions,
    sessionsLoading = false,
    sessionsFailed = false,
    walkinSession,
    walkinTime,
    walkinParticipants,
    walkinDate,
    walkinDates,
    onDateChange,
    walkinSaving,
    walkinError,
    errorBoxStyle,
    onClose,
    onSessionChange,
    onTimeChange,
    onParticipantsChange,
    onSubmit,
  } = props
  /** 選んでいる枠が満席か（登録は止めず、会場で調整してもらう案内だけ出す） */
  const selectedFull = (() => {
    /** 選んでいる枠 */
    const selected = sessions.find((s) => s.id === walkinSession)
    return !!selected && selected.max_participants - selected.reserved_count <= 0
  })()
  /** 登録できるか（枠の読み込み中・失敗中でなく、枠がある日は枠を選んでいる） */
  const canSubmit = !sessionsLoading && !sessionsFailed && (sessions.length === 0 || !!walkinSession)

  return (
    <div
      style={{ /* 背景を画面全体に広げ、中央配置・暗幕色など既存のモーダル表示設定を維持する */ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-walkin-title"
        style={{ /* 白いダイアログの背景・幅・余白・影など、既存の表示設定を維持する */ background: '#fff', borderRadius: 8, padding: '28px 32px', width: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="event-walkin-title" style={{ /* 見出しの余白・文字サイズなど既存の表示設定を維持する */ margin: '0 0 20px', fontSize: 16, fontWeight: 500 }}>当日参加を追加</h3>

        {/* 参加日に選べる日が 2 日以上なら、選ぶ欄を出す */}
        {walkinDates && walkinDates.length > 1 && (
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="event-walkin-date" style={{ /* 参加日ラベルの色・配置・余白 */ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 6 }}>参加日</label>
            <select
              id="event-walkin-date"
              value={walkinDate}
              onChange={(e) => onDateChange?.(e.target.value)}
              style={{ /* 参加日の選択欄の幅・余白・枠線・文字 */ width: '100%', padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit' }}
            >
              {walkinDates.map((d) => (
                <option key={d} value={d}>{formatJaMonthDayDow(d)}</option>
              ))}
            </select>
          </div>
        )}

        {/* 選べる日が 1 日以下（または省略時の複数日のイベント）は、参加日を文字で出すだけにする */}
        {!(walkinDates && walkinDates.length > 1) && (walkinDates ? walkinDates.length === 1 : (event?.end_date && event.end_date !== event.start_date)) && (
          <div style={{ marginBottom: 16 }}>
            {/* 参加日は今日で固定の表示なので、入力欄ではなく文字として出す */}
            <span style={{ /* 参加日ラベルの色・配置・余白など既存の表示設定を維持する */ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 6 }}>参加日</span>
            <div style={{ /* 固定表示欄の背景・枠線・文字色など既存の表示設定を維持する */ padding: '8px 12px', border: '1px solid #f0f0f5', borderRadius: 4, fontSize: 14, background: '#fafafa', color: 'var(--c-ink)' }}>
              {walkinDate}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="event-walkin-session" style={{ /* 時間枠ラベルの色・配置・余白など既存の表示設定を維持する */ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 6 }}>時間枠</label>
          {/* 読み込み中は案内、時間枠があれば選ぶ、無ければ時間を文字で入れる */}
          {sessionsLoading ? (
            <p role="status" style={{ /* 読み込み中の案内の文字 */ margin: 0, fontSize: 13, color: 'var(--c-muted)' }}>読み込み中...</p>
          ) : sessions.length > 0 ? (
            <select
              id="event-walkin-session"
              value={walkinSession}
              onChange={(e) => onSessionChange(e.target.value)}
              style={{ /* 選択欄の幅・余白・枠線・文字など既存の表示設定を維持する */ width: '100%', padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit' }}
            >
              <option value="">-- 選択 --</option>
              {sessions.map((s) => {
                /** この日の残り人数（当日参加は会場で調整するので、満席でも選べる） */
                const available = Math.max(0, s.max_participants - s.reserved_count)
                return (
                  <option key={s.id} value={s.id}>{s.time_label}{'\u3000'}残{available}名{available === 0 ? '（満席）' : ''}</option>
                )
              })}
            </select>
          ) : (
            <input
              id="event-walkin-session"
              type="text"
              placeholder="例: 10:00〜11:30"
              value={walkinTime}
              onChange={(e) => onTimeChange(e.target.value)}
              style={{ /* 時間入力欄の幅・余白・枠線・文字など既存の表示設定を維持する */ width: '100%', padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          )}
          {/* 選んだ枠が満席のときの案内（登録は止めない。当日参加は会場で調整して記録するため） */}
          {selectedFull && (
            <p role="status" style={{ /* 注意の文字: 小さめの橙色 */ margin: '6px 0 0', fontSize: 12, color: '#b9770e', lineHeight: 1.6 }}>
              満席です。会場で調整したうえで登録してください。
            </p>
          )}
        </div>

        <div style={{ marginBottom: 24 }}>
          <label htmlFor="event-walkin-participants" style={{ /* 人数ラベルの色・配置・余白など既存の表示設定を維持する */ fontSize: 12, color: 'var(--c-muted)', display: 'block', marginBottom: 6 }}>参加人数</label>
          <input
            id="event-walkin-participants"
            type="number"
            min={1}
            value={walkinParticipants}
            onChange={(e) => onParticipantsChange(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ /* 人数入力欄の幅・右寄せ・余白・枠線など既存の表示設定を維持する */ width: '100%', padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit', textAlign: 'right', boxSizing: 'border-box' }}
          />
        </div>

        {/* 当日参加の追加の失敗 */}
        {walkinError && <p role="alert" style={errorBoxStyle}>{walkinError}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ /* キャンセルボタンの余白・枠線・文字など既存の表示設定を維持する */ padding: '8px 18px', border: '1px solid #dddde8', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}
          >
            キャンセル
          </button>
          <button
            onClick={onSubmit}
            disabled={walkinSaving || !canSubmit}
            style={{ /* 登録ボタンの色・余白・有効状態に応じた不透明度など既存の表示設定を維持する */ padding: '8px 18px', background: '#2d3a24', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', opacity: !canSubmit ? 0.5 : 1 }}
          >
            {walkinSaving ? '登録中...' : '登録'}
          </button>
        </div>
      </div>
    </div>
  )
}
