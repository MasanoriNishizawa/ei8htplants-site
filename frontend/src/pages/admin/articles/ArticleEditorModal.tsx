import type { CSSProperties, KeyboardEvent } from 'react'
import type { Article, ArticleBody, Product } from '../../../lib/api'
import BlockEditor from '../../../components/BlockEditor'
import type { Block } from '../../../lib/blocks'
import { formatYen } from '../../../lib/format'

/** 記事編集モーダルへ渡す表示状態と、親が所有する更新処理。 */
export interface ArticleEditorModalProps {
  /** 編集中の記事か、新規作成を示す値。 */
  editing: Article | 'new'
  /** 編集フォームの現在値。 */
  form: ArticleBody
  /** 本文・画像のブロック一覧。 */
  blocks: Block[]
  /** タグ入力欄の現在値。 */
  tagInput: string
  /** 関連商品として選択できる商品。 */
  products: Product[]
  /** 保存中のときに操作を抑止する状態。 */
  saving: boolean
  /** 保存失敗時に表示する文言。 */
  saveError: string
  /** 一覧と共有するエラー表示の見た目。 */
  errorBoxStyle: CSSProperties
  /** フォーム項目を親のstateへ反映する。 */
  onFieldChange: <K extends keyof ArticleBody>(key: K, value: ArticleBody[K]) => void
  /** 本文ブロックの変更を親のstateへ反映する。 */
  onBlocksChange: (blocks: Block[]) => void
  /** タグ入力欄の変更を親のstateへ反映する。 */
  onTagInputChange: (value: string) => void
  /** 入力中のタグをフォームへ追加する。 */
  onAddTag: () => void
  /** 指定したタグをフォームから外す。 */
  onRemoveTag: (tag: string) => void
  /** 関連商品の選択を切り替える。 */
  onToggleProduct: (productId: string) => void
  /** 外側クリックやキャンセルによる閉じる処理を親へ委譲する。 */
  onRequestClose: () => void
  /** 保存操作を親へ委譲する。 */
  onSave: () => void
}

/**
 * 記事編集用の入力モーダルを描画し、入力変更を親へ通知する。
 * @param props - 親が管理する編集状態と更新・保存・終了のコールバック。
 * @returns 記事の編集フォームを含むモーダル要素。
 */
export default function ArticleEditorModal({
  editing, form, blocks, tagInput, products, saving, saveError, errorBoxStyle,
  onFieldChange, onBlocksChange, onTagInputChange, onAddTag, onRemoveTag,
  onToggleProduct, onRequestClose, onSave,
}: ArticleEditorModalProps) {
  /** タイトル・タグの入力欄で共通利用する横幅いっぱいの見た目。 */
  const inputStyle: CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px',
    border: '1px solid #dddde8', fontSize: 14, fontFamily: 'inherit',
    color: 'var(--c-ink)', background: '#fff', outline: 'none',
  }

  /** Enter によるタグ追加を行い、フォーム送信扱いになるのを防ぐ。 */
  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onAddTag()
    }
  }

  return (
    /* 暗い背景のクリックは、親がdirty確認を行ったうえで閉じる。 */
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onRequestClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="article-modal-title" style={{ background: '#fff', maxWidth: 680, width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: 32 }} onClick={(event) => event.stopPropagation()}>
        <h3 id="article-modal-title" style={{ margin: '0 0 24px', fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontWeight: 300, fontSize: 22 }}>
          {editing === 'new' ? '記事追加' : '記事編集'}
        </h3>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="article-title" style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>タイトル *</label>
          <input id="article-title" required style={inputStyle} value={form.title} onChange={(event) => onFieldChange('title', event.target.value)} />
        </div>

        <div style={{ marginBottom: 20 }}>
          {/* ブロックエディタは複数入力欄の集まりなので、labelではなく見出しとして示す。 */}
          <p style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, margin: '0 0 10px' }}>本文・画像</p>
          <BlockEditor blocks={blocks} onChange={onBlocksChange} />
        </div>

        {/* 登録済みタグと、新しいタグの入力・追加操作。 */}
        <div style={{ marginBottom: 20 }}>
          <label htmlFor="article-tag-input" style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>タグ</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {form.tags.map((tag) => (
              <span key={tag} style={{ fontSize: 12, padding: '4px 10px', background: '#f0f0f5', display: 'flex', alignItems: 'center', gap: 6 }}>
                {tag}
                <button onClick={() => onRemoveTag(tag)} aria-label={`タグ「${tag}」を外す`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#999', padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="article-tag-input" style={{ ...inputStyle, flex: 1 }} value={tagInput} onChange={(event) => onTagInputChange(event.target.value)} onKeyDown={handleTagKeyDown} placeholder="タグを入力して Enter" />
            <button onClick={onAddTag} style={{ padding: '9px 16px', border: '1px solid #dddde8', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>追加</button>
          </div>
        </div>

        {/* 関連商品候補がある場合だけ商品選択欄を表示する。 */}
        {products.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            {/* 商品ごとのチェックボックスをlabelで包むため、見出しは段落で表示する。 */}
            <p style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, margin: '0 0 8px' }}>関連商品（記事から購入できる商品）</p>
            <div style={{ border: '1px solid #dddde8', maxHeight: 220, overflowY: 'auto' }}>
              {products.map((product) => {
                /** 現在の商品がフォーム上で選択されているか。 */
                const selected = (form.product_ids ?? []).includes(product.id)
                return (
                  <label key={product.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderBottom: '1px solid #f0f0f5', cursor: 'pointer',
                    background: selected ? '#f0f7f0' : '#fff',
                  }}>
                    <input type="checkbox" checked={selected} onChange={() => onToggleProduct(product.id)} style={{ flexShrink: 0 }} />
                    {product.image_urls[0] && <img src={product.image_urls[0]} alt="" style={{ width: 36, height: 36, objectFit: 'cover', flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--c-muted)' }}>{formatYen(product.price)}{product.stock === 0 && <span style={{ color: '#c0392b', marginLeft: 8 }}>売り切れ</span>}</p>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--c-ink)' }}>
            <input type="checkbox" checked={form.is_published} onChange={(event) => onFieldChange('is_published', event.target.checked)} />
            公開する
          </label>
        </div>

        {/* 保存失敗は入力値を残したまま、共通のエラー表示で知らせる。 */}
        {saveError && <p role="alert" style={errorBoxStyle}>{saveError}</p>}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onRequestClose} style={{ padding: '10px 20px', border: '1px solid #dddde8', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
          <button onClick={onSave} disabled={saving} style={{ padding: '10px 24px', background: 'var(--c-ink)', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
