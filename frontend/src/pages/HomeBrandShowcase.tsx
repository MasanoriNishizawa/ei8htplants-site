import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BRAND_SHOWCASES } from '../lib/brandShowcase'
import { useT } from '../lib/lang'

/** 展開カード内の説明文に使う本文書体 */
const SANS = "'Noto Sans JP', sans-serif"

/**
 * 公式ホームのブランド紹介ストリップを表示し、PC のカード展開とモバイル表示を管理する。
 * 引数はありません。
 * @returns ブランド見出しとブランドカード一覧
 */
export default function HomeBrandShowcase() {
  // 現在展開しているブランドカードの位置
  const [activeCard, setActiveCard] = useState(0)
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

  return (
    <section className="home-brands-section" id="our-brands">
      {/* PC はマウスを乗せた（フォーカスした）カードを広げ、外れたら先頭に戻す。スマホは全カードを開いたまま縦に並べる */}
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
  )
}
