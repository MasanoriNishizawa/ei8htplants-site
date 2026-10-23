import { useEffect, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { api, type Event, type EventAdminInfo } from '../../lib/api'
import { backPathFrom } from '../../lib/navigation'

import { collectEventImages, downloadImage } from './eventImageFiles'

/** 枠線ボタン・リンクの共通スタイル（イベント一覧の操作ボタンと同じ見た目） */
const buttonStyle: React.CSSProperties = {
  padding: '6px 12px',
  border: '1px solid #dddde8',
  borderRadius: 4,
  fontSize: 13,
  color: 'var(--c-body)',
  background: '#ffffff',
  cursor: 'pointer',
  fontFamily: 'inherit',
  width: '100%',
}

/**
 * イベントに登録されている画像を一覧表示し、1枚ずつダウンロードできるページ
 * URL: /admin/events/:id/images
 * @returns 出どころごとの画像カードの一覧
 */
export default function AdminEventImages() {
  /** URL の :id（対象のイベントの id） */
  const { id } = useParams<{ id: string }>()
  /** 今の画面の場所（戻り先 state.from を読むため） */
  const location = useLocation()
  /** 戻るリンクの行き先。遷移元のパスが無いときはイベント一覧へ戻る */
  const backTo = backPathFrom(location.state, '/admin/events')

  /** 取得したイベント。読み込み前・失敗時は null */
  const [event, setEvent] = useState<Event | null>(null)
  /** 取得したイベント管理情報（出店要項の画像に使う）。取得失敗時は null で、出店要項グループだけ出さない */
  const [adminInfo, setAdminInfo] = useState<EventAdminInfo | null>(null)
  /** イベント読み込み中かどうか */
  const [loading, setLoading] = useState(true)
  /** 読み込みエラーのメッセージ。null なら非表示 */
  const [error, setError] = useState<string | null>(null)
  /** 保存中の画像の通し番号の集合。該当カードのボタンを「保存中...」にして無効化する */
  const [downloading, setDownloading] = useState<Set<number>>(new Set())
  /** 保存に失敗した画像の通し番号の集合。該当カードに失敗メッセージを出す */
  const [failed, setFailed] = useState<Set<number>>(new Set())

  // イベント情報と管理情報を並行して取得する
  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    Promise.all([
      api.events.get(id),
      // 管理情報が取れなくてもほかの画像は表示したいので、失敗は null にして握りつぶす
      api.events.getAdminInfo(id).catch(() => null),
    ])
      .then(([ev, info]) => {
        setEvent(ev)
        setAdminInfo(info)
      })
      .catch(() => setError('イベントの読み込みに失敗しました。'))
      .finally(() => setLoading(false))
  }, [id])

  /**
   * ダウンロードボタン押下時の処理
   * 1. ボタンを保存中にし、前回の失敗表示を消す
   * 2. 画像を取得して保存させる
   * 3. 失敗したらそのカードに失敗メッセージを出し、最後に保存中を解除する
   * @param url - 画像の URL
   * @param index - 通し番号（1始まり）
   */
  const handleDownload = async (url: string, index: number) => {
    if (!event) return
    // 1. ボタンを保存中にし、前回の失敗表示を消す
    setDownloading((prev) => new Set(prev).add(index))
    setFailed((prev) => {
      const next = new Set(prev)
      next.delete(index)
      return next
    })
    try {
      // 2. 画像を取得して保存させる
      await downloadImage(url, event.name, index)
    } catch {
      // 3. 失敗したらそのカードに失敗メッセージを出す
      setFailed((prev) => new Set(prev).add(index))
    } finally {
      setDownloading((prev) => {
        const next = new Set(prev)
        next.delete(index)
        return next
      })
    }
  }

  if (loading) return <p style={{ color: 'var(--c-muted)' }}>読み込み中...</p>

  /** 出どころごとの画像グループ */
  const groups = event ? collectEventImages(event, adminInfo) : []
  /** 全グループ合計の枚数 */
  const total = groups.reduce((sum, g) => sum + g.items.length, 0)
  /** ページ全体での通し番号。グループをまたいで 1 から振る */
  let counter = 0

  return (
    <div>
      {/* 戻るリンク */}
      <div style={{ marginBottom: 24 }}>
        <Link to={backTo} style={{ fontSize: 13, color: 'var(--c-muted)', textDecoration: 'none' }}>
          &larr; 戻る
        </Link>
      </div>

      <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, marginBottom: 4 }}>
        画像ダウンロード
      </h2>
      {/* イベント名と開始日 */}
      {event && (
        <p style={{ fontSize: 14, color: 'var(--c-muted)', marginBottom: 8 }}>
          {event.name} &mdash; {event.start_date}
        </p>
      )}

      {/* 読み込みエラー */}
      {error && (
        <p style={{ color: '#c0392b', background: '#fdf2f2', border: '1px solid #f5c6cb', borderRadius: 4, padding: '12px 16px', marginTop: 16, fontSize: 14 }}>
          {error}
        </p>
      )}

      {event && (
        <>
          {/* 合計枚数 */}
          <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 24 }}>全 {total} 枚</p>

          {/* 画像が1枚もないときの案内 */}
          {total === 0 && (
            <p style={{ fontSize: 14, color: 'var(--c-muted)' }}>このイベントには画像が登録されていません</p>
          )}

          {groups.map((g) => (
            <section key={g.group} style={{ marginBottom: 32 }}>
              {/* グループ見出し（出どころ名と枚数） */}
              <h3 style={{ fontSize: 14, fontWeight: 500, letterSpacing: 1, color: 'var(--c-body)', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #dddde8' }}>
                {g.group}
                <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--c-muted)', fontWeight: 400 }}>{g.items.length} 枚</span>
              </h3>
              {/* 画像カードのグリッド。最小幅 160px で折り返し、スマホ幅でも横スクロールしない */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(160px, 100%), 1fr))', gap: 12 }}>
                {g.items.map((item) => {
                  counter += 1
                  /** この画像の通し番号（1始まり） */
                  const index = counter
                  /** この画像を保存中かどうか */
                  const isDownloading = downloading.has(index)
                  /** この画像の保存に失敗したかどうか */
                  const isFailed = failed.has(index)
                  return (
                    <div
                      key={item.url}
                      style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8, background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, minWidth: 0 }}
                    >
                      {/* 正方形のサムネイル。クリックで元画像を新しいタブで開く */}
                      <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', aspectRatio: '1 / 1', background: '#f4f4f8', borderRadius: 2, overflow: 'hidden' }}>
                        <img
                          src={item.url}
                          alt={item.caption ?? `${event.name} ${index}`}
                          loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </a>
                      {/* 通し番号とキャプション */}
                      <div style={{ fontSize: 12, color: 'var(--c-muted)', overflowWrap: 'anywhere' }}>
                        {String(index).padStart(2, '0')}
                        {item.caption && <span style={{ marginLeft: 6, color: 'var(--c-body)' }}>{item.caption}</span>}
                      </div>
                      {/* ダウンロードボタン（保存中は押せない） */}
                      <button
                        type="button"
                        onClick={() => handleDownload(item.url, index)}
                        disabled={isDownloading}
                        style={{ ...buttonStyle, cursor: isDownloading ? 'default' : 'pointer', opacity: isDownloading ? 0.6 : 1 }}
                      >
                        {isDownloading ? '保存中...' : 'ダウンロード'}
                      </button>
                      {/* 保存に失敗したときの案内。元画像を開いて手動で保存してもらう */}
                      {isFailed && (
                        <p style={{ fontSize: 12, color: '#c0392b', margin: 0, overflowWrap: 'anywhere' }}>
                          ダウンロードに失敗しました。
                          <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: '#1e3272' }}>
                            元画像を開く
                          </a>
                          から保存してください。
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
