import { BRAND } from '../../lib/brands'
import { formatYen } from '../../lib/format'
import type { PriceCalcEntry, PriceCalcMode } from '../../lib/api'

/** 登録データのブランド識別子を、一覧の表示名へ対応付ける */
const BRAND_LABELS: Readonly<Record<string, string>> = {
  ei8htplants: BRAND.ei8htPlants.shortName,
  habitatoides: BRAND.habitatOides.shortName,
  hue: BRAND.hue.shortName,
}

/** 計算方式の識別子を、一覧に表示する日本語名へ対応付ける */
const MODE_LABELS: Readonly<Record<PriceCalcMode, string>> = {
  production: '生産',
  purchase: '仕入れ',
  seedling: '実生',
}

/**
 * 金額を四捨五入して円表示に整える。
 * @param value - 対象の値
 * @returns 四捨五入して円記号・桁区切りを付けた金額
 */
const yenRounded = (value: number) => formatYen(Math.round(value))

/**
 *  登録済み価格エントリの表示だけを担当する一覧。更新・削除処理は呼び出し側へ委譲する。
 * @param entries - 登録済みの価格エントリ一覧
 * @param emptyMessage - 一覧が空のときに表示する案内文
 * @param onDelete - 削除ボタンを押したときに呼び出す処理
 * @returns 価格エントリ一覧または空状態の React 要素
 */
export function PriceCalcEntriesList({ entries, emptyMessage, onDelete }: {
  entries: PriceCalcEntry[]
  emptyMessage: string
  onDelete: (id: string) => void
}) {
  // 1. 登録が無い場合は、呼び出し側から受け取った空状態の案内だけを表示する
  if (entries.length === 0) return (
    <p style={{ color: '#aaa', fontSize: 14 }}>{emptyMessage}</p>
  )

  // 2. 登録がある場合は横スクロール可能な表にし、各行から削除操作を呼び出し側へ渡す
  return (
    <div style={{ overflowX: 'auto' }}>
      {/* 登録内容と削除操作を行ごとに表示する */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 500 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #dddde8' }}>
            {['植物名 / 鉢作家', 'ブランド', '元値', '販売価格', ''].map((heading, index) => (
              <th key={index} style={{
                padding: '8px 12px', textAlign: 'left',
                fontWeight: 600, color: '#666', letterSpacing: 0.5, whiteSpace: 'nowrap',
              }}>{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={entry.id} style={{ borderBottom: '1px solid #f0f0f0', background: index % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ padding: '12px 12px' }}>
                <div style={{ fontWeight: 500 }}>{entry.plant_name}</div>
                {entry.brand === 'habitatoides' && (
                  <div style={{ fontSize: 12, color: '#888' }}>{entry.pot_artist_name || '量産鉢'}</div>
                )}
              </td>
              <td style={{ padding: '12px 12px', color: '#666', fontSize: 12, whiteSpace: 'nowrap' }}>
                <div>{BRAND_LABELS[entry.brand] ?? entry.brand}</div>
                {entry.mode && MODE_LABELS[entry.mode] && (
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{MODE_LABELS[entry.mode]}</div>
                )}
              </td>
              <td style={{ padding: '12px 12px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {yenRounded(entry.cost)}
              </td>
              <td style={{ padding: '12px 12px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {yenRounded(entry.selling_price)}
              </td>
              <td style={{ padding: '12px 12px' }}>
                <button
                  onClick={() => onDelete(entry.id)}
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
