import { useState } from 'react'
import { useUnsavedChanges } from '../UnsavedChanges'
import type { PotArtist, PriceCalcEntryBody } from '../../../lib/api'
import { recommendPrice } from '../../../lib/priceCalc'
import {
  CustomPriceField, inputStyle, labelStyle, PotArtistSelect, PriceDisplay, RegisterButton,
} from '../PriceCalcFormParts'
import type { Brand } from './shared'
import { yenRounded } from './shared'

/** 植物 + 鉢の仕入れ計算を使うブランド */
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
