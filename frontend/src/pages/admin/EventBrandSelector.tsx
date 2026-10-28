import { BRAND_NAMES } from '../../lib/brands'

/** 販売ブランドの選択状態と、親へ伝える切り替え処理 */
interface EventBrandSelectorProps {
  /** 選択中の販売ブランドの正式名 */
  selectedBrands: string[]
  /** 親画面の共通ラベルスタイル。legend にそのまま適用する */
  labelStyle: React.CSSProperties
  /** ブランドの選択状態が切り替わったことを親へ通知する */
  onToggle: (brand: string) => void
}

/**
 * 販売ブランドの正式名をチェックボックスで表示し、選択操作を親へ通知する。
 * @param props - 選択中のブランド名と切り替え通知処理
 * @returns 販売ブランドの選択欄
 */
export default function EventBrandSelector({ selectedBrands, labelStyle, onToggle }: EventBrandSelectorProps) {
  return (
    <>
      {/* fieldset はブラウザー標準の枠・余白を消し、縮小時の最小幅制約を解除する */}
      <fieldset style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
        {/* 1. 販売ブランド欄の見出しを表示する */}
        {/* legend は親の共通ラベル設定を使い、下余白だけ取り除く */}
        <legend style={{ ...labelStyle, padding: 0 }}>販売ブランド</legend>
        {/* 2. 選択肢を従来どおり間隔12pxの折り返し配置で並べる */}
        {/* 選択肢のまとまりは横並び・12px間隔で、幅に応じて折り返す */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {/* 各ラベルはチェック欄と正式名を横並びにし、間隔・文字サイズ・クリック可能な表示を保つ */}
          {BRAND_NAMES.map((brand) => (
          <label key={brand} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--brand-type-label)', cursor: 'pointer' }}>
              {/* 3. 現在の選択状態を反映し、変更は親の選択処理へ渡す */}
              <input type="checkbox" checked={selectedBrands.includes(brand)} onChange={() => onToggle(brand)} />
              {brand}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  )
}
