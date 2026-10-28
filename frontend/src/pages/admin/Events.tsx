import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, type Event } from '../../lib/api'
import { failMessage } from './errorMessage'

/**
 * イベント一覧の1行コンポーネント。各種操作ボタンを含む
 * @param ev - 表示するイベント情報
 * @param reservationCountMap - イベント ID をキーにした予約件数マップ
 * @param del - 削除ボタン押下時のコールバック
 * @param duplicate - 複製ボタン押下時のコールバック
 * @param busy - 複製・削除を処理中か（処理中はこの行の複製・削除ボタンを押せなくする）
 * @returns イベント名・日付・会場と操作ボタンを並べた1行
 */
function EventRow({ ev, reservationCountMap, del, duplicate, busy }: {
  ev: Event
  reservationCountMap: Map<string, number>
  del: (id: string) => void
  duplicate: (ev: Event) => void
  busy: boolean
}) {
  /** このイベントのキャンセル以外の予約の件数 */
  const resCount = reservationCountMap.get(ev.id) ?? 0
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', padding: '16px 20px', background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, gap: 10 }}>
      {/* 左: イベント名・開催日・会場 */}
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontWeight: 500 }}>{ev.name}</div>
        <div style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 4 }}>
          {ev.start_date}{ev.end_date && ev.end_date !== ev.start_date ? ` 〜 ${ev.end_date}` : ''} / {ev.location}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {/* イベントの編集画面 */}
        <Link to={`/admin/events/${ev.id}/edit`} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, color: 'var(--c-body)', textDecoration: 'none' }}>編集</Link>
        {/* 搬入・搬出・宿泊・出店料などの管理情報ページへのリンク */}
        <Link
          to={`/admin/events/${ev.id}/admin-info`}
          state={{ from: '/admin/events' }}
          style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, color: 'var(--c-body)', textDecoration: 'none' }}
        >
          管理情報
        </Link>
        {/* イベントに登録された画像を一覧表示し、1枚ずつダウンロードするページへのリンク */}
        <Link
          to={`/admin/events/${ev.id}/images`}
          state={{ from: '/admin/events' }}
          style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, color: 'var(--c-body)', textDecoration: 'none' }}
        >
          画像DL
        </Link>
        {/* 収支の入力画面（戻るリンクでこの一覧に戻る） */}
        <Link to={`/admin/events/${ev.id}/finances`} state={{ from: '/admin/events' }} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, color: '#4a6741', textDecoration: 'none' }}>収支</Link>
        {/* イベントの特設ページの編集画面 */}
        <Link to={`/admin/events/${ev.id}/site`} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, color: '#1e3272', textDecoration: 'none' }}>サイト</Link>
        {/* WS 予約一覧（全イベント共通の画面）をこのイベントで絞り込んで開く。件数があれば薄い緑の背景 */}
        {ev.has_workshop && (
          <Link
            to={`/admin/reservations?event_id=${ev.id}`}
            title="WS予約一覧をこのイベントで絞り込んで開く"
            style={{ padding: '8px 16px', border: '1px solid #b8d0b2', borderRadius: 4, fontSize: 13, color: '#2d5a27', textDecoration: 'none', background: resCount > 0 ? '#f0f6ee' : 'none' }}
          >
            予約{resCount > 0 ? ` ${resCount}件` : ''}
          </Link>
        )}
        {/* イベント別の予約画面（時間枠での絞り込み・ステータス変更・印刷・CSV 出力・当日参加の追加）を開く。時間枠の編集はイベントの編集画面で行う */}
        {ev.has_workshop && (
          <Link
            to={`/admin/events/${ev.id}/reservations`}
            state={{ from: '/admin/events' }}
            title="このイベントの予約を印刷・CSV 出力する画面を開く"
            style={{ padding: '8px 16px', border: '1px solid #b8d0b2', borderRadius: 4, fontSize: 13, color: '#2d5a27', textDecoration: 'none' }}
          >
            予約管理（印刷・CSV）
          </Link>
        )}
        {/* 複製・削除（処理中は押せない） */}
        <button onClick={() => duplicate(ev)} disabled={busy} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, color: '#4a6741', background: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}>複製</button>
        <button onClick={() => del(ev.id)} disabled={busy} style={{ padding: '8px 16px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, color: '#c0392b', background: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}>削除</button>
      </div>
    </div>
  )
}

/**
 * イベント管理一覧。今後・過去のイベントを分類して表示し、編集・収支・サイト・複製・削除が行えるページ
 * @returns 今後・過去のイベントの一覧
 */
export default function AdminEvents() {
  /** イベント ID → キャンセル以外の予約の件数 */
  const [reservationCountMap, setReservationCountMap] = useState<Map<string, number>>(new Map())
  /** 一覧を読み込み中か */
  const [loading, setLoading] = useState(true)
  /** 今の画面の場所（location.key が変わったら読み直す） */
  const location = useLocation()

  /** 今後のイベント（開始日の昇順） */
  const [upcoming, setUpcoming] = useState<Event[]>([])
  /** 過去のイベント（開始日の降順） */
  const [past, setPast] = useState<Event[]>([])
  /** 複製・削除を処理中か（どれか1つ処理中なら全行のボタンを止め、複製の二重作成を防ぐ） */
  const [busy, setBusy] = useState(false)
  /** 読み込み・複製・削除の失敗の文言（空なら出さない） */
  const [error, setError] = useState('')

  /**
   * 今後・過去のイベントと予約を読み込む。失敗したら「予定なし」と区別できるようエラーを出す
   * 1. 今後のイベント・過去のイベント・予約をまとめて取得する
   * 2. 今後は開始日の早い順、過去は新しい順に並べる
   * 3. キャンセル以外の予約をイベントごとに数える
   * @returns 戻り値なし。
   */
  const load = () => {
    setLoading(true)
    // 1. まとめて取得
    Promise.all([
      api.events.list(false),
      api.events.list(true),
      api.reserve.list(),
    ]).then(([upcomingData, pastData, reservations]) => {
      // 2. 並べ替え
      setUpcoming([...upcomingData].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()))
      setPast([...pastData].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()))
      // 3. キャンセル以外の予約数をイベント別にカウントして「予約N件」バッジに使用する
      /** イベント ID → 予約の件数 */
      const countMap = new Map<string, number>()
      reservations.filter((r) => r.status !== 'cancelled').forEach((r) => {
        countMap.set(r.event_id, (countMap.get(r.event_id) ?? 0) + 1)
      })
      setReservationCountMap(countMap)
    }).catch((e: unknown) => {
      setError(failMessage('イベントの読み込みに失敗しました', e))
    }).finally(() => setLoading(false))
  }

  // ページ遷移のたびに再ロードして最新データを表示する
  useEffect(() => { load() }, [location.key])

  /**
   * イベントを削除する（確認のあと）。失敗したら一覧に残したままエラーを出す
   * @param id - 削除するイベントの id
   * @returns 戻り値なし。
   */
  const del = async (id: string) => {
    if (busy || !confirm('削除しますか？')) return
    setBusy(true)
    setError('')
    try {
      await api.events.delete(id)
      setUpcoming((prev) => prev.filter((ev) => ev.id !== id))
      setPast((prev) => prev.filter((ev) => ev.id !== id))
    } catch (e) {
      setError(failMessage('削除に失敗しました', e))
    } finally {
      setBusy(false)
    }
  }

  /**
   * イベントを複製する（名前に「(コピー)」を付けて新規作成）
   * 1. 処理中にして、ほかの複製・削除を押せなくする（連打で同じイベントが2つできるのを防ぐ）
   * 2. 作成して一覧を読み直す
   * 3. 失敗したらエラーを出す
   * 4. 処理中を戻す
   * @param ev - 複製元のイベント
   * @returns 戻り値なし。
   */
  const duplicate = async (ev: Event) => {
    // 1. 二重実行の防止
    if (busy) return
    setBusy(true)
    setError('')
    try {
      // 2. 作成
      await api.events.create({
        name: `${ev.name} (コピー)`,
        start_date: ev.start_date,
        end_date: ev.end_date ?? undefined,
        time: ev.time ?? undefined,
        location: ev.location,
        booth_number: ev.booth_number ?? undefined,
        address: ev.address ?? undefined,
        official_url: ev.official_url ?? undefined,
        brands: ev.brands,
        has_workshop: ev.has_workshop,
        ws_requires_reservation: ev.ws_requires_reservation,
        image_urls: ev.images.map((i) => i.url),
      })
      load()
    } catch (e) {
      // 3. 失敗
      setError(failMessage('複製に失敗しました', e))
    } finally {
      // 4. 処理中を戻す
      setBusy(false)
    }
  }

  return (
    <div>
      {/* 見出しと新規追加ボタン */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, margin: 0 }}>イベント管理</h2>
        <Link to="/admin/events/new" style={{ padding: '10px 24px', background: 'var(--c-ink)', color: '#fff', textDecoration: 'none', borderRadius: 4, fontSize: 14 }}>
          + 新規追加
        </Link>
      </div>

      {/* 読み込み・複製・削除の失敗 */}
      {error && (
        <p role="alert" style={{ color: '#c0392b', fontSize: 13, margin: '0 0 16px', padding: '8px 14px', background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0' }}>{error}</p>
      )}

      {loading ? <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p> : (
        <>
          {/* 今後のイベント */}
          <p style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 12px' }}>今後のイベント</p>
          {upcoming.length === 0 ? (
            <p style={{ color: '#bbb', fontSize: 13, marginBottom: 32 }}>予定なし</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 36 }}>
              {upcoming.map((ev) => <EventRow key={ev.id} ev={ev} reservationCountMap={reservationCountMap} del={del} duplicate={duplicate} busy={busy} />)}
            </div>
          )}

          {/* 過去のイベント */}
          <p style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 12px' }}>過去のイベント</p>
          {past.length === 0 ? (
            <p style={{ color: '#bbb', fontSize: 13 }}>なし</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {past.map((ev) => <EventRow key={ev.id} ev={ev} reservationCountMap={reservationCountMap} del={del} duplicate={duplicate} busy={busy} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
