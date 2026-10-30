import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EventPreview from '../components/EventPreview'
import { api, type Event, type GalleryImage, type Product, type Article } from '../lib/api'
import { parseBlocks } from '../lib/blocks'
import PageMeta from '../components/PageMeta'
import ShareButtons from '../components/ShareButtons'
import { useT } from '../lib/lang'
import { parseLocalDate } from '../lib/localDate'
import { BRAND, TEXT_LOGO } from '../lib/brands'
import { BRAND_SHOWCASES } from '../lib/brandShowcase'
import { formatYen } from '../lib/format'
import HomeApproachSection from './HomeApproachSection'
import HomeGallerySection from './HomeGallerySection'

/**
 * Instagram のリンク（href: アカウントの URL、src: ロゴ画像、cls はロゴごとの大きさの調整用、brand は画像の説明に使うブランド名）。
 * Habitat Oides を先頭に置くため、標準の並び順とは変えている
 */
const IG_LINKS = [
  { brandInfo: BRAND.habitatOides, cls: 'habitat' },
  { brandInfo: BRAND.ei8htPlants, cls: 'ei8ht' },
  { brandInfo: BRAND.hue, cls: 'hue' },
].map(({ brandInfo, cls }) => ({ href: brandInfo.instagramUrl, src: brandInfo.logo, cls, brand: brandInfo.name }))

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
  // ブランドストリップで広げているカードの位置
  const [activeCard, setActiveCard] = useState(0)
  // ヒーローのフェードインを始めたら true
  const [loaded, setLoaded] = useState(false)
  // スマホ幅（767px 以下）なら true
  const [isMobile, setIsMobile] = useState(false)
  // 現在の表示言語に合わせて文言を選ぶ翻訳関数
  const t = useT()

  // ブランドストリップの展開挙動をモバイルとデスクトップで切り替えるためにビューポート幅を監視する
  useEffect(() => {
    // スマホ幅かどうかの判定（幅が変わると change が届く）
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    /**
     * 画面幅のメディア条件が切り替わったら表示モードを更新する。
     * @param e - max-width 条件への一致状態を含むメディアクエリ変更イベント
     * @returns 戻り値なし。
     */
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

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

      {/* ─── BRAND GROW-STRIP ───
          PC はマウスを乗せた（フォーカスした）カードを広げ、外れたら先頭に戻す。スマホは全カードを開いたまま縦に並べる */}
      <section className="home-brands-section" id="our-brands">
        <div className="home-brands-heading">
          <div>
            <p className="home-section-index">01 / OUR BRANDS</p>
            <h2>{t('私たちのブランド', 'Our Brands')}</h2>
          </div>
          <div className="home-brands-intro">
            <p>{t('植物との向き合い方から生まれた、3つのブランド。それぞれの世界をご紹介します。', 'Three distinct worlds shaped by different ways of living with plants.')}</p>
            <Link to="/official/brands">{t('すべてのブランド', 'VIEW ALL BRANDS')} <span>↗</span></Link>
          </div>
        </div>

        <div className="brand-strip" onMouseLeave={() => !isMobile && setActiveCard(0)}>
        {BRAND_SHOWCASES.map((card, i) => {
          // このカードを広げて表示するか
          const isActive = isMobile || activeCard === i
          return (
            <a
              key={card.to}
              href={card.to}
              target="_blank"
              rel="noopener noreferrer"
              className="brand-strip-item"
              onMouseEnter={() => !isMobile && setActiveCard(i)}
              // キーボードで選んだときもマウスを乗せたときと同じように広げる
              onFocus={() => !isMobile && setActiveCard(i)}
              style={{
                flex: isMobile ? undefined : (isActive ? '0 0 55%' : '1 1 0'),
                background: card.bg,
              }}
            >
              {/* 背景写真（広げると少し拡大する。飾りなので読み上げない） */}
              {card.img && (
                <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                  <img
                    src={card.img}
                    alt=""
                    style={{
                      width: '100%', height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                      transform: isActive ? 'scale(1.05)' : 'scale(1)',
                      transition: 'transform 1.2s cubic-bezier(.22,1,.36,1)',
                    }}
                  />
                </div>
              )}
              {/* 暗めのグラデーションオーバーレイ（テキスト可読性のため下部を暗くする） */}
              <div style={{
                position: 'absolute', inset: 0,
                background: card.img
                  ? 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.55) 100%)'
                  : 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.38) 100%)',
              }} />

              {/* 背景画像なしのカード（HUE）: 中央にロゴを大きく表示 */}
              {!card.img && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '15%',
                }}>
                  <img
                    src={card.logo}
                    alt={card.shortName}
                    style={{
                      width: '100%', height: '100%', objectFit: 'contain',
                      display: 'block',
                      transform: isActive ? 'scale(1.05)' : 'scale(1)',
                      transition: 'transform 1.2s cubic-bezier(.22,1,.36,1)',
                    }}
                  />
                </div>
              )}

              {/* 折りたたみ時のラベル（縦書き・デスクトップのみ） */}
              {!isMobile && (
                <div style={{
                  position: 'absolute', bottom: 24, left: 18,
                  opacity: isActive ? 0 : 1,
                  transition: 'opacity 0.3s',
                  writingMode: 'vertical-rl',
                  fontSize: 'var(--brand-type-meta)', letterSpacing: '0.2em',
                  color: 'rgba(255,255,255,0.75)',
                  textTransform: 'uppercase', fontWeight: 300,
                  whiteSpace: 'nowrap',
                }}>
                  {card.shortName}
                </div>
              )}


              {/* 展開時の情報（モバイルは常に表示） */}
              <div style={{
                position: 'absolute', bottom: isMobile ? 20 : 32, left: isMobile ? 20 : 28, right: isMobile ? 20 : 28,
                opacity: isActive ? 1 : 0,
                transform: isActive ? 'translateY(0)' : 'translateY(16px)',
                transition: isMobile ? 'none' : 'opacity 0.5s cubic-bezier(.22,1,.36,1) 0.15s, transform 0.5s cubic-bezier(.22,1,.36,1) 0.15s',
              }}>
                <img
                  src={card.logo}
                  alt={card.shortName}
                  style={{
                    height: isMobile ? 28 : 36, width: 'auto', objectFit: 'contain',
                    display: 'block', marginBottom: isMobile ? 6 : 12,
                    filter: 'brightness(0) invert(1)',
                  }}
                />
                {!isMobile && (
                  <p style={{
                    fontSize: 'var(--brand-type-meta)', color: 'rgba(255,255,255,0.85)',
                    letterSpacing: '0.06em', lineHeight: 1.8,
                    margin: '0 0 16px', fontWeight: 300, fontFamily: SANS,
                  }}>
                    {t(card.descJa, card.descEn)}
                  </p>
                )}
                <span style={{
                  fontSize: 'var(--brand-type-meta)', letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.6)', fontWeight: 300, fontFamily: SANS,
                  borderBottom: '1px solid rgba(255,255,255,0.4)', paddingBottom: 2,
                }}>
                  View Brand
                </span>
              </div>
            </a>
          )
        })}
        </div>
      </section>

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

      {/* ─── INSTAGRAM ───（3 ブランドのロゴから各アカウントへ。下にシェアボタン） */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(56px, 8vw, 96px) clamp(20px, 4vw, 48px)', textAlign: 'center' }}>
        <p style={{ fontFamily: SANS, fontSize: 'var(--brand-type-meta)', letterSpacing: '4px', color: 'var(--c-faint)', margin: '0 0 8px', textTransform: 'uppercase' }}>{t('フォロー', 'Follow us')}</p>
        <p style={{ fontFamily: SERIF, fontSize: 'var(--brand-type-subheading)', fontWeight: 300, fontStyle: 'italic', color: 'var(--c-ink)', margin: '0 0 clamp(28px, 4vw, 44px)', letterSpacing: '0.06em' }}>Instagram</p>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'clamp(24px, 5vw, 60px)', flexWrap: 'wrap' }}>
          {IG_LINKS.map(({ href, src, cls, brand }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: 'clamp(90px, 12vw, 140px)', height: 'clamp(90px, 12vw, 140px)', overflow: 'hidden' }}
            >
              <img
                src={src}
                alt={t(`${brand} の Instagram`, `${brand} on Instagram`)}
                style={{
                  width: cls === 'ei8ht' ? '140%' : cls === 'hue' ? '115%' : '100%',
                  height: cls === 'habitat' ? '100%' : 'auto',
                  objectFit: cls === 'habitat' ? 'cover' : undefined,
                  borderRadius: cls === 'habitat' ? '20%' : undefined,
                }}
              />
            </a>
          ))}
        </div>
        <div style={{ marginTop: 48, display: 'flex', justifyContent: 'center' }}>
          <ShareButtons url={`${window.location.origin}/official`} text="ei8ht plants — Collect the strange." />
        </div>
      </section>
    </>
  )
}
