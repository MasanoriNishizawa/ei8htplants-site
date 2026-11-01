import { SectionBox } from './AdminInfoParts'

/** メモ欄と保存操作の表示に必要な値、および親画面へ変更を伝える関数 */
interface EventAdminInfoNotesAndActionsProps {
  /** メモ欄に表示する値。未設定の値は空欄として表示する */
  notes: string | null | undefined
  /** メモ欄の変更を親画面へ伝える */
  onNotesChange: (value: string | null) => void
  /** 保存処理の実行中かどうか */
  saving: boolean
  /** 出店要項画像のアップロード中かどうか */
  uploading: boolean
  /** 初期データの読み込みに失敗したかどうか */
  loadFailed: boolean
  /** 入力内容に未保存の変更があるかどうか */
  isDirty: boolean
}

/** メモ欄と保存ボタン・未保存注意を表示する。state や保存処理、dirty 判定は持たない。
 * @param props メモの値と変更通知、保存・読み込み・アップロード状態、未保存状態
 * @returns メモ欄と保存操作の表示
 */
export default function EventAdminInfoNotesAndActions({
  notes,
  onNotesChange,
  saving,
  uploading,
  loadFailed,
  isDirty,
}: EventAdminInfoNotesAndActionsProps) {
  /** 保存ボタンを無効にする状態。親の保存・読み込み・アップロード状態をそのまま使う */
  const saveDisabled = saving || uploading || loadFailed
  /** textarea に当たるメモ欄の余白・文字・背景・リサイズ表示を設定する */
  const notesStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    border: 'none',
    borderRadius: 0,
    fontSize: 14,
    fontFamily: 'inherit',
    background: 'transparent',
    resize: 'vertical',
    boxSizing: 'border-box',
    outline: 'none',
  }
  /** button に当たる保存ボタンの余白・配色・角丸・文字・状態別の操作表示を設定する */
  const saveButtonStyle: React.CSSProperties = {
    padding: '12px 32px',
    background: 'var(--c-ink)',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    minHeight: 44,
    cursor: saveDisabled ? 'default' : 'pointer',
    fontSize: 15,
    opacity: saveDisabled ? 0.6 : 1,
  }

  return (
    <>
      {/* メモ欄 */}
      <SectionBox label="メモ">
        <textarea
          value={notes ?? ''}
          onChange={(e) => onNotesChange(e.target.value || null)}
          rows={4}
          placeholder="予約が必要なことや注意事項"
          style={notesStyle}
        />
      </SectionBox>

      {/* 保存ボタン */}
      {/* 保存ボタンと未保存注意を横並びにし、狭い幅では折り返す */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        {/* アップロード中に保存すると途中までの画像しか保存されないため、アップロード完了まで押せなくする。
            読み込みに失敗したときも、空のフォームで上書きしないよう押せなくする */}
        <button
          type="submit"
          disabled={saveDisabled}
          style={saveButtonStyle}
        >
          {saving ? '保存中...' : '保存する'}
        </button>
        {/* 入力がまだ保存されていないときの注意。画面を離れると変更が消えるため、橙色の13pxで表示して気づかせる */}
        {isDirty && (
          <span style={{ fontSize: 13, color: '#b9770e' }}>未保存の変更があります</span>
        )}
      </div>
    </>
  )
}
