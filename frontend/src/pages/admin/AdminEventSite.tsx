import { cloneElement, isValidElement, useEffect, useId, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, type Event, type PageContent } from '../../lib/api'
import { failMessage } from './errorMessage'
import { useDirtyTracker, useUnsavedChanges } from './UnsavedChanges'

/** ラインナップの1件（名称・説明・画像） */
type LineupItem = NonNullable<PageContent['lineup']>[number]
/** ゲスト・出展者の1件（名前・肩書き・プロフィール・画像・Instagram） */
type GuestItem = NonNullable<PageContent['guests']>[number]

/** 各カードの入力欄（input・textarea）の共通の見た目。横幅いっぱい */
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #dddde8', borderRadius: 4,
  fontSize: 14, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box',
}

/** Field の項目名の見た目 */
const fieldLabelStyle: React.CSSProperties = { display: 'block', fontSize: 12, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 6 }

/**
 * ラベル付きフォームフィールドのラッパーコンポーネント
 * 1. 中身が input・textarea・select の1つだけなら、useId で作った id を付けて label の htmlFor で結び付ける
 *    （項目名を押すと入力欄に移り、読み上げでも項目名が入力欄の名前になる）
 * 2. それ以外（画像の選択・表示だけの欄など）は、結び付ける先が無いので項目名を文字として出す
 * @param label - フィールド上部に表示するラベルテキスト
 * @param children - フィールドの入力要素
 * @returns 項目名と入力要素
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  /** 入力欄に付ける id（label の htmlFor と結び付ける） */
  const id = useId()
  // 1. 入力欄1つだけかどうか
  /** 中身が input・textarea・select の1つだけなら true */
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
          {/* 2. 結び付ける先が無い欄 */}
          <span style={fieldLabelStyle}>{label}</span>
          {children}
        </>
      )}
    </div>
  )
}

/**
 * セクションを囲むカードコンポーネント
 * @param title - カード上部に表示する見出しテキスト
 * @param children - カード内のコンテンツ
 * @returns 見出しつきの白いカード
 */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, padding: 24 }}>
      <h3 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 18, fontWeight: 300, letterSpacing: 2, margin: '0 0 20px', paddingBottom: 12, borderBottom: '1px solid #dddde8' }}>{title}</h3>
      {children}
    </div>
  )
}

/**
 * 画像アップロード入力コンポーネント。ファイル選択後にアップロードして URL を返す
 * @param value - 現在の画像 URL
 * @param onChange - 画像 URL が変更された際のコールバック（削除したときは空文字を渡す）
 * @returns 四角いサムネイル（押すとファイルを選べる）と削除ボタン
 */
function ImageInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  /** アップロード中なら true（枠を薄くし、ファイル選択を止める） */
  const [uploading, setUploading] = useState(false)
  /**
   * 選んだ画像をアップロードし、URL を onChange で返す（失敗したら alert で知らせる）
   * @param e - ファイル選択の change イベント
   * @returns 戻り値なし。
   */
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    /** 選ばれたファイル（選ぶのをやめたときは undefined） */
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await api.upload(file)
      onChange(url)
    } catch {
      alert('アップロードに失敗しました')
    } finally {
      setUploading(false)
      // 同じファイルを選び直しても change が起きるよう、選択を空に戻す
      e.target.value = ''
    }
  }
  /** サムネイルの枠（ファイルを選ぶ label）の見た目。88px の正方形 */
  const thumb: React.CSSProperties = {
    width: 88, height: 88, borderRadius: 4, border: '1px solid #dddde8',
    overflow: 'hidden', position: 'relative', flexShrink: 0, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#f5f5f8',
  }
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <label style={{ ...thumb, opacity: uploading ? 0.5 : 1 }}>
        {value && !value.startsWith('blob:') ? (
          <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 24, color: '#aaa' }}>{uploading ? '…' : '+'}</span>
        )}
        <input type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} disabled={uploading} />
      </label>
      {/* 画像があるときだけ出す削除ボタン */}
      {value && !value.startsWith('blob:') && (
        <button
          type="button"
          onClick={() => onChange('')}
          style={{ fontSize: 12, color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          削除
        </button>
      )}
    </div>
  )
}

/** エラーの帯の見た目（ほかの管理画面と同じ赤い帯） */
const errorBoxStyle: React.CSSProperties = {
  color: '#c0392b', fontSize: 13, margin: '0 0 16px', padding: '8px 14px',
  background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0',
}

/**
 * ギャラリー画像 URL の入力（1行1URL の文字）を URL の配列にする（前後の空白を除き、空行は捨てる）
 * @param text - テキストエリアの文字
 * @returns URL の配列
 */
function parseGalleryText(text: string): string[] {
  return text.split('\n').map((s) => s.trim()).filter(Boolean)
}

/**
 * 空の公開ページコンテンツを作る（保存済みの内容に足りない項目を補うのにも使う）
 * @returns すべて未入力・アーカイブ表示なしの内容
 */
function emptyContent(): PageContent {
  return {
    hero: { image_url: '', tagline: '', subtitle: '' },
    venue: { address: '', access: '', map_url: '' },
    concept: '',
    lineup: [],
    workshop: null,
    guests: [],
    archive: { enabled: false, title: '', message: '', gallery: [] },
  }
}

/**
 * イベントの公開ページコンテンツ（Hero・会場・コンセプト・ラインナップ・アーカイブ等）を編集するページ
 * URL: /admin/events/:id/site
 * @returns 編集フォーム（読み込み前は「読み込み中...」）
 */
export default function AdminEventSite() {
  /** URL の :id（対象のイベントの id） */
  const { id } = useParams<{ id: string }>()
  /** 対象のイベント（読み込み前は null） */
  const [event, setEvent] = useState<Event | null>(null)
  /** 編集中の公開ページコンテンツ */
  const [pc, setPc] = useState<PageContent>(emptyContent())
  /** 保存中なら true */
  const [saving, setSaving] = useState(false)
  /** 保存できた直後なら true（2.5 秒だけボタンを「保存しました」にする） */
  const [saved, setSaved] = useState(false)
  /** 読み込みの失敗の文言（空なら失敗なし） */
  const [loadError, setLoadError] = useState('')
  /** 保存の失敗の文言（空なら出さない） */
  const [saveError, setSaveError] = useState('')
  /** 読み込みをやり直すたびに 1 増やす数（「再読み込み」ボタンで読み込みの effect を動かし直すため） */
  const [reloadKey, setReloadKey] = useState(0)
  /**
   * ギャラリー画像 URL のテキストエリアの文字（入力中はそのまま持つ）
   * 入力のたびに配列にすると空行が消えて末尾で改行できないため、フォーカスが外れたときと保存のときに配列にする
   */
  const [galleryText, setGalleryText] = useState('')
  /** 未保存の変更があるか（読み込み直後・保存した直後の値を基準にする。読み込み前・失敗時は変更なし） */
  const { isDirty, resetBaseline } = useDirtyTracker({ pc, galleryText })
  // 未保存の変更をサイドメニューの確認・再読み込みの確認に使えるよう登録する（保存に成功したら基準を置き直すので確認は出ない）
  useUnsavedChanges(isDirty)

  /*
   * イベントを読み込んでフォームに入れる
   * 1. 既存の page_content を emptyContent とマージして初期化する（欠落フィールドを補完する）
   * 2. ギャラリー画像 URL はテキストエリア用に1行1URLの文字にする
   * 3. 失敗したら、空のフォームで上書き保存しないよう案内だけ出す（再読み込みできる）
   */
  useEffect(() => {
    if (!id) return
    setLoadError('')
    api.events.get(id).then((ev) => {
      setEvent(ev)
      /** 保存済みの公開ページコンテンツ（まだ無ければ空） */
      const saved = ev.page_content ?? {}
      /** 空の内容とマージした、読み込んだ公開ページコンテンツ */
      const loadedPc: PageContent = {
        ...emptyContent(),
        ...saved,
        hero: { ...emptyContent().hero, ...saved.hero },
        venue: { ...emptyContent().venue, ...saved.venue },
        workshop: saved.workshop ?? null,
        archive: { ...emptyContent().archive, ...saved.archive, enabled: saved.archive?.enabled ?? false },
      }
      setPc(loadedPc)
      // 2. ギャラリーの文字
      /** ギャラリー画像 URL のテキストエリアの文字（1行1URL） */
      const loadedGallery = (saved.archive?.gallery ?? []).join('\n')
      setGalleryText(loadedGallery)
      // 読み込んだ値を、未保存の変更の判定の基準にする
      resetBaseline({ pc: loadedPc, galleryText: loadedGallery })
    }).catch((e: unknown) => {
      // 3. 失敗
      setLoadError(failMessage('イベントの読み込みに失敗しました', e))
    })
    // resetBaseline は入力のたびに作り直されるが、読み込みは id・再読み込みのときだけにする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reloadKey])

  /**
   * 編集内容を保存する
   * 1. ギャラリー画像 URL の入力を配列にして内容に入れ、保存中にして API に送る
   * 2. 公開サイト側のキャッシュを捨てさせる印を立て、2.5 秒「保存しました」を出す
   * 3. 失敗したら文言を出す（入力は残る）
   * 4. 成功・失敗どちらでも保存中を戻す
   * @returns 戻り値なし。
   */
  const save = async () => {
    if (!id) return
    // 1. 保存
    /** 送る内容（ギャラリーはテキストエリアの最新の文字から作る） */
    const content: PageContent = {
      ...pc,
      archive: { ...emptyContent().archive, ...pc.archive, enabled: pc.archive?.enabled ?? false, gallery: parseGalleryText(galleryText) },
    }
    setPc(content)
    setSaving(true)
    setSaveError('')
    try {
      await api.events.savePageContent(id, content)
      // 2. 公開サイト側のキャッシュ無効化フラグを立てる（localStorage が使えない環境では何もしない）
      try { localStorage.setItem(`event_dirty_${id}`, '1') } catch { /* ignore */ }
      // 保存した内容を未保存の変更の判定の基準にする（保存後は確認を出さない）
      resetBaseline({ pc: content, galleryText })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      // 3. 失敗
      setSaveError(failMessage('保存に失敗しました', e))
    } finally {
      // 4. 保存中を戻す
      setSaving(false)
    }
  }

  /**
   * 公開ページコンテンツの1項目をまるごと差し替える
   * @param key - 項目名（concept・lineup など）
   * @param val - 新しい値
   * @returns 戻り値なし。
   */
  const set = <K extends keyof PageContent>(key: K, val: PageContent[K]) =>
    setPc((p) => ({ ...p, [key]: val }))

  /**
   * Hero の1項目を変える
   * @param key - 項目名（tagline・subtitle など）
   * @param val - 新しい値
   * @returns 戻り値なし。
   */
  const setHero = (key: string, val: string) =>
    setPc((p) => ({ ...p, hero: { ...p.hero, [key]: val } }))

  /**
   * 開催情報（venue）の1項目を変える
   * @param key - 項目名（access など）
   * @param val - 新しい値
   * @returns 戻り値なし。
   */
  const setVenue = (key: string, val: string) =>
    setPc((p) => ({ ...p, venue: { ...p.venue, [key]: val } }))

  /**
   * アーカイブの1項目を変える（アーカイブがまだ無ければ空の内容を補ってから変える）
   * @param key - 項目名（enabled・title・message・gallery）
   * @param val - 新しい値
   * @returns 戻り値なし。
   */
  const setArchive = (key: string, val: string | boolean | string[]) =>
    setPc((p) => ({ ...p, archive: { ...emptyContent().archive, ...p.archive, enabled: p.archive?.enabled ?? false, [key]: val } }))

  /**
   * ラインナップの i 番目の一部を変える
   * @param i - 何番目か（0始まり）
   * @param patch - 変える項目と値
   * @returns 戻り値なし。
   */
  const setLineupItem = (i: number, patch: Partial<LineupItem>) =>
    set('lineup', (pc.lineup ?? []).map((it, j) => j === i ? { ...it, ...patch } : it))

  /**
   * ゲストの i 番目の一部を変える
   * @param i - 何番目か（0始まり）
   * @param patch - 変える項目と値
   * @returns 戻り値なし。
   */
  const setGuestItem = (i: number, patch: Partial<GuestItem>) =>
    set('guests', (pc.guests ?? []).map((g, j) => j === i ? { ...g, ...patch } : g))

  // 読み込みに失敗したら、編集フォームは出さずに案内と再読み込みボタンだけ出す
  if (loadError) {
    return (
      <div role="alert" style={errorBoxStyle}>
        <p style={{ margin: '0 0 10px' }}>{loadError}</p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          style={{ padding: '6px 16px', border: '1px solid #dddde8', borderRadius: 4, background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--c-body)' }}
        >
          再読み込み
        </button>
      </div>
    )
  }
  if (!event) return <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p>

  /** アーカイブ表示にしているか（オンのときだけアーカイブの入力欄を出す） */
  const isArchived = pc.archive?.enabled ?? false

  return (
    <div>
      {/* 見出し・イベント名と、公開ページのプレビュー（新しいタブ）・保存ボタン */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 24, fontWeight: 300, margin: '0 0 6px' }}>サイト編集</h2>
          <p style={{ fontSize: 13, color: 'var(--c-muted)', margin: 0 }}>{event.name}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link to={`/official/events/${event.slug ?? id}`} target="_blank" style={{ fontSize: 13, color: 'var(--c-muted)', textDecoration: 'none', borderBottom: '1px solid #dddde8', paddingBottom: 2 }}>
            プレビュー →
          </Link>
          <button
            onClick={save}
            disabled={saving}
            style={{ padding: '10px 24px', background: saved ? '#4a6741' : '#1c2417', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, transition: 'background 0.3s' }}
          >
            {saved ? '保存しました' : saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {/* 保存の失敗（入力は残っているので、もう一度「保存」を押せる） */}
      {saveError && <p role="alert" style={errorBoxStyle}>{saveError}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Hero */}
        <Card title="Hero">
          <Field label="キャッチコピー">
            <input value={pc.hero?.tagline ?? ''} onChange={(e) => setHero('tagline', e.target.value)} placeholder="植物と出会う2日間" style={inputStyle} />
          </Field>
          <Field label="サブタイトル">
            <input value={pc.hero?.subtitle ?? ''} onChange={(e) => setHero('subtitle', e.target.value)} style={inputStyle} />
          </Field>
        </Card>

        {/* 開催情報 */}
        <Card title="開催情報">
          <Field label="住所（イベント情報から自動取得）">
            <div style={{ padding: '9px 12px', background: '#f5f5f8', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, color: 'var(--c-body)' }}>
              {event.address ? (
                <>
                  <span>{event.address}</span>
                  <a
                    href={`https://www.google.com/maps/search/${encodeURIComponent(event.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ marginLeft: 12, fontSize: 12, color: '#4a6741', textDecoration: 'underline', textUnderlineOffset: 3 }}
                  >
                    Google マップで確認
                  </a>
                </>
              ) : (
                <span style={{ color: '#aaa' }}>イベントに住所が登録されていません</span>
              )}
            </div>
          </Field>
          <Field label="アクセス">
            <input value={pc.venue?.access ?? ''} onChange={(e) => setVenue('access', e.target.value)} placeholder="○○駅から徒歩5分" style={inputStyle} />
          </Field>
        </Card>

        {/* コンセプト */}
        <Card title="コンセプト">
          <textarea
            value={pc.concept ?? ''}
            onChange={(e) => set('concept', e.target.value)}
            rows={6}
            placeholder="イベントのコンセプトを入力..."
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.8 }}
          />
        </Card>

        {/* ラインナップ */}
        <Card title="ラインナップ">
          {(pc.lineup ?? []).map((item, i) => (
            <div key={i} style={{ border: '1px solid #e4e4ee', borderRadius: 4, padding: '16px 16px 4px', marginBottom: 12 }}>
              {/* 何件目かと、この1件の削除ボタン */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--c-muted)', letterSpacing: 1 }}>ラインナップ {i + 1}</span>
                <button onClick={() => set('lineup', (pc.lineup ?? []).filter((_, j) => j !== i))} style={{ padding: '4px 10px', border: '1px solid #f0b8ae', borderRadius: 2, fontSize: 12, color: '#c0392b', background: 'none', cursor: 'pointer' }}>削除</button>
              </div>
              <Field label="名称">
                <input value={item.title} onChange={(e) => setLineupItem(i, { title: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="説明">
                <textarea value={item.description ?? ''} onChange={(e) => setLineupItem(i, { description: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </Field>
              <Field label="画像">
                <ImageInput value={item.image_url ?? ''} onChange={(v) => setLineupItem(i, { image_url: v })} />
              </Field>
            </div>
          ))}
          <button onClick={() => set('lineup', [...(pc.lineup ?? []), { title: '', description: '', image_url: '' }])}
            style={{ padding: '9px 20px', border: '1px dashed #b0b0c4', borderRadius: 4, fontSize: 13, color: 'var(--c-muted)', background: 'none', cursor: 'pointer', width: '100%' }}>
            + ラインナップを追加
          </button>
        </Card>

        {/* ゲスト・出展者 */}
        <Card title="ゲスト・出展者">
          {(pc.guests ?? []).map((guest, i) => (
            <div key={i} style={{ border: '1px solid #e4e4ee', borderRadius: 4, padding: '16px 16px 4px', marginBottom: 12 }}>
              {/* 何件目かと、この1件の削除ボタン */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--c-muted)', letterSpacing: 1 }}>ゲスト {i + 1}</span>
                <button onClick={() => set('guests', (pc.guests ?? []).filter((_, j) => j !== i))} style={{ padding: '4px 10px', border: '1px solid #f0b8ae', borderRadius: 2, fontSize: 12, color: '#c0392b', background: 'none', cursor: 'pointer' }}>削除</button>
              </div>
              <Field label="名前">
                <input value={guest.name} onChange={(e) => setGuestItem(i, { name: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="役割・肩書き">
                <input value={guest.role ?? ''} onChange={(e) => setGuestItem(i, { role: e.target.value })} placeholder="陶芸作家" style={inputStyle} />
              </Field>
              <Field label="プロフィール">
                <textarea value={guest.bio ?? ''} onChange={(e) => setGuestItem(i, { bio: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </Field>
              <Field label="プロフィール画像">
                <ImageInput value={guest.image_url ?? ''} onChange={(v) => setGuestItem(i, { image_url: v })} />
              </Field>
              <Field label="Instagram URL">
                <input value={guest.instagram_url ?? ''} onChange={(e) => setGuestItem(i, { instagram_url: e.target.value })} placeholder="https://www.instagram.com/..." style={inputStyle} />
              </Field>
            </div>
          ))}
          <button onClick={() => set('guests', [...(pc.guests ?? []), { name: '', role: '', bio: '', image_url: '', instagram_url: '' }])}
            style={{ padding: '9px 20px', border: '1px dashed #b0b0c4', borderRadius: 4, fontSize: 13, color: 'var(--c-muted)', background: 'none', cursor: 'pointer', width: '100%' }}>
            + ゲストを追加
          </button>
        </Card>

        {/* アーカイブ */}
        <Card title="アーカイブ">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, cursor: 'pointer', fontSize: 14, color: 'var(--c-body)' }}>
            <input type="checkbox" checked={isArchived} onChange={(e) => setArchive('enabled', e.target.checked)} style={{ width: 16, height: 16 }} />
            アーカイブ表示にする（イベント終了後）
          </label>
          {/* アーカイブ表示のときだけ、タイトル・メッセージ・ギャラリーを入力する */}
          {isArchived && (
            <>
              <Field label="タイトル">
                <input value={pc.archive?.title ?? ''} onChange={(e) => setArchive('title', e.target.value)} placeholder="ご来場ありがとうございました" style={inputStyle} />
              </Field>
              <Field label="メッセージ">
                <textarea value={pc.archive?.message ?? ''} onChange={(e) => setArchive('message', e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
              </Field>
              <Field label="ギャラリー画像 URL（1行1URL）">
                <textarea
                  value={galleryText}
                  onChange={(e) => setGalleryText(e.target.value)}
                  onBlur={() => setArchive('gallery', parseGalleryText(galleryText))}
                  rows={5}
                  placeholder="https://..."
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                />
              </Field>
            </>
          )}
        </Card>

      </div>
    </div>
  )
}
