import { useState, useEffect } from 'react'
import { api, type PotArtist, type PriceCalcEntry, type PriceCalcEntryBody } from '../../lib/api'

type Brand = 'ei8htplants' | 'habitatoides' | 'hue'
type SourceType = 'purchase' | 'seedling'

const TABS: { id: Brand; label: string }[] = [
  { id: 'ei8htplants', label: 'ei8ht plants' },
  { id: 'habitatoides', label: 'Habitat Oides' },
  { id: 'hue', label: 'HUE' },
]

const BRAND_LABELS: Record<string, string> = {
  ei8htplants: 'ei8ht plants',
  habitatoides: 'Habitat Oides',
  hue: 'HUE',
}

const fmt = (n: number) => '¥' + Math.round(n).toLocaleString('ja-JP')

const inputStyle: React.CSSProperties = {
  padding: '10px 14px',
  border: '1px solid #dddde8',
  borderRadius: 4,
  fontSize: 15,
  fontFamily: 'inherit',
  width: '100%',
  maxWidth: 280,
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#666',
  margin: '0 0 10px',
  fontWeight: 600,
  letterSpacing: 1,
}

/**
 * 推奨販売価格を強調表示するコンポーネント
 * @param recommendedPrice - 表示する推奨価格。null の場合はプレースホルダーを表示する
 */
function PriceDisplay({ recommendedPrice }: { recommendedPrice: number | null }) {
  return (
    <div style={{
      background: recommendedPrice ? '#f0f4ee' : '#f5f5f5',
      border: `1px solid ${recommendedPrice ? '#b8d0b0' : '#e0e0e0'}`,
      borderRadius: 6, padding: '16px 20px', maxWidth: 280,
      transition: 'background 0.2s, border-color 0.2s',
    }}>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 4px', letterSpacing: 1 }}>推奨販売価格（× 2）</p>
      <p style={{
        fontSize: 26, fontWeight: 600, margin: 0,
        color: recommendedPrice ? '#1c2417' : '#ccc',
        letterSpacing: 1, fontVariantNumeric: 'tabular-nums',
      }}>
        {recommendedPrice ? fmt(recommendedPrice) : '¥ —'}
      </p>
    </div>
  )
}

/**
 * 価格登録ボタンコンポーネント
 * @param label - ボタンに表示するラベル（登録価格を含む場合あり）
 * @param disabled - 必須項目未入力時に無効化するフラグ
 * @param saving - 登録処理中かどうか
 * @param onClick - クリック時のコールバック
 */
function RegisterButton({ label, disabled, saving, onClick }: {
  label: string; disabled: boolean; saving: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || saving}
      style={{
        padding: '12px 24px',
        background: disabled || saving ? '#ccc' : '#1c2417',
        color: '#fff', border: 'none', borderRadius: 4,
        fontSize: 14, cursor: disabled || saving ? 'not-allowed' : 'pointer',
        alignSelf: 'flex-start', transition: 'background 0.15s',
        fontFamily: 'inherit', letterSpacing: 0.5,
      }}
    >
      {saving ? '登録中...' : label}
    </button>
  )
}

/**
 * ei8ht plants ブランドの価格計算コンポーネント
 * @param onRegister - 価格エントリを登録するコールバック
 */
function Ei8htPlantsCalc({ onRegister }: { onRegister: (d: PriceCalcEntryBody) => Promise<void> }) {
  const [source, setSource] = useState<SourceType>('purchase')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [seedPrice, setSeedPrice] = useState('')
  const [plantName, setPlantName] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [saving, setSaving] = useState(false)

  // 仕入れの場合はそのまま、実生の場合は種子20粒の金額を1粒単価に換算してコストを算出する
  const raw = source === 'purchase' ? parseFloat(purchasePrice) : parseFloat(seedPrice) / 20
  const cost = isNaN(raw) || raw <= 0 ? null : raw
  const recommendedPrice = cost ? cost * 2 : null
  const parsedCustom = parseFloat(customPrice)
  const finalPrice = customPrice && !isNaN(parsedCustom) && parsedCustom > 0 ? parsedCustom : recommendedPrice
  const canRegister = !!(plantName.trim() && finalPrice && finalPrice > 0 && cost)

  const handleRegister = async () => {
    if (!canRegister || !cost || !finalPrice) return
    setSaving(true)
    try {
      await onRegister({
        brand: 'ei8htplants',
        plant_name: plantName.trim(),
        pot_artist_name: null,
        cost,
        selling_price: finalPrice,
      })
      setPlantName(''); setCustomPrice(''); setPurchasePrice(''); setSeedPrice('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <p style={labelStyle}>植物名</p>
        <input
          type="text" placeholder="例: アガベ チタノタ"
          value={plantName} onChange={(e) => setPlantName(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div>
        <p style={labelStyle}>種別</p>
        <div style={{ display: 'flex', gap: 24 }}>
          {([['purchase', '仕入れ'], ['seedling', '実生']] as const).map(([val, label]) => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 15 }}>
              <input
                type="radio" name="ei8ht-source" value={val}
                checked={source === val}
                onChange={() => { setSource(val); setPurchasePrice(''); setSeedPrice('') }}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p style={labelStyle}>{source === 'purchase' ? '仕入れ値' : '種子 20粒あたりの金額'}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15 }}>¥</span>
          {source === 'purchase' ? (
            <input
              type="number" min="0" className="num-plain"
              placeholder="例: 1500" value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)} style={inputStyle}
            />
          ) : (
            <>
              <input
                type="number" min="0" className="num-plain"
                placeholder="例: 600" value={seedPrice}
                onChange={(e) => setSeedPrice(e.target.value)} style={inputStyle}
              />
              <span style={{ fontSize: 13, color: '#888' }}>/ 20粒</span>
            </>
          )}
        </div>
        {source === 'seedling' && seedPrice && !isNaN(parseFloat(seedPrice)) && (
          <p style={{ fontSize: 12, color: '#888', margin: '8px 0 0' }}>
            1粒あたり {fmt(parseFloat(seedPrice) / 20)}
          </p>
        )}
      </div>

      <PriceDisplay recommendedPrice={recommendedPrice} />

      <div>
        <p style={labelStyle}>任意価格（推奨価格を上書き）</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15 }}>¥</span>
          <input
            type="number" min="0" className="num-plain"
            placeholder={recommendedPrice ? String(Math.round(recommendedPrice)) : '—'}
            value={customPrice}
            onChange={(e) => setCustomPrice(e.target.value)} style={inputStyle}
          />
        </div>
        {customPrice && finalPrice && (
          <p style={{ fontSize: 12, color: '#3a7c5a', margin: '6px 0 0' }}>登録価格: {fmt(finalPrice)}</p>
        )}
      </div>

      <RegisterButton
        label={finalPrice ? `登録  ${fmt(finalPrice)}` : '登録'}
        disabled={!canRegister} saving={saving} onClick={handleRegister}
      />
    </div>
  )
}

/**
 * Habitat Oides ブランドの価格計算コンポーネント（植物+鉢の合計コストから推奨価格を計算）
 * @param onRegister - 価格エントリを登録するコールバック
 * @param potArtists - 鉢作家の選択肢一覧
 */
function HabitatOidesCalc({ onRegister, potArtists }: {
  onRegister: (d: PriceCalcEntryBody) => Promise<void>
  potArtists: PotArtist[]
}) {
  const [plantName, setPlantName] = useState('')
  const [plantPrice, setPlantPrice] = useState('')
  const [potPrice, setPotPrice] = useState('')
  const [artistId, setArtistId] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [saving, setSaving] = useState(false)

  const plant = parseFloat(plantPrice)
  const pot = parseFloat(potPrice)
  const totalCost = (!isNaN(plant) && plant > 0 ? plant : 0) + (!isNaN(pot) && pot > 0 ? pot : 0)
  const recommendedPrice = totalCost > 0 ? totalCost * 2 : null
  const parsedCustom = parseFloat(customPrice)
  const finalPrice = customPrice && !isNaN(parsedCustom) && parsedCustom > 0 ? parsedCustom : recommendedPrice
  const selectedArtist = potArtists.find((a) => a.id === artistId)
  const canRegister = !!(plantName.trim() && totalCost > 0 && finalPrice && finalPrice > 0)

  const handleRegister = async () => {
    if (!canRegister || !finalPrice) return
    setSaving(true)
    try {
      await onRegister({
        brand: 'habitatoides',
        plant_name: plantName.trim(),
        pot_artist_name: selectedArtist?.name ?? null,
        cost: totalCost,
        selling_price: finalPrice,
      })
      setPlantName(''); setPlantPrice(''); setPotPrice(''); setArtistId(''); setCustomPrice('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <p style={labelStyle}>植物名</p>
        <input
          type="text" placeholder="例: アガベ ポタトルム"
          value={plantName} onChange={(e) => setPlantName(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div>
        <p style={labelStyle}>植物仕入れ値</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15 }}>¥</span>
          <input
            type="number" min="0" className="num-plain"
            placeholder="例: 3000" value={plantPrice}
            onChange={(e) => setPlantPrice(e.target.value)} style={inputStyle}
          />
        </div>
      </div>

      <div>
        <p style={labelStyle}>鉢仕入れ値</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15 }}>¥</span>
          <input
            type="number" min="0" className="num-plain"
            placeholder="例: 5000" value={potPrice}
            onChange={(e) => setPotPrice(e.target.value)} style={inputStyle}
          />
        </div>
      </div>

      <div>
        <p style={labelStyle}>鉢作家</p>
        <select
          value={artistId} onChange={(e) => setArtistId(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="">量産鉢</option>
          {potArtists.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <PriceDisplay recommendedPrice={recommendedPrice} />

      <div>
        <p style={labelStyle}>任意価格（推奨価格を上書き）</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15 }}>¥</span>
          <input
            type="number" min="0" className="num-plain"
            placeholder={recommendedPrice ? String(Math.round(recommendedPrice)) : '—'}
            value={customPrice}
            onChange={(e) => setCustomPrice(e.target.value)} style={inputStyle}
          />
        </div>
        {customPrice && finalPrice && (
          <p style={{ fontSize: 12, color: '#3a7c5a', margin: '6px 0 0' }}>登録価格: {fmt(finalPrice)}</p>
        )}
      </div>

      <RegisterButton
        label={finalPrice ? `登録  ${fmt(finalPrice)}` : '登録'}
        disabled={!canRegister} saving={saving} onClick={handleRegister}
      />
    </div>
  )
}

/**
 * 未実装ブランドのプレースホルダーコンポーネント
 * @param brand - ブランド名
 */
function ComingSoon({ brand }: { brand: string }) {
  return <p style={{ color: '#aaa', fontSize: 14 }}>{brand} の計算機は準備中です。</p>
}

/**
 * 登録済みの価格計算エントリを一覧表示するコンポーネント
 * @param entries - 表示するエントリ一覧
 * @param onDelete - 削除ボタン押下時のコールバック
 */
function EntriesList({ entries, onDelete }: {
  entries: PriceCalcEntry[]
  onDelete: (id: string) => void
}) {
  if (entries.length === 0) return (
    <p style={{ color: '#aaa', fontSize: 14 }}>まだ登録されていません。</p>
  )

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 500 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #dddde8' }}>
            {['植物名 / 鉢作家', 'ブランド', '元値', '販売価格', ''].map((h, i) => (
              <th key={i} style={{
                padding: '8px 12px', textAlign: 'left',
                fontWeight: 600, color: '#666', letterSpacing: 0.5, whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ padding: '12px 12px' }}>
                <div style={{ fontWeight: 500 }}>{e.plant_name}</div>
                <div style={{ fontSize: 12, color: '#888' }}>{e.pot_artist_name || '量産鉢'}</div>
              </td>
              <td style={{ padding: '12px 12px', color: '#666', fontSize: 12, whiteSpace: 'nowrap' }}>
                {BRAND_LABELS[e.brand] ?? e.brand}
              </td>
              <td style={{ padding: '12px 12px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {fmt(e.cost)}
              </td>
              <td style={{ padding: '12px 12px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {fmt(e.selling_price)}
              </td>
              <td style={{ padding: '12px 12px' }}>
                <button
                  onClick={() => onDelete(e.id)}
                  style={{
                    padding: '4px 10px', background: 'none',
                    border: '1px solid #e0b0b0', borderRadius: 4,
                    color: '#c0392b', fontSize: 12, cursor: 'pointer',
                  }}
                >
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** ブランド別の販売価格計算ツール。仕入れ値から推奨価格を算出し、登録リストとして保存する */
export default function PriceCalc() {
  const [tab, setTab] = useState<Brand>('ei8htplants')
  const [entries, setEntries] = useState<PriceCalcEntry[]>([])
  const [potArtists, setPotArtists] = useState<PotArtist[]>([])
  const [loadingEntries, setLoadingEntries] = useState(true)

  useEffect(() => {
    api.potArtists.list().then(setPotArtists).catch(() => {})
    api.priceCalcEntries.list()
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoadingEntries(false))
  }, [])

  const handleRegister = async (data: PriceCalcEntryBody) => {
    const entry = await api.priceCalcEntries.add(data)
    setEntries((prev) => [entry, ...prev])
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この登録を削除しますか？')) return
    await api.priceCalcEntries.delete(id)
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 28px', letterSpacing: 1 }}>
        販売金額計算
      </h1>

      <div style={{ display: 'flex', gap: 0, marginBottom: 32, borderBottom: '1px solid #dddde8' }}>
        {TABS.map(({ id, label }) => (
          <button
            key={id} onClick={() => setTab(id)}
            style={{
              padding: '10px 20px', background: 'none', border: 'none',
              borderBottom: tab === id ? '2px solid #1c2417' : '2px solid transparent',
              cursor: 'pointer', fontSize: 14,
              fontWeight: tab === id ? 600 : 400,
              color: tab === id ? '#1c2417' : '#888',
              marginBottom: -1, transition: 'color 0.15s',
              fontFamily: 'inherit', letterSpacing: 0.5,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'ei8htplants' && <Ei8htPlantsCalc onRegister={handleRegister} />}
      {tab === 'habitatoides' && <HabitatOidesCalc onRegister={handleRegister} potArtists={potArtists} />}
      {tab === 'hue' && <ComingSoon brand="HUE" />}

      <div style={{ marginTop: 56, paddingTop: 40, borderTop: '2px solid #dddde8' }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 20px', letterSpacing: 1 }}>
          登録リスト
        </h2>
        {loadingEntries ? (
          <p style={{ color: '#aaa', fontSize: 14 }}>読み込み中...</p>
        ) : (
          <EntriesList entries={entries} onDelete={handleDelete} />
        )}
      </div>
    </div>
  )
}
