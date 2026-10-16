import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom'
import { api, type Event, type EventAdminInfo, type EventFinances, type EventFinancesBody } from '../../lib/api'
import { SectionBox, ImageViewer } from './AdminInfoParts'

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

/**
 * 収支 API の取得結果から、保存 API に送る項目だけを取り出す
 * @param fin - getFinances で取得した収支データ（id・event_id などを含む）
 * @returns saveFinances に渡せる収支の入力項目
 */
function toFinanceBody(fin: EventFinances): EventFinancesBody {
  return {
    sales: fin.sales,
    booth_fee: fin.booth_fee,
    distance: fin.distance,
    gas_price: fin.gas_price,
    expressway_toll: fin.expressway_toll,
    accommodation: fin.accommodation,
    ws_participants: fin.ws_participants,
    // 古い行では null のことがあり、そのまま送るとサーバーの入力チェック（bool）で弾かれるため false で補う
    payment_flag: fin.payment_flag ?? false,
    ws_payment_done: fin.ws_payment_done ?? false,
    other_expenses: fin.other_expenses,
    other_expenses_note: fin.other_expenses_note,
    notes: fin.notes,
  }
}

/** 搬入・搬出の日時を日付・時・分に分けた値（画面の入力欄の単位） */
interface DateTimeParts {
  /** 日付 "YYYY-MM-DD"。未入力なら空文字 */
  date: string
  /** 時 "HH"。未入力なら空文字 */
  hour: string
  /** 分 "MM"。未入力なら空文字 */
  min: string
}

/** 未保存の変更を判定するために比べる、入力欄の値一式 */
interface EditSnapshot {
  /** 管理情報フォームの値 */
  form: EventAdminInfo
  /** 搬入日時の入力欄（日付だけ入れた途中の状態も変更として扱うため、form とは別に持つ） */
  carryIn: DateTimeParts
  /** 搬出日時の入力欄 */
  carryOut: DateTimeParts
}

/**
 * "YYYY-MM-DDTHH:MM" 形式の日時を日付・時・分に分ける
 * @param value - 日時文字列（null・undefined なら全部空）
 * @returns 日付・時・分
 */
function splitDateTime(value: string | null | undefined): DateTimeParts {
  if (!value) return { date: '', hour: '', min: '' }
  const sepIdx = value.indexOf('T')
  const date = sepIdx !== -1 ? value.slice(0, sepIdx) : ''
  const timePart = sepIdx !== -1 ? value.slice(sepIdx + 1) : ''
  const [h, m] = timePart.split(':')
  return { date, hour: h ?? '', min: m ? m.slice(0, 2) : '' }
}

/** 出店料支払い方法の選択肢 */
const PAY_METHODS = ['当日現金', '事前振込', 'その他'] as const

/** 時 select の選択肢（06〜22） */
const HOUR_OPTIONS: string[] = Array.from({ length: 17 }, (_, i) => String(i + 6).padStart(2, '0'))

/** 分 select の選択肢（00〜55、5分刻み） */
const MINUTE_OPTIONS: string[] = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

/**
 * イベント管理情報（搬入・搬出・宿泊・出店料・出店要項・メモ）を入力・保存するページ
 * URL: /admin/events/:id/admin-info/edit
 * 確認画面（/admin/events/:id/admin-info）の「編集」ボタンから開き、保存に成功したら確認画面へ戻る
 */
export default function EventAdminInfo() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  /** 確認画面に来たときの遷移元（イベント一覧など）。確認画面へ戻るときにそのまま引き継ぎ、確認画面の「← 戻る」が元の画面に戻れるようにする */
  const viewFrom: string | undefined = (location.state as { from?: string } | null)?.from
  /** 確認画面の URL。「← 戻る」と保存後の遷移先 */
  const viewPath = `/admin/events/${id ?? ''}/admin-info`

  const [event, setEvent] = useState<Event | null>(null)
  const [form, setForm] = useState<EventAdminInfo>(BLANK)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
  /**
   * 読み込み直後の入力欄の値（JSON 文字列にした写し）。今の値と比べて未保存の変更があるかを判定する。
   * 判定を描画中に行うため、ref ではなく state で持つ（描画中に ref を読むと更新が画面に反映されないことがある）。
   * 読み込み前・読み込み失敗時は null（変更なしとして扱う）
   */
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null)
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
      // 1-1. 収支の出店料・宿泊費を、管理情報が未入力のときの初期値に使う
      const finBody = toFinanceBody(fin)
      const loadedForm: EventAdminInfo = {
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
      }
      // 1-2. 搬入・搬出日時を YYYY-MM-DDTHH:MM 形式から日付・時・分に分割する
      const carryIn = splitDateTime(info.carry_in_time)
      const carryOut = splitDateTime(info.carry_out_time)

      // 1-3. フォームと入力欄に反映する
      setForm(loadedForm)
      setCarryInDate(carryIn.date); setCarryInHour(carryIn.hour); setCarryInMin(carryIn.min)
      setCarryOutDate(carryOut.date); setCarryOutHour(carryOut.hour); setCarryOutMin(carryOut.min)

      // 1-4. 未保存の変更の判定に使うため、読み込み直後の値を写しておく
      const snapshot: EditSnapshot = { form: loadedForm, carryIn, carryOut }
      setInitialSnapshot(JSON.stringify(snapshot))
    }).catch(() => {
      // 読み込み失敗時にエラーメッセージを表示し、保存を止める
      setError('データの読み込みに失敗しました。ページを再読み込みしてください。')
      setLoadFailed(true)
    }).finally(() => setLoading(false))
  }, [id])

  /** 今の入力欄の値一式（読み込み直後の写しと同じ形） */
  const currentSnapshot: EditSnapshot = {
    form,
    carryIn: { date: carryInDate, hour: carryInHour, min: carryInMin },
    carryOut: { date: carryOutDate, hour: carryOutHour, min: carryOutMin },
  }
  /** 読み込み直後から入力が変わっていて、まだ保存していないかどうか（戻るときの確認・注意表示・beforeunload に使う） */
  const isDirty: boolean = initialSnapshot !== null && JSON.stringify(currentSnapshot) !== initialSnapshot

  // 2. 未保存の変更があるあいだは、再読み込み・タブを閉じるときにブラウザの確認を出す
  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // 古いブラウザは returnValue の設定で確認を出す
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

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

  // 3. 保存ボタン押下時の処理
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    // 読み込みに失敗した画面では保存しない（空のフォームで既存の管理情報と収支を上書きしてしまうため）
    if (!id || loadFailed) return
    setSaving(true)
    setError(null)
    try {
      // 1. 管理情報を保存する
      await api.events.saveAdminInfo(id, form)
      // 2. 収支の最新の内容を読み直す。
      //    画面を開いた時点の内容を使うと、その後に収支画面で保存した売上などを
      //    古い内容で上書きして消してしまうため、保存の直前に取り直す
      const latestFin = toFinanceBody(await api.events.getFinances(id))
      // 3. 収支の出店料・宿泊費だけを管理情報の値に置き換えて保存する（ほかの項目は最新の内容のまま）
      await api.events.saveFinances(id, {
        ...latestFin,
        booth_fee: form.booth_fee ?? 0,
        accommodation: form.hotel_fee ?? 0,
      })
      // 4. 確認画面へ戻る。確認画面では state.saved を見て「保存しました」を表示し、from で元の画面への「← 戻る」を保つ。
      //    replace にして編集画面の履歴を確認画面で置き換え、確認画面でブラウザの戻るを押すと一覧などの元の画面へ戻れるようにする
      navigate(viewPath, { replace: true, state: { from: viewFrom, saved: true } })
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
      {/* 戻るリンク（確認画面へ）。上下に余白を持たせてスマホでもタップしやすくする。
          replace で編集画面の履歴を確認画面に置き換え、確認画面でブラウザの戻るを押すと元の画面（一覧など）へ戻れるようにする */}
      <div style={{ marginBottom: 12 }}>
        <Link
          to={viewPath}
          state={{ from: viewFrom }}
          replace
          onClick={(e) => {
            // 保存していない入力があるまま戻ると変更が消えるため、確認してから戻る
            if (isDirty && !window.confirm('保存していない変更があります。破棄して戻りますか？')) {
              e.preventDefault()
            }
          }}
          style={{ display: 'inline-block', padding: '12px 0', fontSize: 13, color: 'var(--c-muted)', textDecoration: 'none' }}
        >
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
          {/* 入力がまだ保存されていないときの注意。画面を離れると変更が消える */}
          {isDirty && (
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
