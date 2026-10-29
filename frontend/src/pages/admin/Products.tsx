import { useEffect, useState } from 'react'
import { api, type Product, type ProductBody, type ProductCategory, PRODUCT_CATEGORIES } from '../../lib/api'
import BlockEditor from '../../components/BlockEditor'
import { blockImageUrls, type Block, parseBlocks, serializeBlocks } from '../../lib/blocks'
import { confirmDiscard, dirtySnapshotJson, useEscapeToClose, useUnsavedChanges } from './UnsavedChanges'
import { failMessage } from './errorMessage'
import ProductList from './ProductList'


/** エラーの帯の見た目（一覧の上・編集モーダルで共通の赤い帯） */
const errorBoxStyle: React.CSSProperties = {
  color: '#c0392b', fontSize: 13, margin: '0 0 16px', padding: '8px 14px',
  background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0',
}

/**
 * 編集モーダルの入力の状態を、変更があるかの比較用に1つの文字列にする
 * @param form - フォームの値
 * @param blocks - 本文のブロック
 * @param tagInput - 追加前のタグの入力欄
 * @returns 比較用の文字列
 */
function snapshotOf(form: ProductBody, blocks: Block[], tagInput: string): string {
  // '' と null は dirtySnapshotJson で同じ扱いにする（読み込んだ値と、入力して消した値の違いで「変更あり」にしない）
  return dirtySnapshotJson({ form, blocks, tagInput })
}

/** 新規作成のときのフォームの初期値 */
const BLANK: ProductBody = {
  name: '', description: '', price: 0, stock: 0,
  image_urls: [], tags: [], is_published: false, display_order: 0, category: null,
}

/**
 * 商品管理。一覧表示・新規作成・編集・公開切替・削除を行うページ
 * @returns 商品の表と編集モーダル
 */
export default function AdminProducts() {
  /** 商品の一覧（非公開も含む） */
  const [products, setProducts] = useState<Product[]>([])
  /** 一覧を読み込み中か */
  const [loading, setLoading] = useState(true)
  /** 編集中の商品（'new' なら新規作成、null ならモーダルを閉じている） */
  const [editing, setEditing] = useState<Product | null | 'new'>(null)
  /** 編集モーダルのフォームの値 */
  const [form, setForm] = useState<ProductBody>(BLANK)
  /** 保存中か */
  const [saving, setSaving] = useState(false)
  /** タグの入力欄（Enter か「追加」で form.tags に入る） */
  const [tagInput, setTagInput] = useState('')
  /** 本文・画像のブロック */
  const [blocks, setBlocks] = useState<Block[]>([])
  /** モーダルを開いたときの入力の状態（snapshotOf の値。変更があるかの判定に使う） */
  const [initialSnapshot, setInitialSnapshot] = useState('')
  /** 一覧の操作（読み込み・削除・公開切り替え）の失敗の文言（一覧の上に出す） */
  const [pageError, setPageError] = useState('')
  /** 保存の失敗の文言（モーダルの中に出す） */
  const [saveError, setSaveError] = useState('')
  /** 削除・公開切り替えを処理中の商品の id（二重押しを防ぐ） */
  const [busyId, setBusyId] = useState<string | null>(null)

  /** 編集モーダルに、開いたときから変更があるか */
  const isDirty = editing !== null && snapshotOf(form, blocks, tagInput) !== initialSnapshot
  // 編集中に変更があれば、サイドメニューでの移動・再読み込みでも確認を出す
  useUnsavedChanges(isDirty)

  /**
   *  一覧を読み込む（非公開も含む）。失敗したら「商品がありません」と区別できるようエラーを出す
   * @returns 戻り値なし。
   */
  const load = () => {
    api.products.list(true)
      .then(setProducts)
      .catch((e: unknown) => setPageError(failMessage('商品の読み込みに失敗しました', e)))
      .finally(() => setLoading(false))
  }
  // 画面を開いたときに一覧を読み込む
  useEffect(load, [])

  /**
   * モーダルを開き、入力の初期値と比較用の状態を入れる
   * @param target - 編集する商品か 'new'
   * @param nextForm - フォームの初期値
   * @param nextBlocks - 本文のブロックの初期値
   * @returns 戻り値なし。
   */
  const openModal = (target: Product | 'new', nextForm: ProductBody, nextBlocks: Block[]) => {
    setEditing(target)
    setForm(nextForm)
    setBlocks(nextBlocks)
    setTagInput('')
    setSaveError('')
    setInitialSnapshot(snapshotOf(nextForm, nextBlocks, ''))
  }
  /**
   *  新規作成のモーダルを開く（表示順は末尾）
   * @returns 戻り値なし。
   */
  const openNew = () => openModal('new', { ...BLANK, display_order: products.length }, [])
  /**
   * 既存の商品の編集モーダルを開く
   * @param p - 編集する商品
   * @returns 戻り値なし。
   */
  const openEdit = (p: Product) => openModal(
    p,
    { name: p.name, description: p.description ?? '', price: p.price, stock: p.stock, image_urls: p.image_urls, tags: p.tags ?? [], is_published: p.is_published, display_order: p.display_order, category: p.category ?? null },
    parseBlocks(p.description),
  )
  /**
   *  モーダルを閉じて入力を捨てる
   * @returns 戻り値なし。
   */
  const closeModal = () => { setEditing(null); setForm(BLANK); setBlocks([]); setSaveError('') }
  /**
   *  モーダルの外側のクリック・「キャンセル」ボタン・Esc で閉じるとき。保存中は閉じず、変更があれば確認してから閉じる
   * @returns 戻り値なし。
   */
  const closeByBackdrop = () => {
    if (saving) return
    if (confirmDiscard(isDirty)) closeModal()
  }
  // モーダルを開いているあいだは Esc キーでも閉じる（書きかけなら確認、保存中は閉じない）。
  // 日本語の変換中の Esc と、ほかの部品が preventDefault で受け取り済みの Esc では閉じない（useEscapeToClose）
  useEscapeToClose(editing !== null, closeByBackdrop)

  /**
   *  タグの入力欄の値を form.tags に足す（空・重複は足さない）
   * @returns 戻り値なし。
   */
  const addTag = () => {
    /** 前後の空白を除いたタグ */
    const t = tagInput.trim()
    if (t && !form.tags.includes(t)) set('tags', [...form.tags, t])
    setTagInput('')
  }
  /**
   * タグを外す
   * @param t - 外すタグ
   * @returns 戻り値なし。
   */
  const removeTag = (t: string) => set('tags', form.tags.filter((x) => x !== t))

  /**
   * フォームの1項目を書き換える
   * @param k - 項目名
   * @param v - 新しい値
   * @returns 戻り値なし。
   */
  const set = <K extends keyof ProductBody>(k: K, v: ProductBody[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  /**
   * モーダルの内容を保存する
   * 1. ブロック内の画像 URL を image_urls にも入れる（一覧のサムネイル・後方互換のため）
   * 2. 新規なら作成、既存なら更新し、一覧に反映してモーダルを閉じる
   * 3. 失敗したらモーダルを開いたまま（入力は残る）エラーを出す
   * @returns 戻り値なし。
   */
  const handleSave = async () => {
    setSaving(true)
    setSaveError('')
    // 1. 画像 URL の同期
    /** 送る内容（本文はブロックを文字列にしたもの） */
    const payload = { ...form, description: serializeBlocks(blocks), image_urls: blockImageUrls(blocks) }
    try {
      // 2. 保存
      if (editing === 'new') {
        // 新規商品の API 登録結果を一覧へ追加する。
        const p = await api.products.create(payload)
        setProducts((prev) => [...prev, p])
      } else if (editing) {
        // 既存商品の API 更新結果で、一覧の該当商品を差し替える。
        const p = await api.products.update(editing.id, payload)
        setProducts((prev) => prev.map((x) => x.id === p.id ? p : x))
      }
      closeModal()
    } catch (e) {
      // 3. 失敗
      setSaveError(failMessage('保存に失敗しました', e))
    } finally {
      setSaving(false)
    }
  }

  /**
   * 商品を削除する（確認のあと）。失敗したら一覧に残したままエラーを出す
   * @param p - 削除する商品
   * @returns 戻り値なし。
   */
  const handleDelete = async (p: Product) => {
    if (!confirm(`「${p.name}」を削除しますか？`)) return
    setBusyId(p.id)
    setPageError('')
    try {
      await api.products.delete(p.id)
      setProducts((prev) => prev.filter((x) => x.id !== p.id))
    } catch (e) {
      setPageError(failMessage(`「${p.name}」の削除に失敗しました`, e))
    } finally {
      setBusyId(null)
    }
  }

  /**
   * 一覧から直接公開状態を切り替える（モーダルを開かずに切り替え可能）。失敗したら表示は元のままエラーを出す
   * @param p - 切り替える商品
   * @returns 戻り値なし。
   */
  const togglePublish = async (p: Product) => {
    setBusyId(p.id)
    setPageError('')
    try {
      // 公開状態を反転して保存し、返された商品データで一覧を更新する。
      const updated = await api.products.update(p.id, {
        name: p.name, description: p.description, price: p.price, stock: p.stock, image_urls: p.image_urls,
        tags: p.tags ?? [], is_published: !p.is_published, display_order: p.display_order, category: p.category,
      })
      setProducts((prev) => prev.map((x) => x.id === updated.id ? updated : x))
    } catch (e) {
      setPageError(failMessage(`「${p.name}」の公開状態の切り替えに失敗しました`, e))
    } finally {
      setBusyId(null)
    }
  }

  /** 編集モーダルの入力欄（商品名・価格・在庫・タグ）の共通の見た目。横幅いっぱい */
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px',
    border: '1px solid #dddde8', fontSize: 14, fontFamily: 'inherit',
    color: 'var(--c-ink)', background: '#fff', outline: 'none',
  }

  return (
    <div>
      {/* 見出しと商品追加ボタン */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, margin: 0 }}>商品管理</h2>
        <button onClick={openNew} style={{ padding: '9px 20px', background: 'var(--c-ink)', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          + 商品追加
        </button>
      </div>

      {/* 一覧の操作の失敗 */}
      {pageError && <p role="alert" style={errorBoxStyle}>{pageError}</p>}

      {/* 商品一覧の表示は専用コンポーネントへ渡し、操作処理はこの画面に残す */}
      <ProductList
        products={products}
        loading={loading}
        pageError={pageError}
        busyId={busyId}
        onTogglePublish={togglePublish}
        onEdit={openEdit}
        onDelete={handleDelete}
      />

      {/* 編集モーダル（暗い背景を押すと、変更があれば確認してから閉じる） */}
      {editing !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={closeByBackdrop}>
          <div role="dialog" aria-modal="true" aria-labelledby="product-modal-title" style={{ background: '#fff', maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 32 }} onClick={(e) => e.stopPropagation()}>
            <h3 id="product-modal-title" style={{ margin: '0 0 24px', fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontWeight: 300, fontSize: 22 }}>
              {editing === 'new' ? '商品追加' : '商品編集'}
            </h3>

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="product-name" style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>商品名 *</label>
              <input id="product-name" required style={inputStyle} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label htmlFor="product-price" style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>価格（円・税込）*</label>
                <input id="product-price" required type="number" min={0} style={inputStyle} value={form.price} onChange={(e) => set('price', Number(e.target.value))} />
              </div>
              <div>
                <label htmlFor="product-stock" style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>在庫数 *</label>
                <input id="product-stock" required type="number" min={0} style={inputStyle} value={form.stock} onChange={(e) => set('stock', Number(e.target.value))} />
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              {/* ブロックエディタは複数の入力欄の集まりなので、label ではなく見出しの文字にする */}
              <p style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, margin: '0 0 10px' }}>本文・画像</p>
              <BlockEditor blocks={blocks} onChange={setBlocks} />
            </div>
            <fieldset style={{ border: 'none', padding: 0, margin: '0 0 20px', minWidth: 0 }}>
              <legend style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 10, padding: 0 }}>カテゴリー</legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--c-body)' }}>
                  <input
                    type="radio"
                    name="category"
                    checked={form.category === null}
                    onChange={() => set('category', null)}
                  />
                  未設定
                </label>
                {PRODUCT_CATEGORIES.map((cat) => (
                  <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--c-body)' }}>
                    <input
                      type="radio"
                      name="category"
                      checked={form.category === cat}
                      onChange={() => set('category', cat as ProductCategory)}
                    />
                    {cat}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* タグ（付いているタグの一覧と、追加の入力欄） */}
            <div style={{ marginBottom: 20 }}>
              <label htmlFor="product-tag-input" style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>タグ</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {form.tags.map((t) => (
                  <span key={t} style={{ fontSize: 12, padding: '4px 10px', background: '#f0f0f5', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {t}
                    <button onClick={() => removeTag(t)} aria-label={`タグ「${t}」を外す`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#999', padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="product-tag-input"
                  style={{ ...inputStyle, flex: 1 }}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                  placeholder="タグを入力して Enter"
                />
                <button onClick={addTag} style={{ padding: '9px 16px', border: '1px solid #dddde8', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>追加</button>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--c-ink)' }}>
                <input type="checkbox" checked={form.is_published} onChange={(e) => set('is_published', e.target.checked)} />
                公開する
              </label>
            </div>

            {/* 保存の失敗 */}
            {saveError && <p role="alert" style={errorBoxStyle}>{saveError}</p>}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={closeByBackdrop} style={{ padding: '10px 20px', border: '1px solid #dddde8', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '10px 24px', background: 'var(--c-ink)', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
