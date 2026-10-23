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
import { formatYen } from '../lib/format'

/** ブランドストリップに並べる 3 ブランドのカード（リンク先・説明・背景・画像・ロゴ） */
const BRAND_CARDS = [
  {
    to: BRAND.ei8htPlants.path,
    name: BRAND.ei8htPlants.name,
    descJa: 'アガベ・塊根植物など、個性的なフォルムを持つビザールプランツ専門ライン',
    descEn: 'Bizarre Plants — agaves, succulents & rare specimens',
    bg: '#2d4a27',
    img: 'https://lh3.googleusercontent.com/d/1-CERNFP0KtxoxVu-r8jeb-uSP9kj68R0',
    logo: BRAND.ei8htPlants.logo,
  },
  {
    to: BRAND.habitatOides.path,
    name: BRAND.habitatOides.name,
    descJa: '自生地の景色を鉢の中に再現する、ハビタットスタイルの作品とワークショップ',
    descEn: 'Habitat-style compositions & workshops — nature in a pot',
    bg: '#1e3272',
    img: '/img/habitatOides/habitat_oides_hero.jpg',
    logo: BRAND.habitatOides.logo,
  },
  {
    to: BRAND.hue.path,
    // カードには短い表記（HUE）を出す
    name: BRAND.hue.shortName,
    descJa: '色彩と形を楽しむ、インテリアのためのオーナメントプランツ',
    descEn: 'Color & Form as Living Art — plants for your space',
    bg: 'linear-gradient(135deg, #f9eef3 0%, #eee8f8 28%, #e6f4ef 58%, #fdf8e8 82%, #fdf0ea 100%)',
    img: null,
    logo: BRAND.hue.logo,
  },
]

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
  const t = useT()

  // ブランドストリップの展開挙動をモバイルとデスクトップで切り替えるためにビューポート幅を監視する
  useEffect(() => {
    // スマホ幅かどうかの判定（幅が変わると change が届く）
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    /** 幅が切り替わったら入れ直す */
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // 次回イベント・ギャラリー・商品・記事を並列で取得する。
  // トップページは失敗したセクションを出さないだけにする（「まだありません」のような誤った案内は出さない）
  useEffect(() => {
    // 1. 開催前のイベントを開始日の近い順に並べ、先頭を次回のイベントにする
    api.events.list(false).then((events) => {
      const sorted = [...events].sort(
        (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
      )
      setNextEvent(sorted[0] ?? null)
    }).catch(() => {})
    // 2. ギャラリー（全ブランド）
    api.gallery.list().then(setGallery).catch(() => {})
    // 3. 商品と記事は先頭から決まった件数だけ
    api.products.list().then((p) => setProducts(p.slice(0, 4))).catch(() => {})
    api.articles.list().then((a) => setArticles(a.slice(0, 3))).catch(() => {})
  }, [])

  // マウント直後に loaded フラグを立てて、ヒーローのフェードインアニメーションを開始する
  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 60)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      <PageMeta />

      {/* ─── HERO ─── */}
      <section style={{
        position: 'relative',
        overflow: 'hidden',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        padding: 'clamp(32px, 4vw, 56px) clamp(20px, 4vw, 48px) clamp(32px, 4vw, 48px)',
      }}>
        {/* 背景アニメーション（keyframes は index.css の .home-hero-blob。動きを減らす設定では止まる） */}
        <div className="home-hero-blob" style={{
          position: 'absolute',
          top: '50%', left: '50%',
          width: '130%', height: '130%',
          background: 'radial-gradient(ellipse 58% 48% at 55% 50%, rgba(255,255,255,0.7) 0%, transparent 68%)',
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        {/* ロゴ（上部） */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <img
            src={TEXT_LOGO}
            alt="ei8ht plants"
            style={{
              width: 'clamp(180px, 20vw, 300px)',
              height: 'auto', display: 'block',
              opacity: loaded ? 1 : 0,
              transform: loaded ? 'translateY(0)' : 'translateY(1.2em)',
              transition: 'opacity 1.8s cubic-bezier(.22,1,.36,1) 0.3s, transform 1.8s cubic-bezier(.22,1,.36,1) 0.3s',
            }}
          />
        </div>

        {/* テキスト2カラム（英語の小さなコピーと大きなキャッチコピー。少しずつ遅らせてフェードインする） */}
        <div className="hero-catch" style={{ position: 'relative', zIndex: 1, marginTop: 'clamp(24px, 4vh, 48px)' }}>
          <div style={{
            opacity: loaded ? 1 : 0,
            transform: loaded ? 'translateY(0)' : 'translateY(1.2em)',
            transition: 'opacity 1.8s cubic-bezier(.22,1,.36,1) 0.6s, transform 1.8s cubic-bezier(.22,1,.36,1) 0.6s',
          }}>
            <p style={{
              fontFamily: SERIF, fontStyle: 'italic',
              fontSize: 'clamp(13px, 1.1vw, 15px)',
              fontWeight: 300, letterSpacing: '0.08em',
              color: 'var(--c-muted)', margin: 0, lineHeight: 1.9,
            }}>
              Collect<br />the strange.
            </p>
          </div>
          <div style={{
            opacity: loaded ? 1 : 0,
            transform: loaded ? 'translateY(0)' : 'translateY(1.2em)',
            transition: 'opacity 1.8s cubic-bezier(.22,1,.36,1) 0.85s, transform 1.8s cubic-bezier(.22,1,.36,1) 0.85s',
          }}>
            <p style={{
              fontFamily: SANS,
              fontSize: 'clamp(22px, 3.6vw, 52px)',
              fontWeight: 300, letterSpacing: '0.04em',
              color: 'var(--c-ink)', margin: 0, lineHeight: 1.55,
            }}>
              {t(
                <>育て、仕立て、<br />ともに暮らす。</>,
                <>Grow it. Style it.<br />Live with it.</>
              )}
            </p>
          </div>
        </div>
      </section>

      {/* ─── BRAND GROW-STRIP ───
          PC はマウスを乗せた（フォーカスした）カードを広げ、外れたら先頭に戻す。スマホは全カードを開いたまま縦に並べる */}
      <section
        className="brand-strip"
        onMouseLeave={() => !isMobile && setActiveCard(0)}
      >
        {BRAND_CARDS.map((card, i) => {
          // このカードを広げて表示するか
          const isActive = isMobile || activeCard === i
          return (
            <Link
              key={card.to}
              to={card.to}
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
                    alt={card.name}
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
                  fontSize: 10, letterSpacing: '0.2em',
                  color: 'rgba(255,255,255,0.75)',
                  textTransform: 'uppercase', fontWeight: 300,
                  whiteSpace: 'nowrap',
                }}>
                  {card.name}
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
                  alt={card.name}
                  style={{
                    height: isMobile ? 28 : 36, width: 'auto', objectFit: 'contain',
                    display: 'block', marginBottom: isMobile ? 6 : 12,
                    filter: 'brightness(0) invert(1)',
                  }}
                />
                {!isMobile && (
                  <p style={{
                    fontSize: 12, color: 'rgba(255,255,255,0.85)',
                    letterSpacing: '0.06em', lineHeight: 1.8,
                    margin: '0 0 16px', fontWeight: 300, fontFamily: SANS,
                  }}>
                    {t(card.descJa, card.descEn)}
                  </p>
                )}
                <span style={{
                  fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.6)', fontWeight: 300, fontFamily: SANS,
                  borderBottom: '1px solid rgba(255,255,255,0.4)', paddingBottom: 2,
                }}>
                  View Brand
                </span>
              </div>
            </Link>
          )
        })}
      </section>

      <hr style={divider} />

      {/* ─── NEXT EVENT ───（開催前のイベントがあるときだけ） */}
      {nextEvent && (
        <>
          <section style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(56px, 8vw, 96px) clamp(20px, 4vw, 48px)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 28, gap: 16 }}>
              <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '0.06em', margin: 0, color: 'var(--c-ink)' }}>
                Next Event
              </h2>
              <Link to="/events" style={{ fontFamily: SANS, fontSize: 11, color: 'var(--c-muted)', textDecoration: 'none', letterSpacing: '2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
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
              <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '0.06em', margin: 0, color: 'var(--c-ink)' }}>
                Shop
              </h2>
              <Link to="/shop" style={{ fontFamily: SANS, fontSize: 11, color: 'var(--c-muted)', textDecoration: 'none', letterSpacing: '2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                View All →
              </Link>
            </div>
            <div className="home-shop-grid">
              {products.map((p) => (
                // ホバー・キーボード選択で画像を拡大する（index.css の .home-shop-card / .home-zoom-img）
                <Link key={p.id} to={`/shop/${p.id}`} className="home-shop-card" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  <div>
                    <div style={{ position: 'relative', aspectRatio: '1/1', background: 'var(--c-border)', overflow: 'hidden', marginBottom: 12 }}>
                      {p.image_urls[0] ? (
                        <img src={p.image_urls[0]} alt={p.name} className="home-zoom-img" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: 'var(--c-faint)' }} />
                      )}
                      {p.stock === 0 && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '4px', color: '#ffffff', border: '1px solid rgba(255,255,255,0.6)', padding: '6px 16px' }}>SOLD OUT</span>
                        </div>
                      )}
                    </div>
                    <p style={{ fontFamily: SERIF, fontSize: 'clamp(14px, 1.4vw, 16px)', color: 'var(--c-ink)', margin: '0 0 5px', lineHeight: 1.5 }}>{p.name}</p>
                    <p style={{ fontFamily: SANS, fontSize: 13, color: 'var(--c-muted)', margin: 0 }}>{formatYen(p.price)}</p>
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
              <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '0.06em', margin: 0, color: 'var(--c-ink)' }}>
                Journal
              </h2>
              <Link to="/journal" style={{ fontFamily: SANS, fontSize: 11, color: 'var(--c-muted)', textDecoration: 'none', letterSpacing: '2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                All Articles →
              </Link>
            </div>
            <div className="home-journal-grid">
              {articles.map((a, idx) => (
                <Link key={a.id} to={`/journal/${a.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', gridColumn: idx === 0 ? 'span 2' : undefined }} className={idx === 0 ? 'home-journal-card home-journal-featured' : 'home-journal-card'}>
                  <div style={{ display: idx === 0 ? undefined : 'flex', flexDirection: idx === 0 ? undefined : 'column', height: '100%' }}>
                    <div style={{ overflow: 'hidden', background: 'var(--c-border)', aspectRatio: idx === 0 ? '16/7' : '4/3', marginBottom: 16, position: 'relative' }}>
                      {a.image_urls[0] ? (
                        <img src={a.image_urls[0]} alt={a.title} className="home-zoom-img" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: 'var(--c-faint)' }} />
                      )}
                    </div>
                    {a.published_at && (
                      <p style={{ fontFamily: SANS, fontSize: 10, color: 'var(--c-faint)', margin: '0 0 8px', letterSpacing: '1.5px' }}>{fmtDate(a.published_at)}</p>
                    )}
                    <p style={{ fontFamily: SERIF, fontSize: idx === 0 ? 'clamp(18px, 2vw, 24px)' : 'clamp(15px, 1.5vw, 18px)', color: 'var(--c-ink)', margin: '0 0 10px', lineHeight: 1.5, letterSpacing: '0.02em' }}>
                      {a.title}
                    </p>
                    {idx === 0 && articleExcerpt(a.content) && (
                      <p style={{ fontFamily: SANS, fontSize: 13, color: 'var(--c-muted)', margin: '0 0 14px', lineHeight: 2 }}>
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
          <section style={{ padding: 'clamp(56px, 8vw, 96px) 0' }}>
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 clamp(20px, 4vw, 48px)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '0.06em', margin: 0, color: 'var(--c-ink)' }}>
                Gallery
              </h2>
              <Link to="/gallery" style={{ fontFamily: SANS, fontSize: 11, color: 'var(--c-muted)', textDecoration: 'none', letterSpacing: '2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                View All →
              </Link>
            </div>
            {/* マーキーの外枠（左右をぼかす）。流れる列は index.css の .home-marquee-track。
                同じ写真の列を 2 回並べて切れ目なく流し、2 回目は読み上げで重複しないよう aria-hidden にする */}
            <div className="home-marquee-viewport" style={{ overflow: 'hidden', WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)', maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)' }}>
              <div className="home-marquee-track">
                {[0, 1].map((round) => gallery.map((img) => (
                  <div key={`${round}-${img.id}`} aria-hidden={round === 1 ? true : undefined} style={{ width: 'clamp(160px, 18vw, 260px)', aspectRatio: '1/1', overflow: 'hidden', flexShrink: 0 }}>
                    <img src={img.url} alt={round === 1 ? '' : (img.alt ?? '')} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                )))}
              </div>
            </div>
          </section>
          <hr style={divider} />
        </>
      )}

      {/* ─── INSTAGRAM ───（3 ブランドのロゴから各アカウントへ。下にシェアボタン） */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(56px, 8vw, 96px) clamp(20px, 4vw, 48px)', textAlign: 'center' }}>
        <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '4px', color: 'var(--c-faint)', margin: '0 0 8px', textTransform: 'uppercase' }}>{t('フォロー', 'Follow us')}</p>
        <p style={{ fontFamily: SERIF, fontSize: 'clamp(20px, 2.5vw, 28px)', fontWeight: 300, fontStyle: 'italic', color: 'var(--c-ink)', margin: '0 0 clamp(28px, 4vw, 44px)', letterSpacing: '0.06em' }}>Instagram</p>
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
          <ShareButtons url={`${window.location.origin}/`} text="ei8ht plants — Collect the strange." />
        </div>
      </section>
    </>
  )
}
