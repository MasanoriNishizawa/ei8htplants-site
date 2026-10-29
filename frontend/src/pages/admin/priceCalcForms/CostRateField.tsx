/** ブランド既定値への復帰を含む原価率設定欄。 */
import { DEFAULT_COST_RATES, defaultCostRateInput, parseCostRateInput } from '../../../lib/priceCalc'
import { inputStyle, labelStyle, WARN_COLOR } from '../PriceCalcFormParts'
import type { Brand } from './shared'

/**
 * 仕入れ価格計算で使う目標原価率の入力欄を表示し、ブランド既定値への復帰操作を提供する。
 * 値は親の PriceCalc が保持し、登録内容ではなく計算設定のため未保存確認の対象にしない。
 * @param value - 入力欄の原価率。パーセント値を文字列で受け取る
 * @param onChange - 入力値または既定値への変更を親へ通知するコールバック
 * @param brand - 既定原価率の決定に使うブランド
 * @returns 原価率の入力欄、既定値への復帰ボタン、無効値の案内
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
