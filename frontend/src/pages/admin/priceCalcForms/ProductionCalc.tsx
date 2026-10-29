import { useState } from 'react'
import { useUnsavedChanges } from '../UnsavedChanges'
import type { PotArtist, PriceCalcEntryBody } from '../../../lib/api'
import {
  CustomPriceField, inputStyle, labelStyle, PotArtistSelect, PriceDisplay, RegisterButton,
} from '../PriceCalcFormParts'
import type { Brand } from './shared'
import { WHOLESALE_MARKUP, yenRounded } from './shared'

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
     * @returns 登録処理が終わる Promise
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
