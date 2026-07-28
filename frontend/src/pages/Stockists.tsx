import { useEffect, useState } from 'react'
import { api, type Stockist } from '../lib/api'
import PageMeta from '../components/PageMeta'

const BRAND_COLORS: Record<string, { bg: string; color: string }> = {
  'ei8ht plants': { bg: '#e8f0e8', color: '#2d4a2d' },
  'Habitat Oides': { bg: '#dde4f5', color: '#1e3272' },
  'HUE': { bg: '#f5ead8', color: '#6b3c1a' },
}

export default function Stockists() {
  const [stockists, setStockists] = useState<Stockist[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.stockists.list().then(setStockists).finally(() => setLoading(false))
  }, [])

  const byArea = stockists.reduce<Record<string, Stockist[]>>((acc, s) => {
    const area = s.area ?? 'その他'
    ;(acc[area] ??= []).push(s)
    return acc
  }, {})

  return (
    <>
      <PageMeta title="Stockists" description="ei8ht plants 取扱店一覧。" />
      <div style={{ textAlign: 'center', padding: '50px 20px' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 40, fontWeight: 300, letterSpacing: 6, textTransform: 'uppercase', margin: 0 }}>Stockists</h1>
      </div>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px 80px' }}>
        {loading && <p style={{ textAlign: 'center', padding: '60px 0', color: '#8a9a7e' }}>読み込み中...</p>}
        {Object.entries(byArea).map(([area, items]) => (
          <div key={area} style={{ marginBottom: 40 }}>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, letterSpacing: 2, borderBottom: '1px solid #dddde8', paddingBottom: 8, marginBottom: 16 }}>{area}</h2>
            {items.map((s) => (
              <div key={s.id} style={{ padding: '16px 0', borderBottom: '1px solid #f0f0f5' }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>
                  {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: '#1c2417', textDecoration: 'underline', textUnderlineOffset: 3 }}>{s.name}</a> : s.name}
                </div>
                {s.address && <div style={{ fontSize: 14, color: '#8a9a7e', marginBottom: s.brands?.length ? 8 : 0 }}>{s.address}</div>}
                {s.brands?.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {s.brands.map((b) => {
                      const c = BRAND_COLORS[b] ?? { bg: '#f0f0f5', color: '#3a4535' }
                      return (
                        <span key={b} style={{ fontSize: 11, padding: '2px 10px', borderRadius: 12, letterSpacing: '0.5px', background: c.bg, color: c.color }}>
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
        {!loading && (
          <div style={{ marginTop: 48, padding: '20px 24px', background: '#ffffff', border: '1px solid #dddde8', borderRadius: 8, fontSize: 14, color: '#8a9a7e', lineHeight: 1.9 }}>
            取扱のご相談・卸のお問い合わせは{' '}
            <a href="/contact" style={{ color: '#1c2417', textDecoration: 'underline', textUnderlineOffset: 3 }}>お問い合わせフォーム</a>
            {' '}よりお気軽にご連絡ください。
          </div>
        )}
      </div>
    </>
  )
}
