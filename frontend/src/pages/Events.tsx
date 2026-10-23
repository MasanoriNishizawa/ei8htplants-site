import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import EventPreview from '../components/EventPreview'
import { api } from '../lib/api'
import PageMeta from '../components/PageMeta'
import LoadError from '../components/LoadError'
import { useApi } from '../hooks/useApi'
import { useLang, useT } from '../lib/lang'
import { formatMonthKey, monthKey, parseLocalDate } from '../lib/localDate'
import { BRAND_NAMES } from '../lib/brands'

/**
 * イベント一覧ページ。ブランド・月・ワークショップ有無によるフィルターと過去/今後の切り替えを提供する
 * @returns イベント一覧の画面
 */
export default function Events() {
  // URL のクエリ（?page=past）
  const [params] = useSearchParams()
  // ?page=past なら過去のイベントを表示する
  const isPast = params.get('page') === 'past'
  // 選んでいるブランド（null はすべて）
  const [brandFilter, setBrandFilter] = useState<string | null>(null)
  // 選んでいる月（YYYY-MM のキー。言語を切り替えても絞り込みが外れないよう、表示の文字ではなくキーで持つ）
  const [monthFilter, setMonthFilter] = useState<string | null>(null)
  // ワークショップありだけに絞るなら true
  const [workshopFilter, setWorkshopFilter] = useState<boolean | null>(null)
  // 今の表示言語（月の表示に使う）
  const { lang } = useLang()
  const t = useT()

  // 今後／過去を切り替えるたびに取り直す。切り替え前の古い応答が後から届いても捨てる（useApi）
  const { data, loading, error, reload } = useApi(() => api.events.list(isPast), [isPast])

  // 今後／過去を切り替えたら絞り込みを外す
  useEffect(() => {
    setBrandFilter(null)
    setMonthFilter(null)
    setWorkshopFilter(null)
  }, [isPast])

  // 開始日の順に並べたイベント（今後は近い順、過去は新しい順）
  const sorted = useMemo(
    () => [...(data ?? [])].sort((a, b) => {
      // 開始日の差（ミリ秒）
      const diff = parseLocalDate(a.start_date).getTime() - parseLocalDate(b.start_date).getTime()
      return isPast ? -diff : diff
    }),
    [data, isPast]
  )

  // 絞り込みの選択肢に出す月（YYYY-MM のキー。並び順は sorted のまま）
  const months = useMemo(
    () => [...new Set(sorted.map((e) => monthKey(e.start_date)))],
    [sorted]
  )

  // 絞り込み後のイベント
  const filtered = useMemo(() => {
    return sorted.filter((e) => {
      if (brandFilter && !e.brands.includes(brandFilter)) return false
      if (monthFilter && monthKey(e.start_date) !== monthFilter) return false
      if (workshopFilter !== null && e.has_workshop !== workshopFilter) return false
      return true
    })
  }, [sorted, brandFilter, monthFilter, workshopFilter])

  /**
   * 絞り込みボタン（丸い枠）の見た目
   * @param active - 選択中なら true（濃い背景）
   * @returns style
   */
  const filterBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px', border: '1px solid #dddde8', borderRadius: 20, fontSize: 12,
    letterSpacing: 1, cursor: 'pointer', fontFamily: 'inherit',
    background: active ? '#1c2417' : '#ffffff',
    color: active ? '#fff' : '#8a9a7e',
    transition: 'all 0.15s',
  })

  // スマホ表示の絞り込みのプルダウン
  const selectStyle: React.CSSProperties = {
    flex: 1, padding: '8px 10px', border: '1px solid #dddde8', borderRadius: 4,
    fontSize: 13, fontFamily: 'inherit', background: '#ffffff', color: 'var(--c-body)', cursor: 'pointer',
  }

  // 「フィルターをリセット」ボタン（赤い文字だけ）
  const resetBtn: React.CSSProperties = {
    padding: '5px 12px', border: 'none', background: 'none', fontSize: 12,
    color: '#c0392b', cursor: 'pointer', fontFamily: 'inherit',
  }

  // 何か絞り込んでいるなら true
  const hasFilter = brandFilter !== null || monthFilter !== null || workshopFilter !== null

  return (
    <>
      <PageMeta title={isPast ? 'Past Events' : 'Events'} description="ei8ht plants のイベント・出展情報。ワークショップ予約も受け付けています。" />
      {/* ページの見出し */}
      <div style={{ textAlign: 'center', padding: '50px 20px', background: '#f5f5f7' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 300, letterSpacing: 6, textTransform: 'uppercase', margin: 0 }}>
          {isPast ? 'Past Events' : 'Events'}
        </h1>
      </div>

      {/* 絞り込み（イベントが 1 件以上あるときだけ出す。PC はボタン、スマホはプルダウン。どちらを出すかは index.css で切り替える） */}
      {!loading && sorted.length > 0 && (
        <div style={{ background: '#f5f5f7', borderBottom: '1px solid #dddde8', padding: '14px 20px' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>

            {/* PC 用の絞り込み: ブランド・月・WS のボタンの行（同じボタンをもう一度押すと解除） */}
            <div className="filter-pc">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 10, letterSpacing: 2, color: '#aaa', textTransform: 'uppercase', width: 48, flexShrink: 0 }}>Brand</span>
                {BRAND_NAMES.map((b) => (
                  <button key={b} type="button" aria-pressed={brandFilter === b} style={filterBtnStyle(brandFilter === b)} onClick={() => setBrandFilter(brandFilter === b ? null : b)}>{b}</button>
                ))}
              </div>
              {/* 月の行は 2 か月以上あるときだけ */}
              {months.length > 1 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', paddingTop: 8, borderTop: '1px solid #e0e0ea' }}>
                  <span style={{ fontSize: 10, letterSpacing: 2, color: '#aaa', textTransform: 'uppercase', width: 48, flexShrink: 0 }}>Month</span>
                  {months.map((m) => (
                    <button key={m} type="button" aria-pressed={monthFilter === m} style={filterBtnStyle(monthFilter === m)} onClick={() => setMonthFilter(monthFilter === m ? null : m)}>{formatMonthKey(m, lang)}</button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', paddingTop: 8, borderTop: '1px solid #e0e0ea' }}>
                <span style={{ fontSize: 10, letterSpacing: 2, color: '#aaa', textTransform: 'uppercase', width: 48, flexShrink: 0 }}>WS</span>
                <button type="button" aria-pressed={workshopFilter === true} style={filterBtnStyle(workshopFilter === true)} onClick={() => setWorkshopFilter(workshopFilter === true ? null : true)}>
                  {t('Workshop 開催', 'Workshop')}
                </button>
              </div>
              {/* 絞り込み中だけ「リセット」を出す */}
              {hasFilter && (
                <div style={{ paddingTop: 4 }}>
                  <button onClick={() => { setBrandFilter(null); setMonthFilter(null); setWorkshopFilter(null) }} style={resetBtn}>
                    {t('フィルターをリセット ×', 'Reset filters ×')}
                  </button>
                </div>
              )}
            </div>

            {/* スマホ用の絞り込み: ブランド・月のプルダウンと WS のチェックボックス */}
            <div className="filter-mobile">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 10, letterSpacing: 2, color: '#aaa', textTransform: 'uppercase', width: 48, flexShrink: 0 }}>Brand</span>
                <select aria-label={t('ブランドで絞り込む', 'Filter by brand')} value={brandFilter ?? ''} onChange={(e) => setBrandFilter(e.target.value || null)} style={selectStyle}>
                  <option value="">{t('すべてのブランド', 'All Brands')}</option>
                  {BRAND_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              {months.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, letterSpacing: 2, color: '#aaa', textTransform: 'uppercase', width: 48, flexShrink: 0 }}>Month</span>
                  <select aria-label={t('月で絞り込む', 'Filter by month')} value={monthFilter ?? ''} onChange={(e) => setMonthFilter(e.target.value || null)} style={selectStyle}>
                    <option value="">{t('すべての月', 'All Months')}</option>
                    {months.map((m) => <option key={m} value={m}>{formatMonthKey(m, lang)}</option>)}
                  </select>
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', paddingTop: 2 }}>
                <span style={{ fontSize: 10, letterSpacing: 2, color: '#aaa', textTransform: 'uppercase', width: 48, flexShrink: 0 }}>WS</span>
                <input
                  type="checkbox"
                  checked={workshopFilter === true}
                  onChange={(e) => setWorkshopFilter(e.target.checked ? true : null)}
                  style={{ width: 16, height: 16, accentColor: '#1c2417', flexShrink: 0 }}
                />
                <span style={{ fontSize: 13, color: 'var(--c-body)' }}>{t('Workshop 開催のみ', 'Workshop events only')}</span>
              </label>
              {hasFilter && (
                <button onClick={() => { setBrandFilter(null); setMonthFilter(null); setWorkshopFilter(null) }} style={resetBtn}>
                  {t('フィルターをリセット ×', 'Reset filters ×')}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: '40px auto', padding: '0 20px', width: '100%', boxSizing: 'border-box' }}>
        {loading && <p role="status" style={{ textAlign: 'center', padding: '100px 0', color: 'var(--c-muted)' }}>{t('読み込み中...', 'Loading...')}</p>}

        {/* 通信の失敗は「予定されているイベントはありません」と分けて案内する */}
        {!loading && error && <LoadError onRetry={reload} />}

        {/* 0 件のときの案内（絞り込み中・過去・今後で文を変える） */}
        {!loading && !error && filtered.length === 0 && (
          <p style={{ textAlign: 'center', padding: '100px 0', color: 'var(--c-muted)' }}>
            {hasFilter
              ? t('条件に一致するイベントはありません。', 'No events match the filter.')
              : isPast
                ? t('過去のイベントはありません。', 'No past events.')
                : t('予定されているイベントはありません。', 'No upcoming events.')}
          </p>
        )}

        {/* イベントのカードの一覧 */}
        {!loading && !error && filtered.length > 0 && (
          <div className="events-grid">
            {filtered.map((event) => (
              <EventPreview key={event.id} event={event} />
            ))}
          </div>
        )}

        {/* 今後と過去の切り替えリンク */}
        <div style={{ textAlign: 'center', marginTop: 60 }}>
          <Link
            to={isPast ? '/events' : '/events?page=past'}
            style={{ display: 'inline-block', padding: '12px 30px', background: '#ffffff', border: '1px solid #dddde8', color: 'var(--c-muted)', textDecoration: 'none', borderRadius: 4, fontSize: 16, letterSpacing: 2 }}
          >
            {isPast ? t('現在のイベントを見る', 'View upcoming events') : t('過去のイベントを見る', 'View past events')}
          </Link>
        </div>
      </div>
    </>
  )
}
