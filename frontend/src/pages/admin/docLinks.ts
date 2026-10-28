/*
 * 管理画面「設計書」（AdminDocs.tsx）で、Markdown から作った HTML の中のリンクと見出しを整える関数
 *
 * 設計書の中のリンクは「../02_DD/06_API仕様.md#見出し」のような、doc/ の中の相対パスで書かれている。
 * そのまま押すと /admin/02_DD/... に移動してしまい何も出ないため、次のように書き換える
 * - .md へのリンク: 開いているファイルの場所からのパスに直して data-doc-path（と data-doc-anchor）に入れる。
 *   画面はクリックを受け取り、移動せずにそのファイルを開く
 * - 外部リンク（http・https）: 新しいタブで開く（target="_blank" rel="noopener noreferrer"）
 * - 同じファイルの中の見出しへのリンク（#見出し）: data-doc-anchor に入れ、画面がその見出しまでスクロールする
 * - それ以外の相対パス（ソースコードなど設計書の外のファイル）: 管理画面では開けないので href を外す
 * 見出しには GitHub と同じ規則の id を付け、#見出し のリンク先として使えるようにする
 *
 * DOMPurify で無害化したあとの HTML に対して使う（無害化の前に属性を足すと、無害化で消されたり意味が変わったりするため）
 */

/** .md へのリンクの行き先 */
export interface DocLinkTarget {
  /** doc/ からの相対パス（例: '02_DD/06_API仕様.md'） */
  path: string
  /** 見出しの id（# の後ろ。無ければ空文字） */
  anchor: string
}

/** 外部のページへのリンクとみなす URL の始まり */
const EXTERNAL_RE = /^(https?:)?\/\//i

/** 外部のアプリを開くリンク（メール・電話）の始まり。そのまま残す */
const SCHEME_RE = /^(mailto|tel):/i

/**
 * パーセントエンコードされた文字列を元に戻す（壊れたエンコードはそのまま返す）
 * marked はリンク先の日本語を %E8... の形にするため、ファイル名と比べる前に戻す
 * @param s - 文字列
 * @returns 戻した文字列
 */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/**
 * 開いているファイルの場所を基準に、相対パスを doc/ からのパスにする
 * 例: resolveRelative('01_BD/pages/admin/02_Events.md', '../../features/01_認証.md') → '01_BD/features/01_認証.md'
 * @param currentPath - 開いているファイルの doc/ からのパス
 * @param relative - リンクに書かれた相対パス（# より前）
 * @returns doc/ からのパス。doc/ より上に出てしまう場合は null
 */
export function resolveRelative(currentPath: string, relative: string): string | null {
  // 1. 基準のフォルダ（ファイル名を除いた部分）。「/」で始まるパスは doc/ の直下から数える
  const parts = relative.startsWith('/') ? [] : currentPath.split('/').slice(0, -1)
  // 2. 「.」は飛ばし、「..」は 1 つ上がる
  for (const seg of relative.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (parts.length === 0) return null
      parts.pop()
    } else {
      parts.push(seg)
    }
  }
  return parts.join('/')
}

/**
 * リンク先が設計書（.md）なら、その行き先を返す
 * @param currentPath - 開いているファイルの doc/ からのパス
 * @param href - a 要素の href の値
 * @returns 行き先。外部リンク・.md 以外・doc/ の外を指すときは null
 */
export function docLinkTarget(currentPath: string, href: string): DocLinkTarget | null {
  if (!href || EXTERNAL_RE.test(href) || SCHEME_RE.test(href) || href.startsWith('#')) return null
  /** href の中の「#」の位置（無ければ -1） */
  const hashAt = href.indexOf('#')
  /** # より前のパス（エンコードされたまま） */
  const rawPath = hashAt >= 0 ? href.slice(0, hashAt) : href
  /** # より後ろの見出しの id（エンコードされたまま） */
  const rawAnchor = hashAt >= 0 ? href.slice(hashAt + 1) : ''
  // クエリ（?…）は設計書のパスには無いので外して比べる
  const pathPart = safeDecode(rawPath.split('?')[0])
  if (!/\.md$/i.test(pathPart)) return null
  // 現在の設計書から相対パスを解決し、doc/ の外へ出ないか確認する。
  const path = resolveRelative(currentPath, pathPart)
  if (path === null) return null
  return { path, anchor: safeDecode(rawAnchor) }
}

/**
 * 見出しの文字から、GitHub と同じ規則の id を作る（小文字にし、記号を除き、空白を - にする）
 * 例: 'API の一覧 (v2)' → 'api-の一覧-v2'
 * @param text - 見出しの文字
 * @returns id
 */
export function headingSlug(text: string): string {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')
}

/**
 * 無害化したあとの HTML の、リンクと見出しを整える
 * 1. 見出し（h1〜h6）に id を付ける（同じ文字の見出しが続くときは -1・-2 を付けて重ならないようにする）
 * 2. リンクを種類ごとに書き換える（このファイルの先頭の説明を参照）
 * @param html - DOMPurify で無害化した HTML
 * @param currentPath - 開いているファイルの doc/ からのパス
 * @returns 整えた HTML
 */
export function processDocLinks(html: string, currentPath: string): string {
  /** HTML を DOM として扱うための入れ物（template の中身は画面に出ず、スクリプトも動かない） */
  const template = document.createElement('template')
  template.innerHTML = html
  /** 書き換える DOM の根元 */
  const root = template.content

  // 1. 見出しの id
  /** 見出しの id のもと → これまでに使った回数 */
  const used = new Map<string, number>()
  root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
    // 見出し文字列から ID の基礎を作り、空の見出しは対象外にする。
    const base = headingSlug(h.textContent ?? '')
    if (!base) return
    // 同じ基礎 ID が何回目かを数え、重複を避ける。
    const count = used.get(base) ?? 0
    used.set(base, count + 1)
    h.id = count === 0 ? base : `${base}-${count}`
  })

  // 2. リンク
  root.querySelectorAll('a[href]').forEach((a) => {
    // href を読み取り、外部・ページ内・設計書内リンクの順で種類を判定する。
    const href = a.getAttribute('href') ?? ''
    if (EXTERNAL_RE.test(href)) {
      // 外部リンクは新しいタブで開く（開いた先から元の画面を操作されないよう noopener）
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener noreferrer')
      return
    }
    if (SCHEME_RE.test(href)) return
    if (href.startsWith('#')) {
      a.setAttribute('data-doc-anchor', safeDecode(href.slice(1)))
      return
    }
    // 設計書内の Markdown リンクなら、管理画面で開くための情報を付与する。
    const target = docLinkTarget(currentPath, href)
    if (target) {
      a.setAttribute('data-doc-path', target.path)
      if (target.anchor) a.setAttribute('data-doc-anchor', target.anchor)
      return
    }
    // 設計書の外のファイル（ソースコードなど）は管理画面では開けないので、押しても移動しないようにする
    a.removeAttribute('href')
    a.setAttribute('title', `設計書の外のファイルのため、ここでは開けません（${safeDecode(href)}）`)
  })

  return template.innerHTML
}
