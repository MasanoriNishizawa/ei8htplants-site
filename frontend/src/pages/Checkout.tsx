import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api, ApiError, type Product } from '../lib/api'
import { orderErrorMessage } from '../lib/checkout/orderErrorMessage'
import { useCart } from '../lib/cart'
import { useT } from '../lib/lang'
import PageMeta from '../components/PageMeta'
import CheckoutOrderSummary from '../components/CheckoutOrderSummary'
import CheckoutCustomerFields, { type CheckoutCustomerFieldValues } from '../components/CheckoutCustomerFields'
import CheckoutPaymentSection from '../components/CheckoutPaymentSection'
import { formatYen } from '../lib/format'

/** Square のアプリケーション ID（.env の VITE_SQUARE_APP_ID。公開してよい値）。空なら決済フォームを読み込まない */
const SQUARE_APP_ID = import.meta.env.VITE_SQUARE_APP_ID ?? ''
/** Square のロケーション ID（.env の VITE_SQUARE_LOCATION_ID） */
const SQUARE_LOCATION_ID = import.meta.env.VITE_SQUARE_LOCATION_ID ?? ''
/** Square の環境（'production' なら本番、それ以外はテスト用の sandbox） */
const SQUARE_ENV = import.meta.env.VITE_SQUARE_ENVIRONMENT ?? 'sandbox'
/** Square Web Payments SDK の読み込み先 */
const SQUARE_SDK_URL = SQUARE_ENV === 'production'
  ? 'https://web.squarecdn.com/v1/square.js'
  : 'https://sandbox.web.squarecdn.com/v1/square.js'

/** Square のカード情報をトークンにした結果（使う項目だけ） */
interface SquareTokenResult {
  /** 結果（'OK' なら成功） */
  status: string
  /** 決済に使うトークン（成功時だけ） */
  token?: string
  /** 入力の誤りなど、失敗の理由 */
  errors?: { message: string }[]
}

/** Square のカード入力欄（使うメソッドだけ） */
interface SquareCard {
  /** 指定した要素の中にカード入力欄を作る */
  attach: (selector: string) => Promise<void>
  /** 入力されたカード情報をトークンにする */
  tokenize: () => Promise<SquareTokenResult>
  /** カード入力欄を片付ける */
  destroy?: () => void
}

/** Square の決済オブジェクト（使うメソッドだけ） */
interface SquarePayments {
  /** カード入力欄を作る（postalCode: false で郵便番号の欄を出さない） */
  card: (options?: { postalCode?: boolean }) => Promise<SquareCard>
}

declare global {
  interface Window {
    /** Square Web Payments SDK（square.js を読み込むと入る） */
    Square?: { payments: (appId: string, locationId: string) => SquarePayments }
  }
}

/**
 * 入力フォームの値（name: お名前、email: メール、phone: 電話（任意）、postalCode: 郵便番号、prefecture: 都道府県、
 * city: 市区町村、addressLine1: 番地・建物名、addressLine2: 建物名・部屋番号（任意）、note: 備考（任意））
 */
type FormState = CheckoutCustomerFieldValues

/** 入力フォームの初期値 */
const BLANK: FormState = {
  name: '', email: '', phone: '',
  postalCode: '', prefecture: '', city: '',
  addressLine1: '', addressLine2: '', note: '',
}

/**
 * 最新の商品情報と比べて分かった、カートの変更のお知らせ。
 * 文章ではなく種類と値で持ち、表示するときに今の言語で文章にする（言語を切り替えても追従させるため）
 * - soldout: 売り切れでカートから外した
 * - stock: 在庫が減ったので数量を在庫数まで減らした（stock: 今の在庫）
 * - price: 値段が変わった（oldPrice: カートに入れたときの値段、newPrice: 今の値段）
 * - removed: 商品が削除された（取り直しで 404）のでカートから外した
 * - unchecked: 通信の失敗などで最新の情報を確かめられなかった（カートには残す）
 */
type CartNotice =
  | { kind: 'soldout'; name: string }
  | { kind: 'removed'; name: string }
  | { kind: 'unchecked'; name: string }
  | { kind: 'stock'; name: string; stock: number }
  | { kind: 'price'; name: string; oldPrice: number; newPrice: number }

/** 送料の取得の状態（idle: 未選択か取得済み / loading: 取得中 / error: 取得に失敗） */
type ShippingStatus = 'idle' | 'loading' | 'error'

/**
 * 経過時間で失敗にする Promise を作る（Square の読み込みが固まったとき用）
 * @param p - 待つ Promise
 * @param ms - 待つ最大の時間（ミリ秒）
 * @returns p の結果。時間切れなら Error('timeout') で失敗する
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])
}

/**
 * Square 決済を使った注文手続きページ
 * @returns 注文手続きの画面（カートが空なら案内とショップへのリンク）
 */
export default function Checkout() {
  // 現在の表示言語に合わせて文言を選ぶ翻訳関数
  const t = useT()
  // カートの中身と、注文後に空にする・最新の商品情報で更新する関数
  const { items, clear, syncProducts, remove } = useCart()
  // 注文が済んだら完了ページへ移るため
  const navigate = useNavigate()
  // label と入力欄を結び付ける id の先頭部分（ページ内で重ならないようにする）
  const uid = useId()
  // Square のカード入力欄（読み込めたら入る）
  const cardRef = useRef<SquareCard | null>(null)
  // カード入力欄の準備ができたら true
  const [sdkReady, setSdkReady] = useState(false)
  // 入力フォームの値
  const [form, setForm] = useState<FormState>(BLANK)
  // 選んだ都道府県の送料（未選択・取得中・失敗のときは null）
  const [shippingFee, setShippingFee] = useState<number | null>(null)
  // 送料の取得の状態
  const [shippingStatus, setShippingStatus] = useState<ShippingStatus>('idle')
  // 送料の「再取得」を押した回数（取り直しのきっかけ）
  const [shippingRetry, setShippingRetry] = useState(0)
  // 注文の送信状態
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  // フォームの下に出すエラー文
  const [errorMsg, setErrorMsg] = useState('')
  // 最新の商品情報と比べて変わった点のお知らせ
  const [notices, setNotices] = useState<CartNotice[]>([])

  // ページを開いたときに 1 回だけ、カートの商品を最新の情報に取り直す。
  // 値段・名前・在庫をカートに反映し、画面の合計と実際の請求額がずれないようにする
  useEffect(() => {
    if (items.length === 0) return
    // 1. 開いた時点のカートを控える（比べる元）
    const snapshot = items
    // 画面を離れたあとに届いた結果は使わない
    let cancelled = false
    // 2. 商品ごとに最新の情報を取る。商品が削除されていた（404）ら 'gone'、通信の失敗などは null（カートからは消さない）
    Promise.all(snapshot.map((i) => api.products.get(i.product.id).catch((e: unknown): 'gone' | null =>
      e instanceof ApiError && e.status === 404 ? 'gone' : null,
    ))).then((results) => {
      if (cancelled) return
      // 取り直せた最新の商品
      const latest: Product[] = []
      // 見つかった変更のお知らせ
      const found: CartNotice[] = []
      // 3. 削除済み・確かめられなかった商品・売り切れ・在庫の減少・値段の変更を見つける
      results.forEach((p, idx) => {
        // 比べる元のカートの行
        const cartItem = snapshot[idx]
        // 削除された商品は注文できないのでカートから外して知らせる
        if (p === 'gone') {
          remove(cartItem.product.id)
          found.push({ kind: 'removed', name: cartItem.product.name })
          return
        }
        // 通信の失敗などはカートに残し、最新の情報を確かめられなかったことだけ知らせる
        if (!p) {
          found.push({ kind: 'unchecked', name: cartItem.product.name })
          return
        }
        latest.push(p)
        if (p.stock <= 0) {
          found.push({ kind: 'soldout', name: p.name })
          return
        }
        if (p.stock < cartItem.quantity) found.push({ kind: 'stock', name: p.name, stock: p.stock })
        if (p.price !== cartItem.product.price) {
          found.push({ kind: 'price', name: p.name, oldPrice: cartItem.product.price, newPrice: p.price })
        }
      })
      // 4. カートを最新の情報に置き換え、お知らせを出す
      syncProducts(latest)
      setNotices(found)
    })
    return () => { cancelled = true }
    // 開いたときの 1 回だけ確認する（カートを更新するたびに取り直すと、更新→取得→更新と繰り返してしまう）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Square Web Payments SDK を読み込み、カード入力欄を作る
  useEffect(() => {
    // ID が無ければ読み込まない（カード入力欄は「読み込み中」のまま）
    if (!SQUARE_APP_ID) return

    // Square は localhost では動かないので、開発中は案内だけ出す
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      setErrorMsg(t('Square決済はlocalhostでは動作しません。本番サイト（ei8htplants.com）でご確認ください。', 'Square payments do not work on localhost. Please visit the live site (ei8htplants.com) to test.'))
      return
    }

    // 画面を離れたら、読み込みの途中でも以降の処理をやめる
    let cancelled = false
    // SDK を読み込む script 要素
    const script = document.createElement('script')
    script.src = SQUARE_SDK_URL
    script.onload = async () => {
      if (cancelled) return
      try {
        // 1. Square の決済オブジェクトを作る
        if (!window.Square) throw new Error('Square SDK not loaded')
        /** この注文のカード入力欄を作る Square Payments インスタンス */
        const payments = window.Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID)
        // 2. カード入力欄を作る（画面を離れていたら片付ける）
        const card = await withTimeout(payments.card({ postalCode: false }), 10000)
        if (cancelled) { card.destroy?.(); return }
        // 3. 画面の入れ物に取り付ける
        await withTimeout(card.attach('#square-card-container'), 10000)
        if (cancelled) { card.destroy?.(); return }
        cardRef.current = card
        setSdkReady(true)
      } catch (e: unknown) {
        if (!cancelled) {
          // 時間切れとそれ以外で案内を分ける
          const msg = e instanceof Error && e.message === 'timeout'
            ? t('カード入力フォームの読み込みがタイムアウトしました。ページを再読み込みしてください。', 'Card form timed out. Please reload the page.')
            : t('カード入力フォームの読み込みに失敗しました。', 'Failed to load the card form.')
          setErrorMsg(msg)
        }
      }
    }
    script.onerror = () => { if (!cancelled) setErrorMsg(t('決済システムの読み込みに失敗しました。', 'Failed to load the payment system.')) }
    document.head.appendChild(script)
    // 画面を離れたらカード入力欄と script 要素を片付ける
    return () => {
      cancelled = true
      cardRef.current?.destroy?.()
      cardRef.current = null
      if (document.head.contains(script)) document.head.removeChild(script)
    }
    // SDK の読み込みはページを開いたときの 1 回だけ（言語の切り替えで読み込み直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 都道府県を変えたら送料を取り直す。素早く選び直したときに、前の都道府県の応答が後から届いても捨てる
  useEffect(() => {
    if (!form.prefecture) {
      setShippingFee(null)
      setShippingStatus('idle')
      return
    }
    // 都道府県を選び直したあとに届いた前の応答は使わない
    let cancelled = false
    setShippingFee(null)
    setShippingStatus('loading')
    api.shipping.getRate(form.prefecture)
      .then((r) => {
        if (cancelled) return
        setShippingFee(r.fee)
        setShippingStatus('idle')
      })
      .catch(() => {
        if (cancelled) return
        setShippingFee(null)
        setShippingStatus('error')
      })
    return () => { cancelled = true }
  }, [form.prefecture, shippingRetry])

  /**
   * お知らせ 1 件を今の言語の文章にする
   * @param n - お知らせ
   * @returns 表示する文章
   */
  const noticeText = (n: CartNotice): string => {
    if (n.kind === 'soldout') {
      return t(`「${n.name}」は売り切れのためカートから削除しました`, `"${n.name}" has been removed from your cart as it is sold out`)
    }
    if (n.kind === 'removed') {
      return t(`「${n.name}」は販売を終了したためカートから削除しました`, `"${n.name}" has been removed from your cart as it is no longer available`)
    }
    if (n.kind === 'unchecked') {
      return t(
        `「${n.name}」の最新の在庫・価格を確認できませんでした。通信状況をご確認のうえ、ページを再読み込みしてください`,
        `Could not check the latest stock and price of "${n.name}". Please check your connection and reload the page.`,
      )
    }
    if (n.kind === 'stock') {
      return t(`「${n.name}」の在庫が${n.stock}点になりました（数量を変更しました）`, `"${n.name}" now has only ${n.stock} in stock (quantity updated)`)
    }
    return t(
      `「${n.name}」の価格が ${formatYen(n.oldPrice)} から ${formatYen(n.newPrice)} に変わりました。合計は新しい価格で計算しています`,
      `The price of "${n.name}" has changed from ${formatYen(n.oldPrice)} to ${formatYen(n.newPrice)}. The total reflects the new price.`,
    )
  }

  // お知らせの枠。黄色の背景で、カートの変更を目立たせる
  const noticeBox = notices.length > 0 && (
    <div role="status" style={{ background: '#fff8e1', border: '1px solid #f0c040', padding: '16px 20px', marginBottom: 28, fontFamily: "'Noto Sans JP', sans-serif" }}>
      {notices.map((n, i) => (
        <p key={i} style={{ fontSize: 13, color: '#856404', margin: i === 0 ? 0 : '8px 0 0' }}>{noticeText(n)}</p>
      ))}
    </div>
  )

  // カートが空なら注文フォームの代わりに案内を出す
  if (items.length === 0) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center' }}>
        {/* 全部が売り切れでカートが空になったときも、理由が分かるようにお知らせを出す */}
        {noticeBox && <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'left' }}>{noticeBox}</div>}
        <p style={{ color: 'var(--c-muted)', marginBottom: 20 }}>{t('カートに商品がありません。', 'Your cart is empty.')}</p>
        <Link to="/official/shop" style={{ color: 'var(--c-ink)', fontSize: 13, letterSpacing: 1 }}>{t('ショップへ戻る', 'Go to Shop')}</Link>
      </div>
    )
  }

  /**
   * フォームの 1 項目を変える
   * @param k - 項目名
   * @param v - 新しい値
   * @returns 戻り値なし。
   */
  const set = <K extends keyof FormState>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v }))

  // 商品の小計（カートは最新の価格に更新済み）
  const subtotal = items.reduce((s, i) => s + i.product.price * i.quantity, 0)
  // 送料込みの合計（送料が未確定なら送料 0 として計算し、表示は「—」にする）
  const total = subtotal + (shippingFee ?? 0)

  /**
   * 注文を確定する（手順は中の「1. 2. …」のコメント）
   * @param e - フォームの送信イベント
   * @returns 戻り値なし。
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // 1. 送る前の確認（カード入力欄・送料）
    if (!cardRef.current || !sdkReady) {
      setErrorMsg(t('カード入力フォームが準備できていません。', 'The card form is not ready yet.'))
      return
    }
    // 送料が決まっていなければ、状態に合わせた案内を出して止める
    if (shippingFee === null) {
      setErrorMsg(
        shippingStatus === 'loading'
          ? t('送料を確認しています。少しお待ちください。', 'Calculating shipping. Please wait a moment.')
          : shippingStatus === 'error'
            ? t('送料を取得できませんでした。「送料を再取得」を押してください。', 'Could not get the shipping fee. Please press "Retry shipping".')
            : t('都道府県を選択してください。', 'Please select a prefecture.')
      )
      return
    }
    setStatus('loading')
    setErrorMsg('')
    try {
      // 2. カード情報を Square でトークンにする
      const result = await cardRef.current.tokenize()
      // 失敗したら Square の説明（無ければ共通の文）を出して止める
      if (result.status !== 'OK' || !result.token) {
        /** Square の詳細か共通文言を使うカード入力エラー */
        const msg = result.errors?.map((er) => er.message).join(' ') || t('カード情報が正しくありません。', 'Your card details are invalid.')
        setErrorMsg(msg)
        setStatus('idle')
        return
      }
      // 3. 注文を送る（金額はサーバーが商品の最新の価格で計算する）
      const { order_id } = await api.orders.create({
        customer_name: form.name,
        customer_email: form.email,
        customer_phone: form.phone || undefined,
        postal_code: form.postalCode,
        prefecture: form.prefecture,
        city: form.city,
        address_line1: form.addressLine1,
        address_line2: form.addressLine2 || undefined,
        note: form.note || undefined,
        items: items.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
        source_id: result.token,
      })
      // 4. カートを空にして完了ページへ
      clear()
      navigate('/official/order/complete', { state: { orderId: order_id, customerName: form.name, customerEmail: form.email } })
    } catch (err: unknown) {
      setErrorMsg(orderErrorMessage(err, t))
      setStatus('idle')
    }
  }

  // 見出し用（明朝体）の書体
  const SERIF = "'Cormorant Garamond', 'Noto Serif JP', serif"
  // 本文用（ゴシック体）の書体
  const SANS = "'Noto Sans JP', sans-serif"
  // ページの背景色（生成り）
  const BG = '#faf9f7'
  return (
    <>
      <PageMeta title={t('ご注文手続き', 'Checkout')} description={t('ご注文手続き', 'Checkout')} />
      <div style={{ background: BG, minHeight: '100vh' }}>

        {/* ヘッダー */}
        <div style={{ borderBottom: '1px solid #e8e3da', background: '#fff' }}>
          <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
            <p style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '3px', color: '#aaa', margin: '0 0 8px', textTransform: 'uppercase' }}>ei8ht plants</p>
            <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 300, margin: 0, color: '#1c1c1c', letterSpacing: '0.06em' }}>{t('ご注文手続き', 'Checkout')}</h1>
          </div>
        </div>

        <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px 80px' }}>

          {/* 売り切れ・在庫・価格の変更のお知らせ */}
          {noticeBox}

          {/* 左に入力フォーム、右に注文サマリーの 2 列。狭い画面では 1 列にしてサマリーをフォームの下に出す（index.css の .checkout-layout） */}
          <div className="checkout-layout">

            {/* フォーム（お客様情報・お届け先・お支払い） */}
            <form onSubmit={handleSubmit}>
              {/* お客様情報・お届け先の入力と表示を子コンポーネントへ委ね、値と送料連動は親で管理する */}
              <CheckoutCustomerFields
                values={form}
                uid={uid}
                t={t}
                onChange={(field, value) => set(field, value)}
              />

              {/* 決済表示は子へ委ねる。フォーム・Square SDK・注文送信の制御はこの親に残す */}
              <CheckoutPaymentSection
                sdkReady={sdkReady}
                errorMsg={errorMsg}
                status={status}
                total={total}
                t={t}
                serif={SERIF}
                sans={SANS}
              />
            </form>

            {/* 注文商品の表示専用サマリー。送料の取得・計算は親画面で行う */}
            <CheckoutOrderSummary
              items={items}
              subtotal={subtotal}
              total={total}
              prefecture={form.prefecture}
              shippingFee={shippingFee}
              shippingStatus={shippingStatus}
              onRetryShipping={() => setShippingRetry((n) => n + 1)}
              t={t}
              serif={SERIF}
              sans={SANS}
            />
          </div>
        </div>
      </div>
    </>
  )
}
