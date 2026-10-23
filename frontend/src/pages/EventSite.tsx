import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type Event, type PageContent } from '../lib/api'
import PageMeta from '../components/PageMeta'
import ShareButtons from '../components/ShareButtons'
import ImageLightbox from '../components/ImageLightbox'
import LoadError from '../components/LoadError'
import { useApi } from '../hooks/useApi'
import { useLang, useT } from '../lib/lang'
import { formatDateRange } from '../lib/localDate'
import { BRAND_INSTAGRAM } from '../lib/brands'
import { SWIPE_THRESHOLD_PX } from '../lib/constants'

/**
 * 管理画面で保存した直後の印（localStorage の event_dirty_<id かスラッグ>）を確かめて消す
 * （管理画面の AdminEventSite が保存したときに立てる。印は 1 回使ったら消す）
 * @param keys - 確かめる id・スラッグ（空・undefined・null は飛ばす）
 * @returns どれか 1 つでも印があれば true
 */
function takeDirtyFlags(keys: (string | null | undefined)[]): boolean {
  let found = false
  try {
    // 重複を除いて 1 つずつ確かめる（あった印はすべて消す）
    for (const key of new Set(keys.filter((k): k is string => !!k))) {
      if (localStorage.getItem(`event_dirty_${key}`)) {
        localStorage.removeItem(`event_dirty_${key}`)
        found = true
      }
    }
  } catch { /* localStorage が使えなければ印は無いものとして通常どおり取る */ }
  return found
}

/** キャッシュを使わずに取り直すときの fetch の指定 */
const NO_STORE: RequestInit = { cache: 'no-store' }

/**
 * URL の id かスラッグでイベントを取る。管理画面で保存した直後なら、キャッシュを使わずに最新を取る
 * 1. URL の値の印があれば、最初からキャッシュを使わずに取る
 * 2. 無ければ通常どおり取り、取れたイベントの id・スラッグの印も確かめる
 *    （管理画面は id で印を立てるので、スラッグの URL で開いたときはここで見つかる）
 * 3. 2 で印が見つかったら、キャッシュを使わずに取り直す
 * @param id - URL の id かスラッグ
 * @returns イベント
 */
async function fetchEventFresh(id: string): Promise<Event> {
  // 1. URL の値の印
  if (takeDirtyFlags([id])) {
    const fresh = await api.events.get(id, NO_STORE)
    // 同じ保存で立った別の表記の印も消しておく（次に開いたときに余計な取り直しをしない）
    takeDirtyFlags([fresh.id, fresh.slug])
    return fresh
  }
  // 2. 通常どおり取り、id・スラッグの印を確かめる
  const ev = await api.events.get(id)
  if (!takeDirtyFlags([ev.id, ev.slug])) return ev
  // 3. 取り直し
  return api.events.get(id, NO_STORE)
}

/**
 * イベント個別ページ。スラッグまたは ID でルーティングされ、page_content を元に詳細を表示する
 * @returns イベントページの画面（読み込み中・失敗・見つからないときはそれぞれの案内）
 */
export default function EventSite() {
  // URL のイベントの id かスラッグ（/events/:id）
  const { id } = useParams<{ id: string }>()
  const t = useT()
  // 今の表示言語（日付の表示に使う）
  const { lang } = useLang()
  // 表示している写真の位置
  const [imgIdx, setImgIdx] = useState(0)
  // 拡大表示している写真の位置（null は閉じている）
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  /** 読み込めなかった写真の URL（代わりに縦横比 3:4 の枠を出し、枠が潰れて文字とバッジが重ならないようにする） */
  const [failedUrls, setFailedUrls] = useState<string[]>([])
  // スワイプを始めた位置（横方向）
  const touchX = useRef<number | null>(null)

  // URL の id でイベントを取る。別のイベントへ移ったら読み込み中に戻し、前のイベントの応答が後から届いても捨てる（useApi）
  const { data: event, loading, error, reload } = useApi(
    () => fetchEventFresh(id ?? ''),
    [id],
    { enabled: !!id },
  )

  // 別のイベントへ移ったら写真の位置を最初に戻し、拡大表示を閉じる
  useEffect(() => {
    setImgIdx(0)
    setLightboxIdx(null)
  }, [id])

  // 読み込み中
  if (loading) return <div role="status" style={{ padding: '120px 20px', textAlign: 'center', color: 'var(--c-muted)' }}>{t('読み込み中...', 'Loading...')}</div>
  // 404 以外の失敗（通信の失敗など）は「見つかりません」ではなく再読み込みを案内する
  if (error && !error.message.startsWith('404')) return <LoadError onRetry={reload} />
  // イベントが無い（404・URL に id が無い）
  if (!event) return <div style={{ padding: '120px 20px', textAlign: 'center', color: 'var(--c-muted)' }}>{t('イベントが見つかりませんでした。', 'Event not found.')}</div>

  // イベントページの中身（未設定なら空）
  const pc: PageContent = event.page_content ?? {}
  // アーカイブ表示（終了後のお礼の文・写真）にしているか
  const isArchived = pc.archive?.enabled ?? false
  // 開催期間の表示（ページの説明文に使う）
  const dateLabel = formatDateRange(event.start_date, event.end_date, lang)
  // 表示する写真（URL が空のものと、作成途中の blob: の URL は除く）
  const validImages = event.images.filter((i) => i.url && !i.url.startsWith('blob:'))
  // SNS で共有したときに出す画像（1 枚目の写真）
  const ogImage = validImages[0]?.url

  // 会場の住所。カード（EventPreview）と同じく、イベントページの会場住所を優先し、無ければイベントの住所
  const address = pc.venue?.address || event.address

  // 拡大表示に渡す写真の URL
  const imgUrls = validImages.map(i => i.url)

  return (
    <>
      <PageMeta title={event.name} description={`${dateLabel} / ${event.location}`} ogImage={ogImage} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 20px 80px', boxSizing: 'border-box' }}>
        {/* 写真があるときは index.css の .event-site-layout で左に写真・右に情報の 2 列にする */}
        <div className={validImages.length > 0 ? 'event-site-layout' : ''}>

          {/* 左: 写真の切り替え（ボタン・スワイプ）と拡大表示 */}
          {validImages.length > 0 && (
            <div>
              <div
                style={{ position: 'relative', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--c-border)', background: 'var(--c-bg)' }}
                onTouchStart={e => { touchX.current = e.touches[0].clientX }}
                onTouchEnd={e => {
                  if (touchX.current === null) return
                  // 指を動かした横の距離（左へ動かすと正）
                  const d = touchX.current - e.changedTouches[0].clientX
                  if (d > SWIPE_THRESHOLD_PX) setImgIdx(i => (i + 1) % validImages.length)
                  else if (d < -SWIPE_THRESHOLD_PX) setImgIdx(i => (i - 1 + validImages.length) % validImages.length)
                  touchX.current = null
                }}
              >
                {failedUrls.includes(validImages[imgIdx]?.url ?? '') ? (
                  /* 写真を読み込めなかったとき: カード（EventPreview）と同じ縦横比 3:4 の枠に案内を出す（拡大表示はしない） */
                  <div
                    role="img"
                    aria-label={event.name}
                    style={{ width: '100%', aspectRatio: '3/4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box', background: 'var(--c-surface)', color: 'var(--c-muted)', fontSize: 13, textAlign: 'center', lineHeight: 1.8 }}
                  >
                    {t('写真を読み込めませんでした', 'Photo could not be loaded')}
                  </div>
                ) : (
                  /* 写真を押すと拡大表示する。キーボードでも選べるよう button で包む */
                  <button
                    type="button"
                    aria-label={t(`${event.name} の写真を拡大表示`, `Enlarge photo of ${event.name}`)}
                    onClick={() => setLightboxIdx(imgIdx)}
                    style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}
                  >
                    <img
                      src={validImages[imgIdx]?.url}
                      alt={event.name}
                      style={{ width: '100%', height: 'auto', display: 'block' }}
                      draggable={false}
                      onError={() => {
                        /** 読み込めなかった写真の URL */
                        const url = validImages[imgIdx]?.url
                        if (url) setFailedUrls((prev) => (prev.includes(url) ? prev : [...prev, url]))
                      }}
                    />
                  </button>
                )}
                {/* WS を開くイベントは右上に「Workshop」の印 */}
                {event.has_workshop && (
                  <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, background: 'var(--c-blue)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20, letterSpacing: 0.5 }}>
                    Workshop
                  </div>
                )}
                {validImages.length > 1 && (
                  <>
                    {/* 前へ・次へのボタン。写真の高さに関係なく上下の真ん中に置く（top 50% から自分の高さの半分だけ上げる） */}
                    <button
                      type="button"
                      aria-label={t('前の写真', 'Previous photo')}
                      onClick={() => setImgIdx(i => (i - 1 + validImages.length) % validImages.length)}
                      style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: 8, background: 'rgba(0,0,0,0.45)', color: '#fff', width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}
                    >&#10094;</button>
                    <button
                      type="button"
                      aria-label={t('次の写真', 'Next photo')}
                      onClick={() => setImgIdx(i => (i + 1) % validImages.length)}
                      style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: 8, background: 'rgba(0,0,0,0.45)', color: '#fff', width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}
                    >&#10095;</button>
                    {/* 何枚目かを示す点（飾りなので読み上げない） */}
                    <div aria-hidden="true" style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5, pointerEvents: 'none' }}>
                      {validImages.map((_, i) => (
                        <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === imgIdx ? '#fff' : 'rgba(255,255,255,0.5)' }} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 右: イベントの情報 */}
          <div>
            {/* ブランドバッジ（押すとそのブランドの Instagram を開く） */}
            {event.brands.length > 0 && (
              <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {event.brands.map((brand) => (
                  <a key={brand} href={BRAND_INSTAGRAM[brand] ?? '#'} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, background: 'var(--c-ink)', color: '#fff', padding: '6px 12px', borderRadius: 20, letterSpacing: 1, textDecoration: 'none', fontWeight: 500 }}>
                    {brand}
                  </a>
                ))}
              </div>
            )}

            {/* イベント名（アーカイブ表示なら上に「Archived」） */}
            {isArchived && (
              <div style={{ fontSize: 12, color: 'var(--c-muted)', letterSpacing: 2, marginBottom: 8 }}>Archived</div>
            )}
            <h1 style={{ fontSize: 26, margin: '0 0 8px', fontWeight: 500, lineHeight: 1.4, color: 'var(--c-ink)' }}>
              {event.name}
            </h1>

            {/* キャッチコピー・サブタイトル */}
            {(pc.hero?.tagline || pc.hero?.subtitle) && (
              <div style={{ marginBottom: 20 }}>
                {pc.hero?.tagline && (
                  <p style={{ fontSize: 17, color: 'var(--c-body)', fontWeight: 400, margin: '0 0 4px', lineHeight: 1.6 }}>{pc.hero.tagline}</p>
                )}
                {pc.hero?.subtitle && (
                  <p style={{ fontSize: 13, color: 'var(--c-muted)', margin: 0, lineHeight: 1.6 }}>{pc.hero.subtitle}</p>
                )}
              </div>
            )}

            {/* コンセプト */}
            {pc.concept && (
              <div style={{ marginBottom: 24, padding: '24px 20px', background: '#ffffff', borderRadius: 4, border: '1px solid #dddde8' }}>
                <div style={{ fontSize: 11, letterSpacing: 3, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 14 }}>Concept</div>
                <p style={{ fontSize: 15, lineHeight: 2.2, color: 'var(--c-body)', margin: 0, whiteSpace: 'pre-line' }}>{pc.concept}</p>
              </div>
            )}

            {/* 会場・地図（住所があるときだけ。Google マップを埋め込む） */}
            {address && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, letterSpacing: 3, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid #dddde8' }}>Venue</div>
                <p style={{ fontSize: 13, color: 'var(--c-body)', margin: '0 0 4px' }}>{address}</p>
                {pc.venue?.access && (
                  <p style={{ fontSize: 13, color: 'var(--c-muted)', margin: '0 0 12px' }}>{pc.venue.access}</p>
                )}
                <div style={{ borderRadius: 4, overflow: 'hidden', border: '1px solid #dddde8' }}>
                  <iframe
                    title={t('会場の地図', 'Venue map')}
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed&z=15&hl=ja`}
                    width="100%"
                    height="260"
                    style={{ border: 0, display: 'block' }}
                    loading="lazy"
                  />
                </div>
              </div>
            )}

            {/* ワークショップ（終了・アーカイブならお礼の文、予約制なら予約ページへのリンク） */}
            {event.has_workshop && (
              <div style={{ background: '#f2f2f7', border: '1px solid #c0c0d2', padding: '16px 20px', marginBottom: 24, borderRadius: 4 }}>
                <div style={{ fontSize: 11, letterSpacing: 3, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Workshop</div>
                {(isArchived || event.is_past) ? (
                  <p style={{ fontSize: 14, color: 'var(--c-body)', margin: 0, lineHeight: 1.8 }}>
                    {t('ワークショップを開催しました。ご参加いただいた皆様ありがとうございました。', 'The workshop has concluded. Thank you to all who participated.')}
                  </p>
                ) : event.ws_requires_reservation ? (
                  <Link to={`/reserve?event_id=${event.id}`}
                    style={{ display: 'inline-block', background: 'var(--c-ink)', color: '#fff', textDecoration: 'none', padding: '9px 20px', borderRadius: 20, fontSize: 13, fontWeight: 500, letterSpacing: 1 }}>
                    {t('ワークショップを予約する', 'Reserve the workshop')}
                  </Link>
                ) : null}
              </div>
            )}

            {/* ラインナップ */}
            {pc.lineup && pc.lineup.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, letterSpacing: 3, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #dddde8' }}>Lineup</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  {pc.lineup.map((item, i) => (
                    <div key={i} style={{ background: '#f5f5f8', borderRadius: 4, overflow: 'hidden', border: '1px solid #dddde8' }}>
                      {item.image_url && (
                        <img src={item.image_url} alt={item.title} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                      )}
                      <div style={{ padding: '12px 14px' }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--c-ink)', marginBottom: 4 }}>{item.title}</div>
                        {item.description && <div style={{ fontSize: 12, color: 'var(--c-body)', lineHeight: 1.7 }}>{item.description}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ゲスト・出展者 */}
            {pc.guests && pc.guests.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, letterSpacing: 3, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #dddde8' }}>Guests</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
                  {pc.guests.map((guest, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', background: '#f5f5f8', borderRadius: 4, padding: '16px 12px', border: '1px solid #dddde8' }}>
                      {guest.image_url ? (
                        <img src={guest.image_url} alt={guest.name} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', marginBottom: 10, border: '1px solid #dddde8' }} />
                      ) : (
                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#e4e4ee', marginBottom: 10, border: '1px solid #dddde8' }} />
                      )}
                      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--c-ink)', marginBottom: 2 }}>{guest.name}</div>
                      {guest.role && <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--c-muted)', marginBottom: 6 }}>{guest.role}</div>}
                      {guest.bio && <p style={{ fontSize: 12, color: 'var(--c-body)', lineHeight: 1.8, margin: '0 0 8px' }}>{guest.bio}</p>}
                      {guest.instagram_url && (
                        <a href={guest.instagram_url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: '#4a6741', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                          Instagram
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* アーカイブ（お礼の見出し・文・写真） */}
            {isArchived && (
              <div style={{ textAlign: 'center', background: '#f5f5f8', borderRadius: 4, padding: '40px 24px', border: '1px solid #dddde8' }}>
                <h2 style={{ fontSize: 22, fontWeight: 400, color: 'var(--c-ink)', margin: '0 0 16px' }}>
                  {pc.archive?.title ?? t('ご来場ありがとうございました', 'Thank you for visiting')}
                </h2>
                {pc.archive?.message && (
                  <p style={{ fontSize: 15, color: 'var(--c-body)', lineHeight: 2.1, whiteSpace: 'pre-line', margin: '0 0 24px' }}>{pc.archive.message}</p>
                )}
                {pc.archive?.gallery && pc.archive.gallery.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, textAlign: 'left' }}>
                    {pc.archive.gallery.map((url, i) => (
                      <div key={i} style={{ aspectRatio: '1/1', overflow: 'hidden', borderRadius: 4 }}>
                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* シェアボタン（URL は slug があれば slug） */}
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #dddde8' }}>
              <ShareButtons url={`${window.location.origin}/events/${event.slug ?? id}`} text={event.name} />
            </div>
          </div>

        </div>
      </div>
      {/* 写真の拡大表示 */}
      {lightboxIdx !== null && (
        <ImageLightbox
          images={imgUrls}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onChange={setLightboxIdx}
          alt={event.name}
        />
      )}
    </>
  )
}
