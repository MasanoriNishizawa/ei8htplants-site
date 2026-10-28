import { useEffect, useId, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api, ApiError, type WsSession } from '../lib/api'
import PageMeta from '../components/PageMeta'
import { useApi } from '../hooks/useApi'
import { httpStatusOf } from '../lib/httpError'
import { useT, useLang } from '../lib/lang'
import { listDates, parseLocalDate } from '../lib/localDate'
import { formatYen } from '../lib/format'
import { INPUT_MAX_LENGTH, RESERVE_MAX_PARTICIPANTS, WS_FEE_YEN } from '../lib/constants'

/** 予約フォームの値 */
type FormState = {
  /** お名前 */
  name: string
  /** メールアドレス（確認メールの送り先） */
  email: string
  /** 電話番号（任意） */
  phone: string
  /** 参加人数 */
  participants: number
  /** 備考（任意） */
  note: string
  /** 選んだ時間枠の id（未選択は空文字） */
  session_id: string
  /** 植物を持ち込むか */
  bring_plant: boolean
  /** 鉢を持ち込むか */
  bring_pot: boolean
  /** 予約日（YYYY-MM-DD。未選択は空文字） */
  preferred_date: string
}

/** 予約フォームの初期値 */
const BLANK: FormState = {
  name: '', email: '', phone: '', participants: 1, note: '',
  session_id: '', bring_plant: false, bring_pot: false,
  preferred_date: '',
}

/** 予約の 400 のうち「受付終了」を表すサーバーの detail（backend/app/routes/reserve.py の文言と同じ） */
const RESERVE_CLOSED_DETAILS = [
  'このイベントの予約受付は終了しています',
  'この日の予約受付は終了しています',
]

/** 予約の 400 のうち「日付・時間が予約枠と合わない」を表すサーバーの detail */
const RESERVE_MISMATCH_DETAILS = [
  '予約日がイベントの開催期間外です',
  'ワークショップの時間枠が正しくありません',
]

/**
 * 予約の送信が 400 になったときの文言を作る。
 * 日本語表示ではサーバーの detail をそのまま出し、英語表示では detail の種類（受付終了／日付・時間の不一致）に合わせた英語にする。
 * 知らない detail・detail が無いときは、日付と時間を選び直す案内（従来の文言）にする
 * @param err - catch で受け取った値
 * @param t - 翻訳関数（useT() の戻り値）
 * @returns 画面に出す文言
 */
function reserve400Message(err: unknown, t: <T>(ja: T, en: T) => T): string {
  // サーバーの説明（文字列のときだけ）
  const detail = err instanceof ApiError && typeof err.detail === 'string' ? err.detail : ''
  if (RESERVE_CLOSED_DETAILS.includes(detail)) {
    return t(detail, 'Reservations for this date or event are closed. Please choose another date or event.')
  }
  if (RESERVE_MISMATCH_DETAILS.includes(detail)) {
    return t(detail, 'The selected date or time does not match this event. Please choose the date and time again.')
  }
  return t('選んだ日付または時間がこのイベントの予約枠と合いません。日付と時間を選び直してください。', 'The selected date or time does not match this event. Please choose the date and time again.')
}

/**
 * ワークショップ予約フォームページ。日付・セッション選択と参加者情報の送信を行う
 * @returns 予約の画面（読み込み中・イベントが無いとき・受付終了・満席・完了はそれぞれの案内）
 */
export default function Reserve() {
  // URL のクエリ
  const [params] = useSearchParams()
  // URL の ?event_id=（無ければ空文字。そのときは「イベントが見つかりません」を出す）
  const eventId = params.get('event_id') ?? ''
  // 選んだ日の予約枠（時間帯）
  const [sessions, setSessions] = useState<WsSession[]>([])
  // 予約枠の取得の状態（idle: 未取得 / loading: 取得中 / ok: 取得済み / error: 失敗）
  const [sessionsStatus, setSessionsStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  // 予約枠の「再読み込み」を押した回数（取り直しのきっかけ）
  const [sessionsRetry, setSessionsRetry] = useState(0)
  // 予約フォームの値
  const [form, setForm] = useState<FormState>(BLANK)
  // 送信の状態（full: 満席で受け付けられなかった）
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error' | 'full'>('idle')
  // 送信に失敗したときの文言
  const [errorMsg, setErrorMsg] = useState('')
  const t = useT()
  // 今の表示言語（日付の表示と、確認メールの言語として送る）
  const { lang } = useLang()
  // label と入力欄を結び付ける id の先頭部分
  const uid = useId()

  // URL の event_id でイベントを取る（event_id が無ければ取らない）
  const { data: event, loading: eventLoading, error: eventError } = useApi(
    () => api.events.get(eventId),
    [eventId],
    { enabled: !!eventId },
  )

  /**
   * YYYY-MM-DD を「5月1日(金)」のような表示にする
   * @param d - 日付（YYYY-MM-DD）
   * @returns 表示用の文字列
   */
  const fmtDate = (d: string) =>
    parseLocalDate(d).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US', {
      month: 'long', day: 'numeric', weekday: 'short',
    })

  // イベントが取れたら、1 日だけのイベントは予約日を自動で選ぶ
  useEffect(() => {
    if (!event) return
    // イベントの開催日
    const dates = listDates(event.start_date, event.end_date)
    if (dates.length === 1) {
      setForm((f) => ({ ...f, preferred_date: dates[0] }))
    }
  }, [event])

  // ワークショップありのイベントで日付が決まったら予約枠を取り直す。
  // 日付を素早く選び直したときに、前の日付の応答が後から届いても捨てる
  useEffect(() => {
    if (!event?.has_workshop || !form.preferred_date) {
      setSessions([])
      setSessionsStatus('idle')
      return
    }
    // 日付を選び直したあとに届いた前の応答は使わない
    let cancelled = false
    setSessions([])
    setSessionsStatus('loading')
    api.events.getSessions(eventId, form.preferred_date)
      .then((list) => {
        if (cancelled) return
        setSessions(list)
        setSessionsStatus('ok')
      })
      .catch(() => { if (!cancelled) setSessionsStatus('error') })
    return () => { cancelled = true }
  }, [event, form.preferred_date, eventId, sessionsRetry])

  /**
   * フォームの 1 項目を変える
   * @param key - 項目名
   * @param value - 新しい値
   * @returns 戻り値なし。
   */
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  // イベントの開催日の一覧
  const dates = event ? listDates(event.start_date, event.end_date) : []
  // 複数日のイベントか（そのときだけ日付を選ばせる）
  const isMultiDay = dates.length > 1
  // 選んでいる時間枠（未選択は null）
  const selectedSession = sessions.find((s) => s.id === form.session_id) ?? null
  // 選んでいる時間枠の残りの人数
  const selectedRemaining = selectedSession
    ? selectedSession.max_participants - selectedSession.reserved_count
    : 0
  // 日付を選ぶまで時間枠を選べない（薄く表示する）
  const sessionsDisabled = isMultiDay && !form.preferred_date

  // WS ありのイベントは時間枠を選ばせる
  const expectsSessions = !!event?.has_workshop
  // 時間枠を選ぶまで人数を選べない
  const participantsDisabled = expectsSessions && !form.session_id

  // 日付がまだ選ばれていない
  const needsDate = isMultiDay && !form.preferred_date
  // 時間枠がまだ選ばれていない
  const needsSession = expectsSessions && !form.session_id
  // 送信できるか
  const canSubmit = !needsDate && !needsSession

  /**
   * 予約を送信する（日付・時間枠が選ばれていなければ送らない）。結果に応じて完了・エラーの表示に切り替える
   * @param e - フォームの送信イベント
   * @returns 戻り値なし。
   */
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    // 1. 日付・時間枠がそろっていなければ送らない
    if (!canSubmit) return
    setStatus('loading')
    setErrorMsg('')
    try {
      // 2. 送信（任意の項目は空なら送らない）
      await api.reserve.create({
        event_id: eventId,
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        participants: form.participants,
        note: form.note || undefined,
        session_id: form.session_id || undefined,
        bring_plant: form.bring_plant,
        bring_pot: form.bring_pot,
        preferred_date: form.preferred_date || undefined,
        lang,
      })
      setStatus('done')
    } catch (err: unknown) {
      // 3. ステータスコードごとに、利用者がどうすればよいか分かる文言にする（409 は満席）
      const code = httpStatusOf(err)
      if (code === 409) {
        setStatus('full')
        return
      }
      setStatus('error')
      if (code === 429) {
        setErrorMsg(t('送信回数の上限に達しました。しばらく待ってからもう一度お試しください。', 'You have reached the submission limit. Please wait a while and try again.'))
      } else if (code === 400) {
        setErrorMsg(reserve400Message(err, t))
      } else if (code === 422) {
        setErrorMsg(t(
          `入力内容に誤りがあります。お名前・メールアドレス・電話番号・人数（1〜${RESERVE_MAX_PARTICIPANTS}名）・備考（${INPUT_MAX_LENGTH.note}文字まで）をご確認ください。`,
          `Some entries are invalid. Please check your name, email, phone number, number of participants (1-${RESERVE_MAX_PARTICIPANTS}) and notes (up to ${INPUT_MAX_LENGTH.note} characters).`,
        ))
      } else {
        setErrorMsg(t('送信に失敗しました。再度お試しください。', 'Submission failed. Please try again.'))
      }
    }
  }

  // 入力欄（枠線のみの四角い欄）
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid #ddd',
    fontSize: 16, fontFamily: 'inherit', outline: 'none', background: '#fff',
    boxSizing: 'border-box', color: 'var(--c-ink)', borderRadius: 0,
    WebkitAppearance: 'none', appearance: 'none',
  }

  // 入力欄の上の小さなラベル
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, letterSpacing: '1.5px',
    textTransform: 'uppercase', color: '#999', marginBottom: 6,
  }

  // 「予約内容」などの区切りの見出し
  const sectionLabel: React.CSSProperties = {
    fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#aaa',
    margin: '32px 0 16px', paddingBottom: 8, borderBottom: '1px solid #f0f0f0',
  }

  /**
   * 日付・時間帯の選択肢（ラジオボタンを包んだカード）の見た目
   * @param selected - 選択中なら true（緑の枠）
   * @param disabled - 選べない（満席）なら true（薄く表示）
   * @returns 選択状態と満席状態を反映したラジオカード用の CSS スタイル
   */
  const radioCard = (selected: boolean, disabled = false): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
    border: `1px solid ${selected ? '#4a6741' : '#ddd'}`,
    borderRadius: 2, cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? '#f8f8f8' : selected ? '#f0f5ee' : '#fff',
    opacity: disabled ? 0.6 : 1,
  })

  // 予約完了後に出す予約内容の一覧
  const confirmRows = [
    { label: t('お名前', 'Name'), value: form.name },
    { label: t('メール', 'Email'), value: form.email },
    ...(form.phone ? [{ label: t('電話番号', 'Phone'), value: form.phone }] : []),
    { label: t('イベント', 'Event'), value: event?.name ?? '' },
    ...(form.preferred_date ? [{ label: t('予約日', 'Date'), value: fmtDate(form.preferred_date) }] : []),
    ...(selectedSession ? [{ label: t('予約時間', 'Time'), value: selectedSession.time_label }] : []),
    { label: t('参加人数', 'Participants'), value: t(`${form.participants} 名`, `${form.participants}`) },
    { label: t('植物持ち込み', 'Bring plant'), value: t(form.bring_plant ? 'あり' : 'なし', form.bring_plant ? 'Yes' : 'No') },
    { label: t('鉢持ち込み', 'Bring pot'), value: t(form.bring_pot ? 'あり' : 'なし', form.bring_pot ? 'Yes' : 'No') },
    ...(form.note ? [{ label: t('備考', 'Notes'), value: form.note }] : []),
  ]

  // ページの見出し（イベントが見つからないとき・読み込み中も同じものを出す）
  const pageHeader = (
    <div style={{ marginBottom: 40, paddingBottom: 32, borderBottom: '1px solid var(--c-border)' }}>
      <p style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 10px' }}>Habitat Oides</p>
      <h1 style={{ fontSize: 'clamp(24px, 4vw, 38px)', fontWeight: 200, letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0, color: 'var(--c-ink)' }}>
        {t('Workshop 予約', 'Workshop Reservation')}
      </h1>
    </div>
  )
  // ページのタイトル・説明（読み込み中・エラー・完了のどの表示でも同じものを出す）
  const pageMeta = (
    <PageMeta title={t('Workshop 予約', 'Workshop Reservation')} description={t('Habitat Style Workshop へのご予約はこちらから。', 'Reserve your spot at a Habitat Style Workshop.')} />
  )
  // ページ全体の外枠の余白
  const wrapStyle: React.CSSProperties = { maxWidth: 1000, margin: '0 auto', padding: 'clamp(40px, 6vw, 72px) clamp(20px, 4vw, 48px) 80px' }

  // イベントを読み込み中
  if (eventLoading) {
    return (
      <>
        {pageMeta}
        <div style={wrapStyle}>
          {pageHeader}
          <p role="status" style={{ textAlign: 'center', padding: '60px 0', color: 'var(--c-muted)' }}>{t('読み込み中...', 'Loading...')}</p>
        </div>
      </>
    )
  }

  // event_id が無い・イベントを取れなかった（存在しない・通信の失敗）ときは予約フォームを出さない
  if (!event) {
    /** 通信の失敗・サーバーの不具合で読み込めなかったか（404 = イベントが無い、とは分けて見出しと本文をそろえる） */
    const loadFailed = !!eventError && !!eventId && httpStatusOf(eventError) !== 404
    return (
      <>
        {pageMeta}
        <div style={wrapStyle}>
          {pageHeader}
          <div role="alert" style={{ textAlign: 'center', padding: '48px 20px' }}>
            <p style={{ fontSize: 18, fontWeight: 300, letterSpacing: '0.05em', color: 'var(--c-ink)', marginBottom: 12 }}>
              {loadFailed
                ? t('イベントを読み込めませんでした', 'Could not load the event')
                : t('イベントが見つかりません', 'Event not found')}
            </p>
            <p style={{ fontSize: 14, color: 'var(--c-muted)', lineHeight: 1.8, marginBottom: 28 }}>
              {loadFailed
                ? t('通信状況をご確認のうえ、ページを再読み込みしてください。', 'Please check your connection and reload the page.')
                : t('予約するイベントをイベント一覧からお選びください。', 'Please choose an event from the event list.')}
            </p>
            <Link to="/official/events" style={{ display: 'inline-block', padding: '10px 24px', border: '1px solid #dddde8', borderRadius: 4, color: 'var(--c-muted)', textDecoration: 'none', fontSize: 14 }}>
              {t('イベント一覧へ', 'Back to events')}
            </Link>
          </div>
        </div>
      </>
    )
  }

  // 予約の画面（上の pageMeta・pageHeader と同じ内容をここでも直接書いている）
  return (
    <>
      <PageMeta title={t('Workshop 予約', 'Workshop Reservation')} description={t('Habitat Style Workshop へのご予約はこちらから。', 'Reserve your spot at a Habitat Style Workshop.')} />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'clamp(40px, 6vw, 72px) clamp(20px, 4vw, 48px) 80px' }}>

        <div style={{ marginBottom: 40, paddingBottom: 32, borderBottom: '1px solid var(--c-border)' }}>
          <p style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 10px' }}>Habitat Oides</p>
          <h1 style={{ fontSize: 'clamp(24px, 4vw, 38px)', fontWeight: 200, letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0, color: 'var(--c-ink)' }}>
            {t('Workshop 予約', 'Workshop Reservation')}
          </h1>
        </div>

        {/* 左にイベント情報、右に予約フォームの 2 列（狭い画面では縦に並ぶ。index.css の .reserve-layout） */}
        <div className="reserve-layout">

          {/* 左：イベント情報（名前・日付・時間・会場、WS の説明と参加費、確認メールの案内） */}
          <div style={{ color: 'var(--c-body)' }}>
            <>
                <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 10px' }}>Event</p>
                <p style={{ fontSize: 17, fontWeight: 500, color: 'var(--c-ink)', margin: '0 0 12px', lineHeight: 1.5 }}>{event.name}</p>
                <div style={{ fontSize: 14, color: 'var(--c-body)', lineHeight: 2.1, background: 'var(--c-surface)', border: '1px solid var(--c-border)', padding: '16px 20px', borderRadius: 4 }}>
                  <div>{event.start_date}{event.end_date && event.end_date !== event.start_date ? ` 〜 ${event.end_date}` : ''}</div>
                  {event.time && <div>{event.time}</div>}
                  <div style={{ fontWeight: 500 }}>{event.location}</div>
                </div>
                <div style={{ marginTop: 24, padding: '20px 24px', background: '#f0f5ee', borderRadius: 4, border: '1px solid #c8dcc4' }}>
                  <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#6a8a64', margin: '0 0 12px' }}>Workshop</p>
                  <p style={{ fontSize: 15, color: 'var(--c-ink)', lineHeight: 1.8, margin: '0 0 16px' }}>
                    {t(
                      <>植物の自生地を鉢の中で再現するハビタットスタイルのワークショップです。<br />石・砂と植物を組み合わせて、はじめての方でも楽しめます。<br />植物・鉢はご持参いただいたものでもご参加いただけます。</>,
                      <>A habitat-style workshop where you recreate a plant's natural environment in a pot.<br />Combine stone, sand, and plants — perfect for first-timers.<br />Feel free to bring your own plants or pots.</>
                    )}
                  </p>
                  <div style={{ paddingTop: 14, borderTop: '1px solid #c8dcc4' }}>
                    <span style={{ fontSize: 11, letterSpacing: 1, color: '#6a8a64' }}>{t('参加費', 'Fee')}</span>
                    <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '0.02em', margin: '4px 0 2px' }}>{t(formatYen(WS_FEE_YEN, 'suffix'), formatYen(WS_FEE_YEN))}</p>
                    <p style={{ fontSize: 12, color: 'var(--c-muted)', margin: 0 }}>{t('鉢・資材含む / 植物別', 'Pot & materials included / Plants extra')}</p>
                  </div>
                  {/* 自サイトのページなので Link で移る（入力途中の内容を残したい人向けに別タブで開く） */}
                  <Link
                    to="/habitatoides/workshop"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-block', marginTop: 14, fontSize: 13, color: '#4a6741', textDecoration: 'underline', textUnderlineOffset: 3 }}
                  >
                    {t('詳しくはこちら', 'Learn more')}
                  </Link>
                </div>
                <div style={{ marginTop: 16, padding: '16px 20px', background: 'var(--c-bg)', borderRadius: 4, border: '1px solid var(--c-border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--c-muted)', lineHeight: 1.9, margin: 0 }}>
                    {t(
                      <>ご記入いただいた内容を確認後、メールにて予約確認をお送りします。<br />ご不明な点は <Link to="/official/contact" style={{ color: 'var(--c-green)', textDecoration: 'underline', textUnderlineOffset: 3 }}>お問い合わせ</Link> ください。</>,
                      <>After reviewing your submission, we'll send a confirmation email.<br />Questions? <Link to="/official/contact" style={{ color: 'var(--c-green)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Contact us</Link>.</>
                    )}
                  </p>
                </div>
            </>
          </div>

          {/* 右：フォーム（終了したイベント・満席・完了のときは代わりにそれぞれの案内） */}
          <div>
        {/* 終了したイベントは受付終了の案内 */}
        {event.is_past ? (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <p style={{ fontSize: 18, fontWeight: 300, letterSpacing: '0.05em', color: 'var(--c-ink)', marginBottom: 12 }}>
              {t('受付を終了しました', 'Registration is closed')}
            </p>
            <p style={{ fontSize: 14, color: 'var(--c-muted)', lineHeight: 1.8, marginBottom: 28 }}>
              {t('このイベントの予約受付は終了しています。次回のワークショップをお待ちください。', 'Reservations for this event are no longer available. Please look forward to the next workshop.')}
            </p>
            <Link to="/official/events" style={{ display: 'inline-block', padding: '10px 24px', border: '1px solid #dddde8', borderRadius: 4, color: 'var(--c-muted)', textDecoration: 'none', fontSize: 14 }}>
              {t('イベント一覧へ', 'Back to events')}
            </Link>
          </div>
        ) : status === 'full' ? (
          // 満席で受け付けられなかった。「戻る」で時間枠を選び直させる
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p style={{ fontSize: 18, color: '#c0392b', marginBottom: 16 }}>{t('このセッションは満席になりました', 'This session is now full')}</p>
            <p style={{ fontSize: 14, color: 'var(--c-muted)', marginBottom: 24 }}>{t('別の回をお選びいただくか、次回のワークショップをお待ちください。', 'Please choose another time slot or wait for the next workshop.')}</p>
            <button onClick={() => { setStatus('idle'); set('session_id', '') }} style={{ padding: '10px 24px', border: '1px solid #dddde8', borderRadius: 4, background: 'none', cursor: 'pointer', fontSize: 14 }}>
              {t('戻る', 'Back')}
            </button>
          </div>
        ) : status === 'done' ? (
          // 予約の完了と予約内容
          <div style={{ textAlign: 'center' }}>
            <div style={{ background: '#f0f6f0', border: '1px solid #b0d4b0', borderRadius: 4, padding: '36px 32px', marginBottom: 32 }}>
              <p style={{ fontSize: 22, fontWeight: 300, letterSpacing: '0.08em', color: '#2d5a2d', margin: '0 0 16px' }}>{t('予約を受け付けました', 'Reservation received')}</p>
              <p style={{ fontSize: 14, color: 'var(--c-body)', lineHeight: 1.9, margin: 0 }}>
                {t(
                  <><span>確認メールを </span><strong>{form.email}</strong><span> にお送りしました。</span><br />届かない場合は迷惑メールフォルダをご確認ください。</>,
                  <><span>A confirmation email has been sent to </span><strong>{form.email}</strong><span>.</span><br />If you don't see it, check your spam folder.</>
                )}
              </p>
            </div>
            <div style={{ background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, padding: '24px 28px', textAlign: 'left', marginBottom: 32 }}>
              <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 16px' }}>{t('予約内容', 'Reservation Details')}</p>
              {confirmRows.map(({ label, value }) => (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 12, padding: '8px 0', borderBottom: '1px solid #f0f0f5' }}>
                  <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>{label}</span>
                  <span style={{ fontSize: 14, color: 'var(--c-ink)' }}>{value}</span>
                </div>
              ))}
            </div>
            <Link to="/official/events" style={{ display: 'inline-block', padding: '12px 28px', border: '1px solid #dddde8', borderRadius: 4, color: 'var(--c-muted)', textDecoration: 'none', fontSize: 14 }}>
              {t('イベント一覧へ戻る', 'Back to events')}
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} style={{ background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, padding: '40px' }}>
            <p style={sectionLabel}>{t('予約内容', 'Reservation')}</p>

            {/* 予約日（複数日のイベントだけ。選び直すと時間枠と人数を戻す） */}
            {isMultiDay && (
              <div style={{ marginBottom: 20 }}>
                <p id={`${uid}-date`} style={{ ...labelStyle, margin: '0 0 6px' }}>{t('予約日', 'Date')} <span aria-hidden="true" style={{ color: '#c0392b' }}>*</span></p>
                <div role="radiogroup" aria-labelledby={`${uid}-date`} aria-required="true" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dates.map((d) => (
                    <label key={d} style={radioCard(form.preferred_date === d)}>
                      <input
                        type="radio"
                        name="preferred_date"
                        value={d}
                        checked={form.preferred_date === d}
                        onChange={() => setForm((f) => ({ ...f, preferred_date: d, session_id: '', participants: 1 }))}
                        style={{ accentColor: '#4a6741' }}
                      />
                      <span style={{ fontSize: 15, color: 'var(--c-ink)' }}>{fmtDate(d)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 予約時間（WS ありのイベントだけ。満席の枠は選べない） */}
            {event.has_workshop && (
              <div style={{ marginBottom: 20, opacity: sessionsDisabled ? 0.4 : 1, pointerEvents: sessionsDisabled ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
                <p id={`${uid}-time`} style={{ ...labelStyle, margin: '0 0 6px' }}>
                  {t('予約時間', 'Time')} <span aria-hidden="true" style={{ color: '#c0392b' }}>*</span>
                  {sessionsDisabled && (
                    <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11, color: '#aaa', marginLeft: 8 }}>
                      {t('（日付を先に選択してください）', '(Please select a date first)')}
                    </span>
                  )}
                </p>
                {/* 予約枠の取得の状態ごとの表示（取得中・失敗・枠なし・一覧） */}
                {sessionsStatus === 'loading' ? (
                  <p role="status" style={{ fontSize: 14, color: '#bbb', margin: 0 }}>{t('読み込み中...', 'Loading...')}</p>
                ) : sessionsStatus === 'error' ? (
                  <div role="alert">
                    <p style={{ fontSize: 14, color: '#c0392b', margin: '0 0 8px' }}>{t('予約枠を読み込めませんでした。', 'Could not load the time slots.')}</p>
                    <button type="button" onClick={() => setSessionsRetry((n) => n + 1)} style={{ padding: '6px 16px', border: '1px solid #dddde8', borderRadius: 4, background: 'none', cursor: 'pointer', fontSize: 13 }}>
                      {t('再読み込み', 'Retry')}
                    </button>
                  </div>
                ) : sessionsStatus === 'ok' && sessions.length === 0 ? (
                  <p style={{ fontSize: 14, color: 'var(--c-muted)', margin: 0 }}>{t('この日の予約枠はありません。', 'No time slots are available on this date.')}</p>
                ) : sessionsStatus !== 'ok' ? null : (
                  <div role="radiogroup" aria-labelledby={`${uid}-time`} aria-required="true" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sessions.map((s) => {
                      // この枠の残りの人数と、満席かどうか
                      const rem = s.max_participants - s.reserved_count
                      const full = rem <= 0
                      return (
                        <label key={s.id} style={radioCard(form.session_id === s.id, full)}>
                          <input
                            type="radio"
                            name="session"
                            value={s.id}
                            disabled={full}
                            checked={form.session_id === s.id}
                            onChange={() => setForm((f) => ({ ...f, session_id: s.id, participants: 1 }))}
                            style={{ accentColor: '#4a6741' }}
                          />
                          <span style={{ flex: 1, fontSize: 15, color: 'var(--c-ink)' }}>{s.time_label}</span>
                          <span style={{ fontSize: 12, color: full ? '#c0392b' : '#8a9a7e' }}>
                            {full ? t('満席', 'Full') : t(`残り ${rem} 名`, `${rem} left`)}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 参加人数。時間枠のあるイベントは残りの人数（上限 RESERVE_MAX_PARTICIPANTS）までの選択肢、無いイベントは数値の入力 */}
            {event && (
              <div style={{ marginBottom: 20, opacity: participantsDisabled ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                <label htmlFor={`${uid}-participants`} style={labelStyle}>{t('参加人数', 'Participants')} <span aria-hidden="true" style={{ color: '#c0392b' }}>*</span></label>
                {expectsSessions ? (
                  <select
                    id={`${uid}-participants`}
                    disabled={participantsDisabled}
                    style={{ ...inputStyle, width: 120, cursor: participantsDisabled ? 'not-allowed' : 'default' }}
                    value={form.participants}
                    onChange={(e) => set('participants', Number(e.target.value))}
                  >
                    {form.session_id && selectedRemaining > 0
                      ? Array.from({ length: Math.min(selectedRemaining, RESERVE_MAX_PARTICIPANTS) }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>{t(`${n} 名`, `${n}`)}</option>
                        ))
                      : <option value={1}>—</option>
                    }
                  </select>
                ) : (
                  <input id={`${uid}-participants`} required type="number" min={1} max={RESERVE_MAX_PARTICIPANTS} style={{ ...inputStyle, width: 100 }} value={form.participants} onChange={(e) => set('participants', Number(e.target.value))} />
                )}
              </div>
            )}

            <p style={sectionLabel}>{t('お客様情報', 'Your Information')}</p>

            {/* お名前・メールアドレス（必須）・電話番号（任意） */}
            <div style={{ marginBottom: 20 }}>
              <label htmlFor={`${uid}-name`} style={labelStyle}>{t('お名前', 'Name')} <span aria-hidden="true" style={{ color: '#c0392b' }}>*</span></label>
              <input id={`${uid}-name`} required autoComplete="name" maxLength={INPUT_MAX_LENGTH.name} style={inputStyle} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label htmlFor={`${uid}-email`} style={labelStyle}>{t('メールアドレス', 'Email')} <span aria-hidden="true" style={{ color: '#c0392b' }}>*</span></label>
              <input id={`${uid}-email`} required type="email" autoComplete="email" style={inputStyle} value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label htmlFor={`${uid}-phone`} style={labelStyle}>{t('電話番号（任意）', 'Phone (optional)')}</label>
              <input id={`${uid}-phone`} type="tel" autoComplete="tel" maxLength={INPUT_MAX_LENGTH.phone} style={inputStyle} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="090-0000-0000" />
            </div>

            {/* 植物・鉢の持ち込み（任意） */}
            <div style={{ marginBottom: 20 }}>
              <p id={`${uid}-bring`} style={{ ...labelStyle, margin: '0 0 6px' }}>{t('持ち込み（任意）', 'Bring your own (optional)')}</p>
              <div role="group" aria-labelledby={`${uid}-bring`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 15 }}>
                  <input type="checkbox" checked={form.bring_plant} onChange={(e) => set('bring_plant', e.target.checked)} style={{ width: 18, height: 18, accentColor: '#4a6741' }} />
                  {t('植物を持ち込む', 'Bring a plant')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 15 }}>
                  <input type="checkbox" checked={form.bring_pot} onChange={(e) => set('bring_pot', e.target.checked)} style={{ width: 18, height: 18, accentColor: '#4a6741' }} />
                  {t('鉢を持ち込む', 'Bring a pot')}
                </label>
              </div>
            </div>

            <div style={{ marginBottom: 0 }}>
              <label htmlFor={`${uid}-note`} style={labelStyle}>{t('備考（任意）', 'Notes (optional)')}</label>
              <textarea id={`${uid}-note`} rows={4} maxLength={INPUT_MAX_LENGTH.note} style={{ ...inputStyle, resize: 'vertical' }} value={form.note} onChange={(e) => set('note', e.target.value)} />
            </div>

            {/* 送信に失敗したときの案内 */}
            {status === 'error' && <p role="alert" style={{ color: '#c0392b', fontSize: 14, marginTop: 16, marginBottom: 0 }}>{errorMsg}</p>}

            {/* 予約ボタン（日付・時間枠がそろうまで薄く表示して押せない） */}
            <button
              type="submit"
              disabled={status === 'loading' || !canSubmit}
              style={{ width: '100%', padding: 16, background: '#1e3272', color: '#fff', border: 'none', fontSize: 16, letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', marginTop: 32, borderRadius: 4, opacity: !canSubmit ? 0.5 : 1 }}
            >
              {status === 'loading' ? t('送信中...', 'Submitting...') : t('予約する', 'Reserve')}
            </button>
            {/* まだ選んでいない項目の案内 */}
            {(needsDate || needsSession) && (
              <p style={{ textAlign: 'center', fontSize: 12, color: '#c0392b', marginTop: 8 }}>
                {needsDate ? t('予約日を選択してください', 'Please select a date') : t('予約時間を選択してください', 'Please select a time')}
              </p>
            )}
          </form>
        )}
          </div>
        </div>
      </div>

    </>
  )
}
