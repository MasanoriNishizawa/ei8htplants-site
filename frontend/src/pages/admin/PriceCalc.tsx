import { useState, useEffect } from 'react'
import { useConfirmLeave, useUnsavedChanges } from './UnsavedChanges'
import { api, type PotArtist, type PriceCalcEntry, type PriceCalcEntryBody, type PriceCalcMode } from '../../lib/api'
import { BRAND } from '../../lib/brands'
import { formatYen } from '../../lib/format'
import {
  MAX_COST_RATE, costRate, exceedsMaxCostRate, formatCostRate, formatRateLabel,
  loadCostRateInput, parseCostRateInput, recommendPrice, saveCostRateInput,
} from '../../lib/priceCalc'
import { failMessage } from './errorMessage'

/** 価格計算で使うブランドのキー（price_calc_entries.brand に保存する値） */
type Brand = 'ei8htplants' | 'habitatoides' | 'hue'
/** 計算の種類（production: 自分たちで生産して卸価格から決める、purchase: 仕入れて目標原価率から決める） */
type CalcMode = PriceCalcMode
/** 登録リストの絞り込み（all: すべてのブランド、それ以外はそのブランドだけ） */
type ListFilter = Brand | 'all'

/** ブランドのキー → 表示名（短い表記）。保存済みの記録の brand（文字列）でも引けるよう string のキーにする */
const BRAND_LABELS: Readonly<Record<string, string>> = {
  ei8htplants: BRAND.ei8htPlants.shortName,
  habitatoides: BRAND.habitatOides.shortName,
  hue: BRAND.hue.shortName,
}

/** 画面上部のブランドの切り替えタブ */
const TABS: { id: Brand; label: string }[] = (['ei8htplants', 'habitatoides', 'hue'] as const).map((id) => ({ id, label: BRAND_LABELS[id] }))

/** ブランドのタブの下の、計算の種類の切り替えタブ（2 段目。並びは 生産 → 仕入れ） */
const MODE_TABS: { id: CalcMode; label: string }[] = [
  { id: 'production', label: '生産' },
  { id: 'purchase', label: '仕入れ' },
]

/** 計算の種類 → 表示名（登録リストのブランドの列の 2 行目に出す） */
const MODE_LABELS: Readonly<Record<CalcMode, string>> = { production: '生産', purchase: '仕入れ' }

/** 登録リストの絞り込みの切り替え（「すべて」とブランドのタブ。初期は「すべて」） */
const LIST_FILTER_TABS: { id: ListFilter; label: string }[] = [{ id: 'all', label: 'すべて' }, ...TABS]

/** ブランドごとの植物名の入力欄の placeholder（生産・仕入れで同じものを使う） */
const PLANT_PLACEHOLDERS: Readonly<Record<Brand, string>> = {
  ei8htplants: '例: アガベ チタノタ',
  habitatoides: '例: アガベ ポタトルム',
  hue: '例: ユーフォルビア オベサ',
}

/** 生産の販売価格の倍率（卸価格のちょうど 2 倍。切り上げはしない） */
const WHOLESALE_MARKUP = 2

/**
 * 計算結果（小数を含む）を四捨五入して「¥1,234」の形にする
 * @param n - 金額（円）
 * @returns 整形した金額
 */
const yenRounded = (n: number) => formatYen(Math.round(n))

/** 目標原価率の既定値を % の数値の文字列にしたもの（「40% に戻す」ボタンで入れる値 = '40'） */
const DEFAULT_COST_RATE_INPUT = String(Math.round(MAX_COST_RATE * 100))

/** 原価率が目標を超えたときの注意の文字色（削除ボタン・失敗の文言と同じ赤） */
const WARN_COLOR = '#c0392b'

/** 計算フォームの入力欄（植物名・各金額・鉢作家の select）の見た目。最大幅 280px */
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

/** 計算フォームの入力欄の上の項目名（p 要素）の見た目 */
const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#666',
  margin: '0 0 10px',
  fontWeight: 600,
  letterSpacing: 1,
}

/**
 * 推奨販売価格を強調表示するコンポーネント。推奨価格の下に、その価格での原価率も出す
 * @param recommendedPrice - 表示する推奨価格。null の場合はプレースホルダーを表示する
 * @param cost - 原価（原価率の計算に使う。未計算なら null）
 * @param maxRate - 目標原価率（見出しに出す。正しく入っていなければ null）
 * @param title - 見出しを差し替えるときの文言（生産の「販売価格（卸価格の 2 倍）」。省略時は目標原価率の見出し）
 * @returns 推奨価格の枠（未計算なら灰色で「¥ —」）
 */
function PriceDisplay({ recommendedPrice, cost, maxRate, title }: {
  recommendedPrice: number | null
  cost: number | null
  maxRate: number | null
  title?: string
}) {
  return (
    <div style={{
      background: recommendedPrice ? '#f0f4ee' : '#f5f5f5',
      border: `1px solid ${recommendedPrice ? '#b8d0b0' : '#e0e0e0'}`,
      borderRadius: 6, padding: '16px 20px', maxWidth: 280,
      transition: 'background 0.2s, border-color 0.2s',
    }}>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 4px', letterSpacing: 1 }}>
        {/* 見出しの差し替えがあればそれを出す。無ければ目標原価率の見出し
            （目標原価率が正しく入っていないときは率を出さない。推奨価格も「¥ —」になる） */}
        {title ?? (maxRate !== null ? `推奨販売価格（原価率 ${formatRateLabel(maxRate)} 以下）` : '推奨販売価格（目標原価率が未設定）')}
      </p>
      <p style={{
        fontSize: 26, fontWeight: 600, margin: 0,
        color: recommendedPrice ? '#1c2417' : '#ccc',
        letterSpacing: 1, fontVariantNumeric: 'tabular-nums',
      }}>
        {recommendedPrice ? yenRounded(recommendedPrice) : '¥ —'}
      </p>
      {/* 推奨価格での実際の原価率（目標原価率から計算したときは切り上げているので目標以下になる） */}
      {recommendedPrice !== null && cost !== null && maxRate !== null && (
        <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0', fontVariantNumeric: 'tabular-nums' }}>
          原価率 {formatCostRate(costRate(cost, recommendedPrice), maxRate)}
        </p>
      )}
    </div>
  )
}

/**
 * 推奨価格を上書きする任意価格の入力欄。入力があれば登録価格とその原価率を出し、
 * 原価率が目標原価率を超えるときは注意を出す（登録は止めない）
 * @param value - 任意価格の入力（文字のまま）
 * @param onChange - 入力が変わったときのコールバック
 * @param recommendedPrice - 推奨価格（placeholder に出す。未計算なら null）
 * @param finalPrice - 登録する販売価格（未計算なら null）
 * @param cost - 原価（原価率の計算に使う。未計算なら null）
 * @param maxRate - 目標原価率（超えたかの判定に使う。正しく入っていなければ null で、原価率と注意を出さない）
 * @param label - 項目名（省略時は「任意価格（推奨価格を上書き）」。生産では「任意価格（販売価格を上書き）」）
 * @returns 任意価格の項目名・入力欄・登録価格の表示
 */
function CustomPriceField({ value, onChange, recommendedPrice, finalPrice, cost, maxRate, label = '任意価格（推奨価格を上書き）' }: {
  value: string
  onChange: (v: string) => void
  recommendedPrice: number | null
  finalPrice: number | null
  cost: number | null
  maxRate: number | null
  label?: string
}) {
  /** 登録価格での原価率（原価・登録価格・目標原価率がそろっていなければ null） */
  const rate = cost && finalPrice && maxRate !== null ? costRate(cost, finalPrice) : null
  /** 登録価格の原価率が目標を超えているか */
  const over = !!(cost && finalPrice && maxRate !== null && exceedsMaxCostRate(cost, finalPrice, maxRate))

  return (
    <div>
      <p style={labelStyle}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 15 }}>¥</span>
        <input
          type="number" min="0" className="num-plain"
          placeholder={recommendedPrice ? String(Math.round(recommendedPrice)) : '—'}
          value={value}
          onChange={(e) => onChange(e.target.value)} style={inputStyle}
        />
      </div>
      {/* 任意価格を入れたときは、実際に登録する価格とその原価率を出す（目標を超えたら赤字） */}
      {value && finalPrice !== null && (
        <p style={{ fontSize: 12, color: over ? WARN_COLOR : '#3a7c5a', margin: '6px 0 0' }}>
          登録価格: {yenRounded(finalPrice)}{rate !== null && maxRate !== null && `（原価率 ${formatCostRate(rate, maxRate)}）`}
        </p>
      )}
      {/* 原価率が目標を超えるときの注意（登録はそのままできる） */}
      {value && over && maxRate !== null && (
        <p style={{ fontSize: 12, color: WARN_COLOR, margin: '4px 0 0' }}>
          原価率が {formatRateLabel(maxRate)} を超えています
        </p>
      )}
    </div>
  )
}

/**
 * 価格登録ボタンコンポーネント
 * @param label - ボタンに表示するラベル（登録価格を含む場合あり）
 * @param disabled - 必須項目未入力時に無効化するフラグ
 * @param saving - 登録処理中かどうか
 * @param onClick - クリック時のコールバック
 * @returns 登録ボタン（押せないときは灰色）
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
 * 鉢作家の選択欄（Habitat Oides の生産・仕入れで使う。未選択は「量産鉢」）
 * @param value - 選んだ鉢作家の id（空は量産鉢）
 * @param onChange - 選択が変わったときのコールバック
 * @param potArtists - 鉢作家の選択肢一覧
 * @returns 項目名と select
 */
function PotArtistSelect({ value, onChange, potArtists }: {
  value: string
  onChange: (id: string) => void
  potArtists: PotArtist[]
}) {
  return (
    <div>
      <p style={labelStyle}>鉢作家</p>
      <select
        value={value} onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, cursor: 'pointer' }}
      >
        <option value="">量産鉢</option>
        {potArtists.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
    </div>
  )
}

/**
 * 生産の価格計算コンポーネント（3 ブランド共通）。販売価格は卸価格のちょうど WHOLESALE_MARKUP 倍
 * 目標原価率は使わないので、原価率の表示・注意は出さず、目標原価率が正しくなくても登録できる
 * @param brand - 登録する記録のブランド（price_calc_entries.brand に保存する値）
 * @param withPotArtist - 鉢作家の選択欄を出すか（Habitat Oides だけ出す。ei8ht plants・HUE は pot_artist_name を null で登録する）
 * @param plantPlaceholder - 植物名の入力欄の placeholder
 * @param potArtists - 鉢作家の選択肢一覧（withPotArtist が false なら使わない）
 * @param onRegister - 価格エントリを登録するコールバック（失敗したら投げる）
 * @returns 植物名・卸価格・（鉢作家）・任意価格の入力と販売価格
 */
function ProductionCalc({ brand, withPotArtist, plantPlaceholder, potArtists, onRegister }: {
  brand: Brand
  withPotArtist: boolean
  plantPlaceholder: string
  potArtists: PotArtist[]
  onRegister: (d: PriceCalcEntryBody) => Promise<void>
}) {
  /** 植物名の入力 */
  const [plantName, setPlantName] = useState('')
  /** 卸価格の入力（文字のまま持つ） */
  const [wholesalePrice, setWholesalePrice] = useState('')
  /** 選んだ鉢の作家の id（空は未選択。鉢作家の欄が無いブランドでは常に空） */
  const [artistId, setArtistId] = useState('')
  /** 販売価格を上書きする任意価格の入力（空なら卸価格 × WHOLESALE_MARKUP で登録） */
  const [customPrice, setCustomPrice] = useState('')
  /** 登録中なら true */
  const [saving, setSaving] = useState(false)
  // 書きかけの入力があれば、サイドメニュー・タブの切り替え・再読み込みの確認に使えるよう登録する
  // （登録に成功したら入力欄を空にするので確認は出なくなる）
  useUnsavedChanges([plantName, wholesalePrice, artistId, customPrice].some((v) => v.trim() !== ''))

  // 1. 卸価格を原価として読む（未入力・0 以下は null）
  /** 卸価格の入力を数値にしたもの（数値でなければ NaN） */
  const raw = parseFloat(wholesalePrice)
  /** 卸価格（登録時の cost） */
  const cost = isNaN(raw) || raw <= 0 ? null : raw
  // 2. 販売価格（卸価格のちょうど WHOLESALE_MARKUP 倍）と、任意価格があればそれを優先した登録価格
  /** 販売価格（卸価格が無ければ null） */
  const salesPrice = cost !== null ? cost * WHOLESALE_MARKUP : null
  /** 任意価格の入力を数値にしたもの */
  const parsedCustom = parseFloat(customPrice)
  /** 登録する販売価格（任意価格が正の数ならそれ、無ければ卸価格 × WHOLESALE_MARKUP） */
  const finalPrice = customPrice && !isNaN(parsedCustom) && parsedCustom > 0 ? parsedCustom : salesPrice
  /** 選んだ鉢作家（未選択・鉢作家の欄が無いときは undefined で、pot_artist_name を null で登録する） */
  const selectedArtist = withPotArtist ? potArtists.find((a) => a.id === artistId) : undefined
  // 3. 植物名・卸価格・販売価格がそろったら登録できる（目標原価率は見ない）
  /** 登録ボタンを押せるかどうか */
  const canRegister = !!(plantName.trim() && cost && finalPrice && finalPrice > 0)

  /**
   * 入力内容を登録し、成功したら入力欄を空にする
   * @returns 登録が終わる Promise
   */
  const handleRegister = async () => {
    if (!canRegister || !cost || !finalPrice) return
    setSaving(true)
    try {
      await onRegister({
        brand,
        plant_name: plantName.trim(),
        pot_artist_name: selectedArtist?.name ?? null,
        cost,
        selling_price: finalPrice,
        mode: 'production',
      })
      setPlantName(''); setWholesalePrice(''); setArtistId(''); setCustomPrice('')
    } catch {
      // 失敗の文言は親（PriceCalc）が出す。入力はやり直せるよう残す
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <p style={labelStyle}>植物名</p>
        <input
          type="text" placeholder={plantPlaceholder}
          value={plantName} onChange={(e) => setPlantName(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div>
        <p style={labelStyle}>卸価格</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15 }}>¥</span>
          <input
            type="number" min="0" className="num-plain"
            placeholder="例: 1500" value={wholesalePrice}
            onChange={(e) => setWholesalePrice(e.target.value)} style={inputStyle}
          />
        </div>
      </div>

      {/* 鉢作家の選択（Habitat Oides だけ。未選択は「量産鉢」） */}
      {withPotArtist && <PotArtistSelect value={artistId} onChange={setArtistId} potArtists={potArtists} />}

      {/* 生産は目標原価率を使わないので maxRate は null（原価率の行は出ない） */}
      <PriceDisplay
        recommendedPrice={salesPrice} cost={cost} maxRate={null}
        title={`販売価格（卸価格の ${WHOLESALE_MARKUP} 倍）`}
      />

      {/* maxRate が null なので、登録価格だけを出し、原価率と超過の注意は出ない */}
      <CustomPriceField
        value={customPrice} onChange={setCustomPrice}
        recommendedPrice={salesPrice} finalPrice={finalPrice} cost={cost} maxRate={null}
        label="任意価格（販売価格を上書き）"
      />

      <RegisterButton
        label={finalPrice ? `登録  ${yenRounded(finalPrice)}` : '登録'}
        disabled={!canRegister} saving={saving} onClick={handleRegister}
      />
    </div>
  )
}

/**
 * ei8ht plants の仕入れの価格計算コンポーネント（仕入れ値を原価として推奨価格を計算）
 * @param plantPlaceholder - 植物名の入力欄の placeholder
 * @param maxRate - 目標原価率（親の PriceCalc の欄の値。正しく入っていなければ null で、推奨価格を出さず登録もできない）
 * @param onRegister - 価格エントリを登録するコールバック（失敗したら投げる）
 * @returns 植物名・仕入れ値・任意価格の入力と推奨価格
 */
function Ei8htPlantsPurchaseCalc({ plantPlaceholder, maxRate, onRegister }: {
  plantPlaceholder: string
  maxRate: number | null
  onRegister: (d: PriceCalcEntryBody) => Promise<void>
}) {
  /** 仕入れ値の入力（文字のまま持つ） */
  const [purchasePrice, setPurchasePrice] = useState('')
  /** 植物名の入力 */
  const [plantName, setPlantName] = useState('')
  /** 推奨価格を上書きする任意価格の入力（空なら推奨価格で登録） */
  const [customPrice, setCustomPrice] = useState('')
  /** 登録中なら true */
  const [saving, setSaving] = useState(false)
  // 書きかけの入力があれば、サイドメニュー・タブの切り替え・再読み込みの確認に使えるよう登録する
  // （登録に成功したら入力欄を空にするので確認は出なくなる）
  useUnsavedChanges([plantName, purchasePrice, customPrice].some((v) => v.trim() !== ''))

  // 1. 原価は仕入れ値そのもの（未入力・0 以下は null）
  /** 入力から読み取った原価（数値でなければ NaN） */
  const raw = parseFloat(purchasePrice)
  /** 原価 */
  const cost = isNaN(raw) || raw <= 0 ? null : raw
  // 2. 推奨価格（原価率が目標以下でキリの良い値）と、任意価格があればそれを優先した登録価格
  /** 推奨販売価格（原価か目標原価率が無ければ null） */
  const recommendedPrice = cost && maxRate !== null ? recommendPrice(cost, maxRate) : null
  /** 任意価格の入力を数値にしたもの */
  const parsedCustom = parseFloat(customPrice)
  /** 登録する販売価格（任意価格が正の数ならそれ、無ければ推奨価格） */
  const finalPrice = customPrice && !isNaN(parsedCustom) && parsedCustom > 0 ? parsedCustom : recommendedPrice
  // 3. 植物名・原価・販売価格・目標原価率がそろったら登録できる
  //    （目標原価率が正しくないと原価率の判定ができないため、任意価格が入っていても登録させない）
  /** 登録ボタンを押せるかどうか */
  const canRegister = !!(plantName.trim() && finalPrice && finalPrice > 0 && cost && maxRate !== null)

  /**
   * 入力内容を登録し、成功したら入力欄を空にする
   * @returns 登録が終わる Promise
   */
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
        mode: 'purchase',
      })
      setPlantName(''); setCustomPrice(''); setPurchasePrice('')
    } catch {
      // 失敗の文言は親（PriceCalc）が出す。入力はやり直せるよう残す
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <p style={labelStyle}>植物名</p>
        <input
          type="text" placeholder={plantPlaceholder}
          value={plantName} onChange={(e) => setPlantName(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div>
        <p style={labelStyle}>仕入れ値</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15 }}>¥</span>
          <input
            type="number" min="0" className="num-plain"
            placeholder="例: 1500" value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)} style={inputStyle}
          />
        </div>
      </div>

      <PriceDisplay recommendedPrice={recommendedPrice} cost={cost} maxRate={maxRate} />

      <CustomPriceField
        value={customPrice} onChange={setCustomPrice}
        recommendedPrice={recommendedPrice} finalPrice={finalPrice} cost={cost} maxRate={maxRate}
      />

      <RegisterButton
        label={finalPrice ? `登録  ${yenRounded(finalPrice)}` : '登録'}
        disabled={!canRegister} saving={saving} onClick={handleRegister}
      />
    </div>
  )
}

/** 植物 + 鉢の仕入れの計算（PlantPotCalc）を使うブランド */
type PlantPotBrand = Extract<Brand, 'habitatoides' | 'hue'>

/**
 * 仕入れの価格計算で、植物 + 鉢の合計を原価として推奨価格を計算するコンポーネント（Habitat Oides・HUE で共通）
 * @param brand - 登録する記録のブランド（price_calc_entries.brand に保存する値）
 * @param withPotArtist - 鉢作家の選択欄を出すか（Habitat Oides は出す。HUE は鉢作家の概念が無いので出さず、pot_artist_name は null で登録する）
 * @param plantPlaceholder - 植物名の入力欄の placeholder
 * @param potArtists - 鉢作家の選択肢一覧（withPotArtist が false なら使わない）
 * @param maxRate - 目標原価率（親の PriceCalc の欄の値。正しく入っていなければ null で、推奨価格を出さず登録もできない）
 * @param onRegister - 価格エントリを登録するコールバック（失敗したら投げる）
 * @returns 植物名・植物と鉢の仕入れ値・（鉢作家）・任意価格の入力と推奨価格
 */
function PlantPotCalc({ brand, withPotArtist, plantPlaceholder, potArtists, maxRate, onRegister }: {
  brand: PlantPotBrand
  withPotArtist: boolean
  plantPlaceholder: string
  potArtists: PotArtist[]
  maxRate: number | null
  onRegister: (d: PriceCalcEntryBody) => Promise<void>
}) {
  /** 植物名の入力 */
  const [plantName, setPlantName] = useState('')
  /** 植物の仕入れ値の入力 */
  const [plantPrice, setPlantPrice] = useState('')
  /** 鉢の値段の入力 */
  const [potPrice, setPotPrice] = useState('')
  /** 選んだ鉢の作家の id（空は未選択。鉢作家の欄が無いブランドでは常に空） */
  const [artistId, setArtistId] = useState('')
  /** 推奨価格を上書きする任意価格の入力（空なら推奨価格で登録） */
  const [customPrice, setCustomPrice] = useState('')
  /** 登録中なら true */
  const [saving, setSaving] = useState(false)
  // 書きかけの入力があれば、サイドメニュー・タブの切り替え・再読み込みの確認に使えるよう登録する
  // （登録に成功したら入力欄を空にするので確認は出なくなる）
  useUnsavedChanges([plantName, plantPrice, potPrice, artistId, customPrice].some((v) => v.trim() !== ''))

  // 1. 植物と鉢の合計を原価にする（未入力・0 以下は 0 として扱う）
  /** 植物の仕入れ値（数値でなければ NaN） */
  const plant = parseFloat(plantPrice)
  /** 鉢の仕入れ値（数値でなければ NaN） */
  const pot = parseFloat(potPrice)
  /** 原価（植物 + 鉢） */
  const totalCost = (!isNaN(plant) && plant > 0 ? plant : 0) + (!isNaN(pot) && pot > 0 ? pot : 0)
  // 2. 推奨価格と、任意価格があればそれを優先した登録価格
  /** 推奨販売価格（原価率が目標以下でキリの良い値。原価が 0・目標原価率が無いなら null） */
  const recommendedPrice = totalCost > 0 && maxRate !== null ? recommendPrice(totalCost, maxRate) : null
  /** 任意価格の入力を数値にしたもの */
  const parsedCustom = parseFloat(customPrice)
  /** 登録する販売価格（任意価格が正の数ならそれ、無ければ推奨価格） */
  const finalPrice = customPrice && !isNaN(parsedCustom) && parsedCustom > 0 ? parsedCustom : recommendedPrice
  /** 選んだ鉢作家（未選択・鉢作家の欄が無いときは undefined で、pot_artist_name を null で登録する） */
  const selectedArtist = withPotArtist ? potArtists.find((a) => a.id === artistId) : undefined
  // 3. 植物名・原価・販売価格・目標原価率がそろったら登録できる
  //    （目標原価率が正しくないと原価率の判定ができないため、任意価格が入っていても登録させない）
  /** 登録ボタンを押せるかどうか */
  const canRegister = !!(plantName.trim() && totalCost > 0 && finalPrice && finalPrice > 0 && maxRate !== null)

  /**
   * 入力内容を登録し、成功したら入力欄を空にする
   * @returns 登録が終わる Promise
   */
  const handleRegister = async () => {
    if (!canRegister || !finalPrice) return
    setSaving(true)
    try {
      await onRegister({
        brand,
        plant_name: plantName.trim(),
        pot_artist_name: selectedArtist?.name ?? null,
        cost: totalCost,
        selling_price: finalPrice,
        mode: 'purchase',
      })
      setPlantName(''); setPlantPrice(''); setPotPrice(''); setArtistId(''); setCustomPrice('')
    } catch {
      // 失敗の文言は親（PriceCalc）が出す。入力はやり直せるよう残す
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <p style={labelStyle}>植物名</p>
        <input
          type="text" placeholder={plantPlaceholder}
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

      {/* 鉢作家の選択（Habitat Oides だけ。未選択は「量産鉢」） */}
      {withPotArtist && <PotArtistSelect value={artistId} onChange={setArtistId} potArtists={potArtists} />}

      <PriceDisplay recommendedPrice={recommendedPrice} cost={totalCost > 0 ? totalCost : null} maxRate={maxRate} />

      <CustomPriceField
        value={customPrice} onChange={setCustomPrice}
        recommendedPrice={recommendedPrice} finalPrice={finalPrice} cost={totalCost > 0 ? totalCost : null} maxRate={maxRate}
      />

      <RegisterButton
        label={finalPrice ? `登録  ${yenRounded(finalPrice)}` : '登録'}
        disabled={!canRegister} saving={saving} onClick={handleRegister}
      />
    </div>
  )
}

/**
 * 目標原価率（%）の入力欄。3 ブランド共通の設定で、値は親（PriceCalc）が持つ
 * 書きかけの確認（useUnsavedChanges）の対象にはしない（登録する内容ではなく、計算の設定のため）
 * @param value - 入力欄の文字列（% の数値）
 * @param onChange - 入力が変わったときのコールバック
 * @returns 項目名・入力欄・「40% に戻す」ボタン・正しくない値のときの案内
 */
function CostRateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  /** 入力が受け付けられる値か（0 より大きく 100 以下の数） */
  const valid = parseCostRateInput(value) !== null

  return (
    <div style={{ marginBottom: 28 }}>
      <p style={labelStyle}>目標原価率</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* 金額の欄（type="number"）と区別するため、text + inputMode="decimal" にする（スマホでは数字のキーボードが出る） */}
        <input
          type="text" inputMode="decimal" aria-label="目標原価率（%）"
          value={value} onChange={(e) => onChange(e.target.value)}
          aria-invalid={!valid}
          style={{ ...inputStyle, maxWidth: 100, borderColor: valid ? '#dddde8' : WARN_COLOR }}
        />
        <span style={{ fontSize: 15 }}>%</span>
        {/* 既定値と違うときだけ、既定値に戻すボタンを出す（'40.0' のように書き方が違うだけなら同じ率として出さない） */}
        {parseCostRateInput(value) !== MAX_COST_RATE && (
          <button
            type="button" onClick={() => onChange(DEFAULT_COST_RATE_INPUT)}
            style={{
              padding: '4px 10px', background: 'none', border: '1px solid #dddde8', borderRadius: 4,
              color: '#666', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {DEFAULT_COST_RATE_INPUT}% に戻す
          </button>
        )}
      </div>
      {/* 受け付けない値（空・0 以下・100 より大きい・数でない）のときの案内。推奨価格は出さず、登録もできない */}
      {!valid && (
        <p style={{ fontSize: 12, color: WARN_COLOR, margin: '6px 0 0' }}>
          0 より大きく 100 以下の数を入れてください
        </p>
      )}
    </div>
  )
}

/**
 * 切り替えタブの並び（ブランドのタブと、2 段目の生産・仕入れのタブで共通）
 * @param tabs - タブの id と表示名
 * @param current - 選んでいるタブの id
 * @param onSelect - 選んでいないタブを押したときのコールバック（書きかけの確認は呼び出し側で行う）
 * @param small - 2 段目のタブとして小さく出すか（文字 13px・下線 1px・余白を詰める）
 * @param groupLabel - 指定すると role="group" と aria-label を付ける（登録リストの絞り込みのように、
 *   計算フォームのブランドのタブと同じ文言のボタンが並ぶとき、テストや読み上げで区別できるようにする）
 * @returns タブのボタンの並び
 */
function TabBar<T extends string>({ tabs, current, onSelect, small = false, groupLabel }: {
  tabs: { id: T; label: string }[]
  current: T
  onSelect: (id: T) => void
  small?: boolean
  groupLabel?: string
}) {
  /** 選んでいるタブの下線の太さ（2 段目は細くする） */
  const lineWidth = small ? 1 : 2

  return (
    <div
      role={groupLabel ? 'group' : undefined} aria-label={groupLabel}
      style={{ display: 'flex', gap: 0, marginBottom: small ? 24 : 16, borderBottom: '1px solid #dddde8' }}
    >
      {tabs.map(({ id, label }) => (
        <button
          key={id} onClick={() => { if (id !== current) onSelect(id) }}
          style={{
            padding: small ? '8px 16px' : '10px 20px', background: 'none', border: 'none',
            borderBottom: `${lineWidth}px solid ${current === id ? '#1c2417' : 'transparent'}`,
            cursor: 'pointer', fontSize: small ? 13 : 14,
            fontWeight: current === id ? 600 : 400,
            color: current === id ? '#1c2417' : '#888',
            marginBottom: -1, transition: 'color 0.15s',
            fontFamily: 'inherit', letterSpacing: 0.5,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/**
 * 登録済みの価格計算エントリを一覧表示するコンポーネント
 * @param entries - 表示するエントリ一覧（絞り込み済み）
 * @param emptyMessage - 0 件のときの案内（全体で 0 件か、絞り込んだ結果が 0 件かで親が変える）
 * @param onDelete - 削除ボタン押下時のコールバック
 * @returns 登録の表（0 件なら案内）
 */
function EntriesList({ entries, emptyMessage, onDelete }: {
  entries: PriceCalcEntry[]
  emptyMessage: string
  onDelete: (id: string) => void
}) {
  if (entries.length === 0) return (
    <p style={{ color: '#aaa', fontSize: 14 }}>{emptyMessage}</p>
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
                {/* 2 行目の鉢作家は、鉢を選ぶ Habitat Oides の記録だけ出す（ei8ht plants は鉢が無く、HUE は鉢作家の概念が無い） */}
                {e.brand === 'habitatoides' && (
                  <div style={{ fontSize: 12, color: '#888' }}>{e.pot_artist_name || '量産鉢'}</div>
                )}
              </td>
              <td style={{ padding: '12px 12px', color: '#666', fontSize: 12, whiteSpace: 'nowrap' }}>
                <div>{BRAND_LABELS[e.brand] ?? e.brand}</div>
                {/* 2 行目に計算の種類（生産・仕入れ）。種類を保存する前の記録（mode が null）は出さない */}
                {e.mode && MODE_LABELS[e.mode] && (
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{MODE_LABELS[e.mode]}</div>
                )}
              </td>
              <td style={{ padding: '12px 12px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {yenRounded(e.cost)}
              </td>
              <td style={{ padding: '12px 12px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {yenRounded(e.selling_price)}
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

/**
 * ブランド別の販売価格計算ツール。生産は卸価格の 2 倍、仕入れは仕入れ値と目標原価率から推奨価格を算出し、登録リストとして保存する
 * @returns ブランドのタブ・生産／仕入れのタブ・（目標原価率）・計算フォーム・登録リスト
 */
export default function PriceCalc() {
  /** 表示中のブランドのタブ */
  const [tab, setTab] = useState<Brand>('ei8htplants')
  /** 表示中の計算の種類（生産・仕入れ）。ブランドを切り替えてもそのまま */
  const [mode, setMode] = useState<CalcMode>('production')
  /** 登録リスト（新しい順） */
  const [entries, setEntries] = useState<PriceCalcEntry[]>([])
  /** 登録リストの絞り込み（計算フォームのブランドのタブとは別に持つ。画面の中だけで絞り込み、API は変えない） */
  const [listFilter, setListFilter] = useState<ListFilter>('all')
  /** 絞り込んだ登録リスト */
  const filteredEntries = listFilter === 'all' ? entries : entries.filter((e) => e.brand === listFilter)
  /** 鉢の作家の一覧（Habitat Oides の計算の選択肢） */
  const [potArtists, setPotArtists] = useState<PotArtist[]>([])
  /** 登録リストを読み込み中なら true */
  const [loadingEntries, setLoadingEntries] = useState(true)
  /** 読み込み・登録・削除の失敗の文言。null なら出さない */
  const [error, setError] = useState<string | null>(null)
  /** 書きかけの計算フォームがあれば確認する関数（タブを切り替えると入力が消えるため） */
  const confirmLeave = useConfirmLeave()
  /** 目標原価率の入力（% の数値の文字列）。初期値はこのブラウザに覚えさせた値（無ければ 40）。タブを切り替えても残る */
  const [costRateInput, setCostRateInput] = useState(loadCostRateInput)
  /** 目標原価率（0.4 = 40%）。入力が正しくなければ null で、各フォームは推奨価格を出さず登録もできない */
  const maxRate = parseCostRateInput(costRateInput)

  /**
   * 目標原価率の入力を変え、正しい値ならこのブラウザに覚えさせる
   * @param v - 入力欄の文字列（% の数値）
   */
  const handleCostRateChange = (v: string) => {
    setCostRateInput(v)
    saveCostRateInput(v)
  }

  // 鉢の作家と登録リストを読み込む（失敗したら文言を出し、空のリストと区別できるようにする）
  useEffect(() => {
    api.potArtists.list().then(setPotArtists)
      .catch((e: unknown) => setError(failMessage('鉢の作家の読み込みに失敗しました', e)))
    api.priceCalcEntries.list()
      .then(setEntries)
      .catch((e: unknown) => setError(failMessage('登録リストの読み込みに失敗しました', e)))
      .finally(() => setLoadingEntries(false))
  }, [])

  /**
   * 計算結果を登録リストに追加する。失敗したら文言を出してから投げ直す（呼び出し側は入力を残す）
   * @param data - 登録する内容
   * @returns 登録が終わる Promise（失敗したら reject する）
   */
  const handleRegister = async (data: PriceCalcEntryBody) => {
    setError(null)
    try {
      /** 登録された記録 */
      const entry = await api.priceCalcEntries.add(data)
      setEntries((prev) => [entry, ...prev])
    } catch (e: unknown) {
      setError(failMessage('登録に失敗しました', e))
      throw e
    }
  }

  /**
   * 確認してから登録を 1 件削除する。失敗したらリストはそのままにして文言を出す
   * @param id - 削除する登録の id
   */
  const handleDelete = async (id: string) => {
    if (!confirm('この登録を削除しますか？')) return
    setError(null)
    try {
      await api.priceCalcEntries.delete(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } catch (e: unknown) {
      setError(failMessage('削除に失敗しました', e))
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 28px', letterSpacing: 1 }}>
        販売価格計算
      </h1>

      {/* 読み込み・登録・削除の失敗 */}
      {error && (
        <p role="alert" style={{ color: '#c0392b', fontSize: 13, margin: '0 0 16px', padding: '8px 14px', background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0' }}>{error}</p>
      )}

      {/* ブランドの切り替えタブ（書きかけなら切り替える前に確認する） */}
      <TabBar tabs={TABS} current={tab} onSelect={(id) => { if (confirmLeave()) setTab(id) }} />

      {/* 2 段目: 生産・仕入れの切り替えタブ（ブランドのタブと同じく、書きかけなら確認する） */}
      <TabBar tabs={MODE_TABS} current={mode} onSelect={(id) => { if (confirmLeave()) setMode(id) }} small />

      {/* 目標原価率（仕入れだけで使う 3 ブランド共通の設定。生産では隠すが値と保存は残る。書きかけの確認の対象にはしない） */}
      {mode === 'purchase' && <CostRateField value={costRateInput} onChange={handleCostRateChange} />}

      {/* 選んだブランド・種類の計算フォーム。key をブランド＋種類にして、切り替えたら入力を作り直す（入力が混ざらないように） */}
      {mode === 'production' && (
        <ProductionCalc
          key={`${tab}-production`} brand={tab} withPotArtist={tab === 'habitatoides'}
          plantPlaceholder={PLANT_PLACEHOLDERS[tab]} potArtists={potArtists} onRegister={handleRegister}
        />
      )}
      {mode === 'purchase' && tab === 'ei8htplants' && (
        <Ei8htPlantsPurchaseCalc
          key="ei8htplants-purchase" plantPlaceholder={PLANT_PLACEHOLDERS.ei8htplants}
          maxRate={maxRate} onRegister={handleRegister}
        />
      )}
      {/* Habitat Oides と HUE の仕入れは同じ PlantPotCalc（鉢作家の欄は Habitat Oides だけ） */}
      {mode === 'purchase' && tab !== 'ei8htplants' && (
        <PlantPotCalc
          key={`${tab}-purchase`} brand={tab} withPotArtist={tab === 'habitatoides'}
          plantPlaceholder={PLANT_PLACEHOLDERS[tab]} potArtists={potArtists} maxRate={maxRate} onRegister={handleRegister}
        />
      )}

      {/* 登録リスト（全ブランド分。見出しの下の切り替えでブランドを絞り込める） */}
      <div style={{ marginTop: 56, paddingTop: 40, borderTop: '2px solid #dddde8' }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 20px', letterSpacing: 1 }}>
          登録リスト
        </h2>
        {/* 絞り込み（入力は消えないので確認はしない。ボタンの文言が計算フォームのタブと同じなので group で区別する） */}
        <TabBar
          tabs={LIST_FILTER_TABS} current={listFilter} onSelect={setListFilter}
          small groupLabel="登録リストの絞り込み"
        />
        {loadingEntries ? (
          <p style={{ color: '#aaa', fontSize: 14 }}>読み込み中...</p>
        ) : (
          <EntriesList
            entries={filteredEntries} onDelete={handleDelete}
            emptyMessage={entries.length === 0 ? 'まだ登録されていません。' : 'このブランドの登録はありません。'}
          />
        )}
      </div>
    </div>
  )
}
