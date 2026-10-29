import type { EventFinancesBody } from '../../lib/api'
import type { ComputedFinances } from '../../lib/finance'
import { formatNumber, formatYen } from '../../lib/format'
import {
  FUEL_EFFICIENCY_KM_PER_L,
  HELPER_SALES_SHARE_RATE,
  HELPER_WS_SHARE_RATE,
  WS_FEE_YEN,
  WS_MATERIAL_COST_YEN,
  percentLabel,
} from '../../lib/constants'

/** 手伝いへの支払い割合を説明文に表示するため、計算と共通の定数から作る */
const SALES_PCT = percentLabel(HELPER_SALES_SHARE_RATE)
/** WS 売上に対する手伝いへの支払い割合を説明文に表示する */
const WS_PCT = percentLabel(HELPER_WS_SHARE_RATE)

/** 入力値と計算結果を表示し、入力変更だけを親へ通知する props */
interface EventFinanceFieldsProps {
  /** 親が保持する収支フォームの現在値 */
  form: EventFinancesBody
  /** 対象イベントにワークショップがあるか */
  hasWorkshop: boolean
  /** 親が計算した表示専用の金額 */
  values: Pick<ComputedFinances, 'transport' | 'wsSales' | 'wsCost' | 'totalExpense' | 'net' | 'salesShare' | 'wsShare' | 'paymentAmount'>
  /** 入力項目ごとの型を保ったまま変更を親へ通知する */
  onChange: <K extends keyof EventFinancesBody>(key: K, value: EventFinancesBody[K]) => void
}

/**
 * 収支の入力欄と、親から受け取った値に基づく読み取り専用の計算結果を表示する。
 * 入力状態・計算・保存は親に残し、このコンポーネントは表示と変更通知だけを担う。
 * @param props - 入力値、イベント条件、表示用計算結果、型安全な変更通知関数
 * @returns 収入・支出・手伝い支払い・収支・メモのフォーム要素
 */
export default function EventFinanceFields({ form, hasWorkshop, values, onChange }: EventFinanceFieldsProps) {
  /** 親が算出した金額を表示用に取り出す */
  const { transport, wsSales, wsCost, totalExpense, net, salesShare, wsShare, paymentAmount } = values

  /** 金額・数値の入力欄（NumInput）の見た目。右寄せ・幅 130px */
  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    border: '1px solid #dddde8',
    borderRadius: 4,
    fontSize: 15,
    fontFamily: 'inherit',
    background: '#ffffff',
    textAlign: 'right',
    width: 130,
  }

  /** 収入・支出の1行（項目名と入力欄を左右に並べる）の見た目 */
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #f0f0f5',
    gap: 16,
  }

  /** 計算で決まる値（WS売上・移動費）の表示の見た目。入力欄と同じ幅で右寄せ */
  const readonlyVal: React.CSSProperties = {
    fontSize: 15,
    color: '#4a6741',
    fontWeight: 500,
    minWidth: 130,
    textAlign: 'right',
  }

  return (
    <>
        {/* 収入 */}
        <SectionBox label="収入">
          <Row style={rowStyle} label="売上">
            <NumInput value={form.sales} onChange={(v) => onChange('sales', v)} style={inputStyle} plain />
          </Row>
          {hasWorkshop && (
            <>
              <Row style={rowStyle} label="WS参加人数">
                <NumInput value={form.ws_participants} onChange={(v) => onChange('ws_participants', v)} style={inputStyle} unit="人" />
              </Row>
              <Row style={{ ...rowStyle, borderBottom: 'none' }} label={
                <span>WS売上 <Hint>(人数 × {formatYen(WS_FEE_YEN)})</Hint></span>
              }>
                <span style={readonlyVal}>{formatYen(wsSales, 'suffixSpaced')}</span>
              </Row>
            </>
          )}
          {/* WS なしのときは最後の行の下に少し余白を足す */}
          {!hasWorkshop && <div style={{ height: 2 }} />}
        </SectionBox>

        {/* 支払いフラグ */}
        <div style={{ marginBottom: 20 }}>
          {/* 支払い計算モードのチェックカード。選択状態に応じて背景・枠色を変え、説明文を添える */}
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
            padding: '14px 16px',
            background: form.payment_flag ? '#f0f5ee' : '#ffffff',
            border: `1px solid ${form.payment_flag ? '#b8d4ae' : '#dddde8'}`,
            borderRadius: 4,
          }}>
            <input
              type="checkbox"
              checked={form.payment_flag}
              onChange={(e) => onChange('payment_flag', e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', accentColor: '#4a6741', flexShrink: 0 }}
            />
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>手伝いあり（支払い計算モード）</div>
              <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 3, lineHeight: 1.6 }}>
                ONにすると「支払い金額 = (売上 - WS売上 - 各支出) × {SALES_PCT} + WS売上 × {WS_PCT}」で計算します（赤字の場合はマイナス計上）
              </div>
            </div>
          </label>
        </div>

        {/* 支出 */}
        <SectionBox label="支出">
          <Row style={rowStyle} label="出店料">
            <NumInput value={form.booth_fee} onChange={(v) => onChange('booth_fee', v)} style={inputStyle} plain />
          </Row>
          <Row style={rowStyle} label={<span>距離 <Hint>(片道)</Hint></span>}>
            <NumInput value={form.distance} onChange={(v) => onChange('distance', v)} style={inputStyle} unit="km" plain />
          </Row>
          <Row style={rowStyle} label={<span>ガソリン単価 <Hint>(円/L)</Hint></span>}>
            <NumInput value={form.gas_price} onChange={(v) => onChange('gas_price', v)} style={inputStyle} plain />
          </Row>
          <Row style={rowStyle} label={
            <span>移動費 <Hint>(往復{form.distance * 2}km, {FUEL_EFFICIENCY_KM_PER_L}km/L)</Hint></span>
          }>
            <span style={readonlyVal}>{formatYen(transport, 'suffixSpaced')}</span>
          </Row>
          <Row style={rowStyle} label="高速代">
            <NumInput value={form.expressway_toll} onChange={(v) => onChange('expressway_toll', v)} style={inputStyle} plain />
          </Row>
          <Row style={rowStyle} label="宿泊費">
            <NumInput value={form.accommodation} onChange={(v) => onChange('accommodation', v)} style={inputStyle} plain />
          </Row>
          {/* その他支出 */}
          {/* その他支出の金額欄と自由記述欄をまとめ、上下の余白と下線で区切る */}
          <div style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>その他支出</span>
              <NumInput value={form.other_expenses} onChange={(v) => onChange('other_expenses', v)} style={inputStyle} plain />
            </div>
            <input
              type="text"
              placeholder="内容（任意）"
              value={form.other_expenses_note ?? ''}
              onChange={(e) => onChange('other_expenses_note', e.target.value || null)}
              style={{ width: '100%', padding: '7px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', background: '#ffffff', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ height: 2 }} />
        </SectionBox>
        {/* 支出合計と、WS ありなら WS 資材費 */}
        {/* 支出関連の合計を右寄せし、赤文字で目立たせる */}
        <div style={{ textAlign: 'right', paddingRight: 4, fontSize: 13, color: '#c0392b', marginBottom: 8, marginTop: 4 }}>
          支出合計: {formatYen(totalExpense, 'suffixSpaced')}
        </div>
        {hasWorkshop && wsCost > 0 && (
          <div style={{ textAlign: 'right', paddingRight: 4, fontSize: 13, color: '#c0392b', marginBottom: 20 }}>
            WS資材費 ({formatNumber(form.ws_participants)}人 × {formatYen(WS_MATERIAL_COST_YEN, 'suffix')}): {formatYen(wsCost, 'suffixSpaced')}
          </div>
        )}

        {/* 収支（黒字は緑、赤字は赤）と、その下に計算式 */}
        {/* 収支カードは黒字・赤字で背景と枠色を切り替え、金額を大きく表示する */}
        <div style={{
          padding: '18px 22px', borderRadius: 4, marginBottom: form.payment_flag ? 12 : 8,
          background: net >= 0 ? '#f0f5ee' : '#fdf0ee',
          border: `1px solid ${net >= 0 ? '#b8d4ae' : '#f0b8ae'}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontWeight: 500 }}>収支</span>
          <span style={{ fontSize: 22, fontWeight: 600, color: net >= 0 ? '#2d5a27' : '#c0392b', fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif" }}>
            {net >= 0 ? '+' : ''}{formatYen(net, 'suffixSpaced')}
          </span>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--c-muted)', marginBottom: form.payment_flag ? 20 : 24 }}>
          {form.payment_flag
            ? `売上 ${formatYen(form.sales, 'suffixSpaced')} − 支出 ${formatYen(totalExpense, 'suffixSpaced')} − WS資材 ${formatYen(wsCost, 'suffixSpaced')} − 支払い ${formatYen(paymentAmount, 'suffixSpaced')}`
            : `売上 ${formatYen(form.sales, 'suffixSpaced')} − 支出 ${formatYen(totalExpense, 'suffixSpaced')} − WS資材 ${formatYen(wsCost, 'suffixSpaced')}`
          }
        </div>

        {/* 手伝い支払い金額 */}
        {form.payment_flag && (
          <>
            {/* 手伝いへの支払い内訳を暖色のカードにまとめ、合計金額を強調する */}
            <div style={{
              padding: '18px 22px', borderRadius: 4, marginBottom: 8,
              background: '#f5f0ee', border: '1px solid #d4c4ae',
            }}>
              <div style={{ fontSize: 12, letterSpacing: 1, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
                支払い金額（手伝い分）
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#6a5a45', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>売上利益分 <Hint>((売上−WS売上−支出) × {SALES_PCT})</Hint></span>
                  <span>{formatYen(salesShare, 'suffixSpaced')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>WS売上分 <Hint>(WS売上 × {WS_PCT})</Hint></span>
                  <span>{formatYen(wsShare, 'suffixSpaced')}</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #d4c4ae', paddingTop: 10 }}>
                <span style={{ fontWeight: 500 }}>合計支払い金額</span>
                <span style={{ fontSize: 22, fontWeight: 600, color: '#7a5a30', fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif" }}>
                  {formatYen(paymentAmount, 'suffixSpaced')}
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--c-muted)', marginBottom: 24 }}>
              {`売上利益 ${formatYen(form.sales - wsSales - totalExpense, 'suffixSpaced')} × ${SALES_PCT} + WS ${formatYen(wsSales, 'suffixSpaced')} × ${WS_PCT}`}
            </div>
          </>
        )}

        {/* メモ */}
        {/* メモ欄を全幅にし、縦方向にサイズ変更できるようにする */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
            メモ
          </div>
          <textarea
            value={form.notes ?? ''}
            onChange={(e) => onChange('notes', e.target.value || null)}
            rows={3}
            placeholder="備考・メモ（任意）"
            style={{ width: '100%', padding: '10px 14px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit', background: '#ffffff', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

    </>
  )
}

/**
 * 収支フォームのセクションを囲むボックスコンポーネント
 * @param label - セクションの見出しラベル
 * @param children - セクション内のコンテンツ
 * @returns 見出しと白い枠で囲んだ中身
 */
function SectionBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, letterSpacing: 2, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, padding: '0 16px' }}>
        {children}
      </div>
    </div>
  )
}

/**
 * ラベルと値を横並びに表示する1行コンポーネント
 * @param label - 左側のラベル
 * @param children - 右側のコンテンツ（入力欄など）
 * @param style - 行全体のスタイル
 * @returns 項目名と値の1行
 */
function Row({ label, children, style }: { label: React.ReactNode; children: React.ReactNode; style: React.CSSProperties }) {
  return (
    <div style={style}>
      <span style={{ fontSize: 14 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{children}</div>
    </div>
  )
}

/**
 * 金額・数値入力コンポーネント。plain モード時はスピナーを非表示にする
 * @param value - 現在の数値
 * @param onChange - 値変更時のコールバック
 * @param style - input 要素のスタイル
 * @param unit - 単位ラベル（デフォルト: "円"）
 * @param plain - true の場合は type="text" でスピナーを非表示にする
 * @returns 入力欄と単位
 */
function NumInput({ value, onChange, style, unit = '円', plain = false }: {
  value: number
  onChange: (v: number) => void
  style: React.CSSProperties
  unit?: string
  plain?: boolean
}) {
  /** plain のときに Firefox のスピナーを消すスタイル */
  const spinStyle: React.CSSProperties = plain
    ? { MozAppearance: 'textfield' } as React.CSSProperties
    : {}
  return (
    <>
      <input
        type={plain ? 'text' : 'number'}
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => {
          // 数字以外（カンマ・マイナス・小数点など）は取り除いて整数として扱う
          const n = Number(e.target.value.replace(/[^0-9]/g, ''))
          onChange(isNaN(n) ? 0 : n)
        }}
        style={{ ...style, ...spinStyle }}
        className={plain ? 'num-plain' : undefined}
      />
      {/* 単位（円・人・km）。文字数が違っても入力欄の右端がそろうよう、幅を固定する */}
      <span style={{ fontSize: 13, color: 'var(--c-muted)', display: 'inline-block', width: 20, flexShrink: 0 }}>{unit}</span>
    </>
  )
}

/**
 * 補足説明を小さいグレーテキストで表示するインラインコンポーネント
 * @param children - 補足の文
 * @returns 小さい灰色の文字
 */
function Hint({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>{children}</span>
}
