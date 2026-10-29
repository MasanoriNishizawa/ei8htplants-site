import { useState } from 'react'
import { useUnsavedChanges } from '../UnsavedChanges'
import type { PotArtist, PriceCalcEntryBody } from '../../../lib/api'
import {
  CustomPriceField, inputStyle, labelStyle, PotArtistSelect, PriceDisplay, RegisterButton,
} from '../PriceCalcFormParts'
import type { Brand } from './shared'
import { SEEDS_PER_PACK, yenRounded } from './shared'

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
     * @returns 登録処理が終わる Promise
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
