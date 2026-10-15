import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, Link, useLocation } from 'react-router-dom'
import { api, type Event, type EventAdminInfo, type EventFinancesBody } from '../../lib/api'

/** フォームの初期値。全フィールドを null/false で初期化する */
const BLANK: EventAdminInfo = {
  carry_in_time: null,
  carry_out_time: null,
  hotel_name: null,
  hotel_fee: null,
  booth_fee: null,
  booth_fee_pay_method: null,
  booth_fee_due: null,
  booth_fee_paid: false,
  notes: null,
  guidelines_text: null,
  guidelines_image_urls: [],
}

/** 出店要項の画像として受け付けるファイル形式（api.upload が受け付ける形式と合わせる） */
const GUIDELINE_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

/** saveFinances 呼び出し時に finData が null だった場合に使う収支の初期値 */
const BLANK_FIN: EventFinancesBody = {
  sales: 0,
  booth_fee: 0,
  distance: 0,
  gas_price: 160,
  expressway_toll: 0,
  accommodation: 0,
  ws_participants: 0,
  payment_flag: false,
  ws_payment_done: false,
  other_expenses: 0,
  other_expenses_note: null,
  notes: null,
}

/** 出店料支払い方法の選択肢 */
const PAY_METHODS = ['当日現金', '事前振込', 'その他'] as const

/** 時 select の選択肢（06〜22） */
const HOUR_OPTIONS: string[] = Array.from({ length: 17 }, (_, i) => String(i + 6).padStart(2, '0'))

/** 分 select の選択肢（00〜55、5分刻み） */
const MINUTE_OPTIONS: string[] = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

/**
 * イベント管理情報（搬入・搬出・宿泊・出店料）を入力・保存するページ
 * URL: /admin/events/:id/admin-info
 */
export default function EventAdminInfo() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  // 遷移元のパスを取得。未設定時はイベント編集画面へ戻る
  const backTo: string = (location.state as { from?: string } | null)?.from ?? `/admin/events/${id ?? ''}/edit`

  const [event, setEvent] = useState<Event | null>(null)
  const [form, setForm] = useState<EventAdminInfo>(BLANK)
  /** EventFinances から取得した収支データ。保存時に booth_fee / accommodation を同期するために保持する */
  const [finData, setFinData] = useState<EventFinancesBody | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  /** 保存成功メッセージの表示フラグ。3秒後に自動で消える */
  const [saved, setSaved] = useState(false)
  /** 読み込み・保存エラーのメッセージ。null なら非表示 */
  const [error, setError] = useState<string | null>(null)
  /** 読み込みに失敗したかどうか。true の間は保存できなくする（空のフォームで搬入・宿泊・出店要項などを上書きしないため） */
  const [loadFailed, setLoadFailed] = useState(false)

  // 搬入日時を日付・時・分に分けて管理するローカル state（EventAdminInfo 型には含まれない）
  const [carryInDate, setCarryInDate] = useState<string>('')
  const [carryInHour, setCarryInHour] = useState<string>('')
  const [carryInMin, setCarryInMin] = useState<string>('')
  // 搬出日時を日付・時・分に分けて管理するローカル state（EventAdminInfo 型には含まれない）
  const [carryOutDate, setCarryOutDate] = useState<string>('')
  const [carryOutHour, setCarryOutHour] = useState<string>('')
  const [carryOutMin, setCarryOutMin] = useState<string>('')

  /** 出店要項画像のファイル選択 input。「画像を追加」ボタンから click() で開く */
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** 出店要項画像のアップロード進捗。current は今アップロード中の何枚目か（1始まり）。null ならアップロードしていない */
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  /** 出店要項画像のアップロード失敗メッセージ。null なら非表示 */
  const [uploadError, setUploadError] = useState<string | null>(null)
  /** 出店要項画像を追加・削除してからまだ保存していないかどうか（保存ボタン横の注意表示に使う） */
  const [imagesDirty, setImagesDirty] = useState(false)
  /** 拡大表示中の出店要項画像の位置（0始まり）。null なら拡大表示を閉じている */
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  // 1. イベント情報・管理情報・収支データを並行取得してフォームに反映する
  useEffect(() => {
    if (!id) return
    Promise.all([
      api.events.get(id),
      api.events.getAdminInfo(id),
      api.events.getFinances(id),
    ]).then(([ev, info, fin]) => {
      setEvent(ev)
      // 収支データを state に保持する（保存時の同期用）
      const finBody: EventFinancesBody = {
        sales: fin.sales,
        booth_fee: fin.booth_fee,
        distance: fin.distance,
        gas_price: fin.gas_price,
        expressway_toll: fin.expressway_toll,
        accommodation: fin.accommodation,
        ws_participants: fin.ws_participants,
        payment_flag: fin.payment_flag,
        ws_payment_done: fin.ws_payment_done,
        other_expenses: fin.other_expenses,
        other_expenses_note: fin.other_expenses_note,
        notes: fin.notes,
      }
      setFinData(finBody)
      setForm({
        carry_in_time: info.carry_in_time ?? null,
        carry_out_time: info.carry_out_time ?? null,
        hotel_name: info.hotel_name ?? null,
        // 管理情報に値がなければ収支の出店料を初期値として使う
        booth_fee: info.booth_fee ?? (finBody.booth_fee !== 0 ? finBody.booth_fee : null),
        booth_fee_pay_method: info.booth_fee_pay_method ?? null,
        booth_fee_due: info.booth_fee_due ?? null,
        booth_fee_paid: info.booth_fee_paid ?? false,
        // 管理情報に値がなければ収支の宿泊費を初期値として使う
        hotel_fee: info.hotel_fee ?? (finBody.accommodation !== 0 ? finBody.accommodation : null),
        notes: info.notes ?? null,
        // 出店要項は後から追加した項目のため、既存データでは undefined のことがある
        guidelines_text: info.guidelines_text ?? null,
        guidelines_image_urls: info.guidelines_image_urls ?? [],
      })

      // 搬入日時を YYYY-MM-DDTHH:MM 形式から日付・時・分に分割してローカル state に反映する
      if (info.carry_in_time) {
        const sepIdx = info.carry_in_time.indexOf('T')
        setCarryInDate(sepIdx !== -1 ? info.carry_in_time.slice(0, sepIdx) : '')
        const timePart = sepIdx !== -1 ? info.carry_in_time.slice(sepIdx + 1) : ''
        const [h, m] = timePart.split(':')
        setCarryInHour(h ?? '')
        setCarryInMin(m ? m.slice(0, 2) : '')
      } else {
        setCarryInDate(''); setCarryInHour(''); setCarryInMin('')
      }
      // 搬出日時も同様に分割する
      if (info.carry_out_time) {
        const sepIdx = info.carry_out_time.indexOf('T')
        setCarryOutDate(sepIdx !== -1 ? info.carry_out_time.slice(0, sepIdx) : '')
        const timePart = sepIdx !== -1 ? info.carry_out_time.slice(sepIdx + 1) : ''
        const [h, m] = timePart.split(':')
        setCarryOutHour(h ?? '')
        setCarryOutMin(m ? m.slice(0, 2) : '')
      } else {
        setCarryOutDate(''); setCarryOutHour(''); setCarryOutMin('')
      }
    }).catch(() => {
      // 読み込み失敗時にエラーメッセージを表示し、保存を止める
      setError('データの読み込みに失敗しました。ページを再読み込みしてください。')
      setLoadFailed(true)
    }).finally(() => setLoading(false))
  }, [id])

  /**
   * フォームの特定フィールドを更新するヘルパー
   * @param key - 更新するフィールド名
   * @param value - 新しい値
   */
  const set = <K extends keyof EventAdminInfo>(key: K, value: EventAdminInfo[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  /**
   * 日付・時・分を結合して carry_in_time / carry_out_time に保存する値を返す
   * 3つすべて入力されている場合のみ YYYY-MM-DDTHH:MM 形式の文字列を返し、1つでも欠けていれば null を返す
   * @param date - YYYY-MM-DD 形式の日付文字列
   * @param hour - HH 形式の時文字列
   * @param min - MM 形式の分文字列
   * @returns YYYY-MM-DDTHH:MM 形式の文字列、または null
   */
  const combineDateTime = (date: string, hour: string, min: string): string | null => {
    if (date && hour && min) return `${date}T${hour}:${min}`
    return null
  }

  // 2. 保存ボタン押下時の処理
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    // 読み込みに失敗した画面では保存しない（空のフォームで既存の管理情報と収支を上書きしてしまうため）
    if (!id || loadFailed) return
    setSaving(true)
    setError(null)
    try {
      // 1. 管理情報を保存する
      await api.events.saveAdminInfo(id, form)
      // 2. 収支データ（出店料・宿泊費）を管理情報の値で上書きして同期する。
      //    finData が未取得（null）のときは空の初期値をベースにする
      const baseFinData = finData ?? BLANK_FIN
      await api.events.saveFinances(id, {
        ...baseFinData,
        booth_fee: form.booth_fee ?? 0,
        accommodation: form.hotel_fee ?? 0,
      })
      // 画像の追加・削除も保存できたので、未保存の注意表示を消す
      setImagesDirty(false)
      setSaved(true)
      // 3秒後に保存済みメッセージを消す
      setTimeout(() => setSaved(false), 3000)
    } catch {
      // 保存失敗時にエラーメッセージを表示する
      setError('保存に失敗しました。もう一度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  /**
   * 出店要項画像のファイル選択後の処理
   * 選ばれたファイルを1枚ずつ順にアップロードし、成功したものから URL を末尾に追加する。
   * 失敗したファイルはスキップして最後にファイル名をまとめて表示する（成功分は残す）
   * @param e - ファイル input の change イベント
   */
  const handleAddImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    // 1. 選択されたファイルを配列に写す（input の value をクリアすると FileList も空になるため先に写す）
    const files = Array.from(input.files ?? [])
    if (files.length === 0) return
    setUploadError(null)
    /** アップロードに失敗したファイル名 */
    const failedNames: string[] = []
    try {
      // 2. 1枚ずつ順にアップロードし、進捗表示を更新する
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setUploadProgress({ current: i + 1, total: files.length })
        try {
          const url = await api.upload(file)
          // アップロード中に削除操作があっても消えないよう、前の state を元に末尾へ追加する
          setForm((prev) => ({ ...prev, guidelines_image_urls: [...(prev.guidelines_image_urls ?? []), url] }))
          setImagesDirty(true)
        } catch {
          failedNames.push(file.name)
        }
      }
      // 3. 失敗したファイルがあればファイル名を添えて知らせる
      if (failedNames.length > 0) {
        setUploadError(`次の画像をアップロードできませんでした: ${failedNames.join('、')}（JPEG・PNG・WebP・GIF、10MB まで）`)
      }
    } finally {
      setUploadProgress(null)
      // 4. 同じファイルを続けて選んでも change が発火するよう value をクリアする
      input.value = ''
    }
  }

  /**
   * 出店要項画像を一覧から外す（Storage 上のファイルは消さない。保存ボタンで確定する）
   * @param index - 外す画像の位置（0始まり）
   */
  const handleRemoveImage = (index: number) => {
    if (!window.confirm('この画像を出店要項から削除しますか？（保存ボタンを押すと確定します）')) return
    setForm((prev) => ({
      ...prev,
      guidelines_image_urls: (prev.guidelines_image_urls ?? []).filter((_, i) => i !== index),
    }))
    setImagesDirty(true)
  }

  /** 出店要項の画像 URL 一覧（既存データで undefined のときは空配列として扱う） */
  const guidelineImages: string[] = form.guidelines_image_urls ?? []
  /** 出店要項画像をアップロード中かどうか */
  const uploading = uploadProgress !== null

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid #dddde8',
    borderRadius: 4,
    fontSize: 15,
    fontFamily: 'inherit',
    background: '#ffffff',
    boxSizing: 'border-box',
  }

  /** 搬入・搬出の時・分 select の見た目。スマホでも押しやすいよう高さを 44px 確保する */
  const timeSelectStyle: React.CSSProperties = {
    padding: '10px 8px',
    minHeight: 44,
    border: '1px solid #dddde8',
    borderRadius: 4,
    fontSize: 15,
    fontFamily: 'inherit',
    background: '#ffffff',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontSize: 13,
    letterSpacing: 1,
    color: 'var(--c-body)',
  }

  if (loading) return <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p>

  return (
    <>
    {/* 読み込み・保存エラーを画面上部に表示する */}
    {error && (
      <p style={{ color: '#c0392b', background: '#fdf2f2', border: '1px solid #f5c6cb', borderRadius: 4, padding: '12px 16px', marginBottom: 16, fontSize: 14 }}>
        {error}
      </p>
    )}
    <div style={{ maxWidth: 580 }}>
      {/* 戻るリンク */}
      <div style={{ marginBottom: 24 }}>
        <Link to={backTo} style={{ fontSize: 13, color: 'var(--c-muted)', textDecoration: 'none' }}>
          &larr; 戻る
        </Link>
      </div>

      <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, marginBottom: 4 }}>
        イベント管理情報
      </h2>
      {event && (
        <p style={{ fontSize: 14, color: 'var(--c-muted)', marginBottom: 28 }}>
          {event.name} &mdash; {event.start_date}
        </p>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* 搬入・搬出 */}
        <SectionBox label="搬入・搬出" hint="日付・時・分をすべて入力した場合のみ保存されます">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 搬入日時: 日付 input・時 select・分 select を組み合わせる */}
            <div>
              <label style={labelStyle}>搬入日時</label>
              {/* 狭い幅では日付の下に時・分が折り返す */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <input
                  type="date"
                  style={{ ...inputStyle, flex: '1 1 160px', minWidth: 0 }}
                  value={carryInDate}
                  onChange={(e) => {
                    setCarryInDate(e.target.value)
                    set('carry_in_time', combineDateTime(e.target.value, carryInHour, carryInMin))
                  }}
                />
                {/* 時・分は折り返しても離れないよう1つのまとまりにする */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: '0 0 auto' }}>
                  <select
                    style={timeSelectStyle}
                    value={carryInHour}
                    onChange={(e) => {
                      setCarryInHour(e.target.value)
                      set('carry_in_time', combineDateTime(carryInDate, e.target.value, carryInMin))
                    }}
                  >
                    <option value="">--</option>
                    {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <span style={{ fontSize: 15, color: 'var(--c-muted)' }}>:</span>
                  <select
                    style={timeSelectStyle}
                    value={carryInMin}
                    onChange={(e) => {
                      setCarryInMin(e.target.value)
                      set('carry_in_time', combineDateTime(carryInDate, carryInHour, e.target.value))
                    }}
                  >
                    <option value="">--</option>
                    {MINUTE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>
            {/* 搬出日時: 日付 input・時 select・分 select を組み合わせる */}
            <div>
              <label style={labelStyle}>搬出日時</label>
              {/* 狭い幅では日付の下に時・分が折り返す */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <input
                  type="date"
                  style={{ ...inputStyle, flex: '1 1 160px', minWidth: 0 }}
                  value={carryOutDate}
                  onChange={(e) => {
                    setCarryOutDate(e.target.value)
                    set('carry_out_time', combineDateTime(e.target.value, carryOutHour, carryOutMin))
                  }}
                />
                {/* 時・分は折り返しても離れないよう1つのまとまりにする */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: '0 0 auto' }}>
                  <select
                    style={timeSelectStyle}
                    value={carryOutHour}
                    onChange={(e) => {
                      setCarryOutHour(e.target.value)
                      set('carry_out_time', combineDateTime(carryOutDate, e.target.value, carryOutMin))
                    }}
                  >
                    <option value="">--</option>
                    {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <span style={{ fontSize: 15, color: 'var(--c-muted)' }}>:</span>
                  <select
                    style={timeSelectStyle}
                    value={carryOutMin}
                    onChange={(e) => {
                      setCarryOutMin(e.target.value)
                      set('carry_out_time', combineDateTime(carryOutDate, carryOutHour, e.target.value))
                    }}
                  >
                    <option value="">--</option>
                    {MINUTE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </SectionBox>

        {/* 宿泊 */}
        <SectionBox label="宿泊">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>ホテル名</label>
              <input
                type="text"
                style={inputStyle}
                value={form.hotel_name ?? ''}
                placeholder="宿泊ホテル名（任意）"
                onChange={(e) => set('hotel_name', e.target.value || null)}
              />
            </div>
            <div>
              <label style={labelStyle}>宿泊料金</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  style={{ ...inputStyle, textAlign: 'right' }}
                  value={form.hotel_fee ?? ''}
                  placeholder="0"
                  onChange={(e) => set('hotel_fee', e.target.value === '' ? null : Number(e.target.value))}
                />
                <span style={{ fontSize: 13, color: 'var(--c-muted)', flexShrink: 0 }}>円</span>
              </div>
            </div>
          </div>
        </SectionBox>

        {/* 出店料 */}
        <SectionBox label="出店料">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>出店料</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  style={{ ...inputStyle, textAlign: 'right' }}
                  value={form.booth_fee ?? ''}
                  placeholder="0"
                  onChange={(e) => set('booth_fee', e.target.value === '' ? null : Number(e.target.value))}
                />
                <span style={{ fontSize: 13, color: 'var(--c-muted)', flexShrink: 0 }}>円</span>
              </div>
            </div>
            <div>
              <label style={labelStyle}>支払い方法</label>
              <select
                style={inputStyle}
                value={form.booth_fee_pay_method ?? ''}
                onChange={(e) => set('booth_fee_pay_method', e.target.value || null)}
              >
                <option value="">未設定</option>
                {PAY_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>支払い期限</label>
              <input
                type="date"
                style={inputStyle}
                value={form.booth_fee_due ?? ''}
                onChange={(e) => set('booth_fee_due', e.target.value || null)}
              />
            </div>
            {/* 支払い済みチェックボックス */}
            <div>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                padding: '12px 14px',
                background: form.booth_fee_paid ? '#f0f5ee' : '#ffffff',
                border: `1px solid ${form.booth_fee_paid ? '#b8d4ae' : '#dddde8'}`,
                borderRadius: 4,
              }}>
                <input
                  type="checkbox"
                  checked={form.booth_fee_paid ?? false}
                  onChange={(e) => set('booth_fee_paid', e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#4a6741', flexShrink: 0 }}
                />
                <span style={{ fontSize: 14, fontWeight: form.booth_fee_paid ? 500 : 400 }}>
                  支払い済み
                </span>
              </label>
            </div>
          </div>
        </SectionBox>

        {/* 出店要項（主催者から届いた要項の文章と画像） */}
        <SectionBox label="出店要項" hint="画像の追加・削除は「保存する」で確定します">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle} htmlFor="guidelines-text">要項の文章</label>
              <textarea
                id="guidelines-text"
                value={form.guidelines_text ?? ''}
                onChange={(e) => set('guidelines_text', e.target.value || null)}
                rows={8}
                placeholder="主催者から届いた出店要項の本文を貼り付け"
                style={{ ...inputStyle, fontSize: 14, lineHeight: 1.7, resize: 'vertical' }}
              />
            </div>

            <div>
              <label style={labelStyle}>要項の画像{guidelineImages.length > 0 && `（${guidelineImages.length} 枚）`}</label>

              {/* アップロード済み画像のサムネイル。最小 120px で折り返し、狭い幅でも横スクロールしない */}
              {guidelineImages.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(120px, 100%), 1fr))', gap: 10, marginBottom: 12 }}>
                  {guidelineImages.map((url, i) => (
                    <div key={`${url}-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                      {/* 正方形のサムネイル。タップで画面内に拡大表示する */}
                      <button
                        type="button"
                        onClick={() => setViewerIndex(i)}
                        aria-label={`出店要項の画像 ${i + 1} を拡大表示`}
                        style={{ display: 'block', width: '100%', aspectRatio: '1 / 1', padding: 0, border: '1px solid #dddde8', borderRadius: 4, background: '#f4f4f8', overflow: 'hidden', cursor: 'zoom-in' }}
                      >
                        <img
                          src={url}
                          alt={`出店要項の画像 ${i + 1}`}
                          loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(i)}
                        disabled={uploading}
                        style={{ minHeight: 40, padding: '6px 8px', border: '1px solid #dddde8', borderRadius: 4, background: '#ffffff', color: '#c0392b', fontSize: 13, fontFamily: 'inherit', cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 実際のファイル選択欄は隠し、下の「画像を追加」ボタンから開く */}
              <input
                ref={fileInputRef}
                type="file"
                accept={GUIDELINE_IMAGE_ACCEPT}
                multiple
                onChange={handleAddImages}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{ minHeight: 44, padding: '10px 20px', border: '1px solid #dddde8', borderRadius: 4, background: '#ffffff', color: 'var(--c-body)', fontSize: 14, fontFamily: 'inherit', cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1, maxWidth: '100%' }}
              >
                {uploadProgress ? `アップロード中...（${uploadProgress.current}/${uploadProgress.total}）` : '画像を追加'}
              </button>
              <p style={{ fontSize: 12, color: 'var(--c-muted)', margin: '8px 0 0' }}>
                JPEG・PNG・WebP・GIF、1枚 10MB まで。複数枚まとめて選べます
              </p>

              {/* アップロードに失敗したファイルの案内 */}
              {uploadError && (
                <p style={{ fontSize: 13, color: '#c0392b', background: '#fdf2f2', border: '1px solid #f5c6cb', borderRadius: 4, padding: '8px 12px', margin: '10px 0 0', overflowWrap: 'anywhere' }}>
                  {uploadError}
                </p>
              )}
            </div>
          </div>
        </SectionBox>

        {/* メモ */}
        <SectionBox label="メモ">
          <textarea
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value || null)}
            rows={4}
            placeholder="予約が必要なことや注意事項"
            style={{ width: '100%', padding: '10px 14px', border: 'none', borderRadius: 0, fontSize: 14, fontFamily: 'inherit', background: 'transparent', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
          />
        </SectionBox>

        {/* 保存ボタン */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          {/* アップロード中に保存すると途中までの画像しか保存されないため、アップロード完了まで押せなくする。
              読み込みに失敗したときも、空のフォームで上書きしないよう押せなくする */}
          <button
            type="submit"
            disabled={saving || uploading || loadFailed}
            style={{
              padding: '12px 32px',
              background: 'var(--c-ink)',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              minHeight: 44,
              cursor: saving || uploading || loadFailed ? 'default' : 'pointer',
              fontSize: 15,
              opacity: saving || uploading || loadFailed ? 0.6 : 1,
            }}
          >
            {saving ? '保存中...' : '保存する'}
          </button>
          {/* 保存成功時に3秒間表示するフィードバック */}
          {saved && (
            <span style={{ fontSize: 14, color: '#4a6741' }}>保存しました</span>
          )}
          {/* 出店要項画像の追加・削除がまだ保存されていないときの注意。画面を離れると変更が消える */}
          {imagesDirty && !saved && (
            <span style={{ fontSize: 13, color: '#b9770e' }}>未保存の変更があります</span>
          )}
        </div>
      </form>
    </div>

    {/* 出店要項画像の拡大表示 */}
    {viewerIndex !== null && guidelineImages.length > 0 && (
      <ImageViewer
        urls={guidelineImages}
        index={Math.min(viewerIndex, guidelineImages.length - 1)}
        onChange={setViewerIndex}
        onClose={() => setViewerIndex(null)}
      />
    )}
    </>
  )
}

/**
 * フォームのセクションを囲む枠コンポーネント
 * @param label - セクション見出し
 * @param hint - 見出し右側に表示する補足テキスト（任意）
 * @param children - セクション内のコンテンツ
 */
function SectionBox({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      {/* 見出しと補足。狭い幅では補足が下に折り返す */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10, rowGap: 2, marginBottom: 8 }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: 'var(--c-muted)', textTransform: 'uppercase' }}>
          {label}
        </div>
        {hint && <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>{hint}</span>}
      </div>
      <div style={{ background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, padding: '16px', minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}

/** 拡大表示の操作ボタン（閉じる・前へ・次へ）の見た目。スマホでも押しやすいよう 44px 以上にする */
const viewerButtonStyle: React.CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  padding: '10px 16px',
  border: '1px solid rgba(255,255,255,0.4)',
  borderRadius: 4,
  background: 'rgba(0,0,0,0.4)',
  color: '#ffffff',
  fontSize: 14,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

/**
 * 画像を画面いっぱいに拡大表示するオーバーレイ
 * 背景タップ・閉じるボタン・Esc キーで閉じ、複数枚のときは前へ／次へボタンと左右キーで切り替える。
 * 表示中は後ろのページがスクロールしないよう body のスクロールを止める
 * @param urls - 表示する画像 URL の一覧
 * @param index - 表示中の画像の位置（0始まり）
 * @param onChange - 表示する画像を切り替えるときに呼ぶ（新しい位置を渡す）
 * @param onClose - 閉じるときに呼ぶ
 */
function ImageViewer({ urls, index, onChange, onClose }: {
  urls: string[]
  index: number
  onChange: (index: number) => void
  onClose: () => void
}) {
  /** 前の画像があるかどうか（先頭では前へを押せない） */
  const hasPrev = index > 0
  /** 次の画像があるかどうか（末尾では次へを押せない） */
  const hasNext = index < urls.length - 1

  // 表示中は body のスクロールを止め、閉じたら元の値に戻す
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  // Esc で閉じる・左右キーで前後の画像に切り替える
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && hasPrev) onChange(index - 1)
      else if (e.key === 'ArrowRight' && hasNext) onChange(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, hasPrev, hasNext, onChange, onClose])

  // 管理画面のレイアウト（親要素の transform など）の影響を受けないよう body 直下に出す
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="出店要項の画像の拡大表示"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex',
        flexDirection: 'column',
        padding: 'max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))',
        boxSizing: 'border-box',
      }}
    >
      {/* 上部: 何枚目かの表示と閉じるボタン */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <span style={{ color: '#ffffff', fontSize: 14 }}>
          {urls.length > 1 ? `${index + 1} / ${urls.length}` : ''}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose() }}
          style={viewerButtonStyle}
        >
          閉じる
        </button>
      </div>

      {/* 中央: 画像。残りの高さに収まるよう contain で縮小する。画像以外の余白をタップすると閉じる */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 0' }}>
        <img
          src={urls[index]}
          alt={`出店要項の画像 ${index + 1}`}
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
        />
      </div>

      {/* 下部: 複数枚のときだけ前へ／次へボタンを出す。端のボタンを disabled にすると、押したクリックが背景に届いて閉じてしまうブラウザがあるため aria-disabled で表す */}
      {urls.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexShrink: 0 }}>
          <button
            type="button"
            aria-disabled={!hasPrev}
            onClick={(e) => { e.stopPropagation(); if (hasPrev) onChange(index - 1) }}
            style={{ ...viewerButtonStyle, minWidth: 96, opacity: hasPrev ? 1 : 0.35, cursor: hasPrev ? 'pointer' : 'default' }}
          >
            &larr; 前へ
          </button>
          <button
            type="button"
            aria-disabled={!hasNext}
            onClick={(e) => { e.stopPropagation(); if (hasNext) onChange(index + 1) }}
            style={{ ...viewerButtonStyle, minWidth: 96, opacity: hasNext ? 1 : 0.35, cursor: hasNext ? 'pointer' : 'default' }}
          >
            次へ &rarr;
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}
