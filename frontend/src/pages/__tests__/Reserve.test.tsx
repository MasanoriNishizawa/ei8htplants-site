/**
 * WS 予約の画面（pages/Reserve.tsx）のテスト（MSW を使う）
 * - 参加人数の上限は 10 名（時間枠ありは選択肢が最大 10、時間枠なしは入力欄の max が 10）
 * - 送信に失敗したときのステータスごとの文言（409 満席・429 回数制限・422 入力の誤り・400 の出し分け・500 その他）
 * - 400 の出し分け（reserve400Message）: 受付終了・開催期間外・時間枠不正は日本語ではサーバーの detail をそのまま、
 *   英語では種類ごとの英文。知らない detail・detail 無しは従来の「日付と時間を選び直す」文言
 * - 入力欄の maxLength（お名前 100・電話番号 30・備考 2000。lib/constants の INPUT_MAX_LENGTH）
 * - event_id が送信内容に入る
 * GET /api/events/:id は src/mocks/handlers.ts を使い（mock-no-time: 1 日・WS なし / mock-upcoming-1: 2 日・WS あり）、
 * POST /api/reserve と時間枠はテストごとに server.use で差し替える。本番には接続しない
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/node'
import Reserve from '../Reserve'
import { LangProvider } from '../../lib/lang'

/**
 * 予約の画面を開く
 * @param eventId - URL の event_id
 * @returns render の結果
 */
function renderReserve(eventId: string) {
  return render(
    <LangProvider>
      <MemoryRouter initialEntries={[`/reserve?event_id=${eventId}`]}>
        <Routes>
          <Route path="/reserve" element={<Reserve />} />
        </Routes>
      </MemoryRouter>
    </LangProvider>,
  )
}

/**
 * POST /api/reserve の応答を決め、送られた本文を記録する
 * @param status - 返すステータスコード
 * @param body - 返す本文
 * @returns 送られた本文を入れていく配列
 */
function mockReserveApi(status: number, body: object = { ok: true }): Record<string, unknown>[] {
  const sent: Record<string, unknown>[] = []
  server.use(
    http.post('*/api/reserve', async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json(body, { status })
    }),
  )
  return sent
}

/**
 * 時間枠の無いイベント（mock-no-time）で、名前・メールを入れて送信する
 * @returns なし
 */
async function fillAndSubmitSimple() {
  renderReserve('mock-no-time')
  fireEvent.change(await screen.findByLabelText(/お名前/), { target: { value: '山田 花子' } })
  fireEvent.change(screen.getByLabelText(/メールアドレス/), { target: { value: 'hanako@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: '予約する' }))
}

// 各テストは日本語表示から始める（LangProvider は localStorage の site-lang が無いとブラウザの言語＝英語になるため）
beforeEach(() => {
  localStorage.setItem('site-lang', 'ja')
})

describe('Reserve の参加人数の上限', () => {
  it('時間枠の無いイベントでは参加人数の入力欄が min=1・max=10 になる', async () => {
    renderReserve('mock-no-time')
    const input = await screen.findByLabelText(/参加人数/)
    expect(input).toHaveAttribute('type', 'number')
    expect(input).toHaveAttribute('min', '1')
    expect(input).toHaveAttribute('max', '10')
  })

  it('時間枠の残りが 15 名でも、人数の選択肢は 1〜10 名までになる', async () => {
    // 1. 残り 15 名の枠と 3 名の枠を返す
    server.use(
      http.get('*/api/events/:id/sessions', () =>
        HttpResponse.json([
          { id: 's-big', event_id: 'mock-upcoming-1', time_label: '11:00〜12:00', max_participants: 15, reserved_count: 0 },
          { id: 's-small', event_id: 'mock-upcoming-1', time_label: '12:00〜13:00', max_participants: 5, reserved_count: 2 },
        ]),
      ),
    )
    renderReserve('mock-upcoming-1')
    // 2. 複数日のイベントなので先に日付を選ぶ
    const dateGroup = await screen.findByRole('radiogroup', { name: /予約日/ })
    fireEvent.click(within(dateGroup).getAllByRole('radio')[0])
    // 3. 残り 15 名の枠を選ぶと、選択肢は 10 個（1〜10 名）
    fireEvent.click(await screen.findByRole('radio', { name: /11:00〜12:00/ }))
    const select = screen.getByLabelText(/参加人数/) as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
    // 4. 残り 3 名の枠では 3 個まで
    fireEvent.click(screen.getByRole('radio', { name: /12:00〜13:00/ }))
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['1', '2', '3'])
  })
})

describe('Reserve の送信結果ごとの表示', () => {
  beforeEach(() => {
    // 各テストの前に日本語の表示にする
    localStorage.setItem('site-lang', 'ja')
  })

  it('成功すると「予約を受け付けました」が出て、送信内容に event_id が入る', async () => {
    const sent = mockReserveApi(200)
    await fillAndSubmitSimple()
    expect(await screen.findByText('予約を受け付けました')).toBeInTheDocument()
    expect(sent[0]).toMatchObject({ event_id: 'mock-no-time', name: '山田 花子', email: 'hanako@example.com', participants: 1 })
  })

  it('409 のときは「このセッションは満席になりました」が出て、「戻る」でフォームに戻れる', async () => {
    mockReserveApi(409, { detail: 'full' })
    await fillAndSubmitSimple()
    expect(await screen.findByText('このセッションは満席になりました')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '戻る' }))
    expect(await screen.findByRole('button', { name: '予約する' })).toBeEnabled()
  })

  it('429 のときは送信回数の上限の文言が出て、予約ボタンはまた押せる', async () => {
    mockReserveApi(429, { detail: 'rate limit' })
    await fillAndSubmitSimple()
    expect(await screen.findByRole('alert')).toHaveTextContent('送信回数の上限に達しました。しばらく待ってからもう一度お試しください。')
    expect(screen.getByRole('button', { name: '予約する' })).toBeEnabled()
  })

  it('422 のときは電話番号・人数（1〜10名）・備考（2000文字まで）まで含めて確認をうながす文言が出る', async () => {
    mockReserveApi(422, { detail: [] })
    await fillAndSubmitSimple()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '入力内容に誤りがあります。お名前・メールアドレス・電話番号・人数（1〜10名）・備考（2000文字まで）をご確認ください。',
    )
  })

  it('500 のときは「送信に失敗しました。再度お試しください。」が出る', async () => {
    mockReserveApi(500, { detail: 'error' })
    await fillAndSubmitSimple()
    expect(await screen.findByRole('alert')).toHaveTextContent('送信に失敗しました。再度お試しください。')
    await waitFor(() => expect(screen.getByRole('button', { name: '予約する' })).toBeEnabled())
  })
})

/** 400 の従来の文言（知らない detail・detail 無し） */
const MSG_400_DEFAULT = '選んだ日付または時間がこのイベントの予約枠と合いません。日付と時間を選び直してください。'
/** 400 の英語の文言（受付終了） */
const EN_400_CLOSED = 'Reservations for this date or event are closed. Please choose another date or event.'
/** 400 の英語の文言（日付・時間の不一致・従来） */
const EN_400_MISMATCH = 'The selected date or time does not match this event. Please choose the date and time again.'

/**
 * 英語表示で、時間枠の無いイベントに名前・メールを入れて送信する
 * @returns なし
 */
async function fillAndSubmitSimpleEn() {
  localStorage.setItem('site-lang', 'en')
  renderReserve('mock-no-time')
  fireEvent.change(await screen.findByLabelText(/^Name/), { target: { value: 'Hanako' } })
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'hanako@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Reserve' }))
}

describe('Reserve の 400 の出し分け（reserve400Message）', () => {
  beforeEach(() => {
    localStorage.setItem('site-lang', 'ja')
  })

  it.each([
    'このイベントの予約受付は終了しています',
    'この日の予約受付は終了しています',
    '予約日がイベントの開催期間外です',
    'ワークショップの時間枠が正しくありません',
  ])('日本語表示で detail が「%s」ならその文言をそのまま出す', async (detail) => {
    mockReserveApi(400, { detail })
    await fillAndSubmitSimple()
    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    expect(screen.getByRole('alert')).not.toHaveTextContent(MSG_400_DEFAULT)
  })

  it.each([
    ['知らない detail', { detail: 'unknown reason' }],
    ['detail が無い', {}],
    ['detail が文字列でない', { detail: [{ msg: 'x' }] }],
  ])('日本語表示で %s ときは従来の「日付と時間を選び直す」文言になる', async (_label, body) => {
    mockReserveApi(400, body)
    await fillAndSubmitSimple()
    expect(await screen.findByRole('alert')).toHaveTextContent(MSG_400_DEFAULT)
  })

  it.each([
    'このイベントの予約受付は終了しています',
    'この日の予約受付は終了しています',
  ])('英語表示で受付終了（%s）なら受付終了の英文を出す', async (detail) => {
    mockReserveApi(400, { detail })
    await fillAndSubmitSimpleEn()
    expect(await screen.findByRole('alert')).toHaveTextContent(EN_400_CLOSED)
  })

  it.each([
    '予約日がイベントの開催期間外です',
    'ワークショップの時間枠が正しくありません',
    'unknown reason',
  ])('英語表示で開催期間外・時間枠不正・知らない detail（%s）なら日付・時間が合わない英文を出す', async (detail) => {
    mockReserveApi(400, { detail })
    await fillAndSubmitSimpleEn()
    expect(await screen.findByRole('alert')).toHaveTextContent(EN_400_MISMATCH)
  })
})

describe('Reserve の入力欄の maxLength', () => {
  it('お名前は 100・電話番号は 30・備考は 2000 文字まで', async () => {
    localStorage.setItem('site-lang', 'ja')
    renderReserve('mock-no-time')
    expect(await screen.findByLabelText(/お名前/)).toHaveAttribute('maxLength', '100')
    expect(screen.getByPlaceholderText('090-0000-0000')).toHaveAttribute('maxLength', '30')
    expect(screen.getByLabelText(/備考/)).toHaveAttribute('maxLength', '2000')
  })
})

describe('Reserve のイベントの読み込みの失敗の見出し', () => {
  it('イベントが無い（404）ときは「イベントが見つかりません」とイベント一覧から選ぶ案内', async () => {
    server.use(http.get('*/api/events/:id', () => new HttpResponse(null, { status: 404 })))
    renderReserve('no-such-event')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('イベントが見つかりません')
    expect(alert).toHaveTextContent('予約するイベントをイベント一覧からお選びください。')
    expect(alert).not.toHaveTextContent('イベントを読み込めませんでした')
  })

  it('サーバーの不具合（500）のときは「イベントを読み込めませんでした」と再読み込みの案内', async () => {
    server.use(http.get('*/api/events/:id', () => HttpResponse.json({ detail: 'error' }, { status: 500 })))
    renderReserve('mock-no-time')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('イベントを読み込めませんでした')
    expect(alert).toHaveTextContent('通信状況をご確認のうえ、ページを再読み込みしてください。')
    expect(alert).not.toHaveTextContent('イベントが見つかりません')
  })

  it('通信そのものが失敗したときも「イベントを読み込めませんでした」', async () => {
    server.use(http.get('*/api/events/:id', () => HttpResponse.error()))
    renderReserve('mock-no-time')
    expect(await screen.findByRole('alert')).toHaveTextContent('イベントを読み込めませんでした')
  })

  it('英語表示では 404 は「Event not found」、500 は「Could not load the event」', async () => {
    localStorage.setItem('site-lang', 'en')
    server.use(http.get('*/api/events/:id', () => new HttpResponse(null, { status: 404 })))
    const first = renderReserve('no-such-event')
    expect(await screen.findByRole('alert')).toHaveTextContent('Event not found')
    first.unmount()
    server.use(http.get('*/api/events/:id', () => HttpResponse.json({}, { status: 500 })))
    renderReserve('mock-no-time')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the event')
  })
})

describe('Reserve の参加費の表示', () => {
  it('日本語表示では「1,000円」、英語表示では「¥1,000」になる', async () => {
    const ja = renderReserve('mock-no-time')
    expect(await screen.findByText('1,000円')).toBeInTheDocument()
    ja.unmount()
    localStorage.setItem('site-lang', 'en')
    renderReserve('mock-no-time')
    expect(await screen.findByText('¥1,000')).toBeInTheDocument()
    expect(screen.queryByText('1,000円')).toBeNull()
  })
})

describe('Reserve のイベント・ワークショップ案内', () => {
  it('開催情報・ワークショップ案内・詳細リンク・問い合わせ案内を表示する', async () => {
    // 1. 複数日・時間・会場が設定されたイベントを開く
    renderReserve('mock-upcoming-1')

    // 2. イベント名と開催情報が、イベント案内として表示される
    expect(await screen.findByText('Green Market 2027')).toBeInTheDocument()
    expect(screen.getByText('2027-04-05 〜 2027-04-06')).toBeInTheDocument()
    expect(screen.getByText('10:00〜17:00')).toBeInTheDocument()
    expect(screen.getByText('代々木公園 イベント広場')).toBeInTheDocument()

    // 3. ワークショップの説明・参加費・補足が表示される
    expect(screen.getByText(/植物の自生地を鉢の中で再現するハビタットスタイルのワークショップです/))
      .toBeInTheDocument()
    expect(screen.getByText('1,000円')).toBeInTheDocument()
    expect(screen.getByText('鉢・資材含む / 植物別')).toBeInTheDocument()

    // 4. 詳細リンクは別タブ、問い合わせリンクは公式サイト内の所定の遷移先を保つ
    expect(screen.getByRole('link', { name: '詳しくはこちら' })).toHaveAttribute('href', '/habitatoides/workshop')
    expect(screen.getByRole('link', { name: '詳しくはこちら' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: '詳しくはこちら' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: 'お問い合わせ' })).toHaveAttribute('href', '/official/contact')
    expect(screen.getByText(/ご記入いただいた内容を確認後、メールにて予約確認をお送りします。/))
      .toBeInTheDocument()
  })
})
