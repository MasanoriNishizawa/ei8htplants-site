/*
 * 管理画面で、API の失敗を画面に出す日本語の文言にする関数
 *
 * api.ts は失敗時に ApiError（status と detail を持つ）を投げる。ここでステータスごとに分かりやすい文言にする
 * - 401: ログインの期限切れ
 * - 404: 見つからない（ほかの画面・別の人が削除した可能性）
 * - 422: 入力チェックで弾かれた（FastAPI の detail は英語の配列なので、項目名と内容を日本語にする）
 * - 400・409 など: サーバーの detail（日本語の文言を返している）をそのまま出す
 */
import { ApiError } from '../../lib/api'

/** 422 の detail の1項目（FastAPI / pydantic の形） */
interface ValidationIssue {
  /** エラーの場所（例: ['body', 'price']） */
  loc?: (string | number)[]
  /** 英語の説明 */
  msg?: string
  /** エラーの種類（例: 'greater_than_equal'） */
  type?: string
  /** 条件の値（例: { ge: 0 }） */
  ctx?: Record<string, unknown>
}

/** API の項目名 → 画面での名前。ここに無い項目は項目名をそのまま出す */
const FIELD_LABELS: Record<string, string> = {
  name: '名前',
  title: 'タイトル',
  price: '価格',
  stock: '在庫数',
  category: 'カテゴリー',
  status: 'ステータス',
  participants: '人数',
  email: 'メールアドレス',
  question: '質問',
  answer: '回答',
  sort_order: '表示順',
  display_order: '表示順',
  start_date: '開始日',
  end_date: '終了日',
  location: '会場名',
  max_participants: '定員',
  time_label: '時間',
}

/**
 * 422 の1項目を「価格: 0 以上にしてください」の形にする
 * @param issue - detail の1項目
 * @returns 表示用の文言
 */
function describeIssue(issue: ValidationIssue): string {
  // 1. 項目名（loc の最後の文字列。'body' だけなら名前なし）
  /** 項目名（例: 'price'）。場所が 'body' だけのときは undefined */
  const key = [...(issue.loc ?? [])].reverse().find((v): v is string => typeof v === 'string' && v !== 'body')
  /** 画面での項目名（例: '価格'）。項目名が無ければ空文字 */
  const label = key ? (FIELD_LABELS[key] ?? key) : ''
  // 2. 種類ごとの文言
  /** 条件の値（例: { ge: 0 }） */
  const ctx = issue.ctx ?? {}
  /** 種類ごとの説明の文言 */
  let text: string
  switch (issue.type) {
    case 'missing':
    case 'string_too_short':
      text = '入力してください'
      break
    case 'greater_than_equal':
      text = `${String(ctx.ge)} 以上にしてください`
      break
    case 'greater_than':
      text = `${String(ctx.gt)} より大きくしてください`
      break
    case 'less_than_equal':
      text = `${String(ctx.le)} 以下にしてください`
      break
    case 'int_parsing':
    case 'int_type':
    case 'int_from_float':
      text = '整数を入れてください'
      break
    case 'string_too_long':
      text = '長すぎます'
      break
    case 'literal_error':
    case 'enum':
    case 'value_error':
      text = '選べる値ではありません'
      break
    default:
      text = '値が正しくありません'
  }
  return label ? `${label}: ${text}` : text
}

/**
 * 失敗の値から、画面に出す文言を作る（括弧の中の理由は reasonOf で作る）
 * - ApiError ならステータスごとの文言にする（404・422・401 は専用の文言、それ以外は detail を出す）
 * - ログインの確認で投げた「401 Unauthorized」（ApiError ではない）もログイン切れの文言にする
 * - それ以外（通信の失敗など）は Error の message を出す
 * @param prefix - 何に失敗したか（例: '保存に失敗しました'）
 * @param e - 投げられた値
 * @returns 「保存に失敗しました（見つかりませんでした…）」の形の文言
 */
export function failMessage(prefix: string, e: unknown): string {
  return `${prefix}（${reasonOf(e)}）`
}

/**
 * 失敗の理由の部分だけを作る（failMessage の括弧の中）
 * @param e - 投げられた値
 * @returns 理由の文言
 */
export function reasonOf(e: unknown): string {
  // 1. API の失敗
  if (e instanceof ApiError) {
    if (e.status === 401) return 'ログインの期限が切れました。ログインし直してください'
    if (e.status === 404) return '見つかりませんでした（削除された可能性があります）'
    if (e.status === 422 && Array.isArray(e.detail)) {
      /** 項目ごとの日本語の文言 */
      const issues = (e.detail as ValidationIssue[]).map(describeIssue)
      return `入力内容を確認してください: ${issues.join('、')}`
    }
    if (typeof e.detail === 'string' && e.detail) return e.detail
    return e.message
  }
  // 2. ログインのトークンが無い
  if (e instanceof Error && e.message === '401 Unauthorized') return 'ログインの期限が切れました。ログインし直してください'
  // 3. そのほか
  return e instanceof Error ? e.message : String(e)
}

/**
 * ステータスコードを取り出す（ApiError でなければ null）
 * @param e - 投げられた値
 * @returns ステータスコード
 */
export function statusOf(e: unknown): number | null {
  return e instanceof ApiError ? e.status : null
}
