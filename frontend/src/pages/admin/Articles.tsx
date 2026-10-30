import { useEffect, useState } from 'react'
import { api, type Article, type ArticleBody, type Product } from '../../lib/api'
import BlockEditor from '../../components/BlockEditor'
import { blockImageUrls, type Block, parseBlocks, serializeBlocks } from '../../lib/blocks'
import { confirmDiscard, dirtySnapshotJson, useEscapeToClose, useUnsavedChanges } from './UnsavedChanges'
import { failMessage } from './errorMessage'
import { formatYen } from '../../lib/format'
import ArticlesList from './articles/ArticlesList'

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
function snapshotOf(form: ArticleBody, blocks: Block[], tagInput: string): string {
  // 関連商品は選んだ順に意味が無いので、外して付け直しても「変更あり」にならないよう並べ替えて比べる。
  // '' と null は dirtySnapshotJson で同じ扱いにする
  return dirtySnapshotJson({ form: { ...form, product_ids: [...(form.product_ids ?? [])].sort() }, blocks, tagInput })
}

/** 新規作成のときのフォームの初期値 */
const BLANK: ArticleBody = {
  title: '', content: '', image_urls: [], tags: [], product_ids: [], is_published: false, display_order: 0,
}

/**
 * Journal の記事を管理するページ（新規作成・編集・公開切替・削除）
 * @returns 記事の表と編集モーダル
 */
export default function AdminArticles() {
  /** 記事の一覧（非公開も含む） */
  const [articles, setArticles] = useState<Article[]>([])
  /** 関連商品の候補（非公開も含む全商品） */
  const [products, setProducts] = useState<Product[]>([])
  /** 一覧を読み込み中か */
  const [loading, setLoading] = useState(true)
  /** 編集中の記事（'new' なら新規作成、null ならモーダルを閉じている） */
  const [editing, setEditing] = useState<Article | 'new' | null>(null)
  /** 編集モーダルのフォームの値 */
  const [form, setForm] = useState<ArticleBody>(BLANK)
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
  /** 削除・公開切り替えを処理中の記事の id（二重押しを防ぐ） */
  const [busyId, setBusyId] = useState<string | null>(null)

  /** 編集モーダルに、開いたときから変更があるか */
  const isDirty = editing !== null && snapshotOf(form, blocks, tagInput) !== initialSnapshot
  // 編集中に変更があれば、サイドメニューでの移動・再読み込みでも確認を出す
  useUnsavedChanges(isDirty)

  // 記事一覧と関連商品候補を同時取得する。失敗したら「記事がありません」と区別できるようエラーを出す
  useEffect(() => {
    Promise.all([
      api.articles.list(true),
      api.products.list(true),
    ]).then(([arts, prods]) => {
      setArticles(arts)
      setProducts(prods)
    }).catch((e: unknown) => {
      setPageError(failMessage('記事の読み込みに失敗しました', e))
    }).finally(() => setLoading(false))
  }, [])

  /**
   * モーダルを開き、入力の初期値と比較用の状態を入れる
   * @param target - 編集する記事か 'new'
   * @param nextForm - フォームの初期値
   * @param nextBlocks - 本文のブロックの初期値
   * @returns 戻り値なし。
   */
  const openModal = (target: Article | 'new', nextForm: ArticleBody, nextBlocks: Block[]) => {
    setEditing(target)
    setForm(nextForm)
    setBlocks(nextBlocks)
    setTagInput('')
    setSaveError('')
    setInitialSnapshot(snapshotOf(nextForm, nextBlocks, ''))
  }
  /**
   *  新規作成のモーダルを開く（表示順は今の件数）
   * @returns 戻り値なし。
   */
  const openNew = () => openModal('new', { ...BLANK, display_order: articles.length }, [])
  /**
   * 既存の記事の編集モーダルを開く
   * @param a - 編集する記事
   * @returns 戻り値なし。
   */
  const openEdit = (a: Article) => openModal(
    a,
    {
      title: a.title,
      content: a.content ?? '',
      image_urls: a.image_urls,
      tags: a.tags,
      product_ids: a.product_ids ?? [],
      is_published: a.is_published,
      display_order: a.display_order,
    },
    parseBlocks(a.content),
  )
  /**
   *  モーダルを閉じて入力を捨てる
   * @returns 戻り値なし。
   */
  const close = () => { setEditing(null); setForm(BLANK); setBlocks([]); setSaveError('') }
  /**
   *  モーダルの外側のクリック・「キャンセル」ボタン・Esc で閉じるとき。保存中は閉じず、変更があれば確認してから閉じる
   * @returns 戻り値なし。
   */
  const closeByBackdrop = () => {
    if (saving) return
    if (confirmDiscard(isDirty)) close()
  }
  // モーダルを開いているあいだは Esc キーでも閉じる（書きかけなら確認、保存中は閉じない）。
  // 日本語の変換中の Esc と、ほかの部品が preventDefault で受け取り済みの Esc では閉じない（useEscapeToClose）
  useEscapeToClose(editing !== null, closeByBackdrop)

  /**
   * フォームの1項目を書き換える
   * @param k - 項目名
   * @param v - 新しい値
   * @returns 戻り値なし。
   */
  const set = <K extends keyof ArticleBody>(k: K, v: ArticleBody[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

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
   * 関連商品の選択を切り替える
   * @param id - 商品の id
   * @returns 戻り値なし。
   */
  const toggleProduct = (id: string) => {
    /** 今選んでいる商品の id */
    const current = form.product_ids ?? []
    set('product_ids', current.includes(id) ? current.filter((x) => x !== id) : [...current, id])
  }

  /**
   * モーダルの内容を保存する
   * 1. ブロックエディタから画像 URL を取り出して image_urls にも入れる（後方互換）
   * 2. 新規なら作成、既存なら更新し、一覧に反映してモーダルを閉じる
   * 3. 失敗したらモーダルを開いたまま（入力は残る）エラーを出す
   * @returns 戻り値なし。
   */
  const handleSave = async () => {
    setSaving(true)
    setSaveError('')
    // 1. 画像 URL の同期
    /** 送る内容（本文はブロックを文字列にしたもの） */
    const payload = { ...form, content: serializeBlocks(blocks), image_urls: blockImageUrls(blocks) }
    try {
      // 2. 保存
      if (editing === 'new') {
        // 新規記事を作成し、一覧の先頭へ追加する。
        const a = await api.articles.create(payload)
        setArticles((prev) => [a, ...prev])
      } else if (editing) {
        // 編集中の記事を更新し、一覧内の同じ ID の行を置き換える。
        const a = await api.articles.update(editing.id, payload)
        setArticles((prev) => prev.map((x) => x.id === a.id ? a : x))
      }
      close()
    } catch (e) {
      // 3. 失敗
      setSaveError(failMessage('保存に失敗しました', e))
    } finally {
      setSaving(false)
    }
  }

  /**
   * 記事を削除する（確認のあと）。失敗したら一覧に残したままエラーを出す
   * @param a - 削除する記事
   * @returns 戻り値なし。
   */
  const handleDelete = async (a: Article) => {
    if (!confirm(`「${a.title}」を削除しますか？`)) return
    setBusyId(a.id)
    setPageError('')
    try {
      await api.articles.delete(a.id)
      setArticles((prev) => prev.filter((x) => x.id !== a.id))
    } catch (e) {
      setPageError(failMessage(`「${a.title}」の削除に失敗しました`, e))
    } finally {
      setBusyId(null)
    }
  }

  /**
   * 一覧から直接公開状態を切り替える（モーダルを開かずに切り替え可能）。失敗したら表示は元のままエラーを出す
   * @param a - 切り替える記事
   * @returns 戻り値なし。
   */
  const togglePublish = async (a: Article) => {
    setBusyId(a.id)
    setPageError('')
    try {
      // 公開状態を反転した記事を保存し、一覧へ返却値を反映する。
      const updated = await api.articles.update(a.id, {
        title: a.title,
        content: a.content ?? '',
        image_urls: a.image_urls,
        tags: a.tags,
        product_ids: a.product_ids ?? [],
        is_published: !a.is_published,
        display_order: a.display_order,
      })
      setArticles((prev) => prev.map((x) => x.id === updated.id ? updated : x))
    } catch (e) {
      setPageError(failMessage(`「${a.title}」の公開状態の切り替えに失敗しました`, e))
    } finally {
      setBusyId(null)
    }
  }

  /** 編集モーダルの入力欄（タイトル・タグ）の共通の見た目。横幅いっぱい */
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px',
    border: '1px solid #dddde8', fontSize: 14, fontFamily: 'inherit',
    color: 'var(--c-ink)', background: '#fff', outline: 'none',
  }

  return (
    <div>
      {/* 見出しと記事追加ボタン */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, margin: 0 }}>記事管理</h2>
        <button onClick={openNew} style={{ padding: '9px 20px', background: 'var(--c-ink)', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          + 記事追加
        </button>
      </div>

      {/* 一覧の操作の失敗 */}
      {pageError && <p role="alert" style={errorBoxStyle}>{pageError}</p>}

      {/* 記事の表（狭い幅では横にスクロール） */}
      <ArticlesList
        articles={articles}
        loading={loading}
        hasPageError={Boolean(pageError)}
        busyId={busyId}
        onTogglePublish={togglePublish}
        onEdit={openEdit}
        onDelete={handleDelete}
      />

      {/* 編集モーダル（暗い背景を押すと、変更があれば確認してから閉じる） */}
      {editing !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={closeByBackdrop}>
          <div role="dialog" aria-modal="true" aria-labelledby="article-modal-title" style={{ background: '#fff', maxWidth: 680, width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: 32 }} onClick={(e) => e.stopPropagation()}>
            <h3 id="article-modal-title" style={{ margin: '0 0 24px', fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontWeight: 300, fontSize: 22 }}>
              {editing === 'new' ? '記事追加' : '記事編集'}
            </h3>

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="article-title" style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>タイトル *</label>
              <input id="article-title" required style={inputStyle} value={form.title} onChange={(e) => set('title', e.target.value)} />
            </div>

            <div style={{ marginBottom: 20 }}>
              {/* ブロックエディタは複数の入力欄の集まりなので、label ではなく見出しの文字にする */}
              <p style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, margin: '0 0 10px' }}>本文・画像</p>
              <BlockEditor blocks={blocks} onChange={setBlocks} />
            </div>

            {/* タグ（付いているタグの一覧と、追加の入力欄） */}
            <div style={{ marginBottom: 20 }}>
              <label htmlFor="article-tag-input" style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, marginBottom: 6 }}>タグ</label>
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
                  id="article-tag-input"
                  style={{ ...inputStyle, flex: 1 }}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                  placeholder="タグを入力して Enter"
                />
                <button onClick={addTag} style={{ padding: '9px 16px', border: '1px solid #dddde8', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>追加</button>
              </div>
            </div>

            {/* 関連商品（商品が1つも無ければ出さない） */}
            {products.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                {/* 中の各商品はチェックボックスを label で包んでいるので、ここは見出しの文字にする */}
                <p style={{ display: 'block', fontSize: 11, color: '#999', letterSpacing: 1, margin: '0 0 8px' }}>関連商品（記事から購入できる商品）</p>
                <div style={{ border: '1px solid #dddde8', maxHeight: 220, overflowY: 'auto' }}>
                  {products.map((p) => {
                    /** この商品を関連商品に選んでいるか */
                    const selected = (form.product_ids ?? []).includes(p.id)
                    return (
                      <label
                        key={p.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                          borderBottom: '1px solid #f0f0f5', cursor: 'pointer',
                          background: selected ? '#f0f7f0' : '#fff',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleProduct(p.id)}
                          style={{ flexShrink: 0 }}
                        />
                        {p.image_urls[0] && (
                          <img src={p.image_urls[0]} alt="" style={{ width: 36, height: 36, objectFit: 'cover', flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--c-muted)' }}>{formatYen(p.price)}{p.stock === 0 && <span style={{ color: '#c0392b', marginLeft: 8 }}>売り切れ</span>}</p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

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
