const LINES = [
  {
    name: 'ei8ht plants',
    subtitle: 'アガベ専門ライン',
    text: '個性的なフォルムを持つアガベの魅力を入り口に、育てる楽しさ、仕立てる喜び、株姿を追求する深みへ。初めての一株を探している方から、理想の姿を追い求めるコレクターまで——アガベと向き合う奥深い楽しさをお届けします。',
  },
  {
    name: 'Habitat Oides',
    subtitle: 'ハビタットスタイルライン',
    text: '自生地の風景を、一つの鉢の中に。石や砂、岩肌との調和の中に植物を落とし込み、「景色としての植物」を構築するハビタットスタイルに特化したライン。自生地が持つ空気感と記憶を手元に宿す、没入感のある植物の世界を提案します。',
  },
  {
    name: 'HUE by ei8ht plants',
    subtitle: 'オーナメントプランツライン',
    text: '葉の色彩と造形に宿る美しさに着目したライン。フィロデンドロンやカラテアが持つ鮮やかな葉色、ビカクシダが纏う独特のシルエット——日々の暮らしに溶け込みながら、空間に確かな存在感を添えるインテリアグリーンをお届けします。',
  },
]

export default function Concept() {
  return (
    <>
      <div style={{ textAlign: 'center', padding: '80px 20px', background: '#f7f3ec', borderBottom: '1px solid #ddd4c0' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 40, fontWeight: 300, letterSpacing: 6, textTransform: 'uppercase', margin: 0 }}>Concept</h1>
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px' }}>
        <div style={{ marginTop: 80 }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', color: '#8a9a7e', fontWeight: 400, margin: '0 0 40px', paddingBottom: 16, borderBottom: '1px solid #ddd4c0' }}>Philosophy</h2>
          <div style={{ maxWidth: 750, margin: '0 auto', lineHeight: 2.2, fontSize: 16, color: '#3a4535', textAlign: 'justify' }}>
            植物は、育てるものであり、飾るもの。<br /><br />
            色と形に惹かれて手に取った一株が、部屋に置かれたとき—その空間は静かに変わる。私たちはその瞬間のために、色もフォルムも妥協しない植物を選び抜いています。<br /><br />
            観葉植物の持つ鮮やかな色彩と独特の造形美を軸に、インテリアとして「飾る」視点でセレクトし、暮らしを彩る植物文化を提案します。
          </div>
        </div>

        <div style={{ marginTop: 80, marginBottom: 100 }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', color: '#8a9a7e', fontWeight: 400, margin: '0 0 0', paddingBottom: 16, borderBottom: '1px solid #ddd4c0' }}>Specialized Lines</h2>
          <div className="brand-line-grid">
            {LINES.map(({ name, subtitle, text }) => (
              <div
                key={name}
                style={{ padding: 40, background: '#fffcf6', border: '1px solid #ddd4c0', borderRadius: 14, transition: 'transform 0.3s ease' }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-5px)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                <span style={{ display: 'block', fontSize: 16, fontWeight: 500, letterSpacing: 2, marginBottom: 15, borderBottom: '1px solid #ddd4c0', paddingBottom: 10 }}>{name}</span>
                <p style={{ fontSize: 15, lineHeight: 1.9, color: '#3a4535' }}>
                  <strong>{subtitle}</strong><br />
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
