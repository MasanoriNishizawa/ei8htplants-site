/**
 * EventForm のテスト
 *
 * 1. イベントフォーム 新規作成フローのテスト
 *    - 必須フィールドを入力して保存すると api.events.create が呼ばれる
 *    - 保存後に管理画面イベント一覧ページに遷移する
 *    - 保存中は「保存中...」ボタンが表示される
 * 2. イベントフォーム 編集フローのテスト
 *    - 既存イベントのデータがフォームにロードされる
 *    - 保存すると api.events.update が呼ばれる
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AdminEventForm from '../EventForm'
import { api } from '../../../lib/api'
import type { Event, WsSession } from '../../../lib/api'

// ---- api モジュールのモック ----
// computeFinances などの純粋関数は実装を保持し、API 呼び出し関数だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      events: {
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        getSessions: vi.fn(),
        saveSessions: vi.fn(),
      },
      upload: vi.fn(),
    },
  }
})

// ---- テスト用モックデータ ----

/**
 * テスト用のイベントデータ（編集画面で返される既存イベント）
 */
const MOCK_EVENT: Event = {
  id: 'mock-event-1',
  slug: 'test-event',
  name: 'テストイベント',
  start_date: '2099-05-01',
  end_date: null,
  time: '10:00〜17:00',
  location: 'テスト会場',
  booth_number: 'A-1',
  address: '東京都渋谷区',
  official_url: null,
  brands: ['ei8ht plants'],
  has_workshop: false,
  ws_requires_reservation: true,
  is_past: false,
  display_order: 1,
  images: [],
  page_content: null,
  daily_times: null,
}

/**
 * テスト用のWSセッションデータ（空の配列）
 */
const MOCK_SESSIONS: WsSession[] = []

// ---- ヘルパー関数 ----

/**
 * 新規作成フォームをレンダリングするヘルパー
 * /admin/events/new にマウントする
 * @returns 新規イベントフォームを描画した Testing Library の結果
 */
function renderNewForm() {
  return render(
    <MemoryRouter initialEntries={['/admin/events/new']}>
      <Routes>
        <Route path="/admin/events/new" element={<AdminEventForm />} />
      </Routes>
    </MemoryRouter>
  )
}

/**
 * 編集フォームをレンダリングするヘルパー
 * @param eventId - 編集対象のイベントID
 * @returns 指定イベントの編集フォームを描画した Testing Library の結果
 */
function renderEditForm(eventId = 'mock-event-1') {
  return render(
    <MemoryRouter initialEntries={[`/admin/events/${eventId}/edit`]}>
      <Routes>
        <Route path="/admin/events/:id/edit" element={<AdminEventForm />} />
      </Routes>
    </MemoryRouter>
  )
}

// ---- イベントフォーム 新規作成フローのテスト ----

describe('イベントフォーム 新規作成', () => {
  beforeEach(() => {
    // 各テスト前にモック状態をリセットする
    vi.clearAllMocks()

    // create が成功したときに新規作成されたイベントを返す
    vi.mocked(api.events.create).mockResolvedValue({
      ...MOCK_EVENT,
      id: 'new-event-id',
    })
    // saveSessions もモックしておく（create 後に呼ばれる）
    vi.mocked(api.events.saveSessions).mockResolvedValue([])
  })

  it('必須フィールドを入力して保存すると api.events.create が呼ばれる', async () => {
    // フォームに必須項目（イベント名・開始日・会場名）を入力して送信すると
    // api.events.create が呼ばれることを確認する
    renderNewForm()

    // イベント名を入力する
    const nameInput = screen.getAllByRole('textbox')[0]
    fireEvent.change(nameInput, { target: { value: '新規テストイベント' } })

    // 開始日を入力する（date input は type="date" なので fireEvent で値を設定する）
    const dateInputs = document.querySelectorAll('input[type="date"]')
    fireEvent.change(dateInputs[0], { target: { value: '2099-06-01' } })

    // 会場名を入力する（required フィールド）
    // イベント名・スラッグの次にある「会場名」ラベルのinputを探す
    // 直接 label テキストから input を探す
    const locationLabel = screen.getByText('会場名')
    const locationInput = locationLabel.parentElement?.querySelector('input')
    if (locationInput) {
      fireEvent.change(locationInput, { target: { value: 'テスト会場' } })
    }

    // フォームを送信する
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!)
    })

    // api.events.create が呼ばれることを確認する
    await waitFor(() => {
      expect(vi.mocked(api.events.create)).toHaveBeenCalledTimes(1)
    })

    // 呼び出しの引数に入力したイベント名が含まれていることを確認する
    const callArg = vi.mocked(api.events.create).mock.calls[0][0]
    expect(callArg.name).toBe('新規テストイベント')
  })

  it('保存後に管理画面イベント一覧ページに遷移する（navigate が呼ばれる）', async () => {
    // フォーム送信後に /admin/events へ遷移することを確認する
    // カスタムルートで遷移先を確認する
    render(
      <MemoryRouter initialEntries={['/admin/events/new']}>
        <Routes>
          <Route path="/admin/events/new" element={<AdminEventForm />} />
          {/* 遷移後に表示されるダミーのルート */}
          <Route path="/admin/events" element={
            <div data-testid="events-list-page">イベント一覧</div>
          } />
        </Routes>
      </MemoryRouter>
    )

    // イベント名を入力する
    const nameInput = screen.getAllByRole('textbox')[0]
    fireEvent.change(nameInput, { target: { value: '遷移確認イベント' } })

    // 開始日を入力する
    const dateInputs = document.querySelectorAll('input[type="date"]')
    fireEvent.change(dateInputs[0], { target: { value: '2099-07-01' } })

    // 会場名も必須項目のため入力する
    fireEvent.change(screen.getByLabelText('会場名'), { target: { value: '遷移確認会場' } })

    // フォームを送信する
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!)
    })

    // /admin/events ページに遷移したことを確認する
    await waitFor(() => {
      expect(screen.getByTestId('events-list-page')).toBeDefined()
    })

  })

  it('保存中は「保存中...」ボタンが表示される', async () => {
    // フォーム送信中（API 呼び出し中）は保存ボタンのテキストが「保存中...」になることを確認する

    // create を無限に保留させて「保存中」状態を維持する
    vi.mocked(api.events.create).mockImplementation(() => new Promise(() => {}))

    renderNewForm()

    // イベント名を入力する
    const nameInput = screen.getAllByRole('textbox')[0]
    fireEvent.change(nameInput, { target: { value: '保存中テスト' } })

    // フォームを送信する（非同期で保留する）
    act(() => {
      fireEvent.submit(document.querySelector('form')!)
    })

    // 「保存中...」が表示されることを確認する
    await waitFor(() => {
      expect(screen.getByText('保存中...')).toBeDefined()
    })
  })
})

// ---- イベントフォーム 編集フローのテスト ----

describe('イベントフォーム 編集', () => {
  beforeEach(() => {
    // 各テスト前にモック状態をリセットする
    vi.clearAllMocks()

    // 編集画面ではイベントデータとWSセッションを取得する
    vi.mocked(api.events.get).mockResolvedValue(MOCK_EVENT)
    vi.mocked(api.events.getSessions).mockResolvedValue(MOCK_SESSIONS)
    // update の成功時にイベントデータを返す
    vi.mocked(api.events.update).mockResolvedValue(MOCK_EVENT)
    // saveSessions もモックしておく
    vi.mocked(api.events.saveSessions).mockResolvedValue([])
    vi.mocked(api.upload).mockResolvedValue('https://example.com/uploaded.png')
  })

  afterEach(() => {
    // 画像アップロードのテスト用に差し替えた URL API を、次のテストへ残さない。
    vi.unstubAllGlobals()
  })

  it('既存イベントのデータがフォームにロードされる（name フィールドが初期値を持つ）', async () => {
    // 編集画面を開くと api.events.get でデータが取得され、
    // イベント名がフォームにセットされることを確認する
    renderEditForm()

    // データ読み込み後にイベント名がフォームにセットされることを確認する
    await waitFor(() => {
      const nameInputs = screen.getAllByRole('textbox') as HTMLInputElement[]
      // 最初のテキストボックスがイベント名フィールド
      expect(nameInputs[0].value).toBe('テストイベント')
    })
  })

  it('保存すると api.events.update が呼ばれる', async () => {
    // 編集フォームを保存すると api.events.update が id と body で呼ばれることを確認する
    renderEditForm()

    // データが読み込まれるまで待機する
    await waitFor(() => {
      const nameInputs = screen.getAllByRole('textbox') as HTMLInputElement[]
      expect(nameInputs[0].value).toBe('テストイベント')
    })

    // フォームを送信する
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!)
    })

    // api.events.update が呼ばれることを確認する
    await waitFor(() => {
      expect(vi.mocked(api.events.update)).toHaveBeenCalledTimes(1)
    })

    // 呼び出しの引数に正しい id が渡されていることを確認する
    const [calledId, calledBody] = vi.mocked(api.events.update).mock.calls[0]
    expect(calledId).toBe('mock-event-1')
    expect(calledBody.name).toBe('テストイベント')
  })

  it('WSありのイベントを保存すると、時間が入力されたセッションだけを保存する', async () => {
    // 1. WSあり・予約不要のイベントと、時間入力済み/未入力のセッションを読み込む。
    vi.mocked(api.events.get).mockResolvedValue({
      ...MOCK_EVENT,
      has_workshop: true,
      ws_requires_reservation: false,
    })
    vi.mocked(api.events.getSessions).mockResolvedValue([
      {
        id: 'session-valid', event_id: 'mock-event-1', time_label: '10:00〜11:00',
        max_participants: 8, reserved_count: 2, display_order: 1,
      },
      {
        id: 'session-empty', event_id: 'mock-event-1', time_label: '  ',
        max_participants: 6, reserved_count: 0, display_order: 2,
      },
    ])
    renderEditForm()
    await waitFor(() => expect(screen.getAllByRole('textbox')[0]).toHaveValue('テストイベント'))

    // 2. 予約要否の初期値を確認し、時間と定員を画面から変更する。
    expect(screen.getByRole('checkbox', { name: '予約必要' })).not.toBeChecked()
    fireEvent.change(screen.getByRole('textbox', { name: '1回目の時間' }), { target: { value: '11:30〜12:30' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: '1回目の定員' }), { target: { value: '10' } })
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!)
    })

    // 3. イベント body に WS 設定を保ち、変更した値で時間空白行以外を保存する。
    await waitFor(() => {
      expect(vi.mocked(api.events.saveSessions)).toHaveBeenCalledWith('mock-event-1', [
        { id: 'session-valid', time_label: '11:30〜12:30', max_participants: 10 },
      ])
    })
    expect(vi.mocked(api.events.update).mock.calls[0][1]).toMatchObject({
      has_workshop: true,
      ws_requires_reservation: false,
    })
  })

  it('WSなしのイベントを保存すると既存セッションを空配列で置き換える', async () => {
    // 1. WSありのイベントと既存セッションを読み込み、画面でWSを外す状態を用意する。
    vi.mocked(api.events.get).mockResolvedValue({ ...MOCK_EVENT, has_workshop: true })
    vi.mocked(api.events.getSessions).mockResolvedValue([
      {
        id: 'session-existing', event_id: 'mock-event-1', time_label: '10:00〜11:00',
        max_participants: 8, reserved_count: 1, display_order: 1,
      },
    ])
    renderEditForm()
    await waitFor(() => expect(screen.getAllByRole('textbox')[0]).toHaveValue('テストイベント'))

    // 2. 画面でWSを外すと予約要否・セッション欄が隠れることを確認する。
    expect(screen.getByText('WSセッション（各回の時間・定員）')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'ワークショップあり' }))
    expect(screen.queryByRole('checkbox', { name: '予約必要' })).toBeNull()
    expect(screen.queryByText('WSセッション（各回の時間・定員）')).toBeNull()
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!)
    })

    // 3. WSを外して保存した場合、イベント body とセッション payload が共に空状態になる。
    await waitFor(() => {
      expect(vi.mocked(api.events.saveSessions)).toHaveBeenCalledWith('mock-event-1', [])
    })
    expect(vi.mocked(api.events.update).mock.calls[0][1].has_workshop).toBe(false)
  })

  it('編集画面には削除ボタンが無く、表示しても api.events.delete は呼ばれない', async () => {
    // 仕様: イベントの削除はイベント一覧（pages/admin/Events.tsx）で行い、編集画面には削除ボタンを置かない
    // 1. 編集画面を表示し、既存データの読み込みを待つ
    renderEditForm()
    await waitFor(() => {
      const nameInputs = screen.getAllByRole('textbox') as HTMLInputElement[]
      expect(nameInputs[0].value).toBe('テストイベント')
    })

    // 2. 「削除」という名前のボタンが無いことを確認する
    expect(screen.queryByRole('button', { name: /削除/ })).toBeNull()
    // 3. 表示しただけで削除 API が呼ばれていないことを確認する
    expect(vi.mocked(api.events.delete)).not.toHaveBeenCalled()
  })

  it('既存画像を登録順に表示し、画像を外すと後続の順番が詰め直される', async () => {
    // 1. 並び順が異なる画像を持つイベントを編集画面へ読み込む。
    vi.mocked(api.events.get).mockResolvedValue({
      ...MOCK_EVENT,
      images: [
        { id: 'image-1', url: 'https://example.com/first.png', display_order: 1 },
        { id: 'image-2', url: 'https://example.com/second.png', display_order: 2 },
        { id: 'image-3', url: 'https://example.com/third.png', display_order: 3 },
      ],
    })
    const { container } = renderEditForm()

    // 2. 画面上のサムネイル順と、画像を外す操作の番号が一致することを確認する。
    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('img')).map((image) => image.getAttribute('src'))).toEqual([
        'https://example.com/first.png',
        'https://example.com/second.png',
        'https://example.com/third.png',
      ])
    })
    expect(screen.getByRole('button', { name: '1枚目の画像を外す' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2枚目の画像を外す' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '3枚目の画像を外す' })).toBeInTheDocument()

    // 3. 先頭画像を外し、残りの順番と操作名が更新されることを確かめる。
    fireEvent.click(screen.getByRole('button', { name: '1枚目の画像を外す' }))
    expect(Array.from(container.querySelectorAll('img')).map((image) => image.getAttribute('src'))).toEqual([
      'https://example.com/second.png',
      'https://example.com/third.png',
    ])
    expect(screen.getByRole('button', { name: '1枚目の画像を外す' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2枚目の画像を外す' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '3枚目の画像を外す' })).toBeNull()
  })

  it('画像追加欄から複数画像を選ぶと、既存画像の後ろへ選択順にサムネイルが追加される', async () => {
    // 1. テスト環境に未実装の blob URL API を仮実装し、アップロード応答を設定する。
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second'),
      revokeObjectURL: vi.fn(),
    })
    vi.mocked(api.events.get).mockResolvedValue({
      ...MOCK_EVENT,
      images: [{ id: 'image-1', url: 'https://example.com/existing.png', display_order: 1 }],
    })
    vi.mocked(api.upload)
      .mockResolvedValueOnce('https://example.com/uploaded-first.png')
      .mockResolvedValueOnce('https://example.com/uploaded-second.png')
    const { container } = renderEditForm()

    // 2. ラベルから取得した file input が画像の複数選択を受け付けることを確認する。
    const input = screen.getByLabelText('画像を追加') as HTMLInputElement
    await waitFor(() => expect(Array.from(container.querySelectorAll('img')).map((image) => image.getAttribute('src'))).toEqual([
      'https://example.com/existing.png',
    ]))
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', 'image/*')
    expect(input.multiple).toBe(true)

    // 3. 2枚を選び、サーバー URL になった画像が既存画像の末尾へ選択順で並ぶことを確かめる。
    const files = [new File(['first'], 'first.png', { type: 'image/png' }), new File(['second'], 'second.png', { type: 'image/png' })]
    fireEvent.change(input, { target: { files } })
    await waitFor(() => expect(Array.from(container.querySelectorAll('img')).map((image) => image.getAttribute('src'))).toEqual([
      'https://example.com/existing.png',
      'https://example.com/uploaded-first.png',
      'https://example.com/uploaded-second.png',
    ]))
    expect(vi.mocked(api.upload).mock.calls.map(([file]) => (file as File).name)).toEqual(['first.png', 'second.png'])
    expect(screen.getByRole('button', { name: '1枚目の画像を外す' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2枚目の画像を外す' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '3枚目の画像を外す' })).toBeInTheDocument()
  })

  it('画像アップロード中は追加と削除を操作できず、完了すると画像を外せる', async () => {
    // アップロードの完了をテストから操作するための resolve 関数。
    let resolveUpload: (url: string) => void = () => {}
    // 1. blob URL を用意し、アップロード応答を保留する。
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:uploading'),
      revokeObjectURL: vi.fn(),
    })
    vi.mocked(api.upload).mockImplementation(() => new Promise<string>((resolve) => { resolveUpload = resolve }))
    renderEditForm()
    await waitFor(() => expect(screen.getAllByRole('textbox')[0]).toHaveValue('テストイベント'))

    // 2. 画像を選ぶと、追加欄が無効になり、アップロード中画像の削除操作は表示されない。
    const input = screen.getByLabelText('画像を追加') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['upload'], 'upload.png', { type: 'image/png' })] } })
    await waitFor(() => expect(input).toBeDisabled())
    expect(screen.queryByRole('button', { name: '1枚目の画像を外す' })).toBeNull()

    // 3. 完了後はサーバー URL が表示され、追加欄と削除操作が戻る。
    resolveUpload('https://example.com/uploaded.png')
    await waitFor(() => expect(input).toBeEnabled())
    expect(screen.getByRole('button', { name: '1枚目の画像を外す' })).toBeInTheDocument()
  })
})

// ---- URL スラッグの自動生成 ----
describe('イベントフォーム URL スラッグの自動生成', () => {
  /**
   *  イベント名の入力欄
   * @returns 戻り値なし。
   */
  const nameInput = () => screen.getByLabelText('イベント名') as HTMLInputElement
  /**
   *  スラッグの入力欄
   * @returns 戻り値なし。
   */
  const slugInput = () => screen.getByPlaceholderText('plant-market-2026') as HTMLInputElement

  beforeEach(() => {
    vi.mocked(api.events.get).mockReset()
    vi.mocked(api.events.getSessions).mockReset().mockResolvedValue(MOCK_SESSIONS)
  })

  it('新規作成では、イベント名を入れるたびにスラッグが名前から作られる（英小文字・ハイフン、記号と日本語は除く）', () => {
    renderNewForm()
    fireEvent.change(nameInput(), { target: { value: 'Plant Market 2026' } })
    expect(slugInput().value).toBe('plant-market-2026')
    fireEvent.change(nameInput(), { target: { value: 'Green  Fes! 秋' } })
    expect(slugInput().value).toBe('green-fes')
  })

  it('新規作成でスラッグ欄を手で編集すると、そのあと名前を変えてもスラッグは変わらない', () => {
    renderNewForm()
    fireEvent.change(nameInput(), { target: { value: 'Plant Market' } })
    // 手で編集（大文字・記号は入力時に取り除かれる）
    fireEvent.change(slugInput(), { target: { value: 'My-Slug!' } })
    expect(slugInput().value).toBe('my-slug')
    fireEvent.change(nameInput(), { target: { value: 'Another Name' } })
    expect(slugInput().value).toBe('my-slug')
  })

  it('「自動生成」を押すと名前から作り直し、そのあとはまた名前に追従する', () => {
    renderNewForm()
    fireEvent.change(nameInput(), { target: { value: 'Plant Market' } })
    fireEvent.change(slugInput(), { target: { value: 'manual' } })
    // 1. 自動生成で作り直す
    fireEvent.click(screen.getByRole('button', { name: '自動生成' }))
    expect(slugInput().value).toBe('plant-market')
    // 2. 以後は名前に追従する
    fireEvent.change(nameInput(), { target: { value: 'Plant Market Autumn' } })
    expect(slugInput().value).toBe('plant-market-autumn')
  })

  it('イベント名が空のときは「自動生成」ボタンは出ない', () => {
    renderNewForm()
    expect(screen.queryByRole('button', { name: '自動生成' })).toBeNull()
  })

  it('編集画面では、既存のスラッグはイベント名を変えても変わらない', async () => {
    vi.mocked(api.events.get).mockResolvedValue(MOCK_EVENT)
    renderEditForm()
    await waitFor(() => expect(slugInput().value).toBe('test-event'))
    fireEvent.change(nameInput(), { target: { value: 'Renamed Event' } })
    expect(slugInput().value).toBe('test-event')
  })

  it('編集画面でスラッグが空のイベントは、イベント名を変えるとスラッグが作られる', async () => {
    vi.mocked(api.events.get).mockResolvedValue({ ...MOCK_EVENT, slug: null } as unknown as Event)
    renderEditForm()
    await waitFor(() => expect(nameInput().value).toBe('テストイベント'))
    expect(slugInput().value).toBe('')
    fireEvent.change(nameInput(), { target: { value: 'Spring Fair' } })
    expect(slugInput().value).toBe('spring-fair')
  })
})

// ---- 書きかけ保護: ブランドの並び順 ----
describe('イベントフォーム ブランドを外して付け直しても書きかけにならない', () => {
  beforeEach(() => {
    vi.mocked(api.events.get).mockReset().mockResolvedValue({ ...MOCK_EVENT, brands: ['ei8ht plants', 'Habitat Oides'] })
    vi.mocked(api.events.getSessions).mockReset().mockResolvedValue(MOCK_SESSIONS)
  })

  it('ei8ht plants を外して付け直す（並び順が変わる）だけなら、「キャンセル」で確認が出ない', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderEditForm()
    const box = await screen.findByRole('checkbox', { name: 'ei8ht plants' })
    await waitFor(() => expect(box).toBeChecked())
    fireEvent.click(box)
    fireEvent.click(box)
    expect(box).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(confirmSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('ブランドを外したままなら「キャンセル」で確認が出る', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderEditForm()
    const box = await screen.findByRole('checkbox', { name: 'ei8ht plants' })
    await waitFor(() => expect(box).toBeChecked())
    fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(confirmSpy).toHaveBeenCalledWith('保存していない変更があります。破棄して移動しますか？')
    confirmSpy.mockRestore()
  })
})
