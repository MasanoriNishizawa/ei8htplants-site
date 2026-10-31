import { ApiError } from '../api'

/** useT() が返す翻訳関数（日本語と英語の文を受け取り、今の言語の方を返す） */
type Translate = (ja: string, en: string) => string

/**
 * 注文の送信に失敗したときに画面へ出す文言を作る。
 * ApiError の message は開発向けの形式なので表示せず、ステータスと detail から案内文を選ぶ。
 * 1. 429・422 は専用の文言を返す
 * 2. 402 は Square の説明があれば案内に添える
 * 3. 500・502 は detail の内容で決済状態に応じた案内を返す
 * 4. 409・404・400 は detail を優先し、それ以外は共通文を返す
 * @param err - catch で受け取った値
 * @param t - 現在の表示言語に合わせる翻訳関数
 * @returns 画面に表示する注文エラー文
 */
export function orderErrorMessage(err: unknown, t: Translate): string {
  // ステータスを判定できない通信エラーなどに使う共通の失敗文
  const fallback = t('注文処理に失敗しました。もう一度お試しください。', 'Order failed. Please try again.')
  // 1. ApiError 以外は詳細を分類できないため共通文を返す
  if (!(err instanceof ApiError)) return fallback

  // サーバーの説明は文字列だけを使い、422 の項目別配列は表示しない
  const detail = typeof err.detail === 'string' ? err.detail : ''
  /**
   * サーバー detail があれば優先し、なければ日本語の案内文を用いて翻訳する。
   * @param ja - 日本語表示で detail がない場合に使う案内文
   * @param en - 英語表示に使う案内文
   * @returns 現在の表示言語に合わせた案内文
   */
  const fromDetail = (ja: string, en: string): string => t(detail || ja, en)

  // 2. 回数制限・入力チェックは専用の案内文を返す
  if (err.status === 429) {
    return t('送信回数の上限に達しました。しばらく待ってからもう一度お試しください。', 'You have reached the submission limit. Please wait a while and try again.')
  }
  if (err.status === 422) {
    return t(
      '入力内容を確かめてください。お名前・メールアドレス・電話番号・ご住所・備考に誤りや長すぎる項目がないかご確認ください。',
      'Please check your entries. Make sure your name, email, phone number, address and notes are correct and not too long.',
    )
  }

  // 3. カードの決済失敗では、既定文と重複しない Square の説明だけを補足する
  if (err.status === 402) {
    /** 共通の日本語エラーに添える Square の説明（既定文と重複する場合は空） */
    const note = detail && detail !== '決済に失敗しました' ? `（${detail}）` : ''
    return t(
      `カードの決済ができませんでした。カード情報をご確認いただくか、別のカードをお試しください。${note}`,
      `Your card could not be charged. Please check your card details or try another card.${note ? ` (${detail})` : ''}`,
    )
  }

  // 4. サーバー・決済サービスの失敗は決済状態の説明を取り違えないよう detail を確認する
  if (err.status === 500) {
    // 支払い済みの場合は再注文を促さず問い合わせを案内する
    if (detail.includes('お支払いは完了')) {
      return fromDetail('', 'An error occurred while processing your order, but your payment has been completed. Please contact us via the contact page.')
    }
    return t('ただいまご注文を受け付けられません。時間をおいて再度お試しください。', 'We cannot accept orders right now. Please try again later.')
  }
  if (err.status === 502) {
    // 決済結果を確認できない場合は、二重払い防止のため問い合わせを案内する
    if (detail.includes('確認できませんでした')) {
      return fromDetail('', 'We could not confirm the payment result. To avoid a double charge, please contact us via the contact page before ordering again.')
    }
    return fromDetail('決済サービスでエラーが発生しました。時間をおいて再度お試しください。', 'A payment service error occurred. Please try again later.')
  }

  // 5. 購入できない商品・在庫不足などはステータス別の案内を返す
  if (err.status === 409) {
    return fromDetail('在庫が不足しています。カートの数量をご確認ください。', 'Some items are out of stock. Please check the quantities in your cart.')
  }
  if (err.status === 404) {
    return fromDetail('商品が見つかりません。カートの内容をご確認ください。', 'An item in your cart could not be found. Please check your cart.')
  }
  if (err.status === 400) {
    return fromDetail('ご注文の内容に購入できない商品やお届け先が含まれています。', 'Your order contains an item or shipping address that cannot be accepted.')
  }
  return fallback
}
