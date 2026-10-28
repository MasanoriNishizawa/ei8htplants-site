import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { api, type EventBody } from '../../lib/api'
import { failMessage } from './errorMessage'
import { confirmLeaveIfDirty, useDirtyTracker, useUnsavedChanges } from './UnsavedChanges'
import EventBrandSelector from './EventBrandSelector'
import EventTimeRangeSelect from './EventTimeRangeSelect'
import { formatJaMonthDayDow, listDates } from '../../lib/localDate'
import { WS_DEFAULT_SESSION_CAPACITY } from '../../lib/constants'
import { buildAutoSessions, hasTimeRange, type SessionInput } from './eventTime'

/** エラーの帯の見た目（読み込み・保存の失敗で共通の赤い帯） */
const errorBoxStyle: React.CSSProperties = {
  color: '#c0392b', fontSize: 13, margin: 0, padding: '8px 14px',
  background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0',
}

/**
 * フォームの入力の値（日付・URL などは空文字で「未入力」を表す）
 * name: イベント名 / slug: URL スラッグ / start_date・end_date: 開始日・終了日（YYYY-MM-DD）/ time: 開催時間（「10:00〜17:00」）
 * location: 会場名 / booth_number: ブース番号 / address: 住所 / official_url: 公式サイト URL
 * brands: 販売ブランド（正式名）/ has_workshop: WS あり / ws_requires_reservation: WS は予約が必要
 */
type FormState = {
  name: string; slug: string; start_date: string; end_date: string; time: string
  location: string; booth_number: string; address: string; official_url: string
  brands: string[]; has_workshop: boolean; ws_requires_reservation: boolean
}

/**
 * イベント名から URL スラッグを生成する（英小文字・数字・ハイフンのみ）
 * @param name - 変換するイベント名
 * @returns 生成したスラッグ文字列
 */
function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

/** 新規作成のときのフォームの初期値 */
const empty: FormState = {
  name: '', slug: '', start_date: '', end_date: '', time: '', location: '',
  booth_number: '', address: '', official_url: '',
  brands: [], has_workshop: false, ws_requires_reservation: true,
}

/**
 * イベントの新規作成・編集フォーム。画像アップロードや WS セッション管理も行うページ
 * URL: /admin/events/new（新規）・/admin/events/:id/edit（編集）
 * @returns イベントの入力フォーム
 */
export default function AdminEventForm() {
  /** URL の :id（編集のときだけある。新規作成では undefined） */
  const { id } = useParams()
  /** 保存後・キャンセルでイベント一覧へ戻るための画面移動の関数 */
  const navigate = useNavigate()
  /** フォームの入力の値 */
  const [form, setForm] = useState<FormState>(empty)
  /** 画像の URL（アップロード中は blob: のプレビュー URL が入る） */
  const [imageUrls, setImageUrls] = useState<string[]>([])
  /** WS セッションの入力 */
  const [sessions, setSessions] = useState<SessionInput[]>([])
  /** 保存中か */
  const [saving, setSaving] = useState(false)
  /** アップロード中の最初の画像の位置（null ならアップロード中でない。画面では「アップロード中かどうか」の判定にだけ使っている） */
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
  /** 複数日のイベントで「日ごとに異なる」開催時間を使うか */
  const [dailyTimesMode, setDailyTimesMode] = useState(false)
  /** 日付（YYYY-MM-DD）→ その日の開催時間 */
  const [dailyTimes, setDailyTimes] = useState<Record<string, string>>({})
  /** 編集時の読み込みの失敗の文言。読み込めていないまま保存すると空の内容で上書きするので、このときは保存できなくする */
  const [loadError, setLoadError] = useState('')
  /** 保存の失敗の文言 */
  const [saveError, setSaveError] = useState('')
  /**
   * 新規作成で、イベントの作成までは成功したがセッションの保存で失敗したときの、作成済みのイベントの id。
   * もう一度「保存する」を押したときに作成をやり直さず更新にして、同じイベントが2つできるのを防ぐ
   */
  const createdIdRef = useRef<string | null>(null)
  /**
   * スラッグをイベント名に合わせて自動で作り直すかどうか
   * 新規作成では最初は true（名前を打つたびに作り直す）。スラッグ欄を手で編集したら false にし、以後は自動で変えない。
   * 編集では読み込んだイベントにスラッグがあれば false（既存のスラッグは変えない）、無ければ true にする
   */
  const [slugAuto, setSlugAuto] = useState(!id)

  /**
   * 未保存の変更の判定に使う入力欄の値一式（フォーム・画像・WS セッション・日ごとの開催時間）。
   * 販売ブランドは選んだ順に意味が無いので、外して付け直しても「変更あり」にならないよう並べ替えて比べる
   */
  const editSnapshot = { form: { ...form, brands: [...form.brands].sort() }, imageUrls, sessions, dailyTimesMode, dailyTimes }
  /**
   * 未保存の変更があるか。新規作成は空のフォームを基準にし、編集は読み込みが終わったところで基準を置く
   * （読み込み前・読み込み失敗のときは変更なしとして扱う）
   */
  const { isDirty, resetBaseline } = useDirtyTracker(
    editSnapshot,
    id ? null : { form: { ...empty, brands: [] as string[] }, imageUrls: [] as string[], sessions: [] as SessionInput[], dailyTimesMode: false, dailyTimes: {} as Record<string, string> },
  )
  // 未保存の変更をサイドメニューの確認・再読み込みの確認（beforeunload）に使えるよう登録する。
  // 保存に成功したら一覧へ移り、この画面が閉じて登録も外れるので確認は出ない
  useUnsavedChanges(isDirty)

  // 編集時にイベント情報とWSセッション一覧を取得してフォームに反映する。失敗したらエラーを出して保存を止める
  useEffect(() => {
    if (!id) return
    setLoadError('')
    Promise.all([api.events.get(id), api.events.getSessions(id)]).then(([ev, sess]) => {
      /** 読み込んだイベントで作ったフォームの値 */
      const loadedForm: FormState = {
        name: ev.name, slug: ev.slug ?? '', start_date: ev.start_date, end_date: ev.end_date ?? '',
        time: ev.time ?? '', location: ev.location, booth_number: ev.booth_number ?? '',
        address: ev.address ?? '', official_url: ev.official_url ?? '',
        brands: ev.brands, has_workshop: ev.has_workshop,
        ws_requires_reservation: ev.ws_requires_reservation,
      }
      /** 読み込んだ画像の URL */
      const loadedImages = ev.images.map((i) => i.url)
      /** 読み込んだ WS セッション */
      const loadedSessions: SessionInput[] = sess.map((s) => ({ id: s.id, time_label: s.time_label, max_participants: s.max_participants }))
      /** 日ごとの開催時間が保存されているか（あれば「日ごとに異なる」をオンにして開く） */
      const hasDailyTimes = !!ev.daily_times && Object.keys(ev.daily_times).length > 0
      /** 読み込んだ日ごとの開催時間 */
      const loadedDaily = ev.daily_times ?? {}
      setForm(loadedForm)
      // 既存のスラッグがあるイベントは、名前を変えてもスラッグを変えない
      setSlugAuto(!ev.slug)
      setImageUrls(loadedImages)
      setSessions(loadedSessions)
      setDailyTimesMode(hasDailyTimes)
      setDailyTimes(loadedDaily)
      // 未保存の変更の判定の基準を、読み込んだ値にする
      resetBaseline({ form: { ...loadedForm, brands: [...loadedForm.brands].sort() }, imageUrls: loadedImages, sessions: loadedSessions, dailyTimesMode: hasDailyTimes, dailyTimes: loadedDaily })
    }).catch((e: unknown) => {
      setLoadError(failMessage('イベントの読み込みに失敗しました。ページを開き直してください', e))
    })
    // resetBaseline は入力のたびに作り直されるが、読み込みは id が変わったときだけにする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /**
   * フォームの1項目を書き換える（項目名に合わない型の値は型チェックで弾く）
   * @param k - 項目名
   * @param v - 新しい値
   * @returns 戻り値なし。
   */
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  /**
   * 複数画像を同時アップロードする。blobURLで即時プレビューを表示し、完了後に実URLへ差し替える
   * 終わったら（成功・失敗どちらでも）blob URL を revoke してメモリを返す（差し替え・取り除きのあとなので表示には使っていない）
   * 1. 選んだファイルごとに blob URL を作り、一覧の末尾に足してすぐ見せる
   * 2. まとめてアップロードし、blob URL を本当の URL に差し替える
   * 3. 失敗したら blob URL の分を一覧から取り除いて知らせる
   * 4. どちらでもアップロード中を戻し、blob URL を解放する
   * @param files - 選んだファイル
   * @returns 戻り値なし。
   */
  const handleImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    // 1. 仮のプレビュー
    /** 選んだファイルの配列 */
    const fileArray = Array.from(files)
    /** 足す画像の最初の位置 */
    const startIdx = imageUrls.filter(Boolean).length
    /** ファイルごとの仮の blob URL（fileArray と同じ順） */
    const blobs = fileArray.map((f) => URL.createObjectURL(f))
    setImageUrls((prev) => {
      // 既存の有効な URL の後ろに今回選択したファイルの仮 URL を追加する。
      const existing = prev.filter(Boolean)
      return [...existing, ...blobs]
    })
    setUploadingIdx(startIdx)
    try {
      // 2. アップロードと差し替え
      /** アップロードした画像の URL（fileArray と同じ順） */
      const uploaded = await Promise.all(fileArray.map((f) => api.upload(f)))
      setImageUrls((prev) => {
        // 仮 URL を保持した位置に、同じファイル順でサーバー URL を差し替える。
        const result = [...prev]
        blobs.forEach((blob, i) => {
          // 配列内で該当する仮 URL の位置を探し、アップロード結果で置き換える。
          const idx = result.indexOf(blob)
          if (idx !== -1) result[idx] = uploaded[i]
        })
        return result
      })
    } catch (err) {
      // 3. 失敗（1枚でも失敗したら、今回選んだ分はすべて外す）
      setImageUrls((prev) => prev.filter((u) => !blobs.includes(u)))
      alert(failMessage('画像のアップロードに失敗しました', err))
    } finally {
      // 4. 後片付け
      setUploadingIdx(null)
      blobs.forEach((b) => URL.revokeObjectURL(b))
    }
  }

  /**
   * 販売ブランドの選択を切り替える
   * @param b - ブランド名
   * @returns 戻り値なし。
   */
  const toggleBrand = (b: string) =>
    set('brands', form.brands.includes(b) ? form.brands.filter((x) => x !== b) : [...form.brands, b])

  /**
   *  空の WS セッションを1行足す（定員は WS_DEFAULT_SESSION_CAPACITY 名）
   * @returns 戻り値なし。
   */
  const addSession = () => setSessions((prev) => [...prev, { time_label: '', max_participants: WS_DEFAULT_SESSION_CAPACITY }])
  /**
   * WS セッションを1行消す
   * @param i - 消す行の位置
   * @returns 戻り値なし。
   */
  const removeSession = (i: number) => setSessions((prev) => prev.filter((_, j) => j !== i))
  /**
   * WS セッションの1項目を書き換える
   * @param i - 行の位置
   * @param key - 項目名
   * @param value - 新しい値
   * @returns 戻り値なし。
   */
  const setSession = (i: number, key: keyof SessionInput, value: string | number) =>
    setSessions((prev) => prev.map((s, j) => j === i ? { ...s, [key]: value } : s))

  /**
   *  開催時間の文字列から WS セッションを 1 時間刻みで自動生成する（作れなければ今のセッションのまま）
   * @returns 戻り値なし。
   */
  const autoSetSessions = () => {
    /** 開催時間から作った時間枠 */
    const generated = buildAutoSessions(form.time)
    if (generated.length > 0) setSessions(generated)
  }

  /**
   * イベントを保存する
   * 1. 送る内容を作る（アップロード中の blob URL は除く）
   * 2. 編集なら更新、新規なら作成。新規で前回作成まで済んでいれば（createdIdRef）作成せず更新にする
   * 3. WS セッションを保存する
   * 4. 一覧へ戻る。どこかで失敗したら画面に残ってエラーを出す（入力は残るので、もう一度押して再送できる）
   * @param e - フォームの submit イベント
   * @returns 戻り値なし。
   */
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loadError) return
    setSaving(true)
    setSaveError('')
    // 1. 送る内容
    /** 複数日のイベントか（日ごとの開催時間は複数日のときだけ送る） */
    const isMultiDay = form.start_date && form.end_date && form.end_date > form.start_date
    /** 送る内容 */
    const body: EventBody = {
      ...form,
      slug: form.slug || null,
      daily_times: (dailyTimesMode && isMultiDay) ? dailyTimes : null,
      image_urls: imageUrls.filter((u) => u && !u.startsWith('blob:')),
    }
    try {
      // 2. イベント本体
      /** 更新するイベントの id（新規で未作成なら undefined） */
      let eventId = id ?? createdIdRef.current ?? undefined
      if (eventId) {
        await api.events.update(eventId, body)
      } else {
        // 新規イベントを登録し、後続処理と「未保存変更」管理で使う ID を保持する。
        const created = await api.events.create(body)
        eventId = created.id
        createdIdRef.current = created.id
      }
      // 3. セッション
      /** 保存するセッション（WS なしなら空にして全部消す。時間が空の行は送らない） */
      const validSessions = form.has_workshop ? sessions.filter((s) => s.time_label.trim()) : []
      await api.events.saveSessions(eventId, validSessions)
      // 4. 一覧へ
      navigate('/admin/events')
    } catch (err) {
      setSaveError(createdIdRef.current && !id
        ? failMessage('イベントは作成しましたが、WSセッションの保存に失敗しました。もう一度「保存する」を押してください', err)
        : failMessage('保存に失敗しました', err))
    } finally {
      setSaving(false)
    }
  }

  /** テキスト・日付・URL・セッションの入力欄の共通の見た目。横幅いっぱい */
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 15, fontFamily: 'inherit', background: '#ffffff', boxSizing: 'border-box' }
  /** 項目名（label）の共通の見た目 */
  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 6, fontSize: 13, letterSpacing: 1, color: 'var(--c-body)' }

  return (
    <div style={{ maxWidth: 700 }}>
      <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, marginBottom: 32 }}>
        {id ? 'イベント編集' : '新規イベント'}
      </h2>
      {/* 編集時の読み込みの失敗（このときは保存できない） */}
      {loadError && <p role="alert" style={{ ...errorBoxStyle, marginBottom: 20 }}>{loadError}</p>}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* イベント名（スラッグを手で編集するまでは、名前に合わせてスラッグも作り直す） */}
        <div>
          <label htmlFor="event-name" style={labelStyle}>イベント名</label>
          <input id="event-name" required style={inputStyle} value={form.name} onChange={(e) => {
            set('name', e.target.value)
            if (slugAuto) set('slug', toSlug(e.target.value))
          }} />
        </div>
        {/* URL スラッグ（英小文字・数字・ハイフン以外は入力時に取り除く） */}
        <div>
          <label htmlFor="event-slug" style={labelStyle}>URL スラッグ <span style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 400 }}>（英数字・ハイフンのみ）</span></label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>/events/</span>
            <input
              id="event-slug"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
              placeholder="plant-market-2026"
              value={form.slug}
              onChange={(e) => {
                set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                // 手で編集したので、以後はイベント名に合わせて変えない
                setSlugAuto(false)
              }}
            />
            {form.name && (
              /* 「自動生成」を押したら名前から作り直し、以後もまた名前に合わせて作り直す */
              <button type="button" onClick={() => { set('slug', toSlug(form.name)); setSlugAuto(true) }}
                style={{ padding: '8px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', background: '#fff' }}>
                自動生成
              </button>
            )}
          </div>
          {form.slug && <p style={{ fontSize: 11, color: 'var(--c-muted)', margin: '4px 0 0' }}>ei8htplants.com/official/events/{form.slug}</p>}
        </div>
        {/* 開始日・終了日（2020 年より前は打ち間違いの可能性があるので確認の文字を赤くする） */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label htmlFor="event-start-date" style={labelStyle}>開始日</label>
            <input id="event-start-date" required type="date" style={inputStyle} value={form.start_date}
              onChange={(e) => set('start_date', e.target.value)} />
            {form.start_date && <span style={{ fontSize: 11, color: parseInt(form.start_date.slice(0, 4)) < 2020 ? '#c0392b' : '#8a9a7e', marginTop: 4, display: 'block' }}>確認: {form.start_date}</span>}
          </div>
          <div>
            <label htmlFor="event-end-date" style={labelStyle}>終了日</label>
            <input id="event-end-date" type="date" style={inputStyle} value={form.end_date}
              onChange={(e) => set('end_date', e.target.value)} />
            {form.end_date && <span style={{ fontSize: 11, color: parseInt(form.end_date.slice(0, 4)) < 2020 ? '#c0392b' : '#8a9a7e', marginTop: 4, display: 'block' }}>確認: {form.end_date}</span>}
          </div>
        </div>
        {/* 開催時間（複数日のときは「日ごとに異なる」で日ごとに入れられる） */}
        <div>
          {(() => {
            /** 複数日のイベントか */
            const isMultiDay = form.start_date && form.end_date && form.end_date > form.start_date
            /** 開催する日の一覧（YYYY-MM-DD。複数日でなければ空） */
            const dates = isMultiDay ? listDates(form.start_date, form.end_date) : []
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  {/* 日ごとの入力のときは各行のプルダウンに日付つきの読み上げ名があるので、結び付けるのは1つの時間帯のときだけ */}
                  <label htmlFor={dailyTimesMode && isMultiDay ? undefined : 'event-time-start'} style={{ ...labelStyle, marginBottom: 0 }}>開催時間</label>
                  {isMultiDay && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--c-body)' }}>
                      <input
                        type="checkbox"
                        checked={dailyTimesMode}
                        onChange={(e) => {
                          /** オンにしたかどうか */
                          const checked = e.target.checked
                          setDailyTimesMode(checked)
                          // オンにしたときは、各日の初期値を今の開催時間にそろえる
                          if (checked) {
                            /** 日付 → 開催時間の初期値 */
                            const init: Record<string, string> = {}
                            dates.forEach((d) => { init[d] = form.time })
                            setDailyTimes(init)
                          }
                        }}
                      />
                      日ごとに異なる
                    </label>
                  )}
                </div>
                {dailyTimesMode && isMultiDay ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, background: '#f6f6fa', borderRadius: 4, border: '1px solid #dddde8' }}>
                    {dates.map((d) => (
                      <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 13, color: 'var(--c-body)', minWidth: 116, flexShrink: 0 }}>{formatJaMonthDayDow(d)}</span>
                        <EventTimeRangeSelect
                          value={dailyTimes[d] ?? ''}
                          onChange={(v) => setDailyTimes((prev) => ({ ...prev, [d]: v }))}
                          style={{ flex: 1 }}
                          labelPrefix={`${formatJaMonthDayDow(d)}の`}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <EventTimeRangeSelect id="event-time-start" value={form.time} onChange={(v) => set('time', v)} />
                )}
              </>
            )
          })()}
        </div>
        <div><label htmlFor="event-location" style={labelStyle}>会場名</label><input id="event-location" required style={inputStyle} value={form.location} onChange={(e) => set('location', e.target.value)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div><label htmlFor="event-booth" style={labelStyle}>ブース番号</label><input id="event-booth" style={inputStyle} value={form.booth_number} onChange={(e) => set('booth_number', e.target.value)} /></div>
          <div><label htmlFor="event-address" style={labelStyle}>住所</label><input id="event-address" style={inputStyle} value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
        </div>
        <div><label htmlFor="event-official-url" style={labelStyle}>公式サイトURL</label><input id="event-official-url" type="url" style={inputStyle} value={form.official_url} onChange={(e) => set('official_url', e.target.value)} /></div>
        {/* 販売ブランド欄の表示を分離し、選択状態と切り替え処理はフォーム側で管理する */}
        <EventBrandSelector selectedBrands={form.brands} labelStyle={labelStyle} onToggle={toggleBrand} />
        <div>
          {/* 画像は一覧と「追加」のボタンの集まりなので、label ではなく見出しの文字にする */}
          <p style={{ ...labelStyle, margin: '0 0 6px' }}>画像（複数可）</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
            {imageUrls.map((url, i) => {
              /** アップロードが終わる前の仮の画像か */
              const isBlob = url.startsWith('blob:')
              /** この画像をアップロード中か（中は薄く表示し、外すボタンを出さない） */
              const isUploading = isBlob && uploadingIdx !== null
              return (
                <div key={i} style={{ position: 'relative', width: 88, height: 88, flexShrink: 0 }}>
                  <img
                    src={url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4, border: '1px solid #dddde8', opacity: isUploading ? 0.5 : 1, display: 'block' }}
                  />
                  {isUploading && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--c-muted)' }}>...</div>
                  )}
                  {!isUploading && (
                    <button
                      type="button"
                      onClick={() => setImageUrls((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`${i + 1}枚目の画像を外す`}
                      style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#c0392b', border: 'none', color: '#fff', fontSize: 12, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      ×
                    </button>
                  )}
                </div>
              )
            })}
            {/* 画像を追加する枠（押すとファイルを選べる。アップロード中は押せない） */}
            <label style={{
              width: 88, height: 88, border: '1.5px dashed #b0b0c4', borderRadius: 4,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4, cursor: uploadingIdx !== null ? 'default' : 'pointer', color: 'var(--c-muted)', flexShrink: 0,
              opacity: uploadingIdx !== null ? 0.5 : 1,
            }}>
              <span style={{ fontSize: 24, lineHeight: 1 }}>+</span>
              <span style={{ fontSize: 11 }}>追加</span>
              <input
                type="file"
                accept="image/*"
                aria-label="画像を追加"
                multiple
                onChange={(e) => handleImageFiles(e.target.files)}
                disabled={uploadingIdx !== null}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>

        {/* フラグ（WS あり・予約必要） */}
        <div style={{ display: 'flex', gap: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={form.has_workshop} onChange={(e) => set('has_workshop', e.target.checked)} />
            ワークショップあり
          </label>
          {form.has_workshop && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <input type="checkbox" checked={form.ws_requires_reservation} onChange={(e) => set('ws_requires_reservation', e.target.checked)} />
              予約必要
            </label>
          )}
        </div>

        {/* WSセッション管理（「自動設定」は開催時間に時間帯があるときだけ押せる） */}
        {form.has_workshop && (
          <div style={{ padding: '20px', background: '#f8faf6', border: '1px solid #c8d8c0', borderRadius: 4 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8 }}>
              <p style={{ ...labelStyle, margin: 0, fontSize: 14, fontWeight: 500 }}>WSセッション（各回の時間・定員）</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={autoSetSessions} disabled={!hasTimeRange(form.time)}
                  style={{ padding: '6px 14px', background: 'none', color: '#4a6741', border: '1px solid #4a6741', borderRadius: 2, fontSize: 13, cursor: 'pointer', opacity: hasTimeRange(form.time) ? 1 : 0.4 }}>
                  自動設定
                </button>
                <button type="button" onClick={addSession}
                  style={{ padding: '6px 16px', background: '#4a6741', color: '#fff', border: 'none', borderRadius: 2, fontSize: 13, cursor: 'pointer' }}>
                  + 追加
                </button>
              </div>
            </div>
            {sessions.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--c-muted)', margin: 0 }}>セッションなし（時間指定なしで予約受付）</p>
            )}
            {sessions.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  aria-label={`${i + 1}回目の時間`}
                  placeholder="例: 10:00〜11:30"
                  value={s.time_label}
                  onChange={(e) => setSession(i, 'time_label', e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 13, color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>定員</span>
                  <input
                    type="number"
                    min={1}
                    aria-label={`${i + 1}回目の定員`}
                    value={s.max_participants}
                    onChange={(e) => setSession(i, 'max_participants', Number(e.target.value))}
                    style={{ ...inputStyle, width: 70, textAlign: 'right' }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--c-muted)' }}>名</span>
                </div>
                <button type="button" onClick={() => removeSession(i)} aria-label={`${i + 1}回目のセッションを消す`}
                  style={{ padding: '0 10px', height: 40, border: '1px solid #dddde8', borderRadius: 4, background: 'none', cursor: 'pointer', color: '#c0392b', flexShrink: 0 }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 保存の失敗 */}
        {saveError && <p role="alert" style={errorBoxStyle}>{saveError}</p>}

        {/* 保存（保存中・アップロード中・読み込み失敗のときは押せない）とキャンセル */}
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button type="submit" disabled={saving || uploadingIdx !== null || !!loadError} style={{ padding: '12px 32px', background: 'var(--c-ink)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 15, cursor: saving || uploadingIdx !== null ? 'default' : 'pointer', opacity: saving || uploadingIdx !== null ? 0.6 : 1 }}>
            {saving ? '保存中...' : uploadingIdx !== null ? 'アップロード中...' : '保存する'}
          </button>
          <button type="button" onClick={() => { if (confirmLeaveIfDirty(isDirty)) navigate('/admin/events') }} style={{ padding: '12px 24px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 15, background: 'none', cursor: 'pointer' }}>
            キャンセル
          </button>
        </div>
        {/* 編集モード（id あり）のみ管理情報画面へのリンクを表示する */}
        {id && (
          <div style={{ marginTop: 16 }}>
            <Link
              to={`/admin/events/${id}/admin-info`}
              state={{ from: `/admin/events/${id}/edit` }}
              onClick={(e) => { if (!confirmLeaveIfDirty(isDirty)) e.preventDefault() }}
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                border: '1px solid #dddde8',
                borderRadius: 4,
                fontSize: 14,
                color: 'var(--c-body)',
                textDecoration: 'none',
                background: '#ffffff',
              }}
            >
              管理情報を編集
            </Link>
          </div>
        )}
      </form>
    </div>
  )
}
