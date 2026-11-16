import type { ReactNode } from 'react'
import type { SessionInput } from '../eventTime'
import type { WsDateMode } from './wsSchedule'
import WsSessionRows from './WsSessionRows'

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
  /** 指定位置の枠を 1 つ上（-1）・1 つ下（1）へ動かすことを親へ通知する（省略したら↑↓を出さない） */
  onMoveSession?: (index: number, direction: -1 | 1) => void
  /** 枠を時間順に並べ直すことを親へ通知する（省略したら「時間順に並べる」を出さない） */
  onSortSessions?: () => void
  /** 「全日程で実施」「実施する日を選ぶ」の切り替えを出すか（ワークショップあり・複数日のときだけ true） */
  canSelectDates?: boolean
  /** 今の実施のしかた（canSelectDates が true のときだけ使う） */
  wsDateMode?: WsDateMode
  /** 実施のしかたの切り替えを親へ通知する */
  onWsDateModeChange?: (mode: WsDateMode) => void
  /** 「実施する日を選ぶ」のときに、共通の枠の代わりに出す日ごとの枠の編集欄 */
  dateSessionsEditor?: ReactNode
}

/**
 * ワークショップの有無・予約要否と各セッションの入力欄を表示し、編集内容を親へ通知する。
 * 複数日のイベントでは「全日程で実施（共通の枠）」「実施する日を選ぶ」の切り替えも出し、
 * 「実施する日を選ぶ」のときは親から受け取った日ごとの枠の編集欄（dateSessionsEditor）を共通の枠の代わりに出す。
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
  onMoveSession,
  onSortSessions,
  canSelectDates = false,
  wsDateMode = 'all',
  onWsDateModeChange,
  dateSessionsEditor,
}: EventWorkshopFieldProps) {
  /** 日ごとの枠の編集欄を出すか（切り替えを出していて、「実施する日を選ぶ」を選んでいるとき） */
  const showDateEditor = canSelectDates && wsDateMode === 'select'
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
  /**
   * 「時間順に並べる」ボタンの見た目: 枠線だけの控えめなボタン。押せないときは薄くする
   * @param enabled - 押せるか（枠が 2 件以上）
   * @returns ボタンのスタイル
   */
  const sortButtonStyle = (enabled: boolean): React.CSSProperties => ({
    padding: '6px 12px', background: 'none', color: 'var(--c-body)', border: '1px solid #c8d8c0',
    borderRadius: 2, fontSize: 13, cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.4,
  })
  /** 実施のしかたのラジオ 1 つ分のラベル: 横にラジオと文字を並べ、狭い画面でも文字が折り返せるようにする */
  const modeLabelStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer', color: 'var(--c-body)' }

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

      {/* 2. ワークショップあり・複数日のときだけ、実施のしかた（全日程 / 日を選ぶ）を切り替えるラジオを出す */}
      {hasWorkshop && canSelectDates && (
        <div role="radiogroup" aria-label="ワークショップの実施のしかた" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
          <label style={modeLabelStyle}>
            <input type="radio" name="ws-date-mode" checked={wsDateMode === 'all'} onChange={() => onWsDateModeChange?.('all')} />
            全日程で実施（共通の枠）
          </label>
          <label style={modeLabelStyle}>
            <input type="radio" name="ws-date-mode" checked={wsDateMode === 'select'} onChange={() => onWsDateModeChange?.('select')} />
            実施する日を選ぶ
          </label>
        </div>
      )}

      {/* 3. 「実施する日を選ぶ」のときは、親から受け取った日ごとの枠の編集欄を出す */}
      {hasWorkshop && showDateEditor && dateSessionsEditor}

      {/* 4. それ以外で WS がある場合は、共通の枠の自動設定・追加・編集・削除を表示する */}
      {hasWorkshop && !showDateEditor && (
        <div style={{ padding: '20px', background: '#f8faf6', border: '1px solid #c8d8c0', borderRadius: 4 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8 }}>
            <p style={{ ...labelStyle, margin: 0, fontSize: 14, fontWeight: 500 }}>WSセッション（各回の時間・定員）</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {/* 時間順に並べる（枠が 1 件以下なら押せない） */}
              {onSortSessions && (
                <button type="button" onClick={onSortSessions} disabled={sessions.length <= 1} style={sortButtonStyle(sessions.length > 1)}>
                  時間順に並べる
                </button>
              )}
              <button type="button" onClick={onAutoSetSessions} disabled={!canAutoSetSessions} style={autoSetButtonStyle}>
                自動設定
              </button>
              <button type="button" onClick={onAddSession} style={addButtonStyle}>
                + 追加
              </button>
            </div>
          </div>
          {/* 枠が空なら時間指定なしで予約受付の案内、あれば時間・定員の行を並べる */}
          <WsSessionRows
            sessions={sessions}
            inputStyle={inputStyle}
            emptyText="セッションなし（時間指定なしで予約受付）"
            onRemove={onRemoveSession}
            onChange={onSessionChange}
            onMove={onMoveSession}
          />
        </div>
      )}
    </>
  )
}
