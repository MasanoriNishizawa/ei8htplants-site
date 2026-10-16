import { useEffect, useState } from 'react'
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom'
import { api, type Event, type EventAdminInfo, type EventFinances } from '../../lib/api'
import { SectionBox, ImageViewer } from './AdminInfoParts'
import { formatJaDate, formatJaDateTime, formatYen, isPastDue, localToday } from './adminInfoFormat'

/** この画面が受け取る location.state の形 */
interface ViewLocationState {
  /** 確認画面に来る前の画面（イベント一覧・イベント編集画面など）。「← 戻る」の行き先 */
  from?: string
  /** 編集画面で保存に成功して戻ってきたときだけ true。「保存しました」を表示する */
  saved?: boolean
}

/** 「編集」ボタン（黒いボタン）の見た目。スマホでも押しやすいよう高さを 44px 確保する */
const editButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  padding: '10px 28px',
  background: 'var(--c-ink)',
  color: '#ffffff',
  borderRadius: 4,
  fontSize: 15,
  textDecoration: 'none',
  boxSizing: 'border-box',
}

/** 支払い状況などのバッジの共通の見た目 */
const badgeBaseStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '3px 10px',
  borderRadius: 999,
  fontSize: 13,
  lineHeight: 1.5,
  border: '1px solid',
}

/** 「支払い済み」バッジの色（緑系） */
const paidBadgeStyle: React.CSSProperties = { ...badgeBaseStyle, color: '#4a6741', background: '#f0f5ee', borderColor: '#b8d4ae' }

/** 「未払い」「期限切れ」バッジの色（赤系） */
const unpaidBadgeStyle: React.CSSProperties = { ...badgeBaseStyle, color: '#c0392b', background: '#fdf2f2', borderColor: '#f5c6cb' }

/** 改行をそのまま表示し、長い URL なども枠からはみ出さず折り返す文章の見た目（出店要項・メモ） */
const multilineTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.8,
  color: 'var(--c-body)',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
}

/**
 * 文字列が入力されているかどうか（空白・改行だけのものは未入力とみなす）
 * @param value - 調べる文字列
 * @returns 空白以外の文字が1つでもあれば true
 */
function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * 管理情報が1項目も入力されていないかどうか（収支から補う値は含めず、管理情報だけで判定する）
 * @param info - 管理情報
 * @returns すべて未入力（支払い済みも付いていない・画像もない）なら true
 */
function isAdminInfoEmpty(info: EventAdminInfo): boolean {
  /** 文字列の項目。空白だけのものも未入力とみなす */
  const texts = [
    info.carry_in_time, info.carry_out_time, info.hotel_name,
    info.booth_fee_pay_method, info.booth_fee_due, info.notes, info.guidelines_text,
  ]
  /** 数値の項目 */
  const numbers = [info.hotel_fee, info.booth_fee]
  return texts.every((v) => !hasText(v))
    && numbers.every((v) => v === null || v === undefined)
    && !info.booth_fee_paid
    && (info.guidelines_image_urls ?? []).length === 0
}

/**
 * 管理情報の金額が未入力のとき、収支の金額で補う（編集画面の初期値と同じ決め方）
 * @param adminValue - 管理情報の金額（null・undefined なら未入力）
 * @param financeValue - 収支の金額（収支を読めなかったときは undefined）
 * @returns 表示する金額と、収支から補ったかどうか。どちらにもなければ value は null
 */
function resolveFee(
  adminValue: number | null | undefined,
  financeValue: number | null | undefined,
): { value: number | null; fromFinance: boolean } {
  if (adminValue !== null && adminValue !== undefined) return { value: adminValue, fromFinance: false }
  // 収支の 0 は「未入力」と区別できないため、0 以外のときだけ使う（編集画面と同じ）
  if (financeValue !== null && financeValue !== undefined && financeValue !== 0) return { value: financeValue, fromFinance: true }
  return { value: null, fromFinance: false }
}

/**
 * 未入力のときに表示する薄い文字
 */
function Empty() {
  return <span style={{ color: 'var(--c-muted)', fontSize: 14 }}>未入力</span>
}

/**
 * 「ラベル」と「値」を横に並べる1行。幅が狭い（スマホ）ときは折り返してラベルの下に値が来る
 * @param label - 項目名
 * @param children - 値の表示
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 12, rowGap: 2, padding: '10px 0', borderBottom: '1px solid #f0f0f5' }}>
      {/* ラベル。幅 120px で固定し、値と合わせて入りきらない幅では値が下に回る */}
      <div style={{ flex: '0 0 120px', fontSize: 13, color: 'var(--c-muted)', letterSpacing: 1, paddingTop: 1 }}>
        {label}
      </div>
      {/* 値。minWidth: 0 で長い文字列でも枠を押し広げない */}
      <div style={{ flex: '1 1 200px', minWidth: 0, fontSize: 15, color: 'var(--c-ink)', overflowWrap: 'anywhere' }}>
        {children}
      </div>
    </div>
  )
}

/**
 * 文字列の値を表示する。未入力なら「未入力」を薄く出す
 * @param value - 表示する値（null・undefined・空文字は未入力）
 */
function TextValue({ value }: { value: string | null | undefined }) {
  return hasText(value) ? <>{value}</> : <Empty />
}

/**
 * 金額を表示する。収支から補った値には小さく「（収支から）」を添える
 * @param fee - resolveFee で決めた金額と、収支から補ったかどうか
 */
function FeeValue({ fee }: { fee: { value: number | null; fromFinance: boolean } }) {
  const text = formatYen(fee.value)
  if (!text) return <Empty />
  return (
    <>
      {text}
      {fee.fromFinance && <span style={{ fontSize: 12, color: 'var(--c-muted)', marginLeft: 4 }}>（収支から）</span>}
    </>
  )
}

/**
 * イベント管理情報（搬入・搬出・宿泊・出店料・出店要項・メモ）を見やすく確認するページ
 * URL: /admin/events/:id/admin-info
 * 「編集」ボタンで編集画面（/admin/events/:id/admin-info/edit）へ進み、保存するとこの画面に戻る
 */
export default function AdminEventAdminInfoView() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  /** 遷移元から受け取った state（from・saved） */
  const locState = location.state as ViewLocationState | null
  /** 確認画面に来る前の画面。編集画面へ渡し、保存後に戻ってきたときにも引き継がれる */
  const from: string | undefined = locState?.from
  /** 「← 戻る」の行き先。遷移元がなければイベント一覧 */
  const backTo: string = from ?? '/admin/events'
  /** 編集画面の URL */
  const editPath = `/admin/events/${id ?? ''}/admin-info/edit`

  /** イベントの基本情報（イベント名・開催日の表示に使う） */
  const [event, setEvent] = useState<Event | null>(null)
  /** 管理情報。読み込み前・失敗時は null */
  const [info, setInfo] = useState<EventAdminInfo | null>(null)
  /** 収支（管理情報の出店料・宿泊料金が未入力のときに補うために使う）。読めなかったときは null */
  const [finances, setFinances] = useState<EventFinances | null>(null)
  /** 読み込み中かどうか */
  const [loading, setLoading] = useState(true)
  /** 読み込みに失敗したときのメッセージ。null なら非表示 */
  const [error, setError] = useState<string | null>(null)
  /** 「保存しました」の表示フラグ。編集画面から保存して戻ってきたときだけ true で始まり、3秒後に消える */
  const [savedVisible, setSavedVisible] = useState<boolean>(() => locState?.saved === true)
  /** 拡大表示中の出店要項画像の位置（0始まり）。null なら拡大表示を閉じている */
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  // 1. イベント情報・管理情報・収支を並行して取得する。
  //    収支は補助の表示にしか使わないため、失敗しても null にして画面は表示する
  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    Promise.all([
      api.events.get(id),
      api.events.getAdminInfo(id),
      api.events.getFinances(id).catch(() => null),
    ])
      .then(([ev, adminInfo, fin]) => {
        setEvent(ev)
        setInfo(adminInfo)
        setFinances(fin)
      })
      .catch(() => {
        setError('管理情報の読み込みに失敗しました。ページを再読み込みしてください。')
      })
      .finally(() => setLoading(false))
  }, [id])

  // 2. 「保存しました」を3秒後に消す
  useEffect(() => {
    if (!savedVisible) return
    const timer = setTimeout(() => setSavedVisible(false), 3000)
    return () => clearTimeout(timer)
  }, [savedVisible])

  // 3. 履歴に残った saved を消す（再読み込みやブラウザの戻る・進むで「保存しました」が再び出ないようにする）。from は残す
  useEffect(() => {
    if (locState?.saved) {
      navigate(location.pathname, { replace: true, state: { from: locState.from } })
    }
  }, [locState, location.pathname, navigate])

  /** 出店要項の画像 URL 一覧（既存データで undefined のときは空配列として扱う） */
  const guidelineImages: string[] = info?.guidelines_image_urls ?? []
  /** 支払い期限を過ぎているのに未払いかどうか（「期限切れ」バッジの表示に使う） */
  const overdue: boolean = !!info && !info.booth_fee_paid && isPastDue(info.booth_fee_due, localToday())
  /** 表示する出店料（管理情報が未入力なら収支の出店料で補う） */
  const boothFee = resolveFee(info?.booth_fee, finances?.booth_fee)
  /** 表示する宿泊料金（管理情報が未入力なら収支の宿泊費で補う） */
  const hotelFee = resolveFee(info?.hotel_fee, finances?.accommodation)
  /** 出店料について何か入力されているかどうか（収支から補った出店料も含む）。何もなければ支払い状況も「未入力」とする */
  const hasBoothFeeInfo: boolean = !!info && (
    boothFee.value !== null || hasText(info.booth_fee_pay_method) || hasText(info.booth_fee_due) || !!info.booth_fee_paid
  )

  /** 編集ボタン。確認画面に来たときの from を渡し、保存して戻ってきても「← 戻る」が元の画面へ戻れるようにする */
  const editButton = (
    <Link to={editPath} state={{ from }} style={editButtonStyle}>
      編集
    </Link>
  )

  return (
    <>
    <div style={{ maxWidth: 640 }}>
      {/* 戻るリンク。上下に余白を持たせてスマホでもタップしやすくする */}
      <div style={{ marginBottom: 12 }}>
        <Link to={backTo} style={{ display: 'inline-block', padding: '12px 0', fontSize: 13, color: 'var(--c-muted)', textDecoration: 'none' }}>
          &larr; 戻る
        </Link>
      </div>

      {/* 見出し・イベント名と、右側の編集ボタン。狭い幅では編集ボタンが下に折り返す */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, margin: '0 0 4px' }}>
            管理情報
          </h2>
          {event && (
            <p style={{ fontSize: 14, color: 'var(--c-muted)', margin: 0, overflowWrap: 'anywhere' }}>
              {event.name} &mdash; {formatJaDate(event.start_date) ?? event.start_date}
              {event.end_date && event.end_date !== event.start_date && ` 〜 ${formatJaDate(event.end_date) ?? event.end_date}`}
            </p>
          )}
        </div>
        {editButton}
      </div>

      {/* 編集画面で保存して戻ってきたときに3秒間表示する */}
      {savedVisible && (
        <p role="status" style={{ color: '#4a6741', background: '#f0f5ee', border: '1px solid #b8d4ae', borderRadius: 4, padding: '12px 16px', margin: '0 0 16px', fontSize: 14 }}>
          保存しました
        </p>
      )}

      {/* 読み込み中 */}
      {loading && <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p>}

      {/* 読み込み失敗 */}
      {!loading && error && (
        <p style={{ color: '#c0392b', background: '#fdf2f2', border: '1px solid #f5c6cb', borderRadius: 4, padding: '12px 16px', margin: '0 0 16px', fontSize: 14 }}>
          {error}
        </p>
      )}

      {!loading && info && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* 管理情報がまだ1つも登録されていないときの案内 */}
          {isAdminInfoEmpty(info) && (
            <p style={{ margin: 0, padding: '14px 16px', background: '#f4f4f8', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, color: 'var(--c-body)', lineHeight: 1.7 }}>
              まだ管理情報が登録されていません。「編集」ボタンから搬入・搬出、宿泊、出店料などを登録できます。
            </p>
          )}

          {/* 搬入・搬出 */}
          <SectionBox label="搬入・搬出">
            <Row label="搬入日時"><TextValue value={formatJaDateTime(info.carry_in_time)} /></Row>
            <Row label="搬出日時"><TextValue value={formatJaDateTime(info.carry_out_time)} /></Row>
          </SectionBox>

          {/* 宿泊 */}
          <SectionBox label="宿泊">
            <Row label="ホテル名"><TextValue value={info.hotel_name} /></Row>
            <Row label="宿泊料金"><FeeValue fee={hotelFee} /></Row>
          </SectionBox>

          {/* 出店料 */}
          <SectionBox label="出店料">
            <Row label="出店料"><FeeValue fee={boothFee} /></Row>
            <Row label="支払い方法"><TextValue value={info.booth_fee_pay_method} /></Row>
            <Row label="支払い期限"><TextValue value={formatJaDate(info.booth_fee_due)} /></Row>
            <Row label="支払い状況">
              {!hasBoothFeeInfo ? (
                <Empty />
              ) : info.booth_fee_paid ? (
                <span style={paidBadgeStyle}>支払い済み</span>
              ) : (
                <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
                  <span style={unpaidBadgeStyle}>未払い</span>
                  {/* 期限を過ぎて未払いのときは、強調した「期限切れ」も並べる */}
                  {overdue && (
                    <span style={{ ...unpaidBadgeStyle, color: '#ffffff', background: '#c0392b', borderColor: '#c0392b' }}>期限切れ</span>
                  )}
                </span>
              )}
            </Row>
          </SectionBox>

          {/* 出店要項（主催者から届いた要項の文章と画像） */}
          <SectionBox label="出店要項">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--c-muted)', letterSpacing: 1, marginBottom: 6 }}>要項の文章</div>
                {hasText(info.guidelines_text) ? <p style={multilineTextStyle}>{info.guidelines_text}</p> : <Empty />}
              </div>
              <div>
                <div style={{ fontSize: 13, color: 'var(--c-muted)', letterSpacing: 1, marginBottom: 6 }}>
                  要項の画像{guidelineImages.length > 0 && `（${guidelineImages.length} 枚）`}
                </div>
                {guidelineImages.length === 0 ? (
                  <Empty />
                ) : (
                  // サムネイル。編集画面と同じく最小 120px で折り返し、狭い幅でも横スクロールしない
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(120px, 100%), 1fr))', gap: 10 }}>
                    {guidelineImages.map((url, i) => (
                      <button
                        key={`${url}-${i}`}
                        type="button"
                        onClick={() => setViewerIndex(i)}
                        aria-label={`出店要項の画像 ${i + 1} を拡大表示`}
                        style={{ display: 'block', width: '100%', aspectRatio: '1 / 1', padding: 0, border: '1px solid #dddde8', borderRadius: 4, background: '#f4f4f8', overflow: 'hidden', cursor: 'zoom-in', minWidth: 0 }}
                      >
                        <img
                          src={url}
                          alt={`出店要項の画像 ${i + 1}`}
                          loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </SectionBox>

          {/* メモ */}
          <SectionBox label="メモ">
            {hasText(info.notes) ? <p style={multilineTextStyle}>{info.notes}</p> : <Empty />}
          </SectionBox>
        </div>
      )}

      {/* 下部の編集ボタン。長い内容を読み終えた位置からもすぐ編集できるようにする（読み込みに失敗したときも出す） */}
      {!loading && (
        <div style={{ marginTop: 32 }}>
          {editButton}
        </div>
      )}
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
