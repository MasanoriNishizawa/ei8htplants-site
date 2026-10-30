import type { CSSProperties } from 'react'
import type { WsSession } from '../../lib/api'

/** 翻訳関数。日本語と英語の表示値を受け取り、現在の言語の値を返す */
type Translate = <T>(ja: T, en: T) => T

/** 親で計算した時間枠の残席数と満席状態 */
type ReserveSessionOption = {
  /** 表示・選択する時間枠 */
  session: WsSession
  /** 時間枠の残り参加人数 */
  remaining: number
  /** 残席がなく選択できない時間枠か */
  full: boolean
}

/** 予約フォームの日付・時間枠選択に必要な表示用データとイベント */
type ReserveScheduleFieldsProps = {
  /** label と入力欄を結び付ける id の先頭部分 */
  uid: string
  /** 開催日を表示するか（複数日イベントの場合だけ true） */
  isMultiDay: boolean
  /** 選択可能な開催日 */
  dates: string[]
  /** 予約日として選択中の日 */
  preferredDate: string
  /** 日付を画面表示用の文字列にする関数 */
  formatDate: (date: string) => string
  /** 日付の選択を親へ通知する。日付変更時の関連 state リセットは親が行う */
  onSelectDate: (date: string) => void
  /** イベントにワークショップ時間枠があるか */
  hasWorkshop: boolean
  /** 親で計算した時間枠選択の無効状態 */
  sessionsDisabled: boolean
  /** 予約枠の取得状態 */
  sessionsStatus: 'idle' | 'loading' | 'ok' | 'error'
  /** 予約枠の一覧 */
  sessions: ReserveSessionOption[]
  /** 選択中の時間枠 id */
  selectedSessionId: string
  /** 時間枠の選択を親へ通知する。参加人数のリセットは親が行う */
  onSelectSession: (sessionId: string) => void
  /** 予約枠の再読み込みを親へ通知する */
  onRetrySessions: () => void
  /** 小見出しの既存スタイル */
  labelStyle: CSSProperties
  /** 表示言語に応じた文言を選ぶ関数 */
  t: Translate
}

/**
 * 予約フォームの日付と時間枠の選択 UI を表示する。
 * 開催日・予約枠の取得状態・選択値は親から受け取り、変更イベントを親へ返す。
 * @param props - 選択 UI の表示値、スタイル、イベント
 * @returns 日付・時間枠の選択欄。該当欄が不要な場合は空の fragment
 */
export default function ReserveScheduleFields({
  uid,
  isMultiDay,
  dates,
  preferredDate,
  formatDate,
  onSelectDate,
  hasWorkshop,
  sessionsDisabled,
  sessionsStatus,
  sessions,
  selectedSessionId,
  onSelectSession,
  onRetrySessions,
  labelStyle,
  t,
}: ReserveScheduleFieldsProps) {
  /**
   * 日付・時間枠カードの選択状態と満席状態を反映した既存の見た目を作る。
   * @param selected - 選択中なら true
   * @param disabled - 満席などで選択できない場合は true
   * @returns 状態を反映したラジオカード用の CSS スタイル
   */
  const radioCard = (selected: boolean, disabled = false): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
    border: `1px solid ${selected ? '#4a6741' : '#ddd'}`,
    borderRadius: 2, cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? '#f8f8f8' : selected ? '#f0f5ee' : '#fff',
    opacity: disabled ? 0.6 : 1,
  })

  return (
    <>
      {/* 予約日（複数日のイベントだけ。選び直すと時間枠と人数を戻す） */}
      {isMultiDay && (
        <div style={{ marginBottom: 20 }}>
          <p id={`${uid}-date`} style={{ ...labelStyle, margin: '0 0 6px' }}>{t('予約日', 'Date')} <span aria-hidden="true" style={{ color: '#c0392b' }}>*</span></p>
          <div role="radiogroup" aria-labelledby={`${uid}-date`} aria-required="true" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dates.map((date) => (
              <label key={date} style={radioCard(preferredDate === date)}>
                <input
                  type="radio"
                  name="preferred_date"
                  value={date}
                  checked={preferredDate === date}
                  onChange={() => onSelectDate(date)}
                  style={{ accentColor: '#4a6741' }}
                />
                <span style={{ fontSize: 15, color: 'var(--c-ink)' }}>{formatDate(date)}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 予約時間（WS ありのイベントだけ。満席の枠は選べない） */}
      {hasWorkshop && (
        <div style={{ marginBottom: 20, opacity: sessionsDisabled ? 0.4 : 1, pointerEvents: sessionsDisabled ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
          <p id={`${uid}-time`} style={{ ...labelStyle, margin: '0 0 6px' }}>
            {t('予約時間', 'Time')} <span aria-hidden="true" style={{ color: '#c0392b' }}>*</span>
            {sessionsDisabled && (
              <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11, color: '#aaa', marginLeft: 8 }}>
                {t('（日付を先に選択してください）', '(Please select a date first)')}
              </span>
            )}
          </p>
          {/* 予約枠の取得の状態ごとの表示（取得中・失敗・枠なし・一覧） */}
          {sessionsStatus === 'loading' ? (
            <p role="status" style={{ fontSize: 14, color: '#bbb', margin: 0 }}>{t('読み込み中...', 'Loading...')}</p>
          ) : sessionsStatus === 'error' ? (
            <div role="alert">
              <p style={{ fontSize: 14, color: '#c0392b', margin: '0 0 8px' }}>{t('予約枠を読み込めませんでした。', 'Could not load the time slots.')}</p>
              <button type="button" onClick={onRetrySessions} style={{ padding: '6px 16px', border: '1px solid #dddde8', borderRadius: 4, background: 'none', cursor: 'pointer', fontSize: 13 }}>
                {t('再読み込み', 'Retry')}
              </button>
            </div>
          ) : sessionsStatus === 'ok' && sessions.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--c-muted)', margin: 0 }}>{t('この日の予約枠はありません。', 'No time slots are available on this date.')}</p>
          ) : sessionsStatus !== 'ok' ? null : (
            <div role="radiogroup" aria-labelledby={`${uid}-time`} aria-required="true" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sessions.map(({ session, remaining, full }) => (
                <label key={session.id} style={radioCard(selectedSessionId === session.id, full)}>
                  <input
                    type="radio"
                    name="session"
                    value={session.id}
                    disabled={full}
                    checked={selectedSessionId === session.id}
                    onChange={() => onSelectSession(session.id)}
                    style={{ accentColor: '#4a6741' }}
                  />
                  <span style={{ flex: 1, fontSize: 15, color: 'var(--c-ink)' }}>{session.time_label}</span>
                  <span style={{ fontSize: 12, color: full ? '#c0392b' : '#8a9a7e' }}>
                    {full ? t('満席', 'Full') : t(`残り ${remaining} 名`, `${remaining} left`)}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
