/** イベント名と URL スラッグの入力 UI に渡す値・共通スタイル・変更 callback */
interface EventIdentityFieldsProps {
  /** イベント名 */
  name: string
  /** URL スラッグ */
  slug: string
  /** イベント名入力欄に使う共通スタイル */
  inputStyle: React.CSSProperties
  /** 項目ラベルに使う共通スタイル */
  labelStyle: React.CSSProperties
  /** イベント名の変更を親フォームへ通知する */
  onNameChange: (value: string) => void
  /** URL スラッグの変更を親フォームへ通知する */
  onSlugChange: (value: string) => void
  /** 名前からスラッグを作り直す操作を親フォームへ通知する */
  onRegenerateSlug: () => void
}

/** イベント名と URL スラッグの入力欄を表示し、入力を親フォームへ通知する。
 * スラッグ自動生成の状態や値の加工は親フォームが担当する。
 * @param props イベント名・スラッグ、共通スタイル、入力・再生成 callback
 * @returns イベント名と URL スラッグの入力 UI
 */
export default function EventIdentityFields({
  name,
  slug,
  inputStyle,
  labelStyle,
  onNameChange,
  onSlugChange,
  onRegenerateSlug,
}: EventIdentityFieldsProps) {
  return (
    <>
      {/* イベント名を入力する。名前に合わせたスラッグの更新判断は親に通知して任せる */}
      <div>
        <label htmlFor="event-name" style={labelStyle}>イベント名</label>
        <input
          id="event-name"
          required
          style={inputStyle}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </div>

      {/* URL スラッグを編集する。自動生成ボタンはイベント名があるときだけ表示する */}
      <div>
        <label htmlFor="event-slug" style={labelStyle}>URL スラッグ <span style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 400 }}>（英数字・ハイフンのみ）</span></label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>/events/</span>
          <input
            id="event-slug"
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="plant-market-2026"
            value={slug}
            onChange={(event) => onSlugChange(event.target.value)}
          />
          {name && (
            <button
              type="button"
              onClick={onRegenerateSlug}
              style={{ padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', background: '#fff' }}
            >
              自動生成
            </button>
          )}
        </div>
        {slug && <p style={{ fontSize: 11, color: 'var(--c-muted)', margin: '4px 0 0' }}>ei8htplants.com/official/events/{slug}</p>}
      </div>
    </>
  )
}
