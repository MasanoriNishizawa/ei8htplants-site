import { useState } from 'react'
import { useUnsavedChanges } from './UnsavedChanges'
import type { PotArtist, PriceCalcEntryBody } from '../../lib/api'
import { formatYen } from '../../lib/format'
import {
  DEFAULT_COST_RATES, costRate, defaultCostRateInput, exceedsMaxCostRate, formatCostRate, formatRateLabel,
  parseCostRateInput, recommendPrice,
} from '../../lib/priceCalc'

/** 販売価格計算画面の計算フォーム群と、その表示で共用する部品・設定をまとめるモジュール */

/** 価格計算で使うブランドのキー（price_calc_entries.brand に保存する値） */
export type Brand = 'ei8htplants' | 'habitatoides' | 'hue'

/** 実生を扱うブランド（HUE は実生が無い） */
export const SEEDLING_BRANDS: readonly Brand[] = ['ei8htplants', 'habitatoides']

/** 実生の原価計算で扱う種子の粒数（1 袋分の上代をこの粒数で割って 1 粒の元値を求める） */
const SEEDS_PER_PACK = 20

/** ブランドごとの植物名の入力欄の placeholder（生産・仕入れ・実生で同じものを使う） */
export const PLANT_PLACEHOLDERS: Readonly<Record<Brand, string>> = {
  ei8htplants: '例: アガベ チタノタ',
  habitatoides: '例: アガベ ポタトルム',
  hue: '例: ユーフォルビア オベサ',
}

/** 生産の販売価格の倍率（卸価格のちょうど 2 倍。切り上げはしない） */
const WHOLESALE_MARKUP = 2

/**
 * ei8ht plants の仕入れで出す仲卸価格（販売価格 ÷ WHOLESALE_MARKUP。生産の「販売価格 = 卸価格 × 2」と同じ関係）
 * 1 円未満の端数は 1 円単位に切り上げる。表示だけで、登録リストには保存しない
 * 例: wholesalePrice(3800) → 1900、wholesalePrice(3001) → 1501
 * @param sellingPrice - 販売価格（円）
 * @returns 仲卸価格（円）
 */
const wholesalePrice = (sellingPrice: number) => Math.ceil(sellingPrice / WHOLESALE_MARKUP)

/**
 * 計算結果（小数を含む）を四捨五入して「¥1,234」の形にする
 * @param n - 金額（円）
 * @returns 四捨五入した金額を円表示にした文字列
 */
const yenRounded = (n: number) => formatYen(Math.round(n))

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
 * @param title - 見出しを差し替えるときの文言（生産の「販売価格（卸価格の 2 倍）」、実生の「上代（種子 20粒の値段）」など。省略時は目標原価率の見出し）
 * @param showRate - 目標原価率が無くても（maxRate が null でも）原価率の行を出すか（実生で使う。生産は出さない）
 * @returns 推奨価格の枠（未計算なら灰色で「¥ —」）
 */
function PriceDisplay({ recommendedPrice, cost, maxRate, title, showRate = false }: {
  recommendedPrice: number | null
  cost: number | null
  maxRate: number | null
  title?: string
  showRate?: boolean
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
      {/* 推奨価格での実際の原価率（目標原価率から計算したときは切り上げているので目標以下になる。
          実生は目標原価率を使わないが、元値 ÷ 上代の原価率は出す） */}
      {recommendedPrice !== null && cost !== null && (maxRate !== null || showRate) && (
        <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0', fontVariantNumeric: 'tabular-nums' }}>
          原価率 {formatCostRate(costRate(cost, recommendedPrice), maxRate ?? undefined)}
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
 * @param label - 項目名（省略時は「任意価格（推奨価格を上書き）」。生産では「任意価格（販売価格を上書き）」、実生では「任意価格（上代を上書き）」）
 * @param showRate - 目標原価率が無くても（maxRate が null でも）登録価格の原価率を出すか（実生で使う。超過の注意は出さない）
 * @returns 任意価格の項目名・入力欄・登録価格の表示
 */
function CustomPriceField({ value, onChange, recommendedPrice, finalPrice, cost, maxRate, label = '任意価格（推奨価格を上書き）', showRate = false }: {
  value: string
  onChange: (v: string) => void
  recommendedPrice: number | null
  finalPrice: number | null
  cost: number | null
  maxRate: number | null
  label?: string
  showRate?: boolean
}) {
  /** 登録価格での原価率（原価・登録価格がそろい、目標原価率があるか showRate のときだけ。それ以外は null） */
  const rate = cost && finalPrice && (maxRate !== null || showRate) ? costRate(cost, finalPrice) : null
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
          登録価格: {yenRounded(finalPrice)}{rate !== null && `（原価率 ${formatCostRate(rate, maxRate ?? undefined)}）`}
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
 * 鉢作家の選択欄（Habitat Oides の生産・仕入れ・実生で使う。未選択は「量産鉢」）
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
export function ProductionCalc({ brand, withPotArtist, plantPlaceholder, potArtists, onRegister }: {
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
export function Ei8htPlantsPurchaseCalc({ plantPlaceholder, maxRate, onRegister }: {
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

      {/* 仲卸価格（登録する販売価格の半分。任意価格を入れたらその半分。表示だけで保存しない） */}
      <div>
        <p style={labelStyle}>仲卸価格（販売価格の半分）</p>
        <p style={{ fontSize: 18, fontWeight: 600, margin: 0, color: finalPrice ? '#1c2417' : '#ccc', fontVariantNumeric: 'tabular-nums' }}>
          {finalPrice ? yenRounded(wholesalePrice(finalPrice)) : '¥ —'}
        </p>
      </div>

      <RegisterButton
        label={finalPrice ? `登録  ${yenRounded(finalPrice)}` : '登録'}
        disabled={!canRegister} saving={saving} onClick={handleRegister}
      />
    </div>
  )
}

/**
 * 実生の価格計算コンポーネント（ei8ht plants・Habitat Oides で共通）
 * - 上代 = 種子 SEEDS_PER_PACK 粒の値段（withPot なら + 鉢仕入れ値）。切り上げはしない
 * - 元値（cost）= 種子の値段 ÷ SEEDS_PER_PACK（withPot なら + 鉢仕入れ値）
 * 目標原価率は使わないので、原価率の行は出すが超過の注意は出さず、目標原価率が正しくなくても登録できる
 * @param brand - 登録する記録のブランド（price_calc_entries.brand に保存する値）
 * @param withPot - 鉢仕入れ値と鉢作家の欄を出すか（Habitat Oides は出す。ei8ht plants は鉢が無いので出さない）
 * @param plantPlaceholder - 植物名の入力欄の placeholder
 * @param potArtists - 鉢作家の選択肢一覧（withPot が false なら使わない）
 * @param onRegister - 価格エントリを登録するコールバック（失敗したら投げる）
 * @returns 植物名・種子の値段・（鉢仕入れ値・鉢作家）・任意価格の入力と上代
 */
export function SeedlingCalc({ brand, withPot, plantPlaceholder, potArtists, onRegister }: {
  brand: Brand
  withPot: boolean
  plantPlaceholder: string
  potArtists: PotArtist[]
  onRegister: (d: PriceCalcEntryBody) => Promise<void>
}) {
  /** 植物名の入力 */
  const [plantName, setPlantName] = useState('')
  /** 種子 SEEDS_PER_PACK 粒の値段の入力（文字のまま持つ） */
  const [seedPrice, setSeedPrice] = useState('')
  /** 鉢の値段の入力（鉢の欄が無いブランドでは常に空） */
  const [potPrice, setPotPrice] = useState('')
  /** 選んだ鉢の作家の id（空は未選択。鉢の欄が無いブランドでは常に空） */
  const [artistId, setArtistId] = useState('')
  /** 上代を上書きする任意価格の入力（空なら上代で登録） */
  const [customPrice, setCustomPrice] = useState('')
  /** 登録中なら true */
  const [saving, setSaving] = useState(false)
  // 書きかけの入力があれば、サイドメニュー・タブの切り替え・再読み込みの確認に使えるよう登録する
  // （登録に成功したら入力欄を空にするので確認は出なくなる）
  useUnsavedChanges([plantName, seedPrice, potPrice, artistId, customPrice].some((v) => v.trim() !== ''))

  // 1. 種子の値段（未入力・0 以下は null。種子が無ければ鉢だけでは計算しない）と鉢の値段（未入力・0 以下は 0）
  /** 種子の値段の入力を数値にしたもの（数値でなければ NaN） */
  const rawSeed = parseFloat(seedPrice)
  /** 種子 SEEDS_PER_PACK 粒の値段 */
  const seed = isNaN(rawSeed) || rawSeed <= 0 ? null : rawSeed
  /** 鉢の値段の入力を数値にしたもの（数値でなければ NaN） */
  const rawPot = parseFloat(potPrice)
  /** 鉢の値段（鉢の欄が無いときは 0） */
  const pot = withPot && !isNaN(rawPot) && rawPot > 0 ? rawPot : 0
  // 2. 元値（1 粒の値段 + 鉢）と上代（20 粒の値段 + 鉢）
  /** 元値（登録時の cost。種子が無ければ null） */
  const cost = seed !== null ? seed / SEEDS_PER_PACK + pot : null
  /** 上代（種子が無ければ null） */
  const retailPrice = seed !== null ? seed + pot : null
  // 3. 任意価格があればそれを優先した登録価格
  /** 任意価格の入力を数値にしたもの */
  const parsedCustom = parseFloat(customPrice)
  /** 登録する販売価格（任意価格が正の数ならそれ、無ければ上代） */
  const finalPrice = customPrice && !isNaN(parsedCustom) && parsedCustom > 0 ? parsedCustom : retailPrice
  /** 選んだ鉢作家（未選択・鉢の欄が無いときは undefined で、pot_artist_name を null で登録する） */
  const selectedArtist = withPot ? potArtists.find((a) => a.id === artistId) : undefined
  // 4. 植物名・元値・販売価格がそろったら登録できる（目標原価率は見ない）
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
        mode: 'seedling',
      })
      setPlantName(''); setSeedPrice(''); setPotPrice(''); setArtistId(''); setCustomPrice('')
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
        <p style={labelStyle}>種子 {SEEDS_PER_PACK}粒の値段</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15 }}>¥</span>
          <input
            type="number" min="0" className="num-plain"
            placeholder="例: 600" value={seedPrice}
            onChange={(e) => setSeedPrice(e.target.value)} style={inputStyle}
          />
          <span style={{ fontSize: 13, color: '#888', whiteSpace: 'nowrap' }}>/ {SEEDS_PER_PACK}粒</span>
        </div>
        {/* 1 粒あたりの値段（種子の値段が入ったときだけ） */}
        {seed !== null && (
          <p style={{ fontSize: 12, color: '#888', margin: '8px 0 0' }}>
            1粒あたり {yenRounded(seed / SEEDS_PER_PACK)}
          </p>
        )}
      </div>

      {/* 鉢仕入れ値と鉢作家（Habitat Oides だけ。鉢作家の未選択は「量産鉢」） */}
      {withPot && (
        <>
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
          <PotArtistSelect value={artistId} onChange={setArtistId} potArtists={potArtists} />
        </>
      )}

      {/* 実生は目標原価率を使わないので maxRate は null。原価率の行だけ showRate で出す */}
      <PriceDisplay
        recommendedPrice={retailPrice} cost={cost} maxRate={null} showRate
        title={withPot ? `上代（種子 ${SEEDS_PER_PACK}粒の値段 + 鉢）` : `上代（種子 ${SEEDS_PER_PACK}粒の値段）`}
      />

      {/* 登録価格の原価率は出すが、目標原価率による超過の注意は出さない */}
      <CustomPriceField
        value={customPrice} onChange={setCustomPrice}
        recommendedPrice={retailPrice} finalPrice={finalPrice} cost={cost} maxRate={null} showRate
        label="任意価格（上代を上書き）"
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
export function PlantPotCalc({ brand, withPotArtist, plantPlaceholder, potArtists, maxRate, onRegister }: {
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
 * 目標原価率（%）の入力欄（仕入れで使う）。ブランドごとの設定で、値は親（PriceCalc）が持つ
 * 書きかけの確認（useUnsavedChanges）の対象にはしない（登録する内容ではなく、計算の設定のため）
 * @param value - 入力欄の文字列（% の数値）
 * @param onChange - 入力が変わったときのコールバック
 * @param brand - 表示中のブランド（「（既定値）% に戻す」の既定値に使う）
 * @returns 項目名・入力欄・「（既定値）% に戻す」ボタン・正しくない値のときの案内
 */
export function CostRateField({ value, onChange, brand }: { value: string; onChange: (v: string) => void; brand: Brand }) {
  /** そのブランドの既定値の入力（ei8ht plants は '33.4'、ほかは '40'） */
  const defaultInput = defaultCostRateInput(brand)
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
        {parseCostRateInput(value) !== DEFAULT_COST_RATES[brand] && (
          <button
            type="button" onClick={() => onChange(defaultInput)}
            style={{
              padding: '4px 10px', background: 'none', border: '1px solid #dddde8', borderRadius: 4,
              color: '#666', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {defaultInput}% に戻す
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
