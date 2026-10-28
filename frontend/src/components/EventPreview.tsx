import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Event, PageContent } from '../lib/api'
import ImageLightbox from './ImageLightbox'
import { useLang, useT, type Lang } from '../lib/lang'
import { WEEKDAYS_JA, formatDateRange, parseLocalDate } from '../lib/localDate'
import { BRAND_INSTAGRAM } from '../lib/brands'
import { SWIPE_THRESHOLD_PX } from '../lib/constants'

/**
 * daily_times が設定されているとき、日毎の時間を 1 行の文字列に整形して返す。全日同じ時間なら時間だけ返す
 * @param dailyTimes - 日付（YYYY-MM-DD）ごとの時間の文字列
 * @param lang - 表示言語（曜日の表記に使う）
 * @returns 表示用の文字列（設定が無ければ null）
 */
function formatDailyTimes(dailyTimes: Record<string, string> | null | undefined, lang: Lang): string | null {
  if (!dailyTimes || Object.keys(dailyTimes).length === 0) return null
  // 日付の順に並べた [日付, 時間] の組
  const entries = Object.entries(dailyTimes).sort(([a], [b]) => a.localeCompare(b))
  // 全日同じ時間なら時間だけ
  if (entries.every(([, v]) => v === entries[0][1])) return entries[0][1]
  // 日毎に異なる場合は、日本語は「M/D（曜）HH:MM〜HH:MM」、英語は「M/D (Fri) HH:MM〜HH:MM」を改行でつなぐ
  return entries.map(([d, t]) => {
    /** 時間ラベルの曜日と月日を求める現地日付 */
    const date = parseLocalDate(d)
    // 月/日
    const md = `${date.getMonth() + 1}/${date.getDate()}`
    if (lang === 'en') return `${md} (${date.toLocaleDateString('en-US', { weekday: 'short' })}) ${t}`
    return `${md}（${WEEKDAYS_JA[date.getDay()]}）${t}`
  }).join('\n')
}

/**
 * page_content に、イベントの詳細ページを出すだけの中身が入っているかを調べる
 * @param pc - イベントの page_content
 * @returns 中身があれば true（「詳細を見る」ボタンを出す）
 */
function hasPageContent(pc: PageContent | null): boolean {
  if (!pc) return false
  // どれか 1 つでも入っていれば詳細ページを出す（作成途中の blob: の画像 URL は数えない）
  return !!(
    (pc.hero?.image_url && pc.hero.image_url.length > 0 && !pc.hero.image_url.startsWith('blob:')) ||
    (pc.hero?.tagline && pc.hero.tagline.length > 0) ||
    (pc.hero?.subtitle && pc.hero.subtitle.length > 0) ||
    (pc.venue?.address && pc.venue.address.length > 0) ||
    (pc.venue?.access && pc.venue.access.length > 0) ||
    (pc.concept && pc.concept.length > 0) ||
    (pc.lineup && pc.lineup.length > 0) ||
    (pc.guests && pc.guests.length > 0) ||
    (pc.archive?.enabled === true)
  )
}

/** EventPreview に渡す値 */
interface Props {
  /** 表示するイベント */
  event: Event
  /** true なら写真と文字を横に並べる（ホームの Next Event 用） */
  horizontal?: boolean
}

/**
 * Events ページ用のコンパクトなイベントカード（グリッド表示向け）。
 * 写真の切り替え（ボタン・スワイプ）・拡大表示、ブランドの Instagram、日時・会場・地図、WS 予約と詳細ページへのリンクを出す
 * @param event - 表示するイベントデータ
 * @param horizontal - 水平レイアウト（ホームの Next Event セクションで使用）
 * @returns イベントのカード（拡大表示を開いているときはライトボックスも）
 */
export default function EventPreview({ event, horizontal = false }: Props) {
  // カードに表示している写真の位置
  const [imgIdx, setImgIdx] = useState(0)
  // 拡大表示している写真の位置（null は閉じている）
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  // スワイプを始めた位置（横方向）
  const touchX = useRef<number | null>(null)
  // 今の表示言語（日付の表示に使う）
  const { lang } = useLang()
  // 見出し・予約リンクなどのイベント紹介文を表示言語に合わせて出す翻訳関数
  const t = useT()
  // イベントページの中身（未設定なら空）
  const pc: PageContent = event.page_content ?? {}
  // page_content に実際のコンテンツが入っているかどうかを判定
  const hasSite = hasPageContent(event.page_content)
  // 表示する写真（URL が空のものと、作成途中の blob: の URL は除く）
  const images = event.images.filter((i) => i.url && !i.url.startsWith('blob:'))
  // 拡大表示に渡す写真の URL
  const imgUrls = images.map(i => i.url)
  // 開催期間の表示（例: 2026年5月1日〜3日）
  const dateLabel = formatDateRange(event.start_date, event.end_date, lang)
  // page_content の会場住所を優先し、なければ event.address を使用
  const address = pc.venue?.address || event.address
  // 住所を Google マップで検索するリンク
  const mapsUrl = address
    ? `https://www.google.com/maps/search/${encodeURIComponent(address)}`
    : null

  return (
    <>
    {/* カード本体（横並びのときは index.css の .ep-horizontal で写真と文字を横に並べる） */}
    <div className={horizontal ? 'ep-horizontal' : ''} style={{
      background: '#ffffff',
      borderRadius: 4,
      overflow: 'hidden',
      boxShadow: '0 2px 16px rgba(40,35,20,0.08)',
      border: '1px solid var(--c-border)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* 写真の枠（写真があるときだけ。左右にスワイプすると前後の写真へ移る） */}
      {images.length > 0 && (
        <div
          style={{ position: 'relative', background: 'var(--c-surface)', overflow: 'hidden', aspectRatio: '3/4' }}
          onTouchStart={e => { touchX.current = e.touches[0].clientX }}
          onTouchEnd={e => {
            if (touchX.current === null) return
            // 指を動かした横の距離（左へ動かすと正）
            const d = touchX.current - e.changedTouches[0].clientX
            if (d > SWIPE_THRESHOLD_PX) setImgIdx(i => (i + 1) % images.length)
            else if (d < -SWIPE_THRESHOLD_PX) setImgIdx(i => (i - 1 + images.length) % images.length)
            touchX.current = null
          }}
        >
          {/* 写真を押すと拡大表示する。キーボードでも選べるよう button で包む */}
          <button
            type="button"
            aria-label={t(`${event.name} の写真を拡大表示`, `Enlarge photo of ${event.name}`)}
            onClick={() => setLightboxIdx(imgIdx)}
            style={{ display: 'block', width: '100%', height: '100%', padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}
          >
            <img
              src={images[imgIdx].url}
              alt={event.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              draggable={false}
            />
          </button>
          {/* WS を開くイベントは右上に「Workshop」の印 */}
          {event.has_workshop && (
            <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, background: 'var(--c-blue)', color: '#fff', fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 20, letterSpacing: 0.5 }}>
              Workshop
            </div>
          )}
          {images.length > 1 && (
            <>
              {/* 前へ・次へのボタン。写真の高さに関係なく上下の真ん中に置く（top 50% から自分の高さの半分だけ上げる） */}
              <button
                type="button"
                aria-label={t('前の写真', 'Previous photo')}
                onClick={() => setImgIdx((i) => (i - 1 + images.length) % images.length)}
                style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: 6, background: 'rgba(0,0,0,0.45)', color: '#fff', width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
              >&#10094;</button>
              <button
                type="button"
                aria-label={t('次の写真', 'Next photo')}
                onClick={() => setImgIdx((i) => (i + 1) % images.length)}
                style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: 6, background: 'rgba(0,0,0,0.45)', color: '#fff', width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
              >&#10095;</button>
              {/* 何枚目かを示す点（飾りなので読み上げない） */}
              <div aria-hidden="true" style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4, pointerEvents: 'none' }}>
                {images.map((_, i) => (
                  <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i === imgIdx ? '#fff' : 'rgba(255,255,255,0.5)' }} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 文字の部分 */}
      <div style={{ padding: '16px 18px 20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {/* ブランドのラベル（押すとそのブランドの Instagram を開く） */}
        {event.brands.length > 0 && (
          <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {event.brands.map((brand) => (
              <a
                key={brand}
                href={BRAND_INSTAGRAM[brand] ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 10, background: 'var(--c-ink)', color: '#fff', padding: '4px 10px', borderRadius: 20, letterSpacing: 0.8, textDecoration: 'none', fontWeight: 500 }}
              >
                {brand}
              </a>
            ))}
          </div>
        )}

        <h3 style={{ fontSize: 15, margin: '0 0 12px', fontWeight: 500, lineHeight: 1.4, color: 'var(--c-ink)' }}>
          {event.name}
        </h3>

        {/* 日時・会場・ブース・住所（地図へのリンク）・公式サイトの枠 */}
        <div style={{ fontSize: 13, color: 'var(--c-body)', background: '#f5f5f8', padding: '12px 14px', borderRadius: 4, border: '1px solid #dddde8', lineHeight: 1.8 }}>
          <div>{dateLabel}</div>
          {/* time または daily_times のどちらかを表示する。daily_times は改行区切りなので pre-line で折り返す */}
          {(event.time || formatDailyTimes(event.daily_times, lang)) && (
            <div style={{ whiteSpace: 'pre-line' }}>{event.time || formatDailyTimes(event.daily_times, lang)}</div>
          )}
          <div style={{ fontWeight: 600 }}>{event.location}</div>
          {event.booth_number && (
            <div style={{ fontWeight: 600 }}>{t('ブース:', 'Booth:')} {event.booth_number}</div>
          )}
          {address && (
            <div>
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#4a6741', textDecoration: 'underline', textUnderlineOffset: 3 }}
                >
                  {address}
                </a>
              ) : address}
            </div>
          )}
          {/* 公式サイトURLが設定されている場合のみ外部リンクを表示する */}
          {event.official_url && (
            <div style={{ marginTop: 4 }}>
              <a
                href={event.official_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#4a6741', textDecoration: 'underline', textUnderlineOffset: 3 }}
              >
                {t('公式サイト', 'Official Site')}
              </a>
            </div>
          )}
        </div>

        {/* WS の案内（終了したイベントはお礼の文、予約制なら予約ページへのリンク） */}
        {event.has_workshop && (
          <div style={{ marginTop: 14 }}>
            {event.is_past ? (
              <p style={{ fontSize: 12, color: 'var(--c-muted)', margin: 0, lineHeight: 1.7 }}>
                {t(
                  'ワークショップを開催しました。ご参加いただいた皆様ありがとうございました。',
                  'The workshop has concluded. Thank you to all who participated.'
                )}
              </p>
            ) : event.ws_requires_reservation ? (
              <Link
                to={`/official/reserve?event_id=${event.id}`}
                style={{ display: 'inline-block', fontSize: 12, color: '#1e3272', textDecoration: 'none', padding: '7px 16px', borderRadius: 20, border: '1px solid #1e3272', letterSpacing: 0.5, fontWeight: 500 }}
              >
                {t('Habitat Style Workshop を予約する', 'Reserve Habitat Style Workshop')}
              </Link>
            ) : null}
          </div>
        )}

        {/* イベントページに中身があるときだけ「詳細を見る」（URL は slug があれば slug） */}
        {hasSite && (
          <div style={{ marginTop: 16 }}>
            <Link
              to={`/official/events/${event.slug ?? event.id}`}
              style={{ display: 'inline-block', fontSize: 13, color: '#fff', textDecoration: 'none', padding: '9px 22px', borderRadius: 20, background: 'var(--c-ink)', fontWeight: 500, letterSpacing: 0.5 }}
            >
              {t('詳細を見る', 'View Details')}
            </Link>
          </div>
        )}
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
