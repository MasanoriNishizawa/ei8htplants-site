import { cloneElement, isValidElement, useId } from 'react'
import type { EventSiteLineupItem } from '../../../lib/apiTypes/events'
import EventSiteImageInput from './EventSiteImageInput'

/** ラインナップ入力欄の共通の見た目。親画面の既存入力欄と同じ設定を使う */
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #dddde8', borderRadius: 4,
  fontSize: 14, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box',
}

/** Field の項目名に使う既存の見た目 */
const fieldLabelStyle: React.CSSProperties = { display: 'block', fontSize: 12, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 6 }

/**
 * 項目名と入力欄を既存と同じ DOM で表示する。
 * 1. 入力欄が1つなら useId で label と結び付ける
 * 2. 画像入力など複数要素の場合は項目名を span で表示する
 * @param props.label - 入力欄の上に表示する項目名
 * @param props.children - 表示する入力欄または画像選択 UI
 * @returns 項目名と入力内容を含むフォーム領域
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  /** input 要素の id。項目名の label と結び付ける */
  const id = useId()
  /** 子要素が input・textarea・select の単独要素なら true */
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
 * ラインナップ一覧の表示・編集 UI を担当し、変更操作を親フォームへ通知する。
 * 編集データ・保存状態・API 呼び出しは親が引き続き管理する。
 * 1. 親から受け取った行を既存のカード構造と入力順で表示する
 * 2. 項目編集、追加、削除を対応するコールバックで親へ通知する
 * @param props.items - 編集中のラインナップ一覧
 * @param props.onItemChange - 指定行の部分更新を親へ通知する関数
 * @param props.onRemove - 指定行の削除を親へ通知する関数
 * @param props.onAdd - 空の行の追加を親へ通知する関数
 * @returns ラインナップ編集カードの内容
 */
export default function EventSiteLineupEditor({
  items,
  onItemChange,
  onRemove,
  onAdd,
}: {
  items: EventSiteLineupItem[]
  onItemChange: (index: number, patch: Partial<EventSiteLineupItem>) => void
  onRemove: (index: number) => void
  onAdd: () => void
}) {
  return (
    <>
      {(items ?? []).map((item, i) => (
        <div key={i} style={{ border: '1px solid #e4e4ee', borderRadius: 4, padding: '16px 16px 4px', marginBottom: 12 }}>
          {/* 何件目かと、この1件の削除ボタン */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--c-muted)', letterSpacing: 1 }}>ラインナップ {i + 1}</span>
            <button onClick={() => onRemove(i)} style={{ padding: '4px 10px', border: '1px solid #f0b8ae', borderRadius: 2, fontSize: 12, color: '#c0392b', background: 'none', cursor: 'pointer' }}>削除</button>
          </div>
          <Field label="名称">
            <input value={item.title} onChange={(e) => onItemChange(i, { title: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="説明">
            <textarea value={item.description ?? ''} onChange={(e) => onItemChange(i, { description: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
          <Field label="画像">
            <EventSiteImageInput value={item.image_url ?? ''} onChange={(v) => onItemChange(i, { image_url: v })} />
          </Field>
        </div>
      ))}
      <button onClick={onAdd}
        style={{ padding: '9px 20px', border: '1px dashed #b0b0c4', borderRadius: 4, fontSize: 13, color: 'var(--c-muted)', background: 'none', cursor: 'pointer', width: '100%' }}>
        + ラインナップを追加
      </button>
    </>
  )
}
