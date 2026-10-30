import { Link } from 'react-router-dom'
import type { GalleryImage } from '../lib/api'

/** ギャラリーの一覧リンクに使う本文用書体 */
const SANS = "'Noto Sans JP', sans-serif"

/**
 * 公式ホームのギャラリーマーキーを表示する。
 * @param gallery - 順番を保って表示するギャラリー画像
 * @param fontFamily - 見出しに使う親ページ共通の明朝体
 * @returns ギャラリー見出しと連続スクロールする画像列
 */
export default function HomeGallerySection({
  gallery,
  fontFamily,
}: {
  /** マーキーに表示する画像一覧 */
  gallery: GalleryImage[]
  /** 親から受け取る見出し用フォント */
  fontFamily: string
}) {
  // 1. 見出し、ギャラリー一覧へのリンク、画像のマーキーを表示する。
  // 2. 同じ画像順を二周描画し、二周目を読み上げ対象から外して継ぎ目を隠す。
  return (
    <section style={{ padding: 'clamp(56px, 8vw, 96px) 0' }}>
      {/* ギャラリー全体の上下余白を画面幅に応じて確保する */}
      {/* 見出し行は最大幅と左右余白を揃え、見出しとリンクを横並びにする */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 clamp(20px, 4vw, 48px)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
        {/* Gallery見出しは親から受け取った明朝体と共通の見出しサイズを使う */}
        <h2 style={{ fontFamily, fontSize: 'var(--brand-type-subheading)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '0.06em', margin: 0, color: 'var(--c-ink)' }}>
          Gallery
        </h2>
        {/* 一覧リンクは本文用書体とメタ情報サイズに揃え、折り返さない */}
        <Link to="/official/gallery" style={{ fontFamily: SANS, fontSize: 'var(--brand-type-meta)', color: 'var(--c-muted)', textDecoration: 'none', letterSpacing: '2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          View All →
        </Link>
      </div>
      {/* マーキーの外枠は左右をぼかす。流れる列の動きは index.css の .home-marquee-track に任せる。
          同じ写真を 2 回並べて切れ目をなくし、2 周目を aria-hidden にして重複読み上げを防ぐ */}
      {/* 表示領域からはみ出す画像を隠し、左右端をグラデーションマスクで薄くする */}
      <div className="home-marquee-viewport" style={{ overflow: 'hidden', WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)', maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)' }}>
        <div className="home-marquee-track">
          {/* round は二周の番号、img は現在の画像。画像順と識別キーを両周で維持する */}
          {[0, 1].map((round) => gallery.map((img) => (
            <div key={`${round}-${img.id}`} aria-hidden={round === 1 ? true : undefined} style={{ width: 'clamp(160px, 18vw, 260px)', aspectRatio: '1/1', overflow: 'hidden', flexShrink: 0 }}>
              {/* 各画像を正方形で切り抜き、列内で縮まないようにする */}
              {/* 画像は枠いっぱいに表示し、読み込みを遅延させる。二周目の代替テキストは空にする */}
              <img src={img.url} alt={round === 1 ? '' : (img.alt ?? '')} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          )))}
        </div>
      </div>
    </section>
  )
}
