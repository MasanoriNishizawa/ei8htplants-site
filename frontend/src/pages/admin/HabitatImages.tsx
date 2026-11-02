import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import {
  HABITAT_MOTION_GROUP_LABELS,
  HABITAT_MOTION_GROUP_ORDER,
  HABITAT_MOTION_PREFIX,
  HABITAT_MOTION_SLOTS,
  habitatSlotsByGroup,
  type HabitatMotionSlot,
} from '../../lib/habitatMotionSlots'
import { useUnsavedChanges } from './UnsavedChanges'
import { failMessage } from './errorMessage'

/**
 * 枠1つ分の初期状態を作る。
 * @returns URL・処理状態・通知を初期化した枠の状態
 */
const emptySlot = () => ({ savedUrl: '', draftUrl: '', uploading: false, saving: false, error: '', notice: '' })
/** 枠1つ分の状態（保存済み URL、編集中 URL、処理状況、通知） */
type SlotState = ReturnType<typeof emptySlot>

/**
 * 全枠の初期状態を、キー → 状態の辞書で作る。
 * @returns 全枠を未設定にした状態の辞書
 */
const initialSlots = (): Record<string, SlotState> =>
  Object.fromEntries(HABITAT_MOTION_SLOTS.map(({ key }) => [key, emptySlot()]))

// 一覧の読み込みに失敗したときの案内
const LOAD_ERROR = '画像の設定を読み込めませんでした。再読み込みしてください（読み込めるまで保存はできません）。'

// ファイル選択欄の見出しの見た目
const fieldStyle: React.CSSProperties = {
  display: 'block', fontSize: 14, color: '#555', marginBottom: 8,
}
// 推奨サイズ・用途の説明文の見た目
const noteStyle: React.CSSProperties = {
  fontSize: 13, lineHeight: 1.7, color: '#666', margin: '0 0 14px',
}

/**
 * Habitat Oides のトップページで動く画像（一番上の画像5枚・サイン・動くオブジェクト6つ）を、
 * 枠ごとにアップロード・保存・外す管理ページ（/admin/habitat-images）。
 * 1. GET /api/site-assets?prefix=habitat- で12枠の保存済み URL を読み込む（失敗したら保存できないようにする）
 * 2. 画像を選ぶと /api/upload に送り、返った URL を編集中の値にする
 * 3. 「画像を保存」で PUT /api/site-assets/{key} に保存する（外すときは url を '' で保存）
 * 4. 保存していない変更があれば、ページを離れるときに確認を出す
 * @returns Habitat Oides 画像の管理画面の React 要素
 */
export default function HabitatImages() {
  // 枠ごとの保存済み URL・編集中 URL・処理状態（キー → 状態）
  const [slots, setSlots] = useState<Record<string, SlotState>>(initialSlots)
  // 一覧をサーバーから読み込んでいる間は true
  const [loading, setLoading] = useState(true)
  // 一覧の読み込みに失敗したときの案内（空なら成功）。失敗中は保存・アップロードをできないようにする
  const [loadError, setLoadError] = useState('')
  // 保存値と編集中の値に差がある枠があるか（ページを離れるときの確認に使う）
  const dirty = Object.values(slots).some(({ savedUrl, draftUrl }) => savedUrl !== draftUrl)
  useUnsavedChanges(dirty)

  useEffect(() => {
    // 画面を離れたあとに応答が届いて state を更新しないための有効フラグ
    let active = true
    // 1. 12枠の保存済み URL をまとめて取得する
    api.siteAssets.list(HABITAT_MOTION_PREFIX).then((assets) => {
      if (!active) return
      // 2. 取得した URL を保存済み・編集中の両方へ反映する（応答にない枠は未設定のまま）
      const urlByKey = Object.fromEntries(assets.map(({ key, url }) => [key, url]))
      setSlots(Object.fromEntries(HABITAT_MOTION_SLOTS.map(({ key }) => {
        const url = urlByKey[key] ?? ''
        return [key, { ...emptySlot(), savedUrl: url, draftUrl: url }]
      })))
    }).catch(() => {
      // 3. 取得に失敗したら案内を出し、保存できないようにする
      if (active) setLoadError(LOAD_ERROR)
    }).finally(() => {
      // 4. 成功・失敗のどちらでも読み込み中表示を終える
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  /**
   * 指定した枠の状態だけを部分更新する。
   * @param key - 枠のキー
   * @param patch - 対象の枠へ反映する状態の差分
   * @returns なし
   */
  const updateSlot = (key: string, patch: Partial<SlotState>) => {
    setSlots((current) => ({ ...current, [key]: { ...(current[key] ?? emptySlot()), ...patch } }))
  }

  /**
   * 選んだ画像をアップロードし、枠の編集中 URL に反映する。
   * @param key - アップロード先の枠のキー
   * @param event - 画像ファイル選択欄の変更イベント
   * @returns なし
   */
  const chooseImage = async (key: string, event: React.ChangeEvent<HTMLInputElement>) => {
    // 1. 選ばれた先頭のファイルを取り出し、なければ終える
    const file = event.target.files?.[0]
    if (!file) return
    updateSlot(key, { uploading: true, error: '', notice: '' })
    try {
      // 2. 画像をアップロードし、返った URL を編集中の値にする
      const url = await api.upload(file)
      updateSlot(key, { draftUrl: url })
    } catch (e) {
      // 失敗の理由は PageEditor と同じ failMessage で、ステータスごとの日本語の文言にする
      updateSlot(key, { error: failMessage('画像のアップロードに失敗しました', e) })
    } finally {
      // 3. 同じファイルをもう一度選べるよう、選択欄を空に戻す
      updateSlot(key, { uploading: false })
      event.target.value = ''
    }
  }

  /**
   * 枠の編集中 URL を保存する（'' なら画像を外す）。
   * @param key - 保存する枠のキー
   * @returns なし
   */
  const save = async (key: string) => {
    // 1. 読み込みに失敗しているとき・枠がないときは保存しない
    const slot = slots[key]
    if (!slot || loadError) return
    updateSlot(key, { saving: true, error: '', notice: '' })
    try {
      // 2. 編集中 URL を保存し、返った URL を保存済み・編集中の両方へ反映する
      const result = await api.siteAssets.save(key, slot.draftUrl)
      updateSlot(key, {
        savedUrl: result.url,
        draftUrl: result.url,
        notice: result.url ? '画像を保存しました。' : '画像を外しました。',
      })
    } catch (e) {
      // 失敗の理由は PageEditor と同じ failMessage で、ステータスごとの日本語の文言にする
      updateSlot(key, { error: failMessage('保存に失敗しました', e) })
    } finally {
      updateSlot(key, { saving: false })
    }
  }

  /**
   * 枠1つ分のカード（プレビュー・画像を選ぶ・外す・保存）を描く。
   * @param slot - 枠の定義
   * @returns 枠のカードの要素
   */
  const renderCard = (slot: HabitatMotionSlot) => {
    // 枠の状態（読み込み前でも初期値がある）
    const state = slots[slot.key] ?? emptySlot()
    // 保存していない変更があるか
    const changed = state.savedUrl !== state.draftUrl
    // ファイル選択欄の id（ラベルと結びつける）
    const inputId = `${slot.key}-image`
    // 見出しの id（カードの名前として読み上げる）
    const titleId = `${slot.key}-title`
    // 保存・アップロードをできない状態か（読み込み失敗・処理中）
    const locked = Boolean(loadError) || state.uploading || state.saving
    return (
      <section
        key={slot.key}
        className="admin-site-image-card"
        data-testid={`habitat-image-card-${slot.key}`}
        aria-labelledby={titleId}
      >
        <h3 id={titleId} style={{ fontSize: 16, fontWeight: 500, margin: '0 0 6px' }}>{slot.label}</h3>
        <p style={noteStyle}>{slot.note}</p>

        {/* プレビュー。編集中の画像があれば出し、なければ「未設定」と、プロジェクト内の画像の有無を出す */}
        {state.draftUrl ? (
          <div className={`admin-habitat-image-preview admin-habitat-image-preview--${slot.group}`}>
            <img src={state.draftUrl} alt={`${slot.label} のプレビュー`} />
          </div>
        ) : (
          <div
            className={`admin-habitat-image-preview admin-habitat-image-preview--${slot.group} admin-habitat-image-preview--empty`}
            data-testid={`habitat-image-empty-${slot.key}`}
          >
            <strong>未設定</strong>
            <span>
              {slot.localSrc
                ? `プロジェクト内の画像（${slot.localSrc}）を表示中`
                : slot.group === 'sign'
                  ? 'プロジェクト内の画像もないため、サインは表示しません'
                  : 'プロジェクト内の画像もないため、空の枠を表示中'}
            </span>
          </div>
        )}

        <label htmlFor={inputId} style={fieldStyle}>画像を選ぶ</label>
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(event) => { void chooseImage(slot.key, event) }}
          disabled={locked}
          style={{ width: '100%', maxWidth: '100%', fontSize: 14, marginBottom: 12 }}
        />
        {state.uploading && <p role="status" style={{ fontSize: 14 }}>アップロード中…</p>}

        {/* 外す・変更を取り消す（保存するまでは公開ページは変わらない） */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, margin: '0 0 12px' }}>
          {state.draftUrl && (
            <button type="button" onClick={() => updateSlot(slot.key, { draftUrl: '', notice: '' })} disabled={locked} style={{ padding: 0, border: 0, background: 'none', color: '#a33', fontSize: 14, cursor: 'pointer' }}>
              画像を外す
            </button>
          )}
          {changed && (
            <button type="button" onClick={() => updateSlot(slot.key, { draftUrl: state.savedUrl, notice: '', error: '' })} disabled={state.uploading || state.saving} style={{ padding: 0, border: 0, background: 'none', color: '#555', fontSize: 14, cursor: 'pointer', textDecoration: 'underline' }}>
              変更を取り消す
            </button>
          )}
        </div>

        {state.error && <p role="alert" style={{ color: '#a33', fontSize: 14 }}>{state.error}</p>}
        {state.notice && <p role="status" style={{ color: '#28623d', fontSize: 14 }}>{state.notice}</p>}
        <button
          type="button"
          onClick={() => { void save(slot.key) }}
          disabled={!changed || locked}
          style={{ padding: '10px 18px', border: 0, borderRadius: 4, background: changed && !loadError ? '#1c2417' : '#aaa', color: '#fff', fontSize: 15, cursor: changed && !loadError ? 'pointer' : 'default' }}
        >
          {state.saving ? '保存中…' : '画像を保存'}
        </button>
      </section>
    )
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1 style={{ fontSize: 24, fontWeight: 500, margin: '0 0 12px' }}>Habitat Oides 画像</h1>
      <p style={{ fontSize: 16, lineHeight: 1.8, color: '#555', margin: '0 0 12px' }}>
        habitatoides.com のトップページで動く画像を、枠ごとに設定します。保存した画像は、プロジェクト内に置いた画像より優先して表示されます。
      </p>
      <p style={{ fontSize: 14, lineHeight: 1.8, color: '#666', margin: '0 0 28px' }}>
        画像を選んだあと「画像を保存」を押すと公開ページに反映されます。「画像を外す」を選んで保存すると、プロジェクト内の画像（なければ空の枠）に戻ります。
      </p>

      {loadError && <p role="alert" style={{ color: '#a33', fontSize: 15, margin: '0 0 20px' }}>{loadError}</p>}

      {loading ? <p style={{ fontSize: 16 }}>読み込み中…</p> : (
        HABITAT_MOTION_GROUP_ORDER.map((group) => (
          <section key={group} aria-labelledby={`habitat-group-${group}`} data-testid={`habitat-image-group-${group}`} style={{ margin: '0 0 36px' }}>
            <h2 id={`habitat-group-${group}`} style={{ fontSize: 19, fontWeight: 500, margin: '0 0 14px', paddingBottom: 8, borderBottom: '1px solid #dddde8' }}>
              {HABITAT_MOTION_GROUP_LABELS[group]}
            </h2>
            {/* 枠ごとのカード（スマホ幅では1列に並ぶ） */}
            <div className="admin-site-image-grid">
              {habitatSlotsByGroup(group).map(renderCard)}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
