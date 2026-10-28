import { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { api, type Event, type EventAdminInfo, type EventFinances } from '../../lib/api'
import { ImageViewer } from './AdminInfoParts'
import { hasText, isPastDue, localToday } from './adminInfoFormat'
import EventAdminInfoViewContent from './EventAdminInfoViewContent'

/** この画面が受け取る location.state の形 */
interface ViewLocationState {
  /** 確認画面に来る前の画面（イベント一覧・イベント編集画面など）。「← 戻る」の行き先 */
  from?: string
  /** 編集画面で保存に成功して戻ってきたときだけ true。「保存しました」を表示する */
  saved?: boolean
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
 * イベント管理情報（搬入・搬出・宿泊・出店料・出店要項・メモ）を見やすく確認するページ
 * URL: /admin/events/:id/admin-info
 * 「編集」ボタンで編集画面（/admin/events/:id/admin-info/edit）へ進み、保存するとこの画面に戻る
 * @returns 管理情報の確認画面（と出店要項の画像の拡大表示）
 */
export default function AdminEventAdminInfoView() {
  /** URL の :id（対象のイベントの id） */
  const { id } = useParams<{ id: string }>()
  /** 今の画面の場所（state の from・saved を読むため） */
  const location = useLocation()
  /** 履歴から saved を消すための画面移動の関数 */
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
    /** 「保存しました」を消すタイマー（画面を閉じたら止める） */
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

  return (
    <>
      <EventAdminInfoViewContent
        event={event}
        info={info}
        loading={loading}
        error={error}
        savedVisible={savedVisible}
        backTo={backTo}
        editPath={editPath}
        from={from}
        guidelineImages={guidelineImages}
        isEmpty={!!info && isAdminInfoEmpty(info)}
        boothFee={boothFee}
        hotelFee={hotelFee}
        hasBoothFeeInfo={hasBoothFeeInfo}
        overdue={overdue}
        onOpenImage={setViewerIndex}
      />

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
