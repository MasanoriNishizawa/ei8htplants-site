import { useEffect, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { api, type Event, type EventAdminInfo } from '../../lib/api'

/** 画像1枚分の情報。url は元画像の URL、caption はカードに表示する補足（ラインナップ名・ゲスト名など） */
export interface EventImageItem {
  url: string
  caption?: string
}

/** 出どころ（イベント画像・イベントサイトの各セクション）ごとにまとめた画像のグループ */
export interface EventImageGroup {
  group: string
  items: EventImageItem[]
}

/** blob の MIME タイプから拡張子を決めるための対応表 */
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/**
 * イベントに登録されている画像を出どころごとに集める
 * 画像が1枚もないグループは含めない。同じ URL は最初に出たグループだけに残す（重複除外）
 * @param ev - 対象のイベント
 * @param adminInfo - イベント管理情報（任意）。渡すと出店要項の画像を最後のグループとして加える。取得できなかったときは null / 省略
 * @returns グループ名と画像の配列（表示順）
 */
export function collectEventImages(
  ev: Pick<Event, 'images' | 'page_content'>,
  adminInfo?: Pick<EventAdminInfo, 'guidelines_image_urls'> | null,
): EventImageGroup[] {
  // 1. 出どころごとに候補の画像を並べる（空の URL はここでは気にしない）
  const pc = ev.page_content
  const candidates: EventImageGroup[] = [
    {
      group: 'イベント画像',
      items: [...(ev.images ?? [])]
        .sort((a, b) => a.display_order - b.display_order)
        .map((img) => ({ url: img.url })),
    },
    {
      group: 'イベントサイト：メイン画像',
      items: pc?.hero?.image_url ? [{ url: pc.hero.image_url }] : [],
    },
    {
      group: 'イベントサイト：ラインナップ',
      items: (pc?.lineup ?? []).map((l) => ({ url: l.image_url ?? '', caption: l.title || undefined })),
    },
    {
      group: 'イベントサイト：ゲスト',
      items: (pc?.guests ?? []).map((g) => ({ url: g.image_url ?? '', caption: g.name || undefined })),
    },
    {
      group: 'イベントサイト：アーカイブ',
      items: (pc?.archive?.gallery ?? []).map((url) => ({ url })),
    },
    {
      group: '管理情報：出店要項',
      items: (adminInfo?.guidelines_image_urls ?? []).map((url) => ({ url })),
    },
  ]

  // 2. 空の URL と、すでに前のグループで出た URL を取り除く
  const seen = new Set<string>()
  const result: EventImageGroup[] = []
  for (const c of candidates) {
    const items = c.items.filter((item) => {
      const url = item.url.trim()
      if (!url || seen.has(url)) return false
      seen.add(url)
      return true
    })
    // 3. 1枚も残らなかったグループは表示しないので結果に入れない
    if (items.length > 0) result.push({ group: c.group, items })
  }
  return result
}

/**
 * URL のパス末尾（クエリ・ハッシュを除く）から拡張子を取り出す
 * @param url - 画像の URL
 * @returns 小文字の拡張子。取れなければ null
 */
function extFromUrl(url: string): string | null {
  let path: string
  try {
    // 相対 URL でも解釈できるようにダミーの基準 URL を与える
    path = new URL(url, 'http://localhost').pathname
  } catch {
    path = url.split(/[?#]/)[0]
  }
  const last = path.split('/').pop() ?? ''
  const dot = last.lastIndexOf('.')
  if (dot <= 0 || dot === last.length - 1) return null
  const ext = last.slice(dot + 1).toLowerCase()
  // 英数字以外を含むものは拡張子とみなさない（例: "photo.v2-final" のような名前）
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : null
}

/**
 * ダウンロード時のファイル名を作る（例: 「春の植物市_03.jpg」）
 * @param eventName - イベント名。ファイル名に使えない文字 \ / : * ? " < > | と改行は _ に置き換える
 * @param index - ページ全体での通し番号（1始まり）。2桁に0埋めする
 * @param url - 画像の URL。パス末尾から拡張子を取る
 * @param mimeType - blob の MIME タイプ。URL から拡張子が取れなかったときに使う
 * @returns ファイル名
 */
export function buildImageFileName(eventName: string, index: number, url: string, mimeType?: string): string {
  // 1. イベント名からファイル名に使えない文字を取り除く
  const safeName = eventName.replace(/[\\/:*?"<>|\r\n]/g, '_')
  // 2. 通し番号を2桁にする
  const num = String(index).padStart(2, '0')
  // 3. 拡張子は URL → MIME タイプ → jpg の順で決める
  const ext = extFromUrl(url) ?? (mimeType ? MIME_TO_EXT[mimeType.toLowerCase()] : undefined) ?? 'jpg'
  return `${safeName}_${num}.${ext}`
}

/**
 * 画像を取得してブラウザに保存させる
 * Supabase Storage の公開 URL は別オリジンのため <a download> だけでは保存されず、
 * いったん blob にしてからオブジェクト URL 経由で保存させる
 * @param url - 画像の URL
 * @param eventName - ファイル名に使うイベント名
 * @param index - 通し番号（1始まり）
 * @throws 取得に失敗した場合（レスポンスが ok でない場合も含む）
 */
async function downloadImage(url: string, eventName: string, index: number): Promise<void> {
  // 1. 画像を取得して blob にする
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  // 2. 一時的な a 要素に download 属性を付けてクリックする
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = buildImageFileName(eventName, index, url, blob.type)
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 3. クリック直後に解放すると保存が始まらないブラウザがあるため少し待ってから解放する
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

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
 */
export default function AdminEventImages() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  // 遷移元のパス。未設定時はイベント一覧へ戻る
  const backTo: string = (location.state as { from?: string } | null)?.from ?? '/admin/events'

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
  // ページ全体での通し番号。グループをまたいで 1 から振る
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
                  const index = counter
                  const isDownloading = downloading.has(index)
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
