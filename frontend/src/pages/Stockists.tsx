import { useEffect, useState } from 'react'
import { api, type Stockist } from '../lib/api'

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
      <div style={{ textAlign: 'center', padding: '50px 20px' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 40, fontWeight: 300, letterSpacing: 6, textTransform: 'uppercase', margin: 0 }}>Stockists</h1>
      </div>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px 80px' }}>
        {loading && <p style={{ textAlign: 'center', padding: '60px 0', color: '#8a9a7e' }}>読み込み中...</p>}
        {Object.entries(byArea).map(([area, items]) => (
          <div key={area} style={{ marginBottom: 40 }}>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, letterSpacing: 2, borderBottom: '1px solid #ddd4c0', paddingBottom: 8, marginBottom: 16 }}>{area}</h2>
            {items.map((s) => (
              <div key={s.id} style={{ padding: '16px 0', borderBottom: '1px solid #f0ebe0' }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>
                  {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: '#1c2417', textDecoration: 'underline', textUnderlineOffset: 3 }}>{s.name}</a> : s.name}
                </div>
                {s.address && <div style={{ fontSize: 14, color: '#8a9a7e' }}>{s.address}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}
