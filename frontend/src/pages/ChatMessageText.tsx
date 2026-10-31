/** 本文を URL とそれ以外に分ける正規表現。括弧で囲み、split の結果にも URL を残す */
const URL_SPLIT_RE = /(https?:\/\/[^\s]+)/g
/** URL 末尾に来やすい句読点・括弧類。リンクから外し、後ろに通常の文字として表示する */
const TRAILING_PUNCT = /[）」、。！？』】〕)\].,;:!?'"]+$/

/**
 * 1 行の本文に含まれる URL をリンクへ変換して返す
 * @param line - 変換する 1 行分の本文
 * @returns 文字列とリンクを並べた React 要素の配列
 */
function renderWithLinks(line: string) {
  // 1. URL と通常の文字列を交互に並べ、URL の前後の文字列も保持する
  const parts = line.split(URL_SPLIT_RE)
  return parts.flatMap((part, i) => {
    if (!part.startsWith('http')) return [<span key={i}>{part}</span>]
    // 2. URL 末尾の句読点を分離し、従来どおり URL 本体だけをリンクにする
    const url = part.replace(TRAILING_PUNCT, '')
    /** URL としてリンクにせず後ろへ表示する末尾の句読点 */
    const trailing = part.slice(url.length)
    // URL 部分を新しいタブで開くリンク要素にしたもの
    const link = <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecorationColor: 'currentColor' }}>{url}</a>
    return trailing ? [link, <span key={`${i}t`}>{trailing}</span>] : [link]
  })
}

/**
 * メッセージ本文を改行と URL に対応させて表示する
 * @param text - 表示するメッセージ本文
 * @returns URL をリンク化し、改行を反映した本文
 */
export default function ChatMessageText({ text }: { text: string }) {
  // 1. 本文を改行で分け、各行内の URL をリンクとして描画する
  const lines = text.split('\n')
  return (
    <span>
      {lines.map((line, i) => (
        <span key={i}>{renderWithLinks(line)}{i < lines.length - 1 && <br />}</span>
      ))}
    </span>
  )
}
