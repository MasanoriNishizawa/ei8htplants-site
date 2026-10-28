/*
 * イベント画像の一覧（AdminEventImages）で使う、画像の集め方とダウンロードの関数
 * 部品のファイル（EventImages.tsx）から分けて、開発中の画面の自動更新（Fast Refresh）が効くようにしている
 */
import type { Event, EventAdminInfo } from '../../lib/api'
import { saveBlob } from './saveBlob'

/** 画像1枚分の情報。url は元画像の URL、caption はカードに表示する補足（ラインナップ名・ゲスト名など） */
export interface EventImageItem {
  /** 元画像の URL */
  url: string
  /** カードに表示する補足（ラインナップ名・ゲスト名など。無ければ省略） */
  caption?: string
}

/** 出どころ（イベント画像・イベントサイトの各セクション）ごとにまとめた画像のグループ */
export interface EventImageGroup {
  /** グループの見出し（例: 'イベントサイト：ゲスト'） */
  group: string
  /** このグループの画像（表示順） */
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
  /** イベントサイトの内容（無いイベントもある） */
  const pc = ev.page_content
  /** 重複を除く前の、出どころごとの画像の候補 */
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
  /** すでに出た画像の URL（前のグループに出たものは後のグループから外す） */
  const seen = new Set<string>()
  /** 表示するグループの一覧 */
  const result: EventImageGroup[] = []
  for (const c of candidates) {
    // 空 URL と前のグループですでに使われた URL を除外する。
    const items = c.items.filter((item) => {
      // 空白を除いた値を表示・重複判定に使う。
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
  /** URL のパス部分（クエリ・ハッシュを除く） */
  let path: string
  try {
    // 相対 URL でも解釈できるようにダミーの基準 URL を与える
    path = new URL(url, 'http://localhost').pathname
  } catch {
    path = url.split(/[?#]/)[0]
  }
  /** パスの最後の部分（ファイル名） */
  const last = path.split('/').pop() ?? ''
  /** ファイル名の最後の「.」の位置（先頭・末尾にあるときは拡張子なし扱い） */
  const dot = last.lastIndexOf('.')
  if (dot <= 0 || dot === last.length - 1) return null
  // 最後のピリオドより後ろを拡張子として、小文字へそろえる。
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
 * @throws 取得に失敗した場合（レスポンスが ok でない場合も含む）
 * @param url - 画像の URL
 * @param eventName - ファイル名に使うイベント名
 * @param index - 通し番号（1始まり）
 * @returns 保存の操作を始めたら終わる Promise
 */
export async function downloadImage(url: string, eventName: string, index: number): Promise<void> {
  // 1. 画像を取得して blob にする
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  // 画像データを Blob にし、ブラウザー保存処理へ渡す。
  const blob = await res.blob()
  // 2. ファイル名を付けて保存させる（オブジェクト URL は共通の関数が少し待ってから解放する）
  saveBlob(blob, buildImageFileName(eventName, index, url, blob.type))
}
