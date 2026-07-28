import { useEffect, useState } from 'react'
import { api, type Collaboration } from '../lib/api'
import PageMeta from '../components/PageMeta'

export default function Collaborations() {
  const [items, setItems] = useState<Collaboration[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.collaborations.list().then(setItems).finally(() => setLoading(false))
  }, [])

  return (
    <>
      <PageMeta title="Collaborations" description="Habitat Oides のコラボレーション作品・活動記録。" ogImage="https://ei8htplants.com/img/habitatOides/habitat_oides_hero.png" />
      <div style={{ textAlign: 'center', padding: '72px 20px 48px', background: '#f5f5f7' }}>
        <p style={{ fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', color: '#8a9a7e', margin: '0 0 14px' }}>Habitat Oides</p>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(32px, 6vw, 56px)', fontWeight: 200, letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>
          Collaboration
        </h1>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '56px 20px 100px' }}>
        {loading && <p style={{ textAlign: 'center', padding: '60px 0', color: '#8a9a7e' }}>読み込み中...</p>}

        {!loading && items.length === 0 && (
          <p style={{ textAlign: 'center', padding: '100px 0', color: '#8a9a7e', fontSize: 13 }}>
            コラボレーション情報は近日公開予定です。
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          {items.map((item) => (
            <article
              key={item.id}
              style={{ background: '#ffffff', border: '1px solid #dddde8', borderRadius: 14, overflow: 'hidden' }}
            >
              {item.image_url && (
                <div style={{ width: '100%', aspectRatio: '16/9', overflow: 'hidden', background: '#f0f0f5' }}>
                  <img
                    src={item.image_url}
                    alt={item.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.6s ease' }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.03)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  />
                </div>
              )}

              {item.video_url && !item.image_url && (
                <div style={{ width: '100%', aspectRatio: '16/9', background: '#000', overflow: 'hidden' }}>
                  <video
                    src={item.video_url}
                    autoPlay
                    loop
                    muted
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
              )}

              <div style={{ padding: '28px 32px' }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 12 }}>
                  {item.partner_name && (
                    <span style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: '#8a9a7e' }}>
                      {item.partner_name}
                    </span>
                  )}
                  {item.event_date && (
                    <span style={{ fontSize: 11, letterSpacing: 2, color: '#aaa' }}>
                      {new Date(item.event_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  )}
                </div>
                <h2 style={{ fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 300, letterSpacing: '0.06em', color: '#1c2417', margin: '0 0 16px', lineHeight: 1.4 }}>
                  {item.title}
                </h2>
                {item.description && (
                  <p style={{ fontSize: 16, color: '#3a4535', lineHeight: 1.9, margin: 0, whiteSpace: 'pre-wrap' }}>
                    {item.description}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  )
}
