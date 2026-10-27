/*
 * 記事・商品の本文（ブロック形式）の型と、保存用の文字列との変換
 *
 * 本文は「見出し・テキスト・画像」のブロックの配列を JSON 文字列にして DB に保存している。
 * 公開ページ（Home・Journal・ShopProduct など）は表示だけに使うので、編集の部品（components/BlockEditor.tsx）とは分けている
 */

/** 本文の 1 ブロック（見出し・テキスト・画像） */
export type Block =
  | { type: 'heading'; value: string }
  | { type: 'text'; value: string }
  | { type: 'image'; url: string }

/**
 * 本文ブロックから、空でない画像 URL を元の並び順で取り出す
 * @param blocks - 画像 URL を抽出する本文ブロックの一覧
 * @returns 画像ブロックの URL 一覧
 */
export function blockImageUrls(blocks: Block[]): string[] {
  // 1. 画像ブロックだけを選び、空でない URL を順序を保って返す
  return blocks.flatMap((block) => (block.type === 'image' && block.url ? [block.url] : []))
}

/**
 * JSON から読んだ値が、本文のブロックとして使える形かを確かめる型ガード
 * （DB の値が壊れていたり古い形だったりしても、表示・編集の画面が落ちないようにする）
 * @param v - JSON.parse で読んだ配列の 1 要素
 * @returns 見出し・テキスト（value が文字列）か画像（url が文字列）なら true
 */
export function isBlock(v: unknown): v is Block {
  if (typeof v !== 'object' || v === null) return false
  // 種類ごとに必要な項目（見出し・テキストは value、画像は url）が文字列かを見る
  const { type, value, url } = v as { type?: unknown; value?: unknown; url?: unknown }
  if (type === 'heading' || type === 'text') return typeof value === 'string'
  if (type === 'image') return typeof url === 'string'
  return false
}

/**
 * ブロック配列を JSON 文字列にシリアライズする
 * @param blocks - シリアライズするブロック配列
 * @returns DB に保存する JSON 文字列
 */
export function serializeBlocks(blocks: Block[]): string {
  return JSON.stringify(blocks)
}

/**
 * ブロックからテキストを抽出して OGP ディスクリプション等に使う
 * @param blocks - ブロック配列
 * @param maxLen - 最大文字数（デフォルト120）
 * @returns 見出しと本文をつなげた文字列（改行は空白にする）
 */
export function blocksToText(blocks: Block[], maxLen = 120): string {
  // 見出しとテキストだけを取り出し、改行を空白にしてつなぎ、先頭から maxLen 文字にする
  return blocks
    .filter((b): b is Extract<Block, { type: 'text' | 'heading' }> => b.type === 'text' || b.type === 'heading')
    .map((b) => b.value.replace(/\n/g, ' '))
    .join(' ')
    .slice(0, maxLen)
}

/**
 * JSON 文字列またはレガシーテキスト形式をブロック配列にパースする
 * 1. JSON の配列として読めれば、ブロックの形をしている要素だけを返す
 * 2. 読めなければ昔のテキスト形式として扱い、「## 」で始まる行を見出し、それ以外の続く行をまとめて 1 つのテキストにする
 * @param content - JSON 文字列またはレガシー形式のテキスト（null/undefined は空配列を返す）
 * @returns ブロックの配列
 */
export function parseBlocks(content: string | null | undefined): Block[] {
  if (!content) return []
  // 1. JSON 形式
  try {
    const parsed: unknown = JSON.parse(content)
    if (Array.isArray(parsed)) return parsed.filter(isBlock)
  } catch { /* JSON でなければ昔の形式として読む */ }
  // 2. レガシー: ## 見出しテキストをブロックに変換
  // 変換したブロックを入れる配列
  const blocks: Block[] = []
  for (const line of content.split('\n')) {
    if (line.startsWith('## ')) {
      blocks.push({ type: 'heading', value: line.replace(/^## /, '') })
    } else if (line.trim()) {
      // 直前がテキストなら同じブロックに行を足し、そうでなければ新しいテキストのブロックにする
      const last = blocks[blocks.length - 1]
      if (last?.type === 'text') {
        last.value += '\n' + line
      } else {
        blocks.push({ type: 'text', value: line })
      }
    }
  }
  return blocks
}
