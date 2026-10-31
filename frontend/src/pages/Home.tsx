import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EventPreview from '../components/EventPreview'
import { api, type Event, type GalleryImage, type Product, type Article } from '../lib/api'
import { parseBlocks } from '../lib/blocks'
import PageMeta from '../components/PageMeta'
import { useT } from '../lib/lang'
import { parseLocalDate } from '../lib/localDate'
import { TEXT_LOGO } from '../lib/brands'
import { formatYen } from '../lib/format'
import HomeApproachSection from './HomeApproachSection'
import HomeGallerySection from './HomeGallerySection'
import HomeBrandShowcase from './HomeBrandShowcase'
import HomeSocialSection from './HomeSocialSection'

/** 見出し用（明朝体）の書体 */
const SERIF = "'Cormorant Garamond', 'Noto Serif JP', serif"
/** 本文用（ゴシック体）の書体 */
const SANS = "'Noto Sans JP', sans-serif"

/**
 * 記事コンテンツからテキストブロックを抽出し、指定文字数で切り詰めた抜粋を返す
 * @param content - ブロック JSON または生テキスト
 * @param max - 抜粋の最大文字数（デフォルト 90）
 * @returns 抜粋（max を超えたら末尾に「…」を付ける）
 */
function articleExcerpt(content: string | null, max = 90): string {
  if (!content) return ''
  // 1. 本文をブロックに分け、テキストのブロックだけをつなぐ（見出し・画像は除く）
  const blocks = parseBlocks(content)
  /** 抜粋に使うテキストブロックの本文をつないだ文字列 */
  const text = blocks.flatMap((b) => (b.type === 'text' ? [b.value] : [])).join(' ')
  // 2. テキストのブロックが無ければ、元の文字列から「## 見出し」の行を除き、改行を空白にして使う
  const src = text || content.replace(/^## .+$/gm, '').replace(/\n+/g, ' ').trim()
  // 3. 長ければ切り詰める
  return src.length > max ? src.slice(0, max) + '…' : src
}

/**
 * 日付の文字列を英語形式の短い日付ラベルに変換する（日付だけの文字列は現地の日付として読む）
 * @param s - 日付の文字列（YYYY-MM-DD または ISO 形式）
 * @returns 「May 1, 2026」の形（日付が無ければ空文字）
 */
function fmtDate(s: string | null): string {
  if (!s) return ''
  return parseLocalDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** セクションのあいだの横線 */
const divider: React.CSSProperties = {
  border: 'none', borderTop: '1px solid var(--c-border)', margin: 0,
}

/**
 * ホームページ。ヒーロー・ブランドストリップ・次回イベント・ショップ・ジャーナル・ギャラリーマーキーを表示する
 * @returns トップページの画面
 */
export default function Home() {
  // 次回のイベント（無ければ null。セクションごと出さない）
  const [nextEvent, setNextEvent] = useState<Event | null>(null)
  // マーキーに流すギャラリーの写真
  const [gallery, setGallery] = useState<GalleryImage[]>([])
  // ショップの新着 4 件
  const [products, setProducts] = useState<Product[]>([])
  // ジャーナルの新着 3 件
  const [articles, setArticles] = useState<Article[]>([])
  // ヒーローのフェードインを始めたら true
  const [loaded, setLoaded] = useState(false)
  // 現在の表示言語に合わせて文言を選ぶ翻訳関数
  const t = useT()

  // 1. 次回イベント・ギャラリー・商品・記事を並列で取得する。
  // トップページは失敗したセクションを出さないだけにする（「まだありません」のような誤った案内は出さない）
  useEffect(() => {
    // 1. 開催前のイベントを開始日の近い順に並べ、先頭を次回のイベントにする
    api.events.list(false).then((events) => {
      /** 開催日が近い順に並べ替えたイベント一覧 */
      const sorted = [...events].sort(
        (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
      )
      setNextEvent(sorted[0] ?? null)
    }).catch(() => {})
    // 2. ギャラリー（全ブランド）の写真をマーキーに渡す
    api.gallery.list().then(setGallery).catch(() => {})
    // 3. 商品と記事は先頭から決まった件数だけを新着枠に渡す
    api.products.list().then((p) => setProducts(p.slice(0, 4))).catch(() => {})
    api.articles.list().then((a) => setArticles(a.slice(0, 3))).catch(() => {})
  }, [])

  // マウント直後に loaded フラグを立てて、ヒーローのフェードインアニメーションを開始する
  useEffect(() => {
    /** 初回描画の直後にヒーロー表示状態を切り替える短い遅延 */
    const timer = setTimeout(() => setLoaded(true), 60)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      <PageMeta />

      {/* ─── HERO ─── */}
      <section className={`home-hero${loaded ? ' is-loaded' : ''}`}>
        <img className="home-hero-photo" src="/img/ei8htPlants/ei8htplants_hero.jpg" alt="手のひらに載った小さな植物" fetchPriority="high" />
        <div className="home-hero-wash" aria-hidden="true" />
        <div className="home-hero-topline">
          <span>BOTANICAL OBJECTS / JAPAN</span>
          <span>01 — 03</span>
        </div>
        <div className="home-hero-copy">
          <img src={TEXT_LOGO} alt="ei8ht plants" />
          <p className="home-hero-manifesto">Collect<br />the strange.</p>
          <h1>{t(<>育て、仕立て、<br />ともに暮らす。</>, <>Grow it. Style it.<br />Live with it.</>)}</h1>
          <Link to="/official/brands" className="home-hero-brands">{t('ブランドを見る', 'OUR BRANDS')} <span>↗</span></Link>
        </div>
        <p className="home-hero-caption">{t('植物のかたちと、暮らしのあいだ。', 'PLANT FORMS / EVERYDAY LIFE')}</p>
        <a className="home-hero-scroll" href="#our-brands"><span />{t('スクロール', 'SCROLL')}</a>
      </section>

      <HomeBrandShowcase />

      <HomeApproachSection
        title={t(<>植物を育て、<br />景色を仕立て、<br /><em>ともに暮らす。</em></>, <>Grow plants.<br />Shape a place.<br /><em>Live together.</em></>)}
        description={t('ひとつの植物から、部屋の景色や人とのつながりまで。私たちは植物と過ごす時間を、いくつもの形で提案します。', 'From one remarkable plant to a landscape shared with others, we explore the many ways plants can become part of everyday life.')}
        action={<Link to="/official/concept">{t('私たちについて', 'OUR POINT OF VIEW')} <span>↗</span></Link>}
      />

      <hr style={divider} />

      {/* ─── NEXT EVENT ───（開催前のイベントがあるときだけ） */}
      {nextEvent && (
        <>
          <section style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(56px, 8vw, 96px) clamp(20px, 4vw, 48px)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 28, gap: 16 }}>
              <h2 style={{ fontFamily: SERIF, fontSize: 'var(--brand-type-subheading)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '0.06em', margin: 0, color: 'var(--c-ink)' }}>
                Next Event
              </h2>
              <Link to="/official/events" style={{ fontFamily: SANS, fontSize: 'var(--brand-type-meta)', color: 'var(--c-muted)', textDecoration: 'none', letterSpacing: '2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                {t('全イベント →', 'All Events →')}
              </Link>
            </div>
            <EventPreview event={nextEvent} horizontal />
          </section>
          <hr style={divider} />
        </>
      )}

      {/* ─── SHOP ───（商品があるときだけ。在庫切れは画像を暗くして SOLD OUT を重ねる） */}
      {products.length > 0 && (
        <>
          <section style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(56px, 8vw, 96px) clamp(20px, 4vw, 48px)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 28, gap: 16 }}>
              <h2 style={{ fontFamily: SERIF, fontSize: 'var(--brand-type-subheading)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '0.06em', margin: 0, color: 'var(--c-ink)' }}>
                Shop
              </h2>
              <Link to="/official/shop" style={{ fontFamily: SANS, fontSize: 'var(--brand-type-meta)', color: 'var(--c-muted)', textDecoration: 'none', letterSpacing: '2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                View All →
              </Link>
            </div>
            <div className="home-shop-grid">
              {products.map((p) => (
                // ホバー・キーボード選択で画像を拡大する（index.css の .home-shop-card / .home-zoom-img）
                <Link key={p.id} to={`/official/shop/${p.id}`} className="home-shop-card" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  <div>
                    <div style={{ position: 'relative', aspectRatio: '1/1', background: 'var(--c-border)', overflow: 'hidden', marginBottom: 12 }}>
                      {p.image_urls[0] ? (
                        <img src={p.image_urls[0]} alt={p.name} className="home-zoom-img" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: 'var(--c-faint)' }} />
                      )}
                      {p.stock === 0 && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontFamily: SANS, fontSize: 'var(--brand-type-meta)', letterSpacing: '4px', color: '#ffffff', border: '1px solid rgba(255,255,255,0.6)', padding: '6px 16px' }}>SOLD OUT</span>
                        </div>
                      )}
                    </div>
                    <p style={{ fontFamily: SERIF, fontSize: 'var(--brand-type-body)', color: 'var(--c-ink)', margin: '0 0 5px', lineHeight: 1.5 }}>{p.name}</p>
                    <p style={{ fontFamily: SANS, fontSize: 'var(--brand-type-navigation)', color: 'var(--c-muted)', margin: 0 }}>{formatYen(p.price)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
          <hr style={divider} />
        </>
      )}

      {/* ─── JOURNAL ───（記事があるときだけ。1 件目は 2 列分の幅で抜粋も出す） */}
      {articles.length > 0 && (
        <>
          <section style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(56px, 8vw, 96px) clamp(20px, 4vw, 48px)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 28, gap: 16 }}>
              <h2 style={{ fontFamily: SERIF, fontSize: 'var(--brand-type-subheading)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '0.06em', margin: 0, color: 'var(--c-ink)' }}>
                Journal
              </h2>
              <Link to="/official/journal" style={{ fontFamily: SANS, fontSize: 'var(--brand-type-meta)', color: 'var(--c-muted)', textDecoration: 'none', letterSpacing: '2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                All Articles →
              </Link>
            </div>
            <div className="home-journal-grid">
              {articles.map((a, idx) => (
                <Link key={a.id} to={`/official/journal/${a.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', gridColumn: idx === 0 ? 'span 2' : undefined }} className={idx === 0 ? 'home-journal-card home-journal-featured' : 'home-journal-card'}>
                  <div style={{ display: idx === 0 ? undefined : 'flex', flexDirection: idx === 0 ? undefined : 'column', height: '100%' }}>
                    <div style={{ overflow: 'hidden', background: 'var(--c-border)', aspectRatio: idx === 0 ? '16/7' : '4/3', marginBottom: 16, position: 'relative' }}>
                      {a.image_urls[0] ? (
                        <img src={a.image_urls[0]} alt={a.title} className="home-zoom-img" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: 'var(--c-faint)' }} />
                      )}
                    </div>
                    {a.published_at && (
                      <p style={{ fontFamily: SANS, fontSize: 'var(--brand-type-meta)', color: 'var(--c-faint)', margin: '0 0 8px', letterSpacing: '1.5px' }}>{fmtDate(a.published_at)}</p>
                    )}
                    <p style={{ fontFamily: SERIF, fontSize: idx === 0 ? 'var(--brand-type-emphasis)' : 'var(--brand-type-body-small)', color: 'var(--c-ink)', margin: '0 0 10px', lineHeight: 1.5, letterSpacing: '0.02em' }}>
                      {a.title}
                    </p>
                    {idx === 0 && articleExcerpt(a.content) && (
                      <p style={{ fontFamily: SANS, fontSize: 'var(--brand-type-navigation)', color: 'var(--c-muted)', margin: '0 0 14px', lineHeight: 2 }}>
                        {articleExcerpt(a.content)}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
          <hr style={divider} />
        </>
      )}

      {/* ─── GALLERY マーキー ───（写真があるときだけ。横に流れ続ける） */}
      {gallery.length > 0 && (
        <>
          <HomeGallerySection gallery={gallery} fontFamily={SERIF} />
          <hr style={divider} />
        </>
      )}

      <HomeSocialSection />
    </>
  )
}
