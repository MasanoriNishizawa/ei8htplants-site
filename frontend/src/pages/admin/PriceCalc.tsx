import { useState } from 'react'

type Brand = 'ei8htplants' | 'habitatoides' | 'hue'
type SourceType = 'purchase' | 'seedling'

const TABS: { id: Brand; label: string }[] = [
  { id: 'ei8htplants', label: 'ei8ht plants' },
  { id: 'habitatoides', label: 'Habitat Oides' },
  { id: 'hue', label: 'HUE' },
]

const fmt = (n: number) =>
  '¥' + Math.round(n).toLocaleString('ja-JP')

function Ei8htPlantsCalc() {
  const [source, setSource] = useState<SourceType>('purchase')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [seedPrice, setSeedPrice] = useState('')

  const raw = source === 'purchase'
    ? parseFloat(purchasePrice)
    : parseFloat(seedPrice) / 20

  const sellingPrice = isNaN(raw) || raw <= 0 ? null : raw * 2

  const inputStyle: React.CSSProperties = {
    padding: '10px 14px',
    border: '1px solid #dddde8',
    borderRadius: 4,
    fontSize: 16,
    fontFamily: 'inherit',
    width: '100%',
    maxWidth: 280,
    boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* ① 種別選択 */}
      <div>
        <p style={{ fontSize: 13, color: '#666', margin: '0 0 12px', fontWeight: 600, letterSpacing: 1 }}>
          ① 種別
        </p>
        <div style={{ display: 'flex', gap: 24 }}>
          {([['purchase', '仕入れ'], ['seedling', '実生']] as const).map(([val, label]) => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 15 }}>
              <input
                type="radio"
                name="source"
                value={val}
                checked={source === val}
                onChange={() => {
                  setSource(val)
                  setPurchasePrice('')
                  setSeedPrice('')
                }}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* ② 金額入力 */}
      <div>
        <p style={{ fontSize: 13, color: '#666', margin: '0 0 12px', fontWeight: 600, letterSpacing: 1 }}>
          ② {source === 'purchase' ? '仕入れ値' : '種子 20粒あたりの金額'}
        </p>
        {source === 'purchase' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15 }}>¥</span>
            <input
              type="number"
              min="0"
              className="num-plain"
              placeholder="例: 1500"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              style={inputStyle}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15 }}>¥</span>
            <input
              type="number"
              min="0"
              className="num-plain"
              placeholder="例: 600"
              value={seedPrice}
              onChange={(e) => setSeedPrice(e.target.value)}
              style={inputStyle}
            />
            <span style={{ fontSize: 13, color: '#888' }}>/ 20粒</span>
          </div>
        )}
        {source === 'seedling' && seedPrice && !isNaN(parseFloat(seedPrice)) && (
          <p style={{ fontSize: 12, color: '#888', margin: '8px 0 0' }}>
            1粒あたり {fmt(parseFloat(seedPrice) / 20)}
          </p>
        )}
      </div>

      {/* ③ 販売価格 */}
      <div style={{
        background: sellingPrice ? '#f0f4ee' : '#f5f5f5',
        border: `1px solid ${sellingPrice ? '#b8d0b0' : '#e0e0e0'}`,
        borderRadius: 6,
        padding: '20px 24px',
        maxWidth: 320,
        transition: 'background 0.2s, border-color 0.2s',
      }}>
        <p style={{ fontSize: 12, color: '#888', margin: '0 0 6px', letterSpacing: 1 }}>
          ③ 推奨販売価格（× 2）
        </p>
        <p style={{
          fontSize: 28,
          fontWeight: 600,
          margin: 0,
          color: sellingPrice ? '#1c2417' : '#ccc',
          letterSpacing: 1,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {sellingPrice ? fmt(sellingPrice) : '¥ —'}
        </p>
        {source === 'seedling' && sellingPrice && (
          <p style={{ fontSize: 12, color: '#666', margin: '6px 0 0' }}>
            種子代 {fmt(parseFloat(seedPrice))} ÷ 20粒 × 2
          </p>
        )}
      </div>
    </div>
  )
}

function ComingSoon({ brand }: { brand: string }) {
  return (
    <p style={{ color: '#aaa', fontSize: 14 }}>{brand} の計算機は準備中です。</p>
  )
}

export default function PriceCalc() {
  const [tab, setTab] = useState<Brand>('ei8htplants')

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 28px', letterSpacing: 1 }}>
        販売金額計算
      </h1>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 32, borderBottom: '1px solid #dddde8' }}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: tab === id ? '2px solid #1c2417' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: tab === id ? 600 : 400,
              color: tab === id ? '#1c2417' : '#888',
              marginBottom: -1,
              transition: 'color 0.15s',
              fontFamily: 'inherit',
              letterSpacing: 0.5,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* コンテンツ */}
      {tab === 'ei8htplants' && <Ei8htPlantsCalc />}
      {tab === 'habitatoides' && <ComingSoon brand="Habitat Oides" />}
      {tab === 'hue' && <ComingSoon brand="HUE" />}
    </div>
  )
}
