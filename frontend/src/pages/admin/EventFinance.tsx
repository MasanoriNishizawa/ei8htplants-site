import { useEffect, useState } from 'react'
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom'
import { api, type Event, type EventFinancesBody } from '../../lib/api'
import { computeFinances } from '../../lib/finance'
import { backPathFrom } from '../../lib/navigation'
import EventFinanceFields from './EventFinanceFields'
import { confirmLeaveIfDirty, useDirtyTracker, useUnsavedChanges } from './UnsavedChanges'

/**
 * 読み込みが終わる前・読み込みに失敗したときのフォームの初期値（ガソリン単価だけ 160 円/L を入れておく）
 * 収支がまだ無いイベントでも、API（GET /events/:id/finances）が既定値を返すので、読み込めればその値で置き換わる
 */
const BLANK: EventFinancesBody = {
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

/**
 * 特定イベントの収支（売上・各支出・計算結果）を入力・保存するページ
 * URL: /admin/events/:id/finances
 * @returns 収支の入力フォームと計算結果
 */
export default function EventFinance() {
  /** URL の :id（対象のイベントの id） */
  const { id } = useParams<{ id: string }>()
  /** 今の画面の場所（戻り先 state.from を読むため） */
  const location = useLocation()
  /** 保存後に元の画面へ戻るための画面移動の関数 */
  const navigate = useNavigate()
  /** 戻り先のパス。遷移元が無いときはイベント一覧へ戻る */
  const backTo = backPathFrom(location.state, '/admin/events')
  /** 対象のイベント（WS の有無・見出しの表示に使う） */
  const [event, setEvent] = useState<Event | null>(null)
  /** 収支の入力 */
  const [form, setForm] = useState<EventFinancesBody>(BLANK)
  /** 読み込み中なら true */
  const [loading, setLoading] = useState(true)
  /** 保存中なら true */
  const [saving, setSaving] = useState(false)
  /** 読み込み・保存エラーのメッセージ。null なら非表示 */
  const [error, setError] = useState<string | null>(null)
  /** 読み込みに失敗したかどうか。true の間は保存できなくする（空のフォームで既存データを上書きしないため） */
  const [loadFailed, setLoadFailed] = useState(false)
  /** 未保存の変更があるか（読み込み直後の値を基準にする。読み込み前・失敗時は変更なし） */
  const { isDirty, resetBaseline } = useDirtyTracker(form)
  // 未保存の変更をサイドメニューの確認・再読み込みの確認に使えるよう登録する（保存に成功したら元の画面へ移るので確認は出ない）
  useUnsavedChanges(isDirty)

  /*
   * イベント情報・収支データ・予約一覧・管理情報を同時取得してフォームに反映する
   * 1. 4 つをまとめて取得する
   * 2. キャンセル以外の予約の人数を合計する（WS ありで予約があれば、WS 参加人数はこの値にする）
   * 3. 収支の出店料・宿泊費が 0 なら、管理情報の値で補ってフォームに入れる
   */
  useEffect(() => {
    if (!id) return
    // 1. まとめて取得
    Promise.all([
      api.events.get(id),
      api.events.getFinances(id),
      api.reserve.list(id),
      api.events.getAdminInfo(id),
    ]).then(([ev, fin, reservations, info]) => {
      setEvent(ev)
      // 2. 予約の人数の合計
      /** キャンセル以外の予約の参加人数の合計 */
      const reservationTotal = reservations
        .filter((r) => r.status !== 'cancelled')
        .reduce((sum, r) => sum + r.participants, 0)
      // 3. フォームに反映し、未保存の変更の判定の基準にする
      /** 読み込んだ値で作ったフォームの初期値 */
      const loadedForm: EventFinancesBody = {
        sales: fin.sales,
        // 収支に値がない（0）場合は管理情報の出店料を初期値として使う
        booth_fee: fin.booth_fee !== 0 ? fin.booth_fee : (info?.booth_fee ?? 0),
        distance: fin.distance,
        gas_price: fin.gas_price,
        expressway_toll: fin.expressway_toll,
        // 収支に値がない（0）場合は管理情報の宿泊料金を初期値として使う
        accommodation: fin.accommodation !== 0 ? fin.accommodation : (info?.hotel_fee ?? 0),
        ws_participants: ev.has_workshop && reservationTotal > 0 ? reservationTotal : fin.ws_participants,
        payment_flag: fin.payment_flag,
        ws_payment_done: fin.ws_payment_done ?? false,
        other_expenses: fin.other_expenses,
        other_expenses_note: fin.other_expenses_note,
        notes: fin.notes,
      }
      setForm(loadedForm)
      resetBaseline(loadedForm)
    }).catch(() => {
      // 読み込み失敗時にエラーメッセージを表示し、保存を止める
      setError('データの読み込みに失敗しました。ページを再読み込みしてください。')
      setLoadFailed(true)
    }).finally(() => setLoading(false))
    // resetBaseline は入力のたびに作り直されるが、読み込みは id が変わったときだけにする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /**
   * 収支の入力の 1 項目を書き換える
   * @param key - 項目名
   * @param value - 新しい値
   * @returns 戻り値なし。
   */
  const set = <K extends keyof EventFinancesBody>(key: K, value: EventFinancesBody[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  /** 入力値をもとにリアルタイムで計算した移動費・WS売上・収支・手伝い支払い額など */
  const computed = computeFinances({ event_id: id ?? '', ...form }, event?.has_workshop ?? false)
  /**
   * 収支を保存し、管理情報の出店料・宿泊費も同じ値にそろえてから元の画面へ戻る（手順は中のコメント 1〜4）
   * 途中で失敗したら画面に残り、文言を出す（収支だけ保存済みで管理情報は古いまま、ということもありうる）
   * @param e - フォームの送信イベント
   * @returns 戻り値なし。
   */
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    // 読み込みに失敗した画面では保存しない（初期値の 0 で既存の収支を上書きしてしまうため）
    if (!id || loadFailed) return
    setSaving(true)
    setError(null)
    try {
      // 1. 収支データを保存する
      await api.events.saveFinances(id, form)
      // 2. 管理情報の最新の内容を読み直す。
      //    画面を開いた時点の内容を使うと、その後に管理情報ページで保存した搬入・出店要項などを
      //    古い内容で上書きして消してしまうため、保存の直前に取り直す
      /** 保存直前の管理情報 */
      const latestAdminInfo = await api.events.getAdminInfo(id)
      // 3. 管理情報の出店料・宿泊費だけを収支の値に置き換えて保存する（ほかの項目は最新の内容のまま）
      await api.events.saveAdminInfo(id, {
        ...latestAdminInfo,
        booth_fee: form.booth_fee,
        hotel_fee: form.accommodation,
      })
      // 4. 保存後は遷移元（収支一覧またはイベント一覧）へ戻る
      navigate(backTo)
    } catch {
      // 保存失敗時にエラーメッセージを表示する
      setError('保存に失敗しました。もう一度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p>

  return (
    <div style={{ maxWidth: 580 }}>
      {/* 読み込み・保存エラーを画面上部に表示する */}
      {error && (
        <p style={{ color: '#c0392b', background: '#fdf2f2', border: '1px solid #f5c6cb', borderRadius: 4, padding: '12px 16px', marginBottom: 16, fontSize: 14 }}>
          {error}
        </p>
      )}
      {/* 戻るリンク（収支一覧から来たときは「収支一覧」、それ以外は「イベント管理」） */}
      <div style={{ marginBottom: 24 }}>
        <Link
          to={backTo}
          onClick={(e) => { if (!confirmLeaveIfDirty(isDirty)) e.preventDefault() }}
          style={{ fontSize: 13, color: 'var(--c-muted)', textDecoration: 'none' }}
        >
          &larr; {backTo === '/admin/finances' ? '収支一覧' : 'イベント管理'}
        </Link>
      </div>

      <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, marginBottom: 4 }}>
        収支管理
      </h2>
      {event && (
        <p style={{ fontSize: 14, color: 'var(--c-muted)', marginBottom: 28 }}>
          {event.name} &mdash; {event.start_date}
        </p>
      )}

      <form onSubmit={save}>

        <EventFinanceFields form={form} hasWorkshop={event?.has_workshop ?? false} values={computed} onChange={set} />
        {/* 保存ボタン（読み込みに失敗したときは押せない） */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit" disabled={saving || loadFailed} style={{ padding: '12px 32px', background: 'var(--c-ink)', color: '#fff', border: 'none', borderRadius: 4, cursor: loadFailed ? 'default' : 'pointer', opacity: loadFailed ? 0.5 : 1, fontSize: 15 }}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </div>
  )
}
