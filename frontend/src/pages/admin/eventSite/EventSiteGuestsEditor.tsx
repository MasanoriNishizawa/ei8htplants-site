import { cloneElement, isValidElement, useId } from 'react'
import type { PageContent } from '../../../lib/api'
import EventSiteImageInput from './EventSiteImageInput'

/** ゲスト・出展者一覧の1件を API の保存形式のまま表す型 */
type GuestItem = NonNullable<PageContent['guests']>[number]

/** ゲストの input・textarea に使う親画面と同じ入力欄の見た目 */
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #dddde8', borderRadius: 4,
  fontSize: 14, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box',
}

/** 項目名の既存表示を保つラベル用の見た目 */
const fieldLabelStyle: React.CSSProperties = { display: 'block', fontSize: 12, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 6 }

/**
 * 既存フォームと同じ DOM 構造で項目名と入力欄を表示する。
 * 1. 単独の input・textarea はラベルと id で結び付ける
 * 2. 画像入力など複数要素の欄は項目名を span で表示する
 * @param props.label - 入力欄の項目名
 * @param props.children - 表示する入力欄または画像選択 UI
 * @returns 項目名と入力要素を含むフォーム領域
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  /** 項目名と単独入力欄を結び付ける id */
  const id = useId()
  /** 中身が input・textarea・select の単独要素なら true */
  const single = isValidElement<{ id?: string }>(children)
    && typeof children.type === 'string'
    && ['input', 'textarea', 'select'].includes(children.type)
  return (
    <div style={{ marginBottom: 14 }}>
      {single ? (
        <>
          {/* 1. 項目名と入力欄を id で結び付ける */}
          <label htmlFor={id} style={fieldLabelStyle}>{label}</label>
          {cloneElement(children, { id })}
        </>
      ) : (
        <>
          {/* 2. 入力要素と結び付けない欄は項目名を通常表示する */}
          <span style={fieldLabelStyle}>{label}</span>
          {children}
        </>
      )}
    </div>
  )
}

/**
 * ゲスト・出展者カードの表示と編集を担い、変更を親フォームへ通知する。
 * 配列 state、API の読込・保存、dirty 判定は親画面が管理する。
 * 1. 親から受け取った一覧を既存のカード構造と入力順で表示する
 * 2. 項目の変更、カードの追加・削除を親の callback へ通知する
 * @param props.items - 編集中のゲスト・出展者一覧
 * @param props.onItemChange - 指定カードの部分更新を親へ通知する関数
 * @param props.onRemove - 指定カードの削除を親へ通知する関数
 * @param props.onAdd - 空のカードの追加を親へ通知する関数
 * @returns ゲスト・出展者カードの一覧と追加ボタン
 */
export default function EventSiteGuestsEditor({
  items,
  onItemChange,
  onRemove,
  onAdd,
}: {
  items: GuestItem[]
  onItemChange: (index: number, patch: Partial<GuestItem>) => void
  onRemove: (index: number) => void
  onAdd: () => void
}) {
  return (
    <>
      {(items ?? []).map((guest, i) => (
        <div key={i} style={{ border: '1px solid #e4e4ee', borderRadius: 4, padding: '16px 16px 4px', marginBottom: 12 }}>
          {/* 何件目かと、この1件の削除ボタン */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--c-muted)', letterSpacing: 1 }}>ゲスト {i + 1}</span>
            <button onClick={() => onRemove(i)} style={{ padding: '4px 10px', border: '1px solid #f0b8ae', borderRadius: 2, fontSize: 12, color: '#c0392b', background: 'none', cursor: 'pointer' }}>削除</button>
          </div>
          <Field label="名前">
            <input value={guest.name} onChange={(e) => onItemChange(i, { name: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="役割・肩書き">
            <input value={guest.role ?? ''} onChange={(e) => onItemChange(i, { role: e.target.value })} placeholder="陶芸作家" style={inputStyle} />
          </Field>
          <Field label="プロフィール">
            <textarea value={guest.bio ?? ''} onChange={(e) => onItemChange(i, { bio: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
          <Field label="プロフィール画像">
            <EventSiteImageInput value={guest.image_url ?? ''} onChange={(v) => onItemChange(i, { image_url: v })} />
          </Field>
          <Field label="Instagram URL">
            <input value={guest.instagram_url ?? ''} onChange={(e) => onItemChange(i, { instagram_url: e.target.value })} placeholder="https://www.instagram.com/..." style={inputStyle} />
          </Field>
        </div>
      ))}
      <button onClick={onAdd}
        style={{ padding: '9px 20px', border: '1px dashed #b0b0c4', borderRadius: 4, fontSize: 13, color: 'var(--c-muted)', background: 'none', cursor: 'pointer', width: '100%' }}>
        + ゲストを追加
      </button>
    </>
  )
}
