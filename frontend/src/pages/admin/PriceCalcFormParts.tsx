import type { PotArtist } from '../../lib/api'
import { formatYen } from '../../lib/format'
import {
  costRate, exceedsMaxCostRate, formatCostRate, formatRateLabel,
} from '../../lib/priceCalc'

/** 価格計算フォーム間で共有する表示部品と入力欄のスタイルをまとめるモジュール */

/** 原価率が目標を超えたときの注意の文字色（削除ボタン・失敗の文言と同じ赤） */
export const WARN_COLOR = '#c0392b'

/** 計算フォームの入力欄（植物名・各金額・鉢作家の select）の見た目。最大幅 280px */
export const inputStyle: React.CSSProperties = {
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
export const labelStyle: React.CSSProperties = {
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
export function PriceDisplay({ recommendedPrice, cost, maxRate, title, showRate = false }: {
  recommendedPrice: number | null
  cost: number | null
  maxRate: number | null
  title?: string
  showRate?: boolean
}) {
  // 1. 推奨価格の有無でカードの表示状態を決め、見出しは指定値か目標原価率から作る
  // 2. 価格があり、原価率を表示する条件を満たす場合だけ補足行を描画する
  return (
    /* 推奨価格を背景色・境界線付きのカードとしてまとめるコンテナ。 */
    <div style={{
      background: recommendedPrice ? '#f0f4ee' : '#f5f5f5',
      border: `1px solid ${recommendedPrice ? '#b8d0b0' : '#e0e0e0'}`,
      borderRadius: 6, padding: '16px 20px', maxWidth: 280,
      transition: 'background 0.2s, border-color 0.2s',
    }}>
      {/* 見出しの文字サイズ・色・字間・下側の余白を整える設定。 */}
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 4px', letterSpacing: 1 }}>
        {/* 見出しの差し替えがあればそれを出す。無ければ目標原価率の見出し
            （目標原価率が正しく入っていないときは率を出さない。推奨価格も「¥ —」になる） */}
        {title ?? (maxRate !== null ? `推奨販売価格（原価率 ${formatRateLabel(maxRate)} 以下）` : '推奨販売価格（目標原価率が未設定）')}
      </p>
      {/* 推奨価格の金額を大きくし、桁がそろう書体と状態色で表示する設定。 */}
      <p style={{
        fontSize: 26, fontWeight: 600, margin: 0,
        color: recommendedPrice ? '#1c2417' : '#ccc',
        letterSpacing: 1, fontVariantNumeric: 'tabular-nums',
      }}>
        {recommendedPrice ? formatYen(Math.round(recommendedPrice)) : '¥ —'}
      </p>
      {/* 推奨価格での実際の原価率（目標原価率から計算したときは切り上げているので目標以下になる。
          実生は目標原価率を使わないが、元値 ÷ 上代の原価率は出す） */}
      {recommendedPrice !== null && cost !== null && (maxRate !== null || showRate) && (
        /* 推奨価格に対する原価率を小さく控えめな文字で補足する設定。 */
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
export function CustomPriceField({ value, onChange, recommendedPrice, finalPrice, cost, maxRate, label = '任意価格（推奨価格を上書き）', showRate = false }: {
  value: string
  onChange: (v: string) => void
  recommendedPrice: number | null
  finalPrice: number | null
  cost: number | null
  maxRate: number | null
  label?: string
  showRate?: boolean
}) {
  // 1. 原価と登録価格がそろい、目標原価率があるか showRate のときだけ登録価格の原価率を求める
  /** 登録価格での原価率。それ以外の条件では null */
  const rate = cost && finalPrice && (maxRate !== null || showRate) ? costRate(cost, finalPrice) : null
  // 2. 目標原価率が設定されている場合だけ、登録価格の原価率が目標を超えたか判定する
  /** 登録価格の原価率が目標を超えているか */
  const over = !!(cost && finalPrice && maxRate !== null && exceedsMaxCostRate(cost, finalPrice, maxRate))

  return (
    <div>
      <p style={labelStyle}>{label}</p>
      {/* 金額記号と入力欄を横並びにし、間隔と縦位置をそろえるコンテナ。 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* 金額入力欄の通貨記号を入力値と区別できる大きさで表示する設定。 */}
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
        /* 登録価格と原価率を状態色・余白で補足表示する設定。 */
        <p style={{ fontSize: 12, color: over ? WARN_COLOR : '#3a7c5a', margin: '6px 0 0' }}>
          登録価格: {formatYen(Math.round(finalPrice))}{rate !== null && `（原価率 ${formatCostRate(rate, maxRate ?? undefined)}）`}
        </p>
      )}
      {/* 原価率が目標を超えるときの注意（登録はそのままできる） */}
      {value && over && maxRate !== null && (
        /* 目標原価率を超えたことを赤い文字で知らせる設定。 */
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
export function RegisterButton({ label, disabled, saving, onClick }: {
  label: string; disabled: boolean; saving: boolean; onClick: () => void
}) {
  // 1. 必須項目不足または登録中ならボタンを無効化し、登録中の表示に切り替える
  // 2. それ以外は受け取ったラベルとクリック処理を表示する
  return (
    /* 登録可否と処理中状態を背景色・カーソルで示す登録ボタン。 */
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
export function PotArtistSelect({ value, onChange, potArtists }: {
  value: string
  onChange: (id: string) => void
  potArtists: PotArtist[]
}) {
  // 1. 未選択時の量産鉢を先頭に置き、作家一覧を選択肢へ変換する
  // 2. 選択値と変更通知を親フォームへつなぐ
  return (
    <div>
      <p style={labelStyle}>鉢作家</p>
      {/* 鉢作家の選択欄を共通入力欄の寸法にそろえ、選択可能であることを示す設定。 */}
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
