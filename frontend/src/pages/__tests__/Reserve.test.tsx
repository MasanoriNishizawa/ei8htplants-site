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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
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

describe('Reserve の日付・時間枠の選択', () => {
  /** 日付変更・予約送信の確認に使う複数の時間枠を返す */
  const sessions = [
    { id: 's-morning', event_id: 'mock-upcoming-1', time_label: '11:00〜12:00', max_participants: 5, reserved_count: 1 },
    { id: 's-afternoon', event_id: 'mock-upcoming-1', time_label: '13:00〜14:00', max_participants: 5, reserved_count: 0 },
    { id: 's-full', event_id: 'mock-upcoming-1', time_label: '12:00〜13:00', max_participants: 2, reserved_count: 2 },
  ]

  it('予約枠を取得中は読み込み状態を表示する', async () => {
    // 1. 予約枠 API の応答を保留し、画面に loading 状態を保つ
    let finishRequest!: () => void
    let notifyHandlerStarted!: () => void
    const handlerStarted = new Promise<void>((resolve) => { notifyHandlerStarted = resolve })
    server.use(http.get('*/api/events/:id/sessions', async () => {
      notifyHandlerStarted()
      await new Promise<void>((resolve) => { finishRequest = resolve })
      return HttpResponse.json(sessions)
    }))
    renderReserve('mock-upcoming-1')

    // 2. 予約日を選ぶと取得中の状態が見える
    const dateGroup = await screen.findByRole('radiogroup', { name: /予約日/ })
    fireEvent.click(within(dateGroup).getAllByRole('radio')[0])
    expect(await screen.findByRole('status')).toHaveTextContent('読み込み中...')
    await handlerStarted

    // 3. ハンドラー開始後に保留 API を完了させ、未完了リクエストを残さない
    await act(async () => { finishRequest() })
    expect(await screen.findByRole('radio', { name: /11:00〜12:00/ })).toBeInTheDocument()
  })

  it('予約枠の取得失敗を表示し、再読み込み後に枠を表示する', async () => {
    // 1. 最初の取得だけ失敗させ、再取得は予約枠を返す
    let requestCount = 0
    server.use(http.get('*/api/events/:id/sessions', () => {
      requestCount += 1
      return requestCount === 1
        ? HttpResponse.json({ detail: 'error' }, { status: 500 })
        : HttpResponse.json(sessions)
    }))
    renderReserve('mock-upcoming-1')
    const dateGroup = await screen.findByRole('radiogroup', { name: /予約日/ })
    fireEvent.click(within(dateGroup).getAllByRole('radio')[0])

    // 2. エラー表示から再読み込みし、枠の一覧へ復帰する
    expect(await screen.findByRole('alert')).toHaveTextContent('予約枠を読み込めませんでした。')
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(await screen.findByRole('radio', { name: /11:00〜12:00/ })).toBeInTheDocument()
    expect(requestCount).toBe(2)
  })

  it('予約枠が空のときは、時間の指定が無いことと、人数・お客様情報を入れて予約できることを案内する', async () => {
    // 2026-11-13 変更: 枠 0 件の日は「予約枠なし」ではなく「時間の指定なし（枠を選ばずに予約できる）」の案内になった
    server.use(http.get('*/api/events/:id/sessions', () => HttpResponse.json([])))
    renderReserve('mock-upcoming-1')
    const dateGroup = await screen.findByRole('radiogroup', { name: /予約日/ })
    fireEvent.click(within(dateGroup).getAllByRole('radio')[0])
    expect(await screen.findByText('この日は時間の指定はありません。参加人数とお客様情報を入力してご予約ください。')).toBeInTheDocument()
    expect(screen.queryByText('この日の予約枠はありません。')).toBeNull()
  })

  it('満席の時間枠は選択できず、別の時間枠へ切り替えると参加人数が 1 名になる', async () => {
    server.use(http.get('*/api/events/:id/sessions', () => HttpResponse.json(sessions)))
    renderReserve('mock-upcoming-1')
    const dateGroup = await screen.findByRole('radiogroup', { name: /予約日/ })
    fireEvent.click(within(dateGroup).getAllByRole('radio')[0])

    const full = await screen.findByRole('radio', { name: /12:00〜13:00.*満席/ })
    expect(full).toBeDisabled()
    const available = await screen.findByRole('radio', { name: /11:00〜12:00/ })
    fireEvent.click(available)
    const participants = screen.getByLabelText(/参加人数/) as HTMLSelectElement
    fireEvent.change(participants, { target: { value: '3' } })
    fireEvent.click(await screen.findByRole('radio', { name: /13:00〜14:00/ }))
    expect(participants).toHaveValue('1')
  })

  it('日付を変更すると選択中の時間枠と参加人数をリセットする', async () => {
    server.use(http.get('*/api/events/:id/sessions', () => HttpResponse.json(sessions)))
    renderReserve('mock-upcoming-1')
    const dateGroup = await screen.findByRole('radiogroup', { name: /予約日/ })
    const dates = within(dateGroup).getAllByRole('radio')
    fireEvent.click(dates[0])
    const session = await screen.findByRole('radio', { name: /11:00〜12:00/ })
    fireEvent.click(session)

    const participants = screen.getByLabelText(/参加人数/) as HTMLSelectElement
    fireEvent.change(participants, { target: { value: '3' } })
    expect(participants).toHaveValue('3')
    fireEvent.click(dates[1])

    // 1. 日付変更で予約枠の選択と人数が初期値へ戻る
    expect(await screen.findByRole('radio', { name: /11:00〜12:00/ })).not.toBeChecked()
    await waitFor(() => expect(participants).toHaveValue('1'))
  })

  it('選択した日付・時間枠・人数を予約リクエストに含める', async () => {
    server.use(http.get('*/api/events/:id/sessions', () => HttpResponse.json(sessions)))
    const sent = mockReserveApi(200)
    renderReserve('mock-upcoming-1')
    const dateGroup = await screen.findByRole('radiogroup', { name: /予約日/ })
    const date = within(dateGroup).getAllByRole('radio')[1] as HTMLInputElement
    fireEvent.click(date)
    fireEvent.click(await screen.findByRole('radio', { name: /11:00〜12:00/ }))
    fireEvent.change(screen.getByLabelText(/参加人数/), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/お名前/), { target: { value: '山田 花子' } })
    fireEvent.change(screen.getByLabelText(/メールアドレス/), { target: { value: 'hanako@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '予約する' }))

    expect(await screen.findByText('予約を受け付けました')).toBeInTheDocument()
    expect(sent[0]).toMatchObject({
      event_id: 'mock-upcoming-1', preferred_date: date.value,
      session_id: 's-morning', participants: 2,
    })
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

  it('参加者情報を予約リクエストと完了画面に反映する。氏名・メール・イベント・電話番号・参加人数・植物/鉢の持ち込み・備考を送信し、完了詳細に表示する', async () => {
    const sent = mockReserveApi(200)
    renderReserve('mock-no-time')

    // 1. 必須項目と、電話番号・持ち込み選択・備考を入力する
    fireEvent.change(await screen.findByLabelText(/お名前/), { target: { value: '山田 花子' } })
    fireEvent.change(screen.getByLabelText(/メールアドレス/), { target: { value: 'hanako@example.com' } })
    fireEvent.change(screen.getByLabelText(/電話番号（任意）/), { target: { value: '090-1234-5678' } })
    fireEvent.change(screen.getByLabelText(/参加人数/), { target: { value: '2' } })
    fireEvent.click(screen.getByLabelText('植物を持ち込む'))
    fireEvent.click(screen.getByLabelText('鉢を持ち込む'))
    fireEvent.change(screen.getByLabelText(/備考（任意）/), { target: { value: '午前中に伺います' } })

    // 2. 予約を送信し、親画面から API へ全項目が渡ることを確認する
    fireEvent.click(screen.getByRole('button', { name: '予約する' }))
    expect(await screen.findByText('予約を受け付けました')).toBeInTheDocument()
    expect(sent[0]).toMatchObject({
      event_id: 'mock-no-time',
      name: '山田 花子',
      email: 'hanako@example.com',
      phone: '090-1234-5678',
      participants: 2,
      bring_plant: true,
      bring_pot: true,
      note: '午前中に伺います',
    })

    // 3. 送信した電話番号・持ち込み状態・備考が完了画面にも表示されることを確認する
    expect(screen.getByText('090-1234-5678')).toBeInTheDocument()
    expect(screen.getByText('お名前').parentElement).toHaveTextContent('山田 花子')
    expect(screen.getByText('メール').parentElement).toHaveTextContent('hanako@example.com')
    expect(screen.getByText('イベント').parentElement).toHaveTextContent('time 未設定のイベント')
    expect(screen.getByText('参加人数').parentElement).toHaveTextContent('2 名')
    expect(screen.getByText('植物持ち込み').parentElement).toHaveTextContent('あり')
    expect(screen.getByText('鉢持ち込み').parentElement).toHaveTextContent('あり')
    expect(screen.getByText('午前中に伺います')).toBeInTheDocument()
  })

  it('409 のときは満席案内から戻るとフォームが再表示され、入力済みの名前とメールアドレスが保持される', async () => {
    mockReserveApi(409, { detail: 'full' })
    await fillAndSubmitSimple()
    expect(await screen.findByText('このセッションは満席になりました')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '戻る' }))
    expect(await screen.findByRole('button', { name: '予約する' })).toBeEnabled()
    // 4. 結果画面から戻っても、再入力を避けるため名前とメールアドレスを維持する
    expect(screen.getByLabelText(/お名前/)).toHaveValue('山田 花子')
    expect(screen.getByLabelText(/メールアドレス/)).toHaveValue('hanako@example.com')
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

/**
 * ワークショップを一部の日だけ実施するイベント（モックの mock-ws-dates: 7/1〜7/4 開催・7/2 と 7/4 だけ実施。
 * 7/2 は枠 2 つで 13:00 は満席、7/4 は枠なし）の予約（2026-11-13 追加）
 * GET /api/events/:id/sessions?date= と POST /api/reserve は src/mocks/handlers.ts のまま使う（本番と同じ 400 の判定つき）
 * 今日は Date だけを固定して決める（setTimeout などは本物のまま）
 */
describe('Reserve のワークショップ実施日（特定の日だけ・日ごとの枠）', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * 今日（日本時間の正午）を固定する
   * @param ymd - 今日にする日付（YYYY-MM-DD）
   * @returns なし
   */
  const setToday = (ymd: string) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${ymd}T03:00:00Z`))
  }

  /**
   * 予約日のラジオの値を並べる
   * @returns 予約日のラジオの value
   */
  const dateValues = async () => {
    const group = await screen.findByRole('radiogroup', { name: /予約日/ })
    return within(group).getAllByRole('radio').map((r) => (r as HTMLInputElement).value)
  }

  it('FE-ER-01 予約日の選択肢は実施日（7/2・7/4）だけで、実施しない日（7/1・7/3）は出ない', async () => {
    setToday('2026-11-13')
    renderReserve('mock-ws-dates')
    expect(await dateValues()).toEqual(['2027-07-02', '2027-07-04'])
  })

  it('FE-ER-02 一部の日だけ実施するときは「ワークショップ実施日: 7/2（金）・7/4（日）」を出す（英語は「Workshop dates: 7/2 (Fri), 7/4 (Sun)」）', async () => {
    setToday('2026-11-13')
    const ja = renderReserve('mock-ws-dates')
    expect(await screen.findByText(/ワークショップ実施日:/)).toHaveTextContent('ワークショップ実施日: 7/2（金）・7/4（日）')
    ja.unmount()
    localStorage.setItem('site-lang', 'en')
    renderReserve('mock-ws-dates')
    expect(await screen.findByText(/Workshop dates:/)).toHaveTextContent('Workshop dates: 7/2 (Fri), 7/4 (Sun)')
  })

  it('FE-ER-03 全日程で実施するイベント（mock-upcoming-1）では「ワークショップ実施日」を出さない', async () => {
    setToday('2026-11-13')
    renderReserve('mock-upcoming-1')
    expect(await screen.findByText('Green Market 2027')).toBeInTheDocument()
    expect(screen.queryByText(/ワークショップ実施日/)).toBeNull()
  })

  it('FE-ER-04 7/2 を選ぶとその日の枠が出て、満席の枠は選べず、選んだ枠と日付で送る', async () => {
    setToday('2026-11-13')
    const sent = mockReserveApi(200)
    renderReserve('mock-ws-dates')
    const group = await screen.findByRole('radiogroup', { name: /予約日/ })
    fireEvent.click(within(group).getAllByRole('radio')[0])
    expect(await screen.findByRole('radio', { name: /13:00〜14:00.*満席/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: /11:00〜12:00/ }))
    fireEvent.change(screen.getByLabelText(/お名前/), { target: { value: '山田 花子' } })
    fireEvent.change(screen.getByLabelText(/メールアドレス/), { target: { value: 'hanako@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '予約する' }))
    expect(await screen.findByText('予約を受け付けました')).toBeInTheDocument()
    expect(sent[0]).toMatchObject({ event_id: 'mock-ws-dates', preferred_date: '2027-07-02', session_id: 'mock-ws-dates-s1' })
  })

  it('FE-ER-14 時間枠を選んで送ると、その枠の表示名を preferred_time にも入れて送る（2026-11-13 追加）', async () => {
    setToday('2026-11-13')
    const sent = mockReserveApi(200)
    renderReserve('mock-ws-dates')
    const group = await screen.findByRole('radiogroup', { name: /予約日/ })
    fireEvent.click(within(group).getAllByRole('radio')[0])
    fireEvent.click(await screen.findByRole('radio', { name: /11:00〜12:00/ }))
    fireEvent.change(screen.getByLabelText(/お名前/), { target: { value: '山田 花子' } })
    fireEvent.change(screen.getByLabelText(/メールアドレス/), { target: { value: 'hanako@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '予約する' }))
    expect(await screen.findByText('予約を受け付けました')).toBeInTheDocument()
    expect(sent[0]).toMatchObject({ session_id: 'mock-ws-dates-s1', preferred_time: '11:00〜12:00', preferred_date: '2027-07-02' })
  })

  it('FE-ER-15 枠の無い日は preferred_time を送らない（2026-11-13 追加）', async () => {
    setToday('2026-11-13')
    const sent = mockReserveApi(200)
    renderReserve('mock-ws-dates')
    const group = await screen.findByRole('radiogroup', { name: /予約日/ })
    fireEvent.click(within(group).getAllByRole('radio')[1])
    await screen.findByText(/この日は時間の指定はありません/)
    fireEvent.change(screen.getByLabelText(/お名前/), { target: { value: '山田 花子' } })
    fireEvent.change(screen.getByLabelText(/メールアドレス/), { target: { value: 'hanako@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '予約する' }))
    expect(await screen.findByText('予約を受け付けました')).toBeInTheDocument()
    expect(sent[0].preferred_time ?? '').toBe('')
    expect(sent[0].preferred_date).toBe('2027-07-04')
  })

  it('FE-ER-05 枠が 0 件の 7/4 は、時間を選ばずに予約できる（session_id を送らない。モックのサーバーも受け付ける）', async () => {
    setToday('2026-11-13')
    renderReserve('mock-ws-dates')
    const group = await screen.findByRole('radiogroup', { name: /予約日/ })
    fireEvent.click(within(group).getAllByRole('radio')[1])
    expect(await screen.findByText('この日は時間の指定はありません。参加人数とお客様情報を入力してご予約ください。')).toBeInTheDocument()
    // 時間枠のラジオは無く、「予約時間を選択してください」も出ない
    expect(screen.queryByRole('radiogroup', { name: /予約時間/ })).toBeNull()
    expect(screen.queryByText('予約時間を選択してください')).toBeNull()
    // 参加人数は数値の入力欄
    fireEvent.change(screen.getByLabelText(/参加人数/), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/お名前/), { target: { value: '山田 花子' } })
    fireEvent.change(screen.getByLabelText(/メールアドレス/), { target: { value: 'hanako@example.com' } })
    expect(screen.getByRole('button', { name: '予約する' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '予約する' }))
    expect(await screen.findByText('予約を受け付けました')).toBeInTheDocument()
  })

  it('FE-ER-06 今日（7/3）より前の実施日（7/2）は出さず、残りが 1 日（7/4）なら自動で選ぶ', async () => {
    setToday('2027-07-03')
    const sent = mockReserveApi(200)
    renderReserve('mock-ws-dates')
    expect(await dateValues()).toEqual(['2027-07-04'])
    expect(within(screen.getByRole('radiogroup', { name: /予約日/ })).getByRole('radio')).toBeChecked()
    // 自動で選んだ 7/4 は枠なしなので、そのまま送れる
    expect(await screen.findByText(/この日は時間の指定はありません/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/お名前/), { target: { value: '山田 花子' } })
    fireEvent.change(screen.getByLabelText(/メールアドレス/), { target: { value: 'hanako@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '予約する' }))
    expect(await screen.findByText('予約を受け付けました')).toBeInTheDocument()
    expect(sent[0]).toMatchObject({ event_id: 'mock-ws-dates', preferred_date: '2027-07-04' })
    expect(sent[0].session_id ?? '').toBe('')
  })

  it('FE-ER-07 実施日がすべて過ぎていたら（今日 7/5）、受付終了の案内になりフォームを出さない', async () => {
    setToday('2027-07-05')
    renderReserve('mock-ws-dates')
    expect(await screen.findByText('受付を終了しました')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '予約する' })).toBeNull()
  })

  it('FE-ER-08 当日（7/4）も予約日の選択肢に入る（今日は「今日より前」ではない）', async () => {
    setToday('2027-07-04')
    renderReserve('mock-ws-dates')
    expect(await dateValues()).toEqual(['2027-07-04'])
  })

  it('FE-ER-09 枠の読み込み中は「予約する」を押せない（枠 0 件と取り違えない）', async () => {
    setToday('2026-11-13')
    // 枠の応答を返さないままにする
    server.use(http.get('*/api/events/:id/sessions', () => new Promise<never>(() => {})))
    renderReserve('mock-ws-dates')
    const group = await screen.findByRole('radiogroup', { name: /予約日/ })
    fireEvent.click(within(group).getAllByRole('radio')[1])
    expect(await screen.findByRole('status')).toHaveTextContent('読み込み中...')
    fireEvent.change(screen.getByLabelText(/お名前/), { target: { value: '山田 花子' } })
    fireEvent.change(screen.getByLabelText(/メールアドレス/), { target: { value: 'hanako@example.com' } })
    expect(screen.getByRole('button', { name: '予約する' })).toBeDisabled()
  })
})

describe('Reserve の予約不要のワークショップ', () => {
  it('FE-ER-10 予約不要（ws_requires_reservation が false）なら入力欄の代わりに「予約不要です。当日会場へ」の案内を出す', async () => {
    // mock-upcoming-1 を予約不要にして返す
    server.use(http.get('*/api/events/:id', () => HttpResponse.json({
      id: 'mock-upcoming-1', slug: null, name: '予約不要のWS', start_date: '2027-04-05', end_date: '2027-04-06', time: null,
      location: '会場', booth_number: null, address: null, official_url: null, brands: [], has_workshop: true,
      ws_requires_reservation: false, is_past: false, display_order: 1, images: [], page_content: null, daily_times: null,
    })))
    renderReserve('mock-upcoming-1')
    // 読み込み中の表示（role=status）と取り違えないよう、案内の文が出るのを待ってからその枠を確かめる
    const status = (await screen.findByText('このワークショップは予約不要です。')).closest('[role="status"]') as HTMLElement
    expect(status).not.toBeNull()
    expect(status).toHaveTextContent('当日会場へお越しください。')
    expect(screen.queryByRole('button', { name: '予約する' })).toBeNull()
    expect(screen.queryByLabelText(/お名前/)).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: /予約日/ })).toBeNull()
  })
})

/** 400 の英語の文言（予約不要） */
const EN_400_NOT_REQUIRED = 'No reservation is needed for this workshop. Please come directly to the venue on the day.'

describe('Reserve の 400 の出し分け（実施日・予約不要の文言。2026-11-13 追加）', () => {
  beforeEach(() => {
    localStorage.setItem('site-lang', 'ja')
  })

  it.each([
    'この日はワークショップを実施していません',
    'この時間枠は選んだ日には使えません',
    '時間枠を選んでください',
    '予約日を選んでください',
    'このワークショップは予約不要です。当日会場へお越しください。',
  ])('FE-ER-11 日本語表示で detail が「%s」ならその文言をそのまま出す', async (detail) => {
    mockReserveApi(400, { detail })
    await fillAndSubmitSimple()
    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    expect(screen.getByRole('alert')).not.toHaveTextContent(MSG_400_DEFAULT)
  })

  it.each([
    'この日はワークショップを実施していません',
    'この時間枠は選んだ日には使えません',
    '時間枠を選んでください',
    '予約日を選んでください',
  ])('FE-ER-12 英語表示で実施しない日・別の日の枠・枠なし・日付なし（%s）なら日付・時間が合わない英文を出す', async (detail) => {
    mockReserveApi(400, { detail })
    await fillAndSubmitSimpleEn()
    expect(await screen.findByRole('alert')).toHaveTextContent(EN_400_MISMATCH)
  })

  it('FE-ER-13 英語表示で予約不要なら、当日会場へ来てもらう英文を出す', async () => {
    mockReserveApi(400, { detail: 'このワークショップは予約不要です。当日会場へお越しください。' })
    await fillAndSubmitSimpleEn()
    expect(await screen.findByRole('alert')).toHaveTextContent(EN_400_NOT_REQUIRED)
  })
})
