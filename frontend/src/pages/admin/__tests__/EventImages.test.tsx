/**
 * EventImages（イベント画像DLページ）のテスト
 *
 * 1. collectEventImages: 出どころ別グループの収集・順序・キャプション・重複除外・空URL除外・0枚グループ非表示
 * 2. buildImageFileName: 禁止文字の置換・2桁番号・拡張子の決め方（URL → MIME タイプ → jpg）
 * 3. ページ表示: グループ見出しと枚数・0枚メッセージ・管理情報の取得失敗時もほかの画像が出る
 * 4. ダウンロード: 成功時に a[download] がクリックされる・失敗時に失敗メッセージと元画像リンクが出る
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AdminEventImages, { collectEventImages, buildImageFileName } from '../EventImages'
import { api } from '../../../lib/api'
import type { Event, EventAdminInfo } from '../../../lib/api'

// api モジュールのモック。型などは実物を使い、api の関数だけを差し替える
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      events: {
        get: vi.fn(),
        getAdminInfo: vi.fn(),
      },
    },
  }
})

// ---- テスト用モックデータ ----

/** 画像のないイベント（各テストで images / page_content を上書きして使う） */
const BASE_EVENT: Event = {
  id: 'evt-img-1',
  slug: null,
  name: '春の植物市',
  start_date: '2099-04-01',
  end_date: null,
  time: null,
  location: 'テスト会場',
  booth_number: null,
  address: null,
  official_url: null,
  brands: [],
  has_workshop: false,
  ws_requires_reservation: false,
  is_past: false,
  display_order: 1,
  images: [],
  page_content: null,
  daily_times: null,
}

/** 全グループに画像があるイベント。images は display_order が逆順で入っている */
const FULL_EVENT: Event = {
  ...BASE_EVENT,
  images: [
    { id: 'i2', url: 'https://ex.com/ev-b.jpg', display_order: 2 },
    { id: 'i1', url: 'https://ex.com/ev-a.jpg', display_order: 1 },
  ],
  page_content: {
    hero: { image_url: 'https://ex.com/hero.jpg' },
    lineup: [
      { title: 'モンステラ', image_url: 'https://ex.com/lineup-1.jpg' },
      { title: '', image_url: 'https://ex.com/lineup-2.jpg' },
    ],
    guests: [{ name: '山田さん', image_url: 'https://ex.com/guest-1.jpg' }],
    archive: { enabled: true, gallery: ['https://ex.com/arc-1.jpg'] },
  },
}

/**
 * 画像DLページを /admin/events/:id/images でレンダリングするヘルパー
 */
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/events/evt-img-1/images']}>
      <Routes>
        <Route path="/admin/events/:id/images" element={<AdminEventImages />} />
      </Routes>
    </MemoryRouter>,
  )
}

// ---- collectEventImages ----

describe('collectEventImages — 画像の収集', () => {
  it('全グループに画像があるとき、決まった順でグループが並ぶ', () => {
    // 出店要項も渡すと6グループすべてがこの順で返る
    const groups = collectEventImages(FULL_EVENT, { guidelines_image_urls: ['https://ex.com/gl-1.jpg'] })
    expect(groups.map((g) => g.group)).toEqual([
      'イベント画像',
      'イベントサイト：メイン画像',
      'イベントサイト：ラインナップ',
      'イベントサイト：ゲスト',
      'イベントサイト：アーカイブ',
      '管理情報：出店要項',
    ])
  })

  it('イベント画像は display_order の昇順に並び替えられる', () => {
    const groups = collectEventImages(FULL_EVENT)
    expect(groups[0].items.map((i) => i.url)).toEqual(['https://ex.com/ev-a.jpg', 'https://ex.com/ev-b.jpg'])
  })

  it('ラインナップは title、ゲストは name がキャプションになり、空の title はキャプションなしになる', () => {
    const groups = collectEventImages(FULL_EVENT)
    const lineup = groups.find((g) => g.group === 'イベントサイト：ラインナップ')!
    expect(lineup.items[0].caption).toBe('モンステラ')
    expect(lineup.items[1].caption).toBeUndefined()
    const guests = groups.find((g) => g.group === 'イベントサイト：ゲスト')!
    expect(guests.items[0].caption).toBe('山田さん')
  })

  it('同じ URL は最初に出たグループだけに残り、後のグループからは除かれる', () => {
    // メイン画像とアーカイブ・出店要項にイベント画像と同じ URL を入れる
    const ev: Event = {
      ...BASE_EVENT,
      images: [{ id: 'i1', url: 'https://ex.com/same.jpg', display_order: 1 }],
      page_content: {
        hero: { image_url: 'https://ex.com/same.jpg' },
        archive: { enabled: true, gallery: ['https://ex.com/same.jpg', 'https://ex.com/arc.jpg'] },
      },
    }
    const groups = collectEventImages(ev, { guidelines_image_urls: ['https://ex.com/same.jpg'] })
    // メイン画像と出店要項は全部重複なので0枚になり、グループごと消える
    expect(groups.map((g) => g.group)).toEqual(['イベント画像', 'イベントサイト：アーカイブ'])
    expect(groups[1].items.map((i) => i.url)).toEqual(['https://ex.com/arc.jpg'])
  })

  it('前後に空白がある URL も同じ URL として重複除外される', () => {
    const ev: Event = {
      ...BASE_EVENT,
      images: [{ id: 'i1', url: 'https://ex.com/a.jpg', display_order: 1 }],
      page_content: { archive: { enabled: true, gallery: [' https://ex.com/a.jpg '] } },
    }
    expect(collectEventImages(ev).map((g) => g.group)).toEqual(['イベント画像'])
  })

  it('空文字・空白だけ・未設定の image_url は除かれ、0枚のグループは返さない', () => {
    const ev: Event = {
      ...BASE_EVENT,
      page_content: {
        hero: { image_url: '' },
        lineup: [{ title: '画像なし' }, { title: '空白', image_url: '   ' }],
        guests: [{ name: 'ゲスト', image_url: '' }],
        archive: { enabled: true, gallery: ['', 'https://ex.com/arc.jpg'] },
      },
    }
    const groups = collectEventImages(ev)
    expect(groups).toEqual([{ group: 'イベントサイト：アーカイブ', items: [{ url: 'https://ex.com/arc.jpg' }] }])
  })

  it('page_content が null で images も空なら空配列を返す', () => {
    expect(collectEventImages(BASE_EVENT)).toEqual([])
  })

  it('adminInfo が undefined のとき出店要項グループは出ない', () => {
    expect(collectEventImages(FULL_EVENT).some((g) => g.group === '管理情報：出店要項')).toBe(false)
  })

  it('adminInfo が null のとき出店要項グループは出ない', () => {
    expect(collectEventImages(FULL_EVENT, null).some((g) => g.group === '管理情報：出店要項')).toBe(false)
  })

  it('guidelines_image_urls が空配列・未設定のとき出店要項グループは出ない', () => {
    expect(collectEventImages(BASE_EVENT, { guidelines_image_urls: [] })).toEqual([])
    expect(collectEventImages(BASE_EVENT, {})).toEqual([])
  })

  it('出店要項の中で同じ URL が重複していると1枚にまとめられる', () => {
    const groups = collectEventImages(BASE_EVENT, {
      guidelines_image_urls: ['https://ex.com/g1.png', 'https://ex.com/g1.png', 'https://ex.com/g2.png'],
    })
    expect(groups).toEqual([
      { group: '管理情報：出店要項', items: [{ url: 'https://ex.com/g1.png' }, { url: 'https://ex.com/g2.png' }] },
    ])
  })
})

// ---- buildImageFileName ----

describe('buildImageFileName — ダウンロード時のファイル名', () => {
  it('「イベント名_2桁番号.拡張子」の形になる', () => {
    expect(buildImageFileName('春の植物市', 3, 'https://ex.com/a/photo.jpg')).toBe('春の植物市_03.jpg')
  })

  it('番号が2桁以上ならそのまま使う', () => {
    expect(buildImageFileName('市', 12, 'https://ex.com/a.png')).toBe('市_12.png')
    expect(buildImageFileName('市', 123, 'https://ex.com/a.png')).toBe('市_123.png')
  })

  it('ファイル名に使えない文字 \\ / : * ? " < > | と改行は _ に置き換わる', () => {
    expect(buildImageFileName('a\\b/c:d*e?f"g<h>i|j\nk\rl', 1, 'https://ex.com/x.jpg')).toBe('a_b_c_d_e_f_g_h_i_j_k_l_01.jpg')
  })

  it('URL にクエリやハッシュが付いていても拡張子を取り出せる', () => {
    expect(buildImageFileName('市', 1, 'https://ex.com/a.webp?width=600&v=2')).toBe('市_01.webp')
    expect(buildImageFileName('市', 1, 'https://ex.com/a.gif#top')).toBe('市_01.gif')
  })

  it('大文字の拡張子は小文字になる', () => {
    expect(buildImageFileName('市', 1, 'https://ex.com/A.JPEG')).toBe('市_01.jpeg')
  })

  it('URL に拡張子がないときは MIME タイプから決める', () => {
    expect(buildImageFileName('市', 1, 'https://ex.com/image', 'image/png')).toBe('市_01.png')
    expect(buildImageFileName('市', 1, 'https://ex.com/image', 'IMAGE/WEBP')).toBe('市_01.webp')
  })

  it('URL にも MIME タイプにも手がかりがなければ jpg になる', () => {
    expect(buildImageFileName('市', 1, 'https://ex.com/image')).toBe('市_01.jpg')
    expect(buildImageFileName('市', 1, 'https://ex.com/image', 'application/octet-stream')).toBe('市_01.jpg')
  })

  it('拡張子らしくない末尾（記号を含む）は無視して MIME タイプを使う', () => {
    expect(buildImageFileName('市', 1, 'https://ex.com/photo.v2-final', 'image/gif')).toBe('市_01.gif')
  })

  it('相対 URL でも拡張子を取り出せる', () => {
    expect(buildImageFileName('市', 1, '/img/logo.png')).toBe('市_01.png')
  })
})

// ---- ページ表示 ----

describe('AdminEventImages ページ — 表示', () => {
  beforeEach(() => {
    vi.mocked(api.events.get).mockReset()
    vi.mocked(api.events.getAdminInfo).mockReset()
  })

  it('読み込み中は「読み込み中...」が表示される', () => {
    vi.mocked(api.events.get).mockReturnValue(new Promise(() => {}))
    vi.mocked(api.events.getAdminInfo).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText('読み込み中...')).toBeInTheDocument()
  })

  it('グループ見出しと各グループの枚数・合計枚数が表示される', async () => {
    vi.mocked(api.events.get).mockResolvedValue(FULL_EVENT)
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({ guidelines_image_urls: ['https://ex.com/gl-1.jpg', 'https://ex.com/gl-2.jpg'] })
    renderPage()

    // 見出し（h3）がグループ順に並ぶ
    const headings = await screen.findAllByRole('heading', { level: 3 })
    expect(headings.map((h) => h.textContent)).toEqual([
      'イベント画像2 枚',
      'イベントサイト：メイン画像1 枚',
      'イベントサイト：ラインナップ2 枚',
      'イベントサイト：ゲスト1 枚',
      'イベントサイト：アーカイブ1 枚',
      '管理情報：出店要項2 枚',
    ])
    // 合計 9 枚・ダウンロードボタンも 9 個
    expect(screen.getByText('全 9 枚')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'ダウンロード' })).toHaveLength(9)
    // 通し番号はグループをまたいで振られる（出店要項の最後が 09）
    expect(screen.getByText('09')).toBeInTheDocument()
    // キャプションが表示される
    expect(screen.getByText('モンステラ')).toBeInTheDocument()
    expect(screen.getByText('山田さん')).toBeInTheDocument()
  })

  it('画像が1枚もないとき「このイベントには画像が登録されていません」が出てグループ見出しは出ない', async () => {
    vi.mocked(api.events.get).mockResolvedValue(BASE_EVENT)
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({})
    renderPage()
    expect(await screen.findByText('このイベントには画像が登録されていません')).toBeInTheDocument()
    expect(screen.getByText('全 0 枚')).toBeInTheDocument()
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
  })

  it('管理情報の取得に失敗してもイベント画像は表示され、出店要項グループだけ出ない', async () => {
    vi.mocked(api.events.get).mockResolvedValue(FULL_EVENT)
    vi.mocked(api.events.getAdminInfo).mockRejectedValue(new Error('500'))
    renderPage()
    expect(await screen.findByText('イベント画像')).toBeInTheDocument()
    expect(screen.queryByText('管理情報：出店要項')).not.toBeInTheDocument()
    expect(screen.getByText('全 7 枚')).toBeInTheDocument()
    // 読み込みエラーは出さない
    expect(screen.queryByText('イベントの読み込みに失敗しました。')).not.toBeInTheDocument()
  })

  it('イベントの取得に失敗すると読み込みエラーが表示される', async () => {
    vi.mocked(api.events.get).mockRejectedValue(new Error('404'))
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({})
    renderPage()
    expect(await screen.findByText('イベントの読み込みに失敗しました。')).toBeInTheDocument()
  })

  it('イベント名と開始日が表示され、戻るリンクは既定でイベント一覧を指す', async () => {
    vi.mocked(api.events.get).mockResolvedValue(BASE_EVENT)
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({})
    renderPage()
    expect(await screen.findByText(/春の植物市/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /戻る/ })).toHaveAttribute('href', '/admin/events')
  })
})

// ---- ダウンロード ----

describe('AdminEventImages ページ — ダウンロード', () => {
  /** a 要素の click を差し替え、クリックされた a の download 名と href を記録する */
  let clicked: { download: string; href: string }[]
  /** URL.createObjectURL の元の値（テスト後に戻す） */
  const origCreate = URL.createObjectURL
  const origRevoke = URL.revokeObjectURL

  beforeEach(() => {
    vi.mocked(api.events.get).mockReset()
    vi.mocked(api.events.getAdminInfo).mockReset()
    clicked = []
    // 1. jsdom には createObjectURL がないのでスタブを入れる
    URL.createObjectURL = vi.fn(() => 'blob:mock-object-url')
    URL.revokeObjectURL = vi.fn()
    // 2. a.click() で jsdom が遷移しようとしないよう、クリック内容の記録だけにする
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ download: this.download, href: this.getAttribute('href') ?? '' })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    URL.createObjectURL = origCreate
    URL.revokeObjectURL = origRevoke
  })

  it('ダウンロードが成功すると「イベント名_番号.拡張子」の名前で blob URL の a がクリックされる', async () => {
    // 3. 画像2枚のイベント。2枚目の URL は拡張子なしで、MIME タイプ（png）から拡張子を決める
    vi.mocked(api.events.get).mockResolvedValue({
      ...BASE_EVENT,
      images: [
        { id: 'i1', url: 'https://ex.com/first.jpg', display_order: 1 },
        { id: 'i2', url: 'https://ex.com/second', display_order: 2 },
      ],
    })
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({} as EventAdminInfo)
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['x'], { type: 'image/png' })) })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    const buttons = await screen.findAllByRole('button', { name: 'ダウンロード' })
    await userEvent.click(buttons[1])

    // 4. 2枚目の URL を取得し、png の名前で保存される
    await waitFor(() => expect(clicked).toHaveLength(1))
    expect(fetchMock).toHaveBeenCalledWith('https://ex.com/second')
    expect(clicked[0]).toEqual({ download: '春の植物市_02.png', href: 'blob:mock-object-url' })
    // 5. 失敗メッセージは出ず、ボタンは元の表示に戻る
    expect(screen.queryByText(/ダウンロードに失敗しました/)).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'ダウンロード' })).toHaveLength(2))
  })

  it('取得結果が ok でないと失敗メッセージと元画像を開くリンクがそのカードに出る', async () => {
    vi.mocked(api.events.get).mockResolvedValue({
      ...BASE_EVENT,
      images: [
        { id: 'i1', url: 'https://ex.com/first.jpg', display_order: 1 },
        { id: 'i2', url: 'https://ex.com/second.jpg', display_order: 2 },
      ],
    })
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, blob: () => Promise.resolve(new Blob()) }))

    renderPage()
    const buttons = await screen.findAllByRole('button', { name: 'ダウンロード' })
    await userEvent.click(buttons[0])

    // 1枚目のカードにだけ失敗メッセージが出る
    const msg = await screen.findByText(/ダウンロードに失敗しました/)
    expect(screen.getAllByText(/ダウンロードに失敗しました/)).toHaveLength(1)
    const link = within(msg).getByRole('link', { name: '元画像を開く' })
    expect(link).toHaveAttribute('href', 'https://ex.com/first.jpg')
    expect(link).toHaveAttribute('target', '_blank')
    expect(clicked).toHaveLength(0)
  })

  it('fetch が例外を投げても失敗メッセージが出て、再度押して成功すると消える', async () => {
    vi.mocked(api.events.get).mockResolvedValue({
      ...BASE_EVENT,
      images: [{ id: 'i1', url: 'https://ex.com/first.jpg', display_order: 1 }],
    })
    vi.mocked(api.events.getAdminInfo).mockResolvedValue({})
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['x'], { type: 'image/jpeg' })) })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'ダウンロード' }))
    expect(await screen.findByText(/ダウンロードに失敗しました/)).toBeInTheDocument()

    // 再試行で成功すると失敗表示は消える
    await userEvent.click(screen.getByRole('button', { name: 'ダウンロード' }))
    await waitFor(() => expect(screen.queryByText(/ダウンロードに失敗しました/)).not.toBeInTheDocument())
    expect(clicked[0].download).toBe('春の植物市_01.jpg')
  })
})
