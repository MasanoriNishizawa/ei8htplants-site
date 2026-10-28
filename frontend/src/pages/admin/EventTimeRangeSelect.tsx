import { useEffect, useState } from 'react'
import { TIME_END_OPTIONS, TIME_START_OPTIONS, parseTimeRange } from './eventTime'

/** 時間帯選択欄に渡す値と表示設定 */
type TimeRangeSelectProps = {
  /** 保存形式の時間帯 */
  value: string
  /** 選択した時間帯を親へ通知する処理 */
  onChange: (value: string) => void
  /** 2つのプルダウンに追加する見た目 */
  style?: React.CSSProperties
  /** 開始時刻プルダウンの識別子 */
  id?: string
  /** 読み上げラベルの先頭に付ける文字 */
  labelPrefix?: string
}

/**
 * 開始・終了の選択欄から時間帯を組み立て、親フォームへ通知する。
 * @param props.value - 現在の時間帯
 * @param props.onChange - 変更後の時間帯を受け取る処理。片側解除時は空文字を受け取る
 * @param props.style - 選択欄に追加するスタイル
 * @param props.id - 開始時刻欄の識別子
 * @param props.labelPrefix - 読み上げラベルに付ける接頭辞
 * @returns 開始・終了時刻の2つの選択欄
 */
export default function EventTimeRangeSelect({ value, onChange, style, id, labelPrefix = '' }: TimeRangeSelectProps) {
  /** 初期表示の時間帯を開始・終了に分けた値 */
  const [parsed] = useState(() => parseTimeRange(value))
  /** 現在選択されている開始時刻 */
  const [start, setStart] = useState(parsed[0])
  /** 現在選択されている終了時刻 */
  const [end, setEnd] = useState(parsed[1])

  /** 1. 親から値が更新された場合、各選択欄へ同期する */
  useEffect(() => {
    /** 保存形式の時間帯から取り出した開始・終了時刻 */
    const [nextStart, nextEnd] = parseTimeRange(value)
    setStart(nextStart)
    setEnd(nextEnd)
  }, [value])

  /**
   * 開始時刻を更新し、両側が選択済みなら時間帯を通知する。
   * @param nextStart - 選択された開始時刻。空文字は未選択
   * @returns 戻り値なし
  */
  const handleStart = (nextStart: string): void => {
    // 1. 選択欄の表示状態を更新する。
    setStart(nextStart)
    // 2. 両方選択済みなら合成した時間帯を通知し、解除された場合は空文字を通知する。
    if (nextStart && end) onChange(`${nextStart}〜${end}`)
    else if (!nextStart) onChange('')
  }

  /**
   * 終了時刻を更新し、両側が選択済みなら時間帯を通知する。
   * @param nextEnd - 選択された終了時刻。空文字は未選択
   * @returns 戻り値なし
  */
  const handleEnd = (nextEnd: string): void => {
    // 1. 選択欄の表示状態を更新する。
    setEnd(nextEnd)
    // 2. 両方選択済みなら合成した時間帯を通知し、解除された場合は空文字を通知する。
    if (start && nextEnd) onChange(`${start}〜${nextEnd}`)
    else if (!nextEnd) onChange('')
  }

  /** 開始・終了の選択欄に共通する余白・境界線・文字設定。親から渡された style で上書きできる */
  const selectStyle: React.CSSProperties = {
    /** 2つの選択欄を同じ幅で並べる */
    flex: 1,
    /** 選択欄内の上下・左右の余白 */
    padding: '10px 14px',
    /** 選択欄の境界線 */
    border: '1px solid #dddde8',
    /** 選択欄の角の丸み */
    borderRadius: 4,
    /** 選択肢の文字を共通の本文小サイズ（従来の15px相当）にそろえる */
    fontSize: 'var(--brand-type-body-small)',
    /** サイト共通の書体を継承する */
    fontFamily: 'inherit',
    /** 選択欄の背景色 */
    background: '#ffffff',
    /** 幅と余白を含めて寸法を計算する */
    boxSizing: 'border-box',
    /** 呼び出し元の画面に応じた追加スタイル */
    ...style,
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {/* 開始時刻の選択欄 */}
      <select id={id} aria-label={`${labelPrefix}開始時刻`} style={selectStyle} value={start} onChange={(event) => handleStart(event.target.value)}>
        <option value="">--</option>
        {TIME_START_OPTIONS.map((time) => <option key={time} value={time}>{time}</option>)}
      </select>
      {/* 開始時刻と終了時刻の区切り。文字色とサイズは共通トークンを使う */}
      <span style={{ color: 'var(--c-muted)', flexShrink: 0, fontSize: 'var(--brand-type-body-small)' }}>〜</span>
      {/* 終了時刻の選択欄 */}
      <select aria-label={`${labelPrefix}終了時刻`} style={selectStyle} value={end} onChange={(event) => handleEnd(event.target.value)}>
        <option value="">--</option>
        {TIME_END_OPTIONS.map((time) => <option key={time} value={time}>{time}</option>)}
      </select>
    </div>
  )
}
