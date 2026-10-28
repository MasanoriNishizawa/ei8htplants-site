import { useState } from 'react'
import { useUnsavedChanges } from './UnsavedChanges'
import type { PotArtist, PriceCalcEntryBody } from '../../lib/api'
import { formatYen } from '../../lib/format'
import {
  DEFAULT_COST_RATES, defaultCostRateInput, parseCostRateInput, recommendPrice,
} from '../../lib/priceCalc'
import {
  CustomPriceField, inputStyle, labelStyle, PotArtistSelect, PriceDisplay, RegisterButton, WARN_COLOR,
} from './PriceCalcFormParts'

/** 販売価格計算画面の計算フォーム群をまとめるモジュール。共通表示部品は PriceCalcFormParts に置く */

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
    // 1. 必須値がそろい、登録価格を計算できている場合だけ処理を続ける
    if (!canRegister || !cost || !finalPrice) return
    // 2. 二重送信を防ぎ、ボタンを登録中の表示にする
    setSaving(true)
    try {
      // 3. 入力値と計算結果を登録し、成功したらフォームを初期化する
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
      // 4. エラー表示は親に任せ、失敗時は入力を残して再試行できるようにする
      // 失敗の文言は親（PriceCalc）が出す。入力はやり直せるよう残す
    } finally {
      // 5. 成否にかかわらず登録中状態を解除する
      setSaving(false)
    }
  }

  return (
    /* 計算フォームの各項目を縦に並べ、項目間の余白をそろえるコンテナ。 */
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
        {/* 金額記号と入力欄を横並びにし、間隔と縦位置をそろえるコンテナ。 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* 金額入力欄の通貨記号を入力値と区別できる大きさで表示する設定。 */}
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
    // 1. 必須値と目標原価率が有効で、登録価格を計算できている場合だけ続ける
    if (!canRegister || !cost || !finalPrice) return
    // 2. 二重送信を防ぎ、ボタンを登録中の表示にする
    setSaving(true)
    try {
      // 3. ei8ht plants の仕入れ価格を登録し、成功したらフォームを初期化する
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
      // 4. エラー表示は親に任せ、失敗時は入力を残して再試行できるようにする
      // 失敗の文言は親（PriceCalc）が出す。入力はやり直せるよう残す
    } finally {
      // 5. 成否にかかわらず登録中状態を解除する
      setSaving(false)
    }
  }

  return (
    /* 計算フォームの各項目を縦に並べ、項目間の余白をそろえるコンテナ。 */
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
        {/* 金額記号と入力欄を横並びにし、間隔と縦位置をそろえるコンテナ。 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* 金額入力欄の通貨記号を入力値と区別できる大きさで表示する設定。 */}
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
        {/* 仲卸価格の金額を太字と桁がそろう書体で表示する設定。 */}
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
    // 1. 必須値がそろい、登録価格を計算できている場合だけ処理を続ける
    if (!canRegister || !cost || !finalPrice) return
    // 2. 二重送信を防ぎ、ボタンを登録中の表示にする
    setSaving(true)
    try {
      // 3. 種子と鉢の原価・選択内容を登録し、成功したらフォームを初期化する
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
      // 4. エラー表示は親に任せ、失敗時は入力を残して再試行できるようにする
      // 失敗の文言は親（PriceCalc）が出す。入力はやり直せるよう残す
    } finally {
      // 5. 成否にかかわらず登録中状態を解除する
      setSaving(false)
    }
  }

  return (
    /* 計算フォームの各項目を縦に並べ、項目間の余白をそろえるコンテナ。 */
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
        {/* 金額記号と入力欄を横並びにし、間隔と縦位置をそろえるコンテナ。 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* 金額入力欄の通貨記号を入力値と区別できる大きさで表示する設定。 */}
          <span style={{ fontSize: 15 }}>¥</span>
          <input
            type="number" min="0" className="num-plain"
            placeholder="例: 600" value={seedPrice}
            onChange={(e) => setSeedPrice(e.target.value)} style={inputStyle}
          />
          {/* 種子の粒数補足を小さな灰色文字で折り返さず表示する設定。 */}
          <span style={{ fontSize: 13, color: '#888', whiteSpace: 'nowrap' }}>/ {SEEDS_PER_PACK}粒</span>
        </div>
        {/* 1 粒あたりの値段（種子の値段が入ったときだけ） */}
        {seed !== null && (
          /* 1粒あたりの原価を小さな灰色文字で補足する設定。 */
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
            {/* 金額記号と入力欄を横並びにし、間隔と縦位置をそろえるコンテナ。 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* 金額入力欄の通貨記号を入力値と区別できる大きさで表示する設定。 */}
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
    // 1. 必須値と目標原価率が有効で、登録価格を計算できている場合だけ続ける
    if (!canRegister || !finalPrice) return
    // 2. 二重送信を防ぎ、ボタンを登録中の表示にする
    setSaving(true)
    try {
      // 3. 植物と鉢の合計原価・選択内容を登録し、成功したらフォームを初期化する
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
      // 4. エラー表示は親に任せ、失敗時は入力を残して再試行できるようにする
      // 失敗の文言は親（PriceCalc）が出す。入力はやり直せるよう残す
    } finally {
      // 5. 成否にかかわらず登録中状態を解除する
      setSaving(false)
    }
  }

  return (
    /* 計算フォームの各項目を縦に並べ、項目間の余白をそろえるコンテナ。 */
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
        {/* 金額記号と入力欄を横並びにし、間隔と縦位置をそろえるコンテナ。 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* 金額入力欄の通貨記号を入力値と区別できる大きさで表示する設定。 */}
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
        {/* 金額記号と入力欄を横並びにし、間隔と縦位置をそろえるコンテナ。 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* 金額入力欄の通貨記号を入力値と区別できる大きさで表示する設定。 */}
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
    /* 原価率の入力欄と下のフォームとの間隔を確保する外枠。 */
    <div style={{ marginBottom: 28 }}>
      <p style={labelStyle}>目標原価率</p>
      {/* 原価率の入力欄と単位・補助ボタンを横並びにし、幅に応じて折り返すコンテナ。 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* 金額の欄（type="number"）と区別するため、text + inputMode="decimal" にする（スマホでは数字のキーボードが出る） */}
        {/* 目標原価率の入力欄を短く保ち、無効値のとき境界線を赤くする設定。 */}
        <input
          type="text" inputMode="decimal" aria-label="目標原価率（%）"
          value={value} onChange={(e) => onChange(e.target.value)}
          aria-invalid={!valid}
          style={{ ...inputStyle, maxWidth: 100, borderColor: valid ? '#dddde8' : WARN_COLOR }}
        />
        {/* 原価率の単位記号を入力値と区別できる大きさで表示する設定。 */}
        <span style={{ fontSize: 15 }}>%</span>
        {/* 既定値と違うときだけ、既定値に戻すボタンを出す（'40.0' のように書き方が違うだけなら同じ率として出さない） */}
        {parseCostRateInput(value) !== DEFAULT_COST_RATES[brand] && (
          /* 原価率をブランド既定値に戻す補助ボタンの余白と文字を整える設定。 */
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
        /* 無効な原価率を赤い文字と上余白で説明する設定。 */
        <p style={{ fontSize: 12, color: WARN_COLOR, margin: '6px 0 0' }}>
          0 より大きく 100 以下の数を入れてください
        </p>
      )}
    </div>
  )
}
