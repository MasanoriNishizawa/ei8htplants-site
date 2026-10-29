import { useState } from 'react'
import { useUnsavedChanges } from '../UnsavedChanges'
import type { PriceCalcEntryBody } from '../../../lib/api'
import { recommendPrice } from '../../../lib/priceCalc'
import {
  CustomPriceField, inputStyle, labelStyle, PriceDisplay, RegisterButton,
} from '../PriceCalcFormParts'
import { wholesalePrice, yenRounded } from './shared'

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
     * @returns 登録処理が終わる Promise
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
