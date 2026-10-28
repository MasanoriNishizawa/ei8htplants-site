import { api, type Stockist } from '../lib/api'
import PageMeta from '../components/PageMeta'
import LoadError from '../components/LoadError'
import { useApi } from '../hooks/useApi'
import { useT } from '../lib/lang'
import { BRAND } from '../lib/brands'

/** ブランドのラベルの背景色（bg）と文字色（color）。lib/brands の BRAND のキーごと */
const BRAND_LABEL_COLORS: Record<keyof typeof BRAND, { bg: string; color: string }> = {
  ei8htPlants: { bg: '#e8f0e8', color: '#2d4a2d' },
  habitatOides: { bg: '#dde4f5', color: '#1e3272' },
  hue: { bg: '#f5ead8', color: '#6b3c1a' },
}

/**
 * ブランドの値 → ラベルの色。取扱店は短い表記（HUE）で保存されるが、
 * 古いデータや手入力で正式名（HUE by ei8ht plants）が入っていても同じ色になるよう、両方の表記をキーにする。
 * ここに無い値は灰色で出す
 */
const BRAND_COLORS: Record<string, { bg: string; color: string }> = Object.fromEntries(
  (Object.keys(BRAND) as (keyof typeof BRAND)[]).flatMap((key) => [
    [BRAND[key].name, BRAND_LABEL_COLORS[key]],
    [BRAND[key].shortName, BRAND_LABEL_COLORS[key]],
  ]),
)

/**
 * 取扱店一覧ページ。エリア別にグループ化して表示する
 * @returns 取扱店一覧の画面
 */
export default function Stockists() {
  // 現在の表示言語に合わせて文言を選ぶ翻訳関数
  const t = useT()
  // 取扱店の一覧（失敗は error に入る）
  const { data, loading, error, reload } = useApi(() => api.stockists.list(), [])
  // 表示する取扱店（取得前・失敗時は空）
  const stockists = data ?? []

  // エリアごとに分けた取扱店（エリア未設定は「その他」）
  const byArea = stockists.reduce<Record<string, Stockist[]>>((acc, s) => {
    const area = s.area ?? t('その他', 'Other')
    ;(acc[area] ??= []).push(s)
    return acc
  }, {})

  return (
    <>
      <PageMeta title="Stockists" description="ei8ht plants 取扱店一覧。" />
      {/* ページの見出し */}
      <div style={{ textAlign: 'center', padding: '50px 20px' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 300, letterSpacing: 6, textTransform: 'uppercase', margin: 0 }}>Stockists</h1>
      </div>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px 80px' }}>
        {loading && <p role="status" style={{ textAlign: 'center', padding: '60px 0', color: 'var(--c-muted)' }}>{t('読み込み中...', 'Loading...')}</p>}
        {/* 通信の失敗は「準備中」と分けて案内する */}
        {!loading && error && <LoadError onRetry={reload} />}
        {!loading && !error && stockists.length === 0 && (
          <p style={{ textAlign: 'center', padding: '60px 0', color: 'var(--c-muted)', fontSize: 14 }}>{t('取扱店の情報は準備中です。', 'Stockist information is coming soon.')}</p>
        )}
        {/* エリアごとの見出しと、その中の取扱店（店名・住所・扱っているブランド） */}
        {Object.entries(byArea).map(([area, items]) => (
          <div key={area} style={{ marginBottom: 40 }}>
            <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 22, fontWeight: 300, letterSpacing: 2, borderBottom: '1px solid #dddde8', paddingBottom: 8, marginBottom: 16 }}>{area}</h2>
            {items.map((s) => (
              <div key={s.id} style={{ padding: '16px 0', borderBottom: '1px solid #f0f0f5' }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>
                  {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-ink)', textDecoration: 'underline', textUnderlineOffset: 3 }}>{s.name}</a> : s.name}
                </div>
                {s.address && <div style={{ fontSize: 14, color: 'var(--c-muted)', marginBottom: s.brands?.length ? 8 : 0 }}>{s.address}</div>}
                {s.brands?.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {s.brands.map((b) => {
                      // ブランドのラベルの色
                      const c = BRAND_COLORS[b] ?? { bg: '#f0f0f5', color: 'var(--c-body)' }
                      return (
                        <span key={b} style={{ fontSize: 11, padding: '2px 10px', borderRadius: 4, letterSpacing: '0.5px', background: c.bg, color: c.color }}>
                          {b}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        {/* 取扱・卸の相談の案内（読み込みが終わってから出す） */}
        {!loading && (
          <div style={{ marginTop: 48, padding: '20px 24px', background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, color: 'var(--c-muted)', lineHeight: 1.9 }}>
            {t(
              <>
                取扱のご相談・卸のお問い合わせは{' '}
                <a href="/official/contact" style={{ color: 'var(--c-ink)', textDecoration: 'underline', textUnderlineOffset: 3 }}>お問い合わせフォーム</a>
                {' '}よりお気軽にご連絡ください。
              </>,
              <>
                For stockist inquiries, please use our{' '}
                <a href="/official/contact" style={{ color: 'var(--c-ink)', textDecoration: 'underline', textUnderlineOffset: 3 }}>contact form</a>.
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
