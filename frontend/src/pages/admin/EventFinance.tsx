import { useEffect, useState } from 'react'
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom'
import { api, type Event, type EventFinancesBody } from '../../lib/api'
import { computeFinances } from '../../lib/finance'
import { formatNumber, formatYen } from '../../lib/format'
import {
  FUEL_EFFICIENCY_KM_PER_L,
  HELPER_SALES_SHARE_RATE,
  HELPER_WS_SHARE_RATE,
  WS_FEE_YEN,
  WS_MATERIAL_COST_YEN,
  percentLabel,
} from '../../lib/constants'
import { backPathFrom } from '../../lib/navigation'
import { confirmLeaveIfDirty, useDirtyTracker, useUnsavedChanges } from './UnsavedChanges'

/** 手伝いへの支払いの割合のうち、売上利益分の表示（説明文用。計算と同じ定数から作る） */
const SALES_PCT = percentLabel(HELPER_SALES_SHARE_RATE)
/** 手伝いへの支払いの割合のうち、WS 売上分の表示（説明文用） */
const WS_PCT = percentLabel(HELPER_WS_SHARE_RATE)

/**
 * 読み込みが終わる前・読み込みに失敗したときのフォームの初期値（ガソリン単価だけ 160 円/L を入れておく）
 * 収支がまだ無いイベントでも、API（GET /events/:id/finances）が既定値を返すので、読み込めればその値で置き換わる
 */
const BLANK: EventFinancesBody = {
  sales: 0,
  booth_fee: 0,
  distance: 0,
  gas_price: 160,
  expressway_toll: 0,
  accommodation: 0,
  ws_participants: 0,
  payment_flag: false,
  ws_payment_done: false,
  other_expenses: 0,
  other_expenses_note: null,
  notes: null,
}

/**
 * 特定イベントの収支（売上・各支出・計算結果）を入力・保存するページ
 * URL: /admin/events/:id/finances
 * @returns 収支の入力フォームと計算結果
 */
export default function EventFinance() {
  /** URL の :id（対象のイベントの id） */
  const { id } = useParams<{ id: string }>()
  /** 今の画面の場所（戻り先 state.from を読むため） */
  const location = useLocation()
  /** 保存後に元の画面へ戻るための画面移動の関数 */
  const navigate = useNavigate()
  /** 戻り先のパス。遷移元が無いときはイベント一覧へ戻る */
  const backTo = backPathFrom(location.state, '/admin/events')
  /** 対象のイベント（WS の有無・見出しの表示に使う） */
  const [event, setEvent] = useState<Event | null>(null)
  /** 収支の入力 */
  const [form, setForm] = useState<EventFinancesBody>(BLANK)
  /** 読み込み中なら true */
  const [loading, setLoading] = useState(true)
  /** 保存中なら true */
  const [saving, setSaving] = useState(false)
  /** 読み込み・保存エラーのメッセージ。null なら非表示 */
  const [error, setError] = useState<string | null>(null)
  /** 読み込みに失敗したかどうか。true の間は保存できなくする（空のフォームで既存データを上書きしないため） */
  const [loadFailed, setLoadFailed] = useState(false)
  /** 未保存の変更があるか（読み込み直後の値を基準にする。読み込み前・失敗時は変更なし） */
  const { isDirty, resetBaseline } = useDirtyTracker(form)
  // 未保存の変更をサイドメニューの確認・再読み込みの確認に使えるよう登録する（保存に成功したら元の画面へ移るので確認は出ない）
  useUnsavedChanges(isDirty)

  /*
   * イベント情報・収支データ・予約一覧・管理情報を同時取得してフォームに反映する
   * 1. 4 つをまとめて取得する
   * 2. キャンセル以外の予約の人数を合計する（WS ありで予約があれば、WS 参加人数はこの値にする）
   * 3. 収支の出店料・宿泊費が 0 なら、管理情報の値で補ってフォームに入れる
   */
  useEffect(() => {
    if (!id) return
    // 1. まとめて取得
    Promise.all([
      api.events.get(id),
      api.events.getFinances(id),
      api.reserve.list(id),
      api.events.getAdminInfo(id),
    ]).then(([ev, fin, reservations, info]) => {
      setEvent(ev)
      // 2. 予約の人数の合計
      /** キャンセル以外の予約の参加人数の合計 */
      const reservationTotal = reservations
        .filter((r) => r.status !== 'cancelled')
        .reduce((sum, r) => sum + r.participants, 0)
      // 3. フォームに反映し、未保存の変更の判定の基準にする
      /** 読み込んだ値で作ったフォームの初期値 */
      const loadedForm: EventFinancesBody = {
        sales: fin.sales,
        // 収支に値がない（0）場合は管理情報の出店料を初期値として使う
        booth_fee: fin.booth_fee !== 0 ? fin.booth_fee : (info?.booth_fee ?? 0),
        distance: fin.distance,
        gas_price: fin.gas_price,
        expressway_toll: fin.expressway_toll,
        // 収支に値がない（0）場合は管理情報の宿泊料金を初期値として使う
        accommodation: fin.accommodation !== 0 ? fin.accommodation : (info?.hotel_fee ?? 0),
        ws_participants: ev.has_workshop && reservationTotal > 0 ? reservationTotal : fin.ws_participants,
        payment_flag: fin.payment_flag,
        ws_payment_done: fin.ws_payment_done ?? false,
        other_expenses: fin.other_expenses,
        other_expenses_note: fin.other_expenses_note,
        notes: fin.notes,
      }
      setForm(loadedForm)
      resetBaseline(loadedForm)
    }).catch(() => {
      // 読み込み失敗時にエラーメッセージを表示し、保存を止める
      setError('データの読み込みに失敗しました。ページを再読み込みしてください。')
      setLoadFailed(true)
    }).finally(() => setLoading(false))
    // resetBaseline は入力のたびに作り直されるが、読み込みは id が変わったときだけにする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /**
   * 収支の入力の 1 項目を書き換える
   * @param key - 項目名
   * @param value - 新しい値
   */
  const set = <K extends keyof EventFinancesBody>(key: K, value: EventFinancesBody[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  /** 入力値をもとにリアルタイムで計算した移動費・WS売上・収支・手伝い支払い額など */
  const computed = computeFinances({ event_id: id ?? '', ...form }, event?.has_workshop ?? false)
  const { transport, wsSales, wsCost, totalExpense, net, salesShare, wsShare, paymentAmount } = computed

  /**
   * 収支を保存し、管理情報の出店料・宿泊費も同じ値にそろえてから元の画面へ戻る（手順は中のコメント 1〜4）
   * 途中で失敗したら画面に残り、文言を出す（収支だけ保存済みで管理情報は古いまま、ということもありうる）
   * @param e - フォームの送信イベント
   */
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    // 読み込みに失敗した画面では保存しない（初期値の 0 で既存の収支を上書きしてしまうため）
    if (!id || loadFailed) return
    setSaving(true)
    setError(null)
    try {
      // 1. 収支データを保存する
      await api.events.saveFinances(id, form)
      // 2. 管理情報の最新の内容を読み直す。
      //    画面を開いた時点の内容を使うと、その後に管理情報ページで保存した搬入・出店要項などを
      //    古い内容で上書きして消してしまうため、保存の直前に取り直す
      /** 保存直前の管理情報 */
      const latestAdminInfo = await api.events.getAdminInfo(id)
      // 3. 管理情報の出店料・宿泊費だけを収支の値に置き換えて保存する（ほかの項目は最新の内容のまま）
      await api.events.saveAdminInfo(id, {
        ...latestAdminInfo,
        booth_fee: form.booth_fee,
        hotel_fee: form.accommodation,
      })
      // 4. 保存後は遷移元（収支一覧またはイベント一覧）へ戻る
      navigate(backTo)
    } catch {
      // 保存失敗時にエラーメッセージを表示する
      setError('保存に失敗しました。もう一度お試しください。')
    } finally {
      setSaving(false)
    }
  }

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

  if (loading) return <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p>

  return (
    <div style={{ maxWidth: 580 }}>
      {/* 読み込み・保存エラーを画面上部に表示する */}
      {error && (
        <p style={{ color: '#c0392b', background: '#fdf2f2', border: '1px solid #f5c6cb', borderRadius: 4, padding: '12px 16px', marginBottom: 16, fontSize: 14 }}>
          {error}
        </p>
      )}
      {/* 戻るリンク（収支一覧から来たときは「収支一覧」、それ以外は「イベント管理」） */}
      <div style={{ marginBottom: 24 }}>
        <Link
          to={backTo}
          onClick={(e) => { if (!confirmLeaveIfDirty(isDirty)) e.preventDefault() }}
          style={{ fontSize: 13, color: 'var(--c-muted)', textDecoration: 'none' }}
        >
          &larr; {backTo === '/admin/finances' ? '収支一覧' : 'イベント管理'}
        </Link>
      </div>

      <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, marginBottom: 4 }}>
        収支管理
      </h2>
      {event && (
        <p style={{ fontSize: 14, color: 'var(--c-muted)', marginBottom: 28 }}>
          {event.name} &mdash; {event.start_date}
        </p>
      )}

      <form onSubmit={save}>

        {/* 収入 */}
        <SectionBox label="収入">
          <Row style={rowStyle} label="売上">
            <NumInput value={form.sales} onChange={(v) => set('sales', v)} style={inputStyle} plain />
          </Row>
          {event?.has_workshop && (
            <>
              <Row style={rowStyle} label="WS参加人数">
                <NumInput value={form.ws_participants} onChange={(v) => set('ws_participants', v)} style={inputStyle} unit="人" />
              </Row>
              <Row style={{ ...rowStyle, borderBottom: 'none' }} label={
                <span>WS売上 <Hint>(人数 × {formatYen(WS_FEE_YEN)})</Hint></span>
              }>
                <span style={readonlyVal}>{formatYen(wsSales, 'suffixSpaced')}</span>
              </Row>
            </>
          )}
          {/* WS なしのときは最後の行の下に少し余白を足す */}
          {!event?.has_workshop && <div style={{ height: 2 }} />}
        </SectionBox>

        {/* 支払いフラグ */}
        <div style={{ marginBottom: 20 }}>
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
              onChange={(e) => set('payment_flag', e.target.checked)}
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
            <NumInput value={form.booth_fee} onChange={(v) => set('booth_fee', v)} style={inputStyle} plain />
          </Row>
          <Row style={rowStyle} label={<span>距離 <Hint>(片道)</Hint></span>}>
            <NumInput value={form.distance} onChange={(v) => set('distance', v)} style={inputStyle} unit="km" plain />
          </Row>
          <Row style={rowStyle} label={<span>ガソリン単価 <Hint>(円/L)</Hint></span>}>
            <NumInput value={form.gas_price} onChange={(v) => set('gas_price', v)} style={inputStyle} plain />
          </Row>
          <Row style={rowStyle} label={
            <span>移動費 <Hint>(往復{form.distance * 2}km, {FUEL_EFFICIENCY_KM_PER_L}km/L)</Hint></span>
          }>
            <span style={readonlyVal}>{formatYen(transport, 'suffixSpaced')}</span>
          </Row>
          <Row style={rowStyle} label="高速代">
            <NumInput value={form.expressway_toll} onChange={(v) => set('expressway_toll', v)} style={inputStyle} plain />
          </Row>
          <Row style={rowStyle} label="宿泊費">
            <NumInput value={form.accommodation} onChange={(v) => set('accommodation', v)} style={inputStyle} plain />
          </Row>
          {/* その他支出 */}
          <div style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>その他支出</span>
              <NumInput value={form.other_expenses} onChange={(v) => set('other_expenses', v)} style={inputStyle} plain />
            </div>
            <input
              type="text"
              placeholder="内容（任意）"
              value={form.other_expenses_note ?? ''}
              onChange={(e) => set('other_expenses_note', e.target.value || null)}
              style={{ width: '100%', padding: '7px 12px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', background: '#ffffff', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ height: 2 }} />
        </SectionBox>
        {/* 支出合計と、WS ありなら WS 資材費 */}
        <div style={{ textAlign: 'right', paddingRight: 4, fontSize: 13, color: '#c0392b', marginBottom: 8, marginTop: 4 }}>
          支出合計: {formatYen(totalExpense, 'suffixSpaced')}
        </div>
        {event?.has_workshop && wsCost > 0 && (
          <div style={{ textAlign: 'right', paddingRight: 4, fontSize: 13, color: '#c0392b', marginBottom: 20 }}>
            WS資材費 ({formatNumber(form.ws_participants)}人 × {formatYen(WS_MATERIAL_COST_YEN, 'suffix')}): {formatYen(wsCost, 'suffixSpaced')}
          </div>
        )}

        {/* 収支（黒字は緑、赤字は赤）と、その下に計算式 */}
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
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: 'var(--c-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
            メモ
          </div>
          <textarea
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value || null)}
            rows={3}
            placeholder="備考・メモ（任意）"
            style={{ width: '100%', padding: '10px 14px', border: '1px solid #dddde8', borderRadius: 4, fontSize: 14, fontFamily: 'inherit', background: '#ffffff', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        {/* 保存ボタン（読み込みに失敗したときは押せない） */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit" disabled={saving || loadFailed} style={{ padding: '12px 32px', background: 'var(--c-ink)', color: '#fff', border: 'none', borderRadius: 4, cursor: loadFailed ? 'default' : 'pointer', opacity: loadFailed ? 0.5 : 1, fontSize: 15 }}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </div>
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
