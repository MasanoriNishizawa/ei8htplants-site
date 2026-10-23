import { useEffect, useState } from 'react'
import { api, type GalleryImage } from '../../lib/api'
import { failMessage } from './errorMessage'
// 画像に付けられるブランド（追加フォームの選択肢と、一覧の絞り込みのボタン）。保存する値は短い表記（HUE）
import { SHORT_BRAND_NAMES } from '../../lib/brands'

/**
 * ギャラリー画像の追加・削除・表示順変更を管理するページ
 * @returns 追加フォーム・ブランドの絞り込み・画像のグリッド
 */
export default function AdminGallery() {
  /** ギャラリーの画像（表示順） */
  const [images, setImages] = useState<GalleryImage[]>([])
  /** 追加する画像の URL（アップロードが終わると入る） */
  const [url, setUrl] = useState('')
  /** 追加する画像の ALT テキスト */
  const [alt, setAlt] = useState('')
  /** 追加する画像のブランド（空文字は指定なし） */
  const [brand, setBrand] = useState('')
  /** 追加を送信中か */
  const [saving, setSaving] = useState(false)
  /** 画像をアップロード中か */
  const [uploading, setUploading] = useState(false)
  /** 削除・並べ替えを処理中か（二重押しを防ぐ） */
  const [busy, setBusy] = useState(false)
  /** 操作の失敗の文言（空なら出さない） */
  const [error, setError] = useState('')
  /** 読み込みエラーになった画像の id（「URL無効」バッジを出す） */
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set())
  /** 一覧の絞り込みのブランド（null はすべて） */
  const [brandFilter, setBrandFilter] = useState<string | null>(null)

  /**
   * 一覧を読み直す。失敗したらエラーを出す（一覧はそのまま）
   * @returns 読み込みが終わる Promise
   */
  const load = () => api.gallery.list()
    .then(setImages)
    .catch((e: unknown) => setError(failMessage('ギャラリーの読み込みに失敗しました', e)))
  // 画面を開いたときに一覧を読み込む
  useEffect(() => { load() }, [])

  /**
   * 選んだ画像ファイルをアップロードし、追加フォームの URL に入れる。失敗したらエラーを出す
   * @param e - ファイル選択の change イベント
   */
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    /** 選ばれたファイル（選ぶのをやめたときは undefined） */
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const uploaded = await api.upload(file)
      setUrl(uploaded)
    } catch (err) {
      setError(failMessage('画像のアップロードに失敗しました', err))
    } finally {
      setUploading(false)
      // 同じファイルを選び直しても change が起きるよう、選択を空に戻す
      e.target.value = ''
    }
  }

  /**
   * 画像をギャラリーに追加する（URL がまだ無ければ何もしない）
   * 1. 追加を送る
   * 2. 成功したらフォームを空にして一覧を読み直す
   * 3. 失敗したらフォームの入力を残してエラーを出す
   * 4. どちらでも送信中を戻す
   * @param e - フォームの submit イベント
   */
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return
    setSaving(true)
    setError('')
    try {
      await api.gallery.add({ url, alt: alt || null, brand: brand || null })
      setUrl(''); setAlt(''); setBrand('')
      await load()
    } catch (err) {
      setError(failMessage('画像の追加に失敗しました', err))
    } finally {
      setSaving(false)
    }
  }

  /**
   * 画像を削除する（確認のあと）。失敗したら一覧に残したままエラーを出す
   * @param id - 削除する画像の id
   */
  const del = async (id: string) => {
    if (!confirm('削除しますか？')) return
    setBusy(true)
    setError('')
    try {
      await api.gallery.delete(id)
      setImages((prev) => prev.filter((img) => img.id !== id))
    } catch (err) {
      setError(failMessage('削除に失敗しました', err))
    } finally {
      setBusy(false)
    }
  }

  /**
   * 隣の画像と display_order を入れ替えて並び順を変える（全件表示のときだけ使う）
   * 片方だけ保存に成功した場合もあるので、成功・失敗どちらでも一覧を読み直して実際の順を出す
   * @param idx - 動かす画像の位置
   * @param dir - -1 で前へ、1 で後ろへ
   */
  const move = async (idx: number, dir: -1 | 1) => {
    /** 入れ替える相手の位置 */
    const next = dir === -1 ? idx - 1 : idx + 1
    if (next < 0 || next >= images.length) return
    /** 動かす画像（a）と入れ替える相手（b） */
    const a = images[idx], b = images[next]
    setBusy(true)
    setError('')
    try {
      await Promise.all([
        api.gallery.updateOrder(a.id, b.display_order),
        api.gallery.updateOrder(b.id, a.display_order),
      ])
    } catch (err) {
      setError(failMessage('並べ替えに失敗しました', err))
    } finally {
      await load()
      setBusy(false)
    }
  }

  /**
   * ブランドで絞り込んでいるあいだは並べ替えを出さない。
   * 絞り込んだ一覧で隣に見える画像は全体では隣とは限らず、全体の順で入れ替えると見た目と違う動きになるため
   */
  const canReorder = brandFilter === null

  /** 追加フォームの入力欄の共通の見た目 */
  const inputStyle: React.CSSProperties = { padding: '10px 14px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 15, fontFamily: 'inherit', background: '#ffffff' }

  return (
    <div>
      <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, marginBottom: 24 }}>ギャラリー管理</h2>
      {/* 操作の失敗 */}
      {error && (
        <p role="alert" style={{ color: '#c0392b', fontSize: 13, margin: '0 0 16px', padding: '8px 14px', background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0' }}>{error}</p>
      )}
      {/* 追加フォーム（左: 画像の選択とプレビュー、右: ALT・ブランド・追加ボタン） */}
      <form onSubmit={add} style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ width: 88, height: 88, borderRadius: 4, border: '1px solid #dddde8', overflow: 'hidden', flexShrink: 0, cursor: uploading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f8', opacity: uploading ? 0.5 : 1 }}>
          {url ? (
            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 24, color: '#aaa' }}>{uploading ? '…' : '+'}</span>
          )}
          <input type="file" accept="image/*" aria-label="追加する画像を選ぶ" onChange={handleFile} disabled={uploading} style={{ display: 'none' }} />
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 2, minWidth: 200 }}>
          <input aria-label="ALTテキスト（任意）" placeholder="ALTテキスト（任意）" value={alt} onChange={(e) => setAlt(e.target.value)} style={{ ...inputStyle, minWidth: 140 }} />
          <select aria-label="ブランド（任意）" value={brand} onChange={(e) => setBrand(e.target.value)} style={inputStyle}>
            <option value="">ブランド（任意）</option>
            {SHORT_BRAND_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <button type="submit" disabled={!url || saving || uploading} style={{ padding: '10px 24px', background: 'var(--c-ink)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', opacity: !url ? 0.5 : 1 }}>追加</button>
        </div>
      </form>
      {/* ブランドの絞り込みボタン（先頭は「すべて」） */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {[null, ...SHORT_BRAND_NAMES].map((b) => (
          <button key={b ?? 'all'} onClick={() => setBrandFilter(b)} aria-pressed={brandFilter === b}
            style={{ padding: '6px 14px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, cursor: 'pointer', background: brandFilter === b ? 'var(--c-ink)' : '#fff', color: brandFilter === b ? '#fff' : 'var(--c-body)' }}>
            {b ?? 'すべて'}
          </button>
        ))}
      </div>
      {/* 絞り込み中は並べ替えできない旨の案内 */}
      {!canReorder && (
        <p style={{ fontSize: 12, color: 'var(--c-muted)', margin: '0 0 12px' }}>並べ替えは「すべて」を表示しているときにできます。</p>
      )}
      {/* 画像のグリッド（絞り込みに合うものだけ） */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {images.filter((img) => brandFilter === null || img.brand === brandFilter).map((img) => {
          /** 全件の中での位置（並べ替えに使う） */
          const idx = images.indexOf(img)
          return (
          <div key={img.id} style={{ position: 'relative', borderRadius: 4, overflow: 'hidden', aspectRatio: '1/1', background: '#f0f0f5' }}>
            <img
              src={img.url}
              alt={img.alt ?? ''}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => setBrokenIds((prev) => new Set([...prev, img.id]))}
            />
            {/* 画像が読み込めなかったときの「URL無効」バッジ */}
            {brokenIds.has(img.id) && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(192,57,43,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 11, color: '#c0392b', background: '#fff', padding: '3px 10px', borderRadius: 4, fontWeight: 600 }}>URL無効</span>
              </div>
            )}
            {/* 左下: ブランド */}
            {img.brand && (
              <span style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 4, letterSpacing: 1 }}>
                {img.brand}
              </span>
            )}
            {/* 右上: 削除ボタン */}
            <button onClick={() => del(img.id)} disabled={busy} aria-label={`画像「${img.alt || img.url}」を削除`}
              style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 14 }}>
              x
            </button>
            {/* 右下: 前へ・後ろへ（全件表示のときだけ） */}
            {canReorder && (
            <div style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <button onClick={() => move(idx, -1)} disabled={busy || idx === 0} aria-label="前へ移動"
                style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: idx === 0 ? 0.3 : 1 }}>
                ▲
              </button>
              <button onClick={() => move(idx, 1)} disabled={busy || idx === images.length - 1} aria-label="後ろへ移動"
                style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: idx === images.length - 1 ? 0.3 : 1 }}>
                ▼
              </button>
            </div>
            )}
          </div>
        )})}
      </div>
    </div>
  )
}
