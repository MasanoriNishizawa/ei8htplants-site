import { useEffect, useState } from 'react'
import { api, type Stockist, type StockistBody } from '../../lib/api'
import { SHORT_BRAND_NAMES } from '../../lib/brands'
import { failMessage } from './errorMessage'
import { confirmDiscard, dirtySnapshotJson, useDirtyTracker, useEscapeToClose, useUnsavedChanges } from './UnsavedChanges'

/** 追加・編集フォームの入力（未入力は空文字。保存するときに null にする） */
type Form = { name: string; area: string; address: string; url: string; brands: string[] }
/** フォームの初期値（すべて未入力） */
const empty: Form = { name: '', area: '', address: '', url: '', brands: [] }

/** 追加フォーム・編集のダイアログの入力欄の共通の見た目（横幅いっぱい） */
const inputStyle: React.CSSProperties = { padding: '10px 14px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 15, fontFamily: 'inherit', background: '#ffffff', width: '100%', boxSizing: 'border-box' }

/**
 * フォームの入力を API に送る形にする（空の項目は null）
 * @param f - フォームの入力
 * @returns 送る内容
 */
function toBody(f: Form): StockistBody {
  return {
    name: f.name,
    area: f.area || null,
    address: f.address || null,
    url: f.url || null,
    brands: f.brands,
  }
}

/**
 * ブランドのチェックボックス群コンポーネント
 * @param value - 現在選択されているブランドの配列
 * @param onChange - 選択が変更された際のコールバック（新しい選択の配列を渡す）
 * @returns ブランドごとのチェックボックスを横に並べたもの
 */
function BrandCheckboxes({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  /**
   * ブランドの選択を切り替える（選ばれていれば外し、無ければ足す）
   * @param b - 切り替えるブランド
   */
  const toggle = (b: string) =>
    onChange(value.includes(b) ? value.filter((x) => x !== b) : [...value, b])
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {SHORT_BRAND_NAMES.map((b) => (
        <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer', color: 'var(--c-body)' }}>
          <input type="checkbox" checked={value.includes(b)} onChange={() => toggle(b)} />
          {b}
        </label>
      ))}
    </div>
  )
}

/**
 * 取扱店（卸先）の追加・編集・削除を管理するページ
 * @returns 追加フォーム・編集のダイアログ・登録済みの一覧
 */
export default function AdminStockists() {
  /** 登録済みの取扱店 */
  const [stockists, setStockists] = useState<Stockist[]>([])
  /** 追加フォームの入力 */
  const [form, setForm] = useState<Form>(empty)
  /** 編集中の取扱店（null なら編集のダイアログを閉じている） */
  const [editing, setEditing] = useState<Stockist | null>(null)
  /** 編集のダイアログの入力 */
  const [editForm, setEditForm] = useState<Form>(empty)
  /** 追加・編集を保存中なら true */
  const [saving, setSaving] = useState(false)
  /** 読み込み・保存・削除の失敗の文言。null なら出さない */
  const [error, setError] = useState<string | null>(null)
  /** 編集のダイアログを開いたときの値を基準にした、未保存の変更の判定（開くたびに基準を置き直す） */
  // 取扱ブランドは選んだ順に意味が無いので、外して付け直しても「変更あり」にならないよう並べ替えて比べる
  const { isDirty: editChanged, resetBaseline } = useDirtyTracker({ ...editForm, brands: [...editForm.brands].sort() })
  /** 編集のダイアログを開いていて、開いたときから入力が変わっているか */
  const editDirty = editing !== null && editChanged
  /** 追加フォームに書きかけの入力があるか（追加に成功したらフォームを空にするので確認は出なくなる） */
  const addDirty = dirtySnapshotJson(form) !== dirtySnapshotJson(empty)
  // 書きかけ・未保存の入力をサイドメニューの確認・再読み込みの確認に使えるよう登録する
  useUnsavedChanges(addDirty || editDirty)

  /**
   * 一覧を読み込み直す。失敗したら文言を出す
   * @returns 読み込みが終わる Promise
   */
  const load = () => api.stockists.list()
    .then(setStockists)
    .catch((e: unknown) => setError(failMessage('取扱店の読み込みに失敗しました', e)))
  // 画面を開いたときに一覧を読み込む
  useEffect(() => { load() }, [])

  /**
   * 追加フォームの内容を登録する。失敗したら入力を残したまま文言を出す
   * @param e - フォームの送信イベント
   */
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.stockists.add(toBody(form))
      setForm(empty)
      await load()
    } catch (err: unknown) {
      setError(failMessage('追加に失敗しました', err))
    } finally {
      setSaving(false)
    }
  }

  /**
   * 編集のダイアログを開き、取扱店の今の値を入力欄に入れる
   * @param s - 編集する取扱店
   */
  const startEdit = (s: Stockist) => {
    /** 編集のダイアログに入れる値 */
    const next: Form = { name: s.name, area: s.area ?? '', address: s.address ?? '', url: s.url ?? '', brands: s.brands ?? [] }
    setEditing(s)
    setEditForm(next)
    resetBaseline({ ...next, brands: [...next.brands].sort() })
  }

  /** 編集のダイアログを閉じる（キャンセル・幕・Esc。保存中は閉じず、書きかけなら確認し、閉じたら失敗の文言も消す） */
  const closeEdit = () => {
    if (saving) return
    if (!confirmDiscard(editDirty)) return
    setEditing(null)
    setError(null)
  }
  // 編集のダイアログを開いているあいだは Esc キーでも閉じる（記事・商品のモーダルと同じ扱い）
  useEscapeToClose(editing !== null, closeEdit)

  /**
   * 編集の内容を保存する。成功したらダイアログを閉じて一覧を読み込み直す。失敗したらダイアログを開いたまま文言を出す
   * @param e - フォームの送信イベント
   */
  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    setError(null)
    try {
      await api.stockists.patch(editing.id, toBody(editForm))
      setEditing(null)
      await load()
    } catch (err: unknown) {
      setError(failMessage('保存に失敗しました', err))
    } finally {
      setSaving(false)
    }
  }

  /**
   * 確認してから 1 件削除する。失敗したら一覧はそのままにして文言を出す
   * @param id - 削除する取扱店の id
   */
  const del = async (id: string) => {
    if (!confirm('削除しますか？')) return
    setError(null)
    try {
      await api.stockists.delete(id)
      setStockists((prev) => prev.filter((s) => s.id !== id))
    } catch (err: unknown) {
      setError(failMessage('削除に失敗しました', err))
    }
  }

  return (
    <div>
      <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, marginBottom: 24 }}>取扱店管理</h2>

      {/* 読み込み・保存・削除の失敗（編集のダイアログの中にも同じ文言を出す） */}
      {error && !editing && (
        <p role="alert" style={{ color: '#c0392b', fontSize: 13, margin: '0 0 16px', padding: '8px 14px', background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0' }}>{error}</p>
      )}

      {/* 追加フォーム */}
      <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32, padding: 20, background: '#ffffff', borderRadius: 4, border: '1px solid #dddde8' }}>
        <div><input required aria-label="店舗名" placeholder="店舗名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} /></div>
        <div><input aria-label="エリア" placeholder="エリア（例: 東京）" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} style={inputStyle} /></div>
        <div><input aria-label="住所" placeholder="住所" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={inputStyle} /></div>
        <div><input type="url" aria-label="URL" placeholder="URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} style={inputStyle} /></div>
        <div style={{ gridColumn: '1 / -1' }}>
          <p style={{ fontSize: 12, color: 'var(--c-muted)', margin: '0 0 8px', letterSpacing: 1 }}>取扱ブランド</p>
          <BrandCheckboxes value={form.brands} onChange={(brands) => setForm({ ...form, brands })} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: 'var(--c-ink)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>追加</button>
        </div>
      </form>

      {/* 編集のダイアログ（画面を暗くした上に出す。暗い背景を押したら、書きかけなら確認してから閉じる） */}
      {editing && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeEdit() }}
        >
          <form onSubmit={saveEdit} role="dialog" aria-modal="true" aria-label="取扱店を編集" style={{ background: '#ffffff', borderRadius: 4, padding: 32, width: 480, maxWidth: '90vw', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <h3 style={{ gridColumn: '1 / -1', fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 20, fontWeight: 300, margin: '0 0 8px' }}>取扱店を編集</h3>
            {error && (
              <p role="alert" style={{ gridColumn: '1 / -1', color: '#c0392b', fontSize: 13, margin: 0, padding: '8px 14px', background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0' }}>{error}</p>
            )}
            <div><input required aria-label="店舗名" placeholder="店舗名" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} style={inputStyle} /></div>
            <div><input aria-label="エリア" placeholder="エリア" value={editForm.area} onChange={(e) => setEditForm({ ...editForm, area: e.target.value })} style={inputStyle} /></div>
            <div><input aria-label="住所" placeholder="住所" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} style={inputStyle} /></div>
            <div><input type="url" aria-label="URL" placeholder="URL" value={editForm.url} onChange={(e) => setEditForm({ ...editForm, url: e.target.value })} style={inputStyle} /></div>
            <div style={{ gridColumn: '1 / -1' }}>
              <p style={{ fontSize: 12, color: 'var(--c-muted)', margin: '0 0 8px', letterSpacing: 1 }}>取扱ブランド</p>
              <BrandCheckboxes value={editForm.brands} onChange={(brands) => setEditForm({ ...editForm, brands })} />
            </div>
            {/* キャンセル（書きかけなら確認し、閉じて失敗の文言も消す）・保存 */}
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" onClick={closeEdit} style={{ padding: '10px 20px', background: 'none', border: '1px solid #dddde8', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}>キャンセル</button>
              <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: 'var(--c-ink)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}>保存</button>
            </div>
          </form>
        </div>
      )}

      {/* 登録済みの一覧 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {stockists.map((s) => (
          <div key={s.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', padding: '14px 18px', background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, gap: 10 }}>
            {/* 店舗名・エリアと住所・取扱ブランド */}
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontWeight: 500 }}>{s.name}</div>
              <div style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 2 }}>{[s.area, s.address].filter(Boolean).join(' / ')}</div>
              {s.brands?.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {s.brands.map((b) => (
                    <span key={b} style={{ fontSize: 11, background: '#eee8da', color: 'var(--c-body)', padding: '2px 8px', borderRadius: 4, letterSpacing: 0.5 }}>{b}</span>
                  ))}
                </div>
              )}
            </div>
            {/* 編集・削除ボタン */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={() => startEdit(s)} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, background: 'none', cursor: 'pointer', color: 'var(--c-body)' }}>編集</button>
              <button onClick={() => del(s.id)} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, color: '#c0392b', background: 'none', cursor: 'pointer' }}>削除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
