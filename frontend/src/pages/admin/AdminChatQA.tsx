import { useEffect, useState } from 'react'
import { api, type ChatQA, type ChatQABody } from '../../lib/api'
import { failMessage } from './errorMessage'
import { confirmDiscard, useDirtyTracker, useEscapeToClose, useUnsavedChanges } from './UnsavedChanges'

/**
 * 追加フォームの初期値を作る
 * @returns 空の質問・回答、表示順 0、有効
 */
const emptyForm = (): ChatQABody => ({
  question: '',
  answer: '',
  sort_order: 0,
  enabled: true,
})

/**
 * AIチャット用Q&A管理画面。追加・編集・削除・有効/無効の切り替えが可能
 * @returns 追加・編集フォームと Q&A の一覧
 */
export default function AdminChatQA() {
  /** 登録済みの Q&A（無効のものも含む全件） */
  const [items, setItems] = useState<ChatQA[]>([])
  /** 一覧を読み込み中か */
  const [loading, setLoading] = useState(true)
  /** 編集中の Q&A の id（'new' なら追加、null ならフォームを閉じている） */
  const [editId, setEditId] = useState<string | null>(null)
  /** 追加・編集フォームの入力内容 */
  const [form, setForm] = useState(emptyForm())
  /** 保存中か（保存ボタンを無効にする） */
  const [saving, setSaving] = useState(false)
  /** 一覧の操作（切り替え・削除）を処理中の Q&A の id（二重押しを防ぐ） */
  const [busyId, setBusyId] = useState<string | null>(null)
  /** 画面に出すエラー（フォームを開いているときはフォームの中、閉じているときは一覧の上に出す） */
  const [error, setError] = useState('')
  /** フォームを開いたときの値を基準にした、未保存の変更の判定（開くたびに基準を置き直す） */
  const { isDirty: formChanged, resetBaseline } = useDirtyTracker(form)
  /** フォームを開いていて、開いたときから入力が変わっているか */
  const isDirty = editId !== null && formChanged
  // 未保存の変更をサイドメニューの確認・再読み込みの確認に使えるよう登録する（保存に成功したらフォームを閉じるので確認は出ない）
  useUnsavedChanges(isDirty)

  /**
   * 一覧を読み直す
   * 1. 読み込み中にする
   * 2. 全件を取得する（失敗したら一覧を空にしてエラーを出す）
   * 3. 読み込み中を戻す
   * @returns 読み込みが終わる Promise
   */
  const load = async () => {
    // 1. 読み込み中にする
    setLoading(true)
    try {
      // 2. 全件を取得
      setItems(await api.chatQa.list())
    } catch (e) {
      setError(failMessage('Q&A の読み込みに失敗しました', e))
      setItems([])
    } finally {
      // 3. 読み込み中を戻す
      setLoading(false)
    }
  }

  // 画面を開いたときに一覧を読み込む
  useEffect(() => { load() }, [])

  /**
   * 既存の Q&A を編集フォームに読み込む
   * @param item - 編集する Q&A
   */
  const startEdit = (item: ChatQA) => {
    // 別の Q&A を書きかけのまま開き直すと入力が消えるので確認する
    if (!confirmDiscard(isDirty)) return
    /** 編集フォームに入れる値 */
    const next: ChatQABody = { question: item.question, answer: item.answer, sort_order: item.sort_order, enabled: item.enabled }
    setEditId(item.id)
    setForm(next)
    resetBaseline(next)
    setError('')
  }

  /** 空の追加フォームを開く（書きかけのフォームがあれば確認する） */
  const startAdd = () => {
    if (!confirmDiscard(isDirty)) return
    /** 空のフォームの値 */
    const next = emptyForm()
    setEditId('new')
    setForm(next)
    resetBaseline(next)
    setError('')
  }

  /** フォームを閉じる（キャンセル・Esc。保存中は閉じず、書きかけなら確認する） */
  const cancel = () => {
    if (saving) return
    if (!confirmDiscard(isDirty)) return
    setEditId(null)
    setError('')
  }
  // フォームを開いているあいだは Esc キーでも閉じる（記事・商品のモーダルと同じ扱い）
  useEscapeToClose(editId !== null, cancel)

  /**
   * フォームの内容を保存する
   * 1. 質問・回答が空なら止める
   * 2. 追加（POST）か更新（PATCH）を送る。失敗したらフォームを開いたままエラーを出す
   * 3. 成功したらフォームを閉じて一覧を読み直す
   * @returns 保存と読み直しが終わる Promise
   */
  const save = async () => {
    // 1. 入力チェック
    if (!form.question.trim() || !form.answer.trim()) { setError('質問と回答を入力してください'); return }
    setSaving(true)
    setError('')
    try {
      // 2. 送信
      if (editId === 'new') await api.chatQa.add(form)
      else if (editId) await api.chatQa.update(editId, form)
    } catch (e) {
      setError(failMessage('保存に失敗しました', e))
      return
    } finally {
      setSaving(false)
    }
    // 3. 閉じて読み直す
    setEditId(null)
    await load()
  }

  /**
   * Q&A を削除する（確認のあと）。失敗したら一覧の上にエラーを出す
   * @param id - 削除する Q&A の id
   * @returns 削除と読み直しが終わる Promise
   */
  const remove = async (id: string) => {
    if (!confirm('削除しますか？')) return
    setBusyId(id)
    setError('')
    try {
      await api.chatQa.delete(id)
    } catch (e) {
      setError(failMessage('削除に失敗しました', e))
      return
    } finally {
      setBusyId(null)
    }
    await load()
  }

  /**
   * 有効・無効を切り替える。失敗したら一覧の上にエラーを出す（表示は変えない）
   * @param item - 切り替える Q&A
   * @returns 切り替えと読み直しが終わる Promise
   */
  const toggleEnabled = async (item: ChatQA) => {
    setBusyId(item.id)
    setError('')
    try {
      await api.chatQa.update(item.id, {
        question: item.question, answer: item.answer, sort_order: item.sort_order, enabled: !item.enabled,
      })
    } catch (e) {
      setError(failMessage('有効・無効の切り替えに失敗しました', e))
      return
    } finally {
      setBusyId(null)
    }
    await load()
  }

  /** 追加・編集フォームの入力欄（質問・回答・表示順）の共通の見た目 */
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid #dddde8',
    borderRadius: 4, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
  }

  return (
    <div style={{ maxWidth: 800 }}>
      {/* 見出しと追加ボタン */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>AIチャット Q&A 管理</h1>
        <button onClick={startAdd} style={{ padding: '8px 16px', background: '#2d3a24', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14, cursor: 'pointer' }}>
          + 追加
        </button>
      </div>

      {/* 使い方の説明 */}
      <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
        ここで登録したQ&Aはチャットのシステムプロンプトに自動で反映されます。有効/無効で一時的に除外できます。
      </p>

      {/* 追加・編集フォーム */}
      {editId !== null && (
        <div style={{ background: '#f9f9fb', border: '1px solid #dddde8', borderRadius: 4, padding: 20, marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 400 }}>{editId === 'new' ? 'Q&A を追加' : 'Q&A を編集'}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 13, color: '#555' }}>
              質問
              <textarea
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
                rows={2}
                style={{ ...inputStyle, marginTop: 4, resize: 'vertical' }}
              />
            </label>
            <label style={{ fontSize: 13, color: '#555' }}>
              回答
              <textarea
                value={form.answer}
                onChange={(e) => setForm({ ...form, answer: e.target.value })}
                rows={4}
                style={{ ...inputStyle, marginTop: 4, resize: 'vertical' }}
              />
            </label>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <label style={{ fontSize: 13, color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
                表示順
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                  style={{ ...inputStyle, width: 80 }}
                />
              </label>
              <label style={{ fontSize: 13, color: '#555', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                />
                有効
              </label>
            </div>
            {/* フォームを開いているあいだのエラー */}
            {error && <p style={{ color: '#c0392b', fontSize: 13, margin: 0 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={save} disabled={saving} style={{ padding: '8px 20px', background: '#2d3a24', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14, cursor: 'pointer' }}>
                {saving ? '保存中...' : '保存'}
              </button>
              <button onClick={cancel} style={{ padding: '8px 16px', background: 'none', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, cursor: 'pointer' }}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* フォームを閉じているときのエラー */}
      {error && editId === null && (
        <p style={{ color: '#c0392b', fontSize: 13, background: '#fdf0ef', padding: '10px 14px', borderRadius: 4 }}>{error}</p>
      )}
      {/* Q&A 一覧（無効のものは薄く出す） */}
      {loading ? (
        <p style={{ color: '#888', fontSize: 14 }}>読み込み中...</p>
      ) : items.length === 0 && !error ? (
        <p style={{ color: '#aaa', fontSize: 14 }}>Q&A がまだ登録されていません。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((item) => (
            <div key={item.id} style={{
              border: '1px solid #dddde8', borderRadius: 4, padding: 16,
              background: item.enabled ? '#fff' : '#fafafa',
              opacity: item.enabled ? 1 : 0.6,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                {/* 質問・回答・表示順 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 500, color: '#2d3a24' }}>
                    Q: {item.question}
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: '#555', whiteSpace: 'pre-wrap' }}>
                    A: {item.answer}
                  </p>
                  <p style={{ margin: '8px 0 0', fontSize: 11, color: '#aaa' }}>表示順: {item.sort_order}</p>
                </div>
                {/* 有効・無効の切り替え・編集・削除（切り替え・削除は処理中は押せない） */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => toggleEnabled(item)}
                    disabled={busyId === item.id}
                    style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #dddde8', borderRadius: 4, cursor: 'pointer', background: '#fff' }}
                  >
                    {item.enabled ? '無効化' : '有効化'}
                  </button>
                  <button
                    onClick={() => startEdit(item)}
                    style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #dddde8', borderRadius: 4, cursor: 'pointer', background: '#fff' }}
                  >
                    編集
                  </button>
                  <button
                    onClick={() => remove(item.id)}
                    disabled={busyId === item.id}
                    style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #e8dddd', borderRadius: 4, cursor: 'pointer', background: '#fff', color: '#c0392b' }}
                  >
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
