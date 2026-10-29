// @vitest-environment-options {"url": "https://ei8htplants.com/official/checkout"}
/**
 * 注文手続き（pages/Checkout.tsx）のテスト
 * - 注文の送信に失敗したときのステータスごとの文言（orderErrorMessage）を、画面の操作を通して確かめる
 *   422・402・409/400/404（日本語はサーバーの detail）・429・500（「お支払いは完了」）・ほかの 500・
 *   502（「確認できませんでした」）・ほかの 502・通信の失敗、英語表示
 * - お客様情報・住所入力欄の必須属性、ラベル、入力形式、自動補完、表示順
 * - controlled state に入力した全項目が注文 payload に反映されること
 * - 各入力欄の maxLength（lib/constants の INPUT_MAX_LENGTH）
 *
 * Square の決済フォームは本物を読み込まない。
 * 1. jsdom の URL を本番のホスト名にして（先頭の @vitest-environment-options）、localhost の案内に入らないようにする
 * 2. VITE_SQUARE_APP_ID を vi.stubEnv で入れてから Checkout を読み込む（ID はモジュールを読むときに決まるため）
 * 3. window.Square をモックにし、画面が足した SDK の script 要素の onload を手で呼ぶ（jsdom は外部の script を読まない）
 * api（商品の取り直し・送料・注文）はモックにして本番には接続しない
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { ComponentType } from 'react'
import { api, ApiError, type Product } from '../../lib/api'
import { LangProvider } from '../../lib/lang'
import { CartProvider } from '../../lib/cart'
import { CART_STORAGE_KEY } from '../../lib/cartContext'
import CheckoutOrderSummary from '../../components/CheckoutOrderSummary'
import type { CartItem } from '../../lib/cart'

// 使う api の関数だけをモックする（ApiError などの実装はそのまま）
vi.mock('../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../lib/api')>()
  return {
    ...actual,
    api: {
      products: { get: vi.fn() },
      shipping: { getRate: vi.fn(), getPrefectures: vi.fn() },
      orders: { create: vi.fn() },
    },
  }
})

/** カートに入れる商品 */
const PRODUCT: Product = {
  id: 'p-1', name: '鉢 S', description: null, price: 3800, stock: 5, image_urls: [], tags: [],
  is_published: true, display_order: 1, category: null, created_at: '2026-01-01T00:00:00Z',
} as Product

/** stubEnv のあとに読み込む Checkout の部品 */
let Checkout: ComponentType

beforeAll(async () => {
  // Square の ID を入れてから読み込む
  vi.stubEnv('VITE_SQUARE_APP_ID', 'sandbox-app-id')
  vi.stubEnv('VITE_SQUARE_LOCATION_ID', 'loc-id')
  Checkout = (await import('../Checkout')).default
  // Square SDK のモック（カード入力欄は常にトークンを返す）
  const card = {
    attach: vi.fn().mockResolvedValue(undefined),
    tokenize: vi.fn().mockResolvedValue({ status: 'OK', token: 'tok-1' }),
    destroy: vi.fn(),
  }
  ;(window as unknown as { Square: unknown }).Square = { payments: () => ({ card: () => Promise.resolve(card) }) }
})

afterAll(() => {
  vi.unstubAllEnvs()
  delete (window as unknown as { Square?: unknown }).Square
})

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('site-lang', 'ja')
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([{ product: PRODUCT, quantity: 1 }]))
  vi.mocked(api.products.get).mockReset().mockResolvedValue(PRODUCT)
  vi.mocked(api.shipping.getRate).mockReset().mockResolvedValue({ fee: 800 })
  vi.mocked(api.orders.create).mockReset()
})

/**
 * 注文手続きを開き、Square の読み込みを済ませる
 * @returns render の結果
 */
async function renderCheckout() {
  const result = render(
    <LangProvider>
      <CartProvider>
        <MemoryRouter initialEntries={['/official/checkout']}>
          <Routes>
            <Route path="/official/checkout" element={<Checkout />} />
            <Route path="/official/order/complete" element={<p>注文完了</p>} />
          </Routes>
        </MemoryRouter>
      </CartProvider>
    </LangProvider>,
  )
  // 画面が足した SDK の script の onload を呼んで、カード入力欄を用意させる
  const script = await waitFor(() => {
    const s = Array.from(document.head.querySelectorAll('script')).find((el) => el.src.includes('squarecdn'))
    if (!s) throw new Error('SDK の script がまだ無い')
    return s
  })
  await act(async () => { await (script.onload as () => Promise<void>)() })
  return result
}

/**
 * 必須項目を入れて注文を送る（英語表示でも同じ入力欄の順に入れる）
 * @param includeOptional - 電話・建物名・備考も入力する場合は true
 * @returns なし
 */
async function fillAndSubmit(includeOptional = true) {
  const { container } = await renderCheckout()
  // 1. 入力欄（id の末尾で探す。言語に左右されない）
  /**
   * 項目 ID の末尾を指定して、対応するフォーム入力欄を取得する。
   * @param suffix - 項目名の末尾文字列
   * @returns 一致する入力要素
   * @throws 入力欄が見つからない場合
   */
  const field = (suffix: string) => {
    const input = container.querySelector(`[id$="-${suffix}"]`)
    if (!input) throw new Error(`入力欄が見つかりません: ${suffix}`)
    return input
  }
  fireEvent.change(field('name'), { target: { value: '山田 花子' } })
  fireEvent.change(field('email'), { target: { value: 'hanako@example.com' } })
  if (includeOptional) {
    fireEvent.change(field('phone'), { target: { value: '090-1234-5678' } })
  }
  fireEvent.change(field('postal'), { target: { value: '150-0001' } })
  fireEvent.change(field('prefecture'), { target: { value: '東京都' } })
  fireEvent.change(field('city'), { target: { value: '渋谷区' } })
  fireEvent.change(field('address1'), { target: { value: '神宮前1-1-1' } })
  if (includeOptional) {
    fireEvent.change(field('address2'), { target: { value: '植物ビル 301号室' } })
    fireEvent.change(field('note'), { target: { value: '平日の午後に配達希望' } })
  }
  // 2. 送料が決まってから送る
  await waitFor(() => expect(api.shipping.getRate).toHaveBeenCalledWith('東京都'))
  await act(async () => {})
  fireEvent.submit(container.querySelector('form')!)
}

/**
 * 注文の API を指定のエラーで失敗させて送り、出た文言を返す
 * @param err - 投げるエラー
 * @returns role="alert" の文言
 */
async function errorTextFor(err: unknown): Promise<string> {
  vi.mocked(api.orders.create).mockRejectedValue(err)
  await fillAndSubmit()
  await waitFor(() => expect(api.orders.create).toHaveBeenCalled())
  const alert = await screen.findByText((_, el) => el?.getAttribute('role') === 'alert' && (el.textContent ?? '').length > 0)
  return alert.textContent ?? ''
}

describe('Checkout の注文の失敗の文言（日本語）', () => {
  it('成功すると注文を送り、完了ページへ移る', async () => {
    vi.mocked(api.orders.create).mockResolvedValue({ order_id: 'o-1' } as never)
    await fillAndSubmit()
    expect(await screen.findByText('注文完了')).toBeInTheDocument()
    expect(vi.mocked(api.orders.create).mock.calls[0][0]).toMatchObject({
      customer_name: '山田 花子',
      customer_email: 'hanako@example.com',
      customer_phone: '090-1234-5678',
      postal_code: '150-0001',
      prefecture: '東京都',
      city: '渋谷区',
      address_line1: '神宮前1-1-1',
      address_line2: '植物ビル 301号室',
      note: '平日の午後に配達希望',
      source_id: 'tok-1',
    })
  })

  it('任意項目が未入力なら注文 payload で undefined となり、JSON 送信時に省略される', async () => {
    vi.mocked(api.orders.create).mockResolvedValue({ order_id: 'o-2' } as never)
    // 1. 任意項目は空欄のまま、必須項目を埋めて注文する
    await fillAndSubmit(false)
    expect(await screen.findByText('注文完了')).toBeInTheDocument()

    // 2. 親の controlled state から作られた payload と JSON 化後の省略を確認する
    const payload = vi.mocked(api.orders.create).mock.calls[0][0]
    expect(payload.customer_phone).toBeUndefined()
    expect(payload.address_line2).toBeUndefined()
    expect(payload.note).toBeUndefined()
    const serializedPayload = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>
    expect(serializedPayload).not.toHaveProperty('customer_phone')
    expect(serializedPayload).not.toHaveProperty('address_line2')
    expect(serializedPayload).not.toHaveProperty('note')
  })

  it('422 は入力の確認をうながす文言になる', async () => {
    expect(await errorTextFor(new ApiError(422, '422', []))).toBe(
      '入力内容を確かめてください。お名前・メールアドレス・電話番号・ご住所・備考に誤りや長すぎる項目がないかご確認ください。',
    )
  })

  it('402 はカードの決済ができなかった文言に、Square の説明を括弧で添える', async () => {
    expect(await errorTextFor(new ApiError(402, '402', 'CARD_DECLINED'))).toBe(
      'カードの決済ができませんでした。カード情報をご確認いただくか、別のカードをお試しください。（CARD_DECLINED）',
    )
  })

  it('402 で detail が「決済に失敗しました」なら括弧の補足は付けない', async () => {
    expect(await errorTextFor(new ApiError(402, '402', '決済に失敗しました'))).toBe(
      'カードの決済ができませんでした。カード情報をご確認いただくか、別のカードをお試しください。',
    )
  })

  it.each([
    [409, '在庫が足りません（鉢 S）'],
    [400, 'この商品は購入できません'],
    [404, '商品が見つかりません'],
  ])('%i は日本語表示ではサーバーの detail をそのまま出す', async (status, detail) => {
    expect(await errorTextFor(new ApiError(status, `${status}`, detail))).toBe(detail)
  })

  it('409 で detail が無いときは在庫不足の既定の文言になる', async () => {
    expect(await errorTextFor(new ApiError(409, '409', null))).toBe('在庫が不足しています。カートの数量をご確認ください。')
  })

  it('429 は送信回数の上限の文言になる', async () => {
    expect(await errorTextFor(new ApiError(429, '429', 'rate'))).toBe('送信回数の上限に達しました。しばらく待ってからもう一度お試しください。')
  })

  it('500 で detail に「お支払いは完了」を含むときは、その detail をそのまま出す（二重払いを防ぐ）', async () => {
    const detail = '注文の登録中にエラーが発生しましたが、お支払いは完了しています。お問い合わせください。'
    expect(await errorTextFor(new ApiError(500, '500', detail))).toBe(detail)
  })

  it('ほかの 500 は「ただいまご注文を受け付けられません」になる', async () => {
    expect(await errorTextFor(new ApiError(500, '500', 'Internal Server Error'))).toBe('ただいまご注文を受け付けられません。時間をおいて再度お試しください。')
  })

  it('502 で detail に「確認できませんでした」を含むときは、その detail をそのまま出す', async () => {
    const detail = '決済の結果を確認できませんでした。再度注文する前にお問い合わせください。'
    expect(await errorTextFor(new ApiError(502, '502', detail))).toBe(detail)
  })

  it('ほかの 502 は日本語表示ではサーバーの detail を出す（無ければ決済サービスのエラーの文言）', async () => {
    expect(await errorTextFor(new ApiError(502, '502', null))).toBe('決済サービスでエラーが発生しました。時間をおいて再度お試しください。')
  })

  it('通信そのものの失敗（ApiError でない）は共通の失敗の文言になり、また送れる', async () => {
    expect(await errorTextFor(new TypeError('Failed to fetch'))).toBe('注文処理に失敗しました。もう一度お試しください。')
    expect(screen.getByRole('button', { name: /注文を確定する/ })).toBeEnabled()
  })
})

describe('Checkout の注文の失敗の文言（英語）', () => {
  beforeEach(() => {
    localStorage.setItem('site-lang', 'en')
  })

  it.each([
    [422, [], 'Please check your entries. Make sure your name, email, phone number, address and notes are correct and not too long.'],
    [409, '在庫が足りません', 'Some items are out of stock. Please check the quantities in your cart.'],
    [404, '商品が見つかりません', 'An item in your cart could not be found. Please check your cart.'],
    [400, '購入できません', 'Your order contains an item or shipping address that cannot be accepted.'],
    [429, 'rate', 'You have reached the submission limit. Please wait a while and try again.'],
    [500, 'お支払いは完了しています', 'An error occurred while processing your order, but your payment has been completed. Please contact us via the contact page.'],
    [500, 'Internal', 'We cannot accept orders right now. Please try again later.'],
    [502, '決済の結果を確認できませんでした', 'We could not confirm the payment result. To avoid a double charge, please contact us via the contact page before ordering again.'],
    [502, 'gateway', 'A payment service error occurred. Please try again later.'],
  ])('%i（detail: %j）は英語の文言になり、日本語の detail は出さない', async (status, detail, expected) => {
    expect(await errorTextFor(new ApiError(status as number, `${status}`, detail))).toBe(expected)
  })

  it('402 は英語の文言に Square の説明を括弧で添える', async () => {
    expect(await errorTextFor(new ApiError(402, '402', 'CARD_DECLINED'))).toBe(
      'Your card could not be charged. Please check your card details or try another card. (CARD_DECLINED)',
    )
  })

  it('通信の失敗は「Order failed. Please try again.」になる', async () => {
    expect(await errorTextFor(new Error('network'))).toBe('Order failed. Please try again.')
  })
})

describe('Checkout の入力欄の maxLength', () => {
  it('お名前 100・電話 30・郵便番号 10・市区町村 100・番地 200・建物名 200・備考 2000', async () => {
    const { container } = await renderCheckout()
    /**
     * 項目 ID の末尾を指定して、入力欄の maxLength 属性を取得する。
     * @param suffix - 項目名の末尾文字列
     * @returns maxLength 属性値。属性がない場合は null
     */
    const max = (suffix: string) => container.querySelector(`[id$="-${suffix}"]`)!.getAttribute('maxLength')
    expect(max('name')).toBe('100')
    expect(max('phone')).toBe('30')
    expect(max('postal')).toBe('10')
    expect(max('city')).toBe('100')
    expect(max('address1')).toBe('200')
    expect(max('address2')).toBe('200')
    expect(max('note')).toBe('2000')
  })
})

describe('Checkout のお客様情報・お届け先の入力欄', () => {
  /**
   * お客様情報・住所欄の入力要件と読み上げ用ラベルの関連付けを確認する。
   * 1. 表示順と label の htmlFor が入力 id に対応することを確かめる。
   * 2. 必須・任意、入力形式、自動補完属性を確認する。
   * @returns 入力欄の画面確認が完了したときに解決する Promise
   */
  it('必須・任意、入力形式、自動補完、ラベルとの対応、表示順を保つ', async () => {
    const { container } = await renderCheckout()
    // 1. フォームの入力要素とラベルを id の末尾で特定する
    /**
     * 項目 ID の末尾を指定して、画面に表示された入力要素を取得する。
     * @param suffix - 項目名の末尾文字列
     * @returns 一致する入力要素。該当項目がない場合はテストを失敗させる
     */
    const field = (suffix: string) => {
      const control = container.querySelector(`[id$="-${suffix}"]`)
      if (!control) throw new Error(`入力欄が見つかりません: ${suffix}`)
      return control
    }
    const suffixes = ['name', 'email', 'phone', 'postal', 'prefecture', 'city', 'address1', 'address2', 'note']

    // 2. ラベルと各コントロールが id で結ばれ、指定した順序で並ぶことを確かめる
    const controls = Array.from(container.querySelectorAll('input[id], select[id], textarea[id]'))
    expect(controls.map((control) => control.id.slice(control.id.lastIndexOf('-') + 1))).toEqual(suffixes)
    for (const suffix of suffixes) {
      const control = field(suffix)
      expect(container.querySelector(`label[for="${control.id}"]`)).toHaveAttribute('for', control.id)
    }

    // 3. 必須属性と任意属性を区別する
    for (const suffix of ['name', 'email', 'postal', 'prefecture', 'city', 'address1']) {
      expect(field(suffix)).toBeRequired()
    }
    for (const suffix of ['phone', 'address2', 'note']) {
      expect(field(suffix)).not.toBeRequired()
    }

    // 4. メール・電話の入力形式とブラウザー自動補完を確かめる
    expect(field('email')).toHaveAttribute('type', 'email')
    expect(field('phone')).toHaveAttribute('type', 'tel')
    expect(field('name')).toHaveAttribute('autocomplete', 'name')
    expect(field('email')).toHaveAttribute('autocomplete', 'email')
    expect(field('phone')).toHaveAttribute('autocomplete', 'tel')
    expect(field('postal')).toHaveAttribute('autocomplete', 'postal-code')
  })
})

describe('CheckoutOrderSummary の注文内容表示', () => {
  /** 表示テストで使う2商品の注文内容 */
  const summaryItems: CartItem[] = [
    { product: PRODUCT, quantity: 1 },
    { product: { ...PRODUCT, id: 'p-2', name: '鉢 M', price: 5200 }, quantity: 2 },
  ]

  /**
   * 注文内容のテストデータを使って注文サマリーを描画する。
   * @param options - 表示に使うオプション
   * @returns React Testing Library が返す描画結果とクエリ関数。
   */
  function renderSummary(options?: {
    items?: CartItem[]
    subtotal?: number
    total?: number
    prefecture?: string
    shippingFee?: number | null
    shippingStatus?: 'idle' | 'loading' | 'error'
    onRetryShipping?: () => void
  }) {
    const language = localStorage.getItem('site-lang')
    return render(
      <CheckoutOrderSummary
        items={options?.items ?? summaryItems}
        subtotal={options?.subtotal ?? 14200}
        total={options?.total ?? 15000}
        prefecture={options?.prefecture ?? ''}
        shippingFee={options?.shippingFee !== undefined ? options.shippingFee : 800}
        shippingStatus={options?.shippingStatus ?? 'idle'}
        onRetryShipping={options?.onRetryShipping ?? vi.fn()}
        t={(ja, en) => language === 'en' ? en : ja}
        serif="serif"
        sans="sans-serif"
      />,
    )
  }

  it('複数商品の名前・数量・商品ごとの金額と、小計・送料・合計を表示する', () => {
    renderSummary()
    const summary = screen.getByText('ご注文内容').parentElement!.parentElement!

    expect(within(summary).getByText('鉢 S')).toBeInTheDocument()
    expect(within(summary).getByText('× 1')).toBeInTheDocument()
    expect(within(summary).getByText('¥3,800')).toBeInTheDocument()
    expect(within(summary).getByText('鉢 M')).toBeInTheDocument()
    expect(within(summary).getByText('× 2')).toBeInTheDocument()
    expect(within(summary).getByText('¥10,400')).toBeInTheDocument()
    expect(within(summary).getByText('小計')).toBeInTheDocument()
    expect(within(summary).getByText('¥14,200')).toBeInTheDocument()
    expect(within(summary).getByText('送料')).toBeInTheDocument()
    expect(within(summary).getByText('¥800')).toBeInTheDocument()
    expect(within(summary).getByText('合計')).toBeInTheDocument()
    expect(within(summary).getByText('¥15,000')).toBeInTheDocument()
  })

  it('送料が未確定なら送料と合計を「—」にし、都道府県選択後の案内を表示する', () => {
    renderSummary({ shippingFee: null, total: 14200 })
    const summary = screen.getByText('ご注文内容').parentElement!.parentElement!

    expect(within(summary).getAllByText('—')).toHaveLength(2)
    expect(within(summary).getByText('都道府県選択後に確定')).toBeInTheDocument()
  })

  it('送料確認中は案内を表示し、英語設定では注文サマリーの項目名も英語になる', () => {
    localStorage.setItem('site-lang', 'en')
    renderSummary({ shippingFee: null, shippingStatus: 'loading', total: 14200 })
    const summary = screen.getByText('Order Summary').parentElement!.parentElement!

    expect(within(summary).getByText('Subtotal')).toBeInTheDocument()
    expect(within(summary).getByText('Shipping')).toBeInTheDocument()
    expect(within(summary).getByText('Total')).toBeInTheDocument()
    expect(within(summary).getByText('Calculating shipping...')).toBeInTheDocument()
    expect(within(summary).queryByText('送料')).not.toBeInTheDocument()
  })

  it('送料の取得に失敗したら案内と再取得ボタンを表示し、押すと再取得を依頼する', () => {
    const onRetryShipping = vi.fn()
    renderSummary({ shippingFee: null, shippingStatus: 'error', onRetryShipping })
    expect(screen.getByRole('alert')).toHaveTextContent('送料を取得できませんでした。通信状況をご確認ください。')
    fireEvent.click(screen.getByRole('button', { name: '送料を再取得' }))
    expect(onRetryShipping).toHaveBeenCalledOnce()
  })
})

describe('Checkout を開いたときの商品の取り直し（404・通信の失敗）', () => {
  /** 2 つ目の商品 */
  const PRODUCT_B: Product = { ...PRODUCT, id: 'p-2', name: '鉢 M', price: 5200 }

  /**
   * カートに 2 商品を入れて注文手続きを開く（Square の読み込みは待たない）
   * @returns render の結果
   */
  function renderWithTwoItems() {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([{ product: PRODUCT, quantity: 1 }, { product: PRODUCT_B, quantity: 2 }]))
    return render(
      <LangProvider>
        <CartProvider>
          <MemoryRouter initialEntries={['/official/checkout']}>
            <Routes>
              <Route path="/official/checkout" element={<Checkout />} />
            </Routes>
          </MemoryRouter>
        </CartProvider>
      </LangProvider>,
    )
  }

  /**
   *  保存されたカートの商品 id の一覧
   * @returns 戻り値なし。
   */
  const savedIds = () => (JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '[]') as { product: Product }[]).map((i) => i.product.id)

  it('一部の商品だけ 404 のときは、その商品だけカートから外し「販売を終了したため…」を出す', async () => {
    vi.mocked(api.products.get).mockImplementation((id: string) =>
      id === 'p-2' ? Promise.reject(new ApiError(404, '404 Not Found', '商品が見つかりません')) : Promise.resolve(PRODUCT),
    )
    renderWithTwoItems()
    expect(await screen.findByText('「鉢 M」は販売を終了したためカートから削除しました')).toBeInTheDocument()
    await waitFor(() => expect(savedIds()).toEqual(['p-1']))
    // 残った商品で注文手続きは続けられる
    expect(screen.getByRole('button', { name: /注文を確定する/ })).toBeInTheDocument()
  })

  it('全部の商品が 404 のときは、カートが空になり、空のカートの案内と両方の「販売を終了したため…」を出す', async () => {
    vi.mocked(api.products.get).mockRejectedValue(new ApiError(404, '404 Not Found', '商品が見つかりません'))
    renderWithTwoItems()
    expect(await screen.findByText('カートに商品がありません。')).toBeInTheDocument()
    expect(await screen.findByText('「鉢 S」は販売を終了したためカートから削除しました')).toBeInTheDocument()
    expect(await screen.findByText('「鉢 M」は販売を終了したためカートから削除しました')).toBeInTheDocument()
    await waitFor(() => expect(savedIds()).toEqual([]))
  })

  it('通信の失敗（404 以外）の商品はカートに残し、「最新の在庫・価格を確認できませんでした」を出す', async () => {
    vi.mocked(api.products.get).mockImplementation((id: string) =>
      id === 'p-2' ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(PRODUCT),
    )
    renderWithTwoItems()
    expect(await screen.findByText(/「鉢 M」の最新の在庫・価格を確認できませんでした/)).toBeInTheDocument()
    expect(screen.queryByText(/販売を終了したため/)).toBeNull()
    expect(savedIds()).toEqual(['p-1', 'p-2'])
  })

  it('500 で取り直せなかった商品も削除せずに残す', async () => {
    vi.mocked(api.products.get).mockRejectedValue(new ApiError(500, '500 Internal Server Error', null))
    renderWithTwoItems()
    expect(await screen.findByText(/「鉢 S」の最新の在庫・価格を確認できませんでした/)).toBeInTheDocument()
    expect(savedIds()).toEqual(['p-1', 'p-2'])
  })

  it('英語表示では 404 の商品は「is no longer available」の文になる', async () => {
    localStorage.setItem('site-lang', 'en')
    vi.mocked(api.products.get).mockImplementation((id: string) =>
      id === 'p-2' ? Promise.reject(new ApiError(404, '404 Not Found', null)) : Promise.resolve(PRODUCT),
    )
    renderWithTwoItems()
    expect(await screen.findByText('"鉢 M" has been removed from your cart as it is no longer available')).toBeInTheDocument()
  })
})
