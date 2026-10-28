import { Link } from 'react-router-dom'
import type { Event, EventAdminInfo } from '../../lib/api'
import { SectionBox } from './AdminInfoParts'
import { formatJaDate, formatJaDateTime, formatYen, hasText } from './adminInfoFormat'

/** 収支からの補完結果を含む、画面に表示する料金の形 */
interface ResolvedFee {
  /** 表示する料金。値がなければ null */
  value: number | null
  /** 収支の値を表示しているかどうか */
  fromFinance: boolean
}

/** 管理情報確認画面の描画に必要な値と、親画面が所有する操作 callback */
interface EventAdminInfoViewContentProps {
  /** イベント基本情報。取得前・取得失敗時は null */
  event: Event | null
  /** 管理情報。取得前・取得失敗時は null */
  info: EventAdminInfo | null
  /** 読み込み処理中かどうか */
  loading: boolean
  /** 読み込み失敗のメッセージ。無ければ null */
  error: string | null
  /** 保存後メッセージを表示するかどうか */
  savedVisible: boolean
  /** 戻るリンクの遷移元 */
  backTo: string
  /** 編集画面の URL */
  editPath: string
  /** 編集画面へ渡す遷移元 state */
  from: string | undefined
  /** 出店要項画像 URL の一覧 */
  guidelineImages: string[]
  /** 管理情報が空であることを親画面が判定した結果 */
  isEmpty: boolean
  /** 収支値で補完した出店料 */
  boothFee: ResolvedFee
  /** 収支値で補完した宿泊料金 */
  hotelFee: ResolvedFee
  /** 支払い状況を表示する情報があるかどうか */
  hasBoothFeeInfo: boolean
  /** 支払い期限を過ぎて未払いかどうか */
  overdue: boolean
  /** 画像サムネイルを押したとき親画面に選択位置を通知する */
  onOpenImage: (index: number) => void
}

/**
 * 管理情報確認画面の表示だけを担当し、読み込み・状態・料金補完・遷移判定は親画面に委ねる。
 * @param props - 親画面が取得・計算した表示値と画像選択 callback
 * @returns 管理情報確認画面の本文
 */
export default function EventAdminInfoViewContent({
  event,
  info,
  loading,
  error,
  savedVisible,
  backTo,
  editPath,
  from,
  guidelineImages,
  isEmpty,
  boothFee,
  hotelFee,
  hasBoothFeeInfo,
  overdue,
  onOpenImage,
}: EventAdminInfoViewContentProps) {
  /** 編集画面に遷移するリンク。元の遷移先 state を引き継ぐ */
  const editButton = (
    <Link to={editPath} state={{ from }} style={editButtonStyle}>
      編集
    </Link>
  )

  return (
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

      {/* 管理情報の本体（読み込めたときだけ） */}
      {!loading && info && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* 管理情報がまだ1つも登録されていないときの案内 */}
          {isEmpty && (
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
                  /* サムネイル。編集画面と同じく最小 120px で折り返し、押すと拡大表示 */
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(120px, 100%), 1fr))', gap: 10 }}>
                    {guidelineImages.map((url, i) => (
                      <button
                        key={`${url}-${i}`}
                        type="button"
                        onClick={() => onOpenImage(i)}
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

      {/* 下部の編集ボタン。読み込みに失敗したときも表示する */}
      {!loading && (
        <div style={{ marginTop: 32 }}>
          {editButton}
        </div>
      )}
    </div>
  )
}

/** 「編集」ボタンの見た目。スマホでも押しやすいよう高さを44px確保する */
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

/** 支払い状況バッジの共通見た目 */
const badgeBaseStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '3px 10px',
  borderRadius: 999,
  fontSize: 13,
  lineHeight: 1.5,
  border: '1px solid',
}

/** 「支払い済み」バッジの色 */
const paidBadgeStyle: React.CSSProperties = { ...badgeBaseStyle, color: '#4a6741', background: '#f0f5ee', borderColor: '#b8d4ae' }

/** 「未払い」「期限切れ」バッジの色 */
const unpaidBadgeStyle: React.CSSProperties = { ...badgeBaseStyle, color: '#c0392b', background: '#fdf2f2', borderColor: '#f5c6cb' }

/** 出店要項・メモの改行を保ち、長い URL などを枠内で折り返す見た目 */
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
 * 空文字や空白だけの文字列が与えられた場合に「未入力」を描画する。
 * @returns 未入力を示す薄い文字
 */
function Empty() {
  return <span style={{ color: 'var(--c-muted)', fontSize: 14 }}>未入力</span>
}

/**
 * ラベルと値を横並びにし、狭い幅では値を次の行へ折り返す。
 * @param props.label - 項目名
 * @param props.children - 項目の表示内容
 * @returns 管理情報の1行
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 12, rowGap: 2, padding: '10px 0', borderBottom: '1px solid #f0f0f5' }}>
      {/* 固定幅のラベル。値が入りきらない場合は値を下へ折り返す */}
      <div style={{ flex: '0 0 120px', fontSize: 13, color: 'var(--c-muted)', letterSpacing: 1, paddingTop: 1 }}>
        {label}
      </div>
      {/* 長い文字列で親の幅を押し広げない値の領域 */}
      <div style={{ flex: '1 1 200px', minWidth: 0, fontSize: 15, color: 'var(--c-ink)', overflowWrap: 'anywhere' }}>
        {children}
      </div>
    </div>
  )
}

/**
 * 文字列をそのまま表示し、未入力なら代替表示を出す。
 * @param props.value - 表示する文字列。null・undefined・空白だけなら未入力
 * @returns 入力文字列または未入力表示
 */
function TextValue({ value }: { value: string | null | undefined }) {
  return typeof value === 'string' && value.trim() !== '' ? <>{value}</> : <Empty />
}

/**
 * 金額と、収支から補完した値であることを描画する。
 * @param props.fee - 表示金額と収支補完の有無
 * @returns 金額または未入力表示
 */
function FeeValue({ fee }: { fee: ResolvedFee }) {
  /** 表示する金額の文字列。金額が無いときは null */
  const text = formatYen(fee.value)
  if (!text) return <Empty />
  return (
    <>
      {text}
      {fee.fromFinance && <span style={{ fontSize: 12, color: 'var(--c-muted)', marginLeft: 4 }}>（収支から）</span>}
    </>
  )
}
