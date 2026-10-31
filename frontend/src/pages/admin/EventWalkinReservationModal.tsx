import type { CSSProperties } from 'react'
import type { Event, WsSession } from '../../lib/api'

/**
 * イベント予約画面専用の当日参加モーダルへ渡す表示値と操作。
 * 登録処理や状態の管理は親画面に残し、この部品は既存の入力 UI を表示する。
 */
interface EventWalkinReservationModalProps {
  /** 複数日開催かの判定に使うイベント。 */
  event: Event | null
  /** イベントの時間枠一覧。空の場合は自由入力欄を表示する。 */
  sessions: WsSession[]
  /** 選択中の時間枠 ID。 */
  walkinSession: string
  /** 時間枠が無いイベントで入力する時間。 */
  walkinTime: string
  /** 当日参加の人数。 */
  walkinParticipants: number
  /** 固定表示する参加日。 */
  walkinDate: string
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
    walkinSession,
    walkinTime,
    walkinParticipants,
    walkinDate,
    walkinSaving,
    walkinError,
    errorBoxStyle,
    onClose,
    onSessionChange,
    onTimeChange,
    onParticipantsChange,
    onSubmit,
  } = props

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

        {/* 複数日のイベントのときだけ参加日を見せる */}
        {event?.end_date && event.end_date !== event.start_date && (
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
          {/* 時間枠があれば選ぶ、無ければ時間を文字で入れる */}
          {sessions.length > 0 ? (
            <select
              id="event-walkin-session"
              value={walkinSession}
              onChange={(e) => onSessionChange(e.target.value)}
              style={{ /* 選択欄の幅・余白・枠線・文字など既存の表示設定を維持する */ width: '100%', padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit' }}
            >
              <option value="">-- 選択 --</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.time_label}</option>
              ))}
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
            disabled={walkinSaving || (sessions.length > 0 && !walkinSession)}
            style={{ /* 登録ボタンの色・余白・有効状態に応じた不透明度など既存の表示設定を維持する */ padding: '8px 18px', background: '#2d3a24', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', opacity: (sessions.length > 0 && !walkinSession) ? 0.5 : 1 }}
          >
            {walkinSaving ? '登録中...' : '登録'}
          </button>
        </div>
      </div>
    </div>
  )
}
