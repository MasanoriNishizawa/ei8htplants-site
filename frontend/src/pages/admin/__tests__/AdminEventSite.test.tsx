/**
 * 管理画面のイベントページ編集（pages/admin/AdminEventSite.tsx）のテスト
 * - ギャラリー画像 URL の欄は入力中に空行を消さないので、末尾に改行を打てる。保存時に前後の空白と空行を除いて配列にする
 * - 読み込みに失敗すると文言と「再読み込み」が出て、編集フォームは出ない。「再読み込み」で読み直す
 * - 保存に失敗すると文言が出て、「保存中...」から「保存」に戻り、また押せる
 * - 保存に成功すると公開ページの取り直しの印（localStorage の event_dirty_<id>）を立てる
 * api はモックにして本番には接続しない
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AdminEventSite from '../AdminEventSite'
import { api, ApiError, type Event, type PageContent } from '../../../lib/api'

// 使う api の関数だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return { ...actual, api: { events: { get: vi.fn(), savePageContent: vi.fn() }, upload: vi.fn() } }
})

/** アーカイブ表示で、ギャラリーに 1 枚あるイベント */
const EVENT = {
  id: 'ev-1', slug: 'ev', name: '春のイベント', start_date: '2099-04-01', end_date: null, time: null, location: '会場',
  booth_number: null, address: null, official_url: null, brands: [], has_workshop: false, ws_requires_reservation: false,
  is_past: false, display_order: 1, images: [], daily_times: null,
  page_content: { archive: { enabled: true, title: '', message: '', gallery: ['https://example.com/1.jpg'] } },
} as unknown as Event

/**
 * 保存済みラインナップを含むイベントを作る。
 * @param lineup - イベントページに保存済みのラインナップ行
 * @returns 指定したラインナップを公開ページ内容に含むイベント
 */
const eventWithLineup = (lineup: NonNullable<PageContent['lineup']>): Event => ({
  ...EVENT,
  page_content: { ...EVENT.page_content, lineup },
}) as Event

/**
 * 保存済みゲストを含むイベントを作る。
 * @param guests - イベントページに保存済みのゲスト
 * @returns 指定したゲストを公開ページ内容に含むイベント
 */
const eventWithGuests = (guests: NonNullable<PageContent['guests']>): Event => ({
  ...EVENT,
  page_content: { ...EVENT.page_content, guests },
}) as Event

/**
 * 編集画面を開く
 * @returns render の結果
 */
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/events/ev-1/site']}>
      <Routes>
        <Route path="/admin/events/:id/site" element={<AdminEventSite />} />
      </Routes>
    </MemoryRouter>,
  )
}

/**
 *  ギャラリー画像 URL の欄
 * @returns 戻り値なし。
 */
const galleryArea = () => screen.getByLabelText('ギャラリー画像 URL（1行1URL）') as HTMLTextAreaElement

beforeEach(() => {
  vi.mocked(api.events.get).mockReset().mockResolvedValue(EVENT)
  vi.mocked(api.events.savePageContent).mockReset()
  localStorage.clear()
})

describe('AdminEventSite のギャラリー画像 URL', () => {
  it('保存済みのギャラリーが 1 行 1 URL で入る', async () => {
    renderPage()
    await screen.findByText('春のイベント')
    expect(galleryArea().value).toBe('https://example.com/1.jpg')
  })

  it('末尾に改行を打っても消えずに残る（次の URL を続けて入力できる）', async () => {
    renderPage()
    await screen.findByText('春のイベント')
    fireEvent.change(galleryArea(), { target: { value: 'https://example.com/1.jpg\n' } })
    expect(galleryArea().value).toBe('https://example.com/1.jpg\n')
    fireEvent.change(galleryArea(), { target: { value: 'https://example.com/1.jpg\n\nhttps://example.com/2.jpg' } })
    expect(galleryArea().value).toBe('https://example.com/1.jpg\n\nhttps://example.com/2.jpg')
  })

  it('保存すると、空行と前後の空白を除いた URL の配列が送られる', async () => {
    vi.mocked(api.events.savePageContent).mockResolvedValue(EVENT)
    renderPage()
    await screen.findByText('春のイベント')
    fireEvent.change(galleryArea(), { target: { value: '  https://example.com/1.jpg  \n\n\nhttps://example.com/2.jpg\n  \n' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(api.events.savePageContent).toHaveBeenCalledTimes(1))
    const sent = vi.mocked(api.events.savePageContent).mock.calls[0][1] as PageContent
    expect(sent.archive?.gallery).toEqual(['https://example.com/1.jpg', 'https://example.com/2.jpg'])
  })

  it('保存に成功すると「保存しました」になり、公開ページの取り直しの印 event_dirty_<id> が立つ', async () => {
    vi.mocked(api.events.savePageContent).mockResolvedValue(EVENT)
    renderPage()
    await screen.findByText('春のイベント')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('button', { name: '保存しました' })).toBeInTheDocument()
    expect(localStorage.getItem('event_dirty_ev-1')).toBe('1')
  })
})

describe('AdminEventSite のラインナップ編集', () => {
  it('保存済みのラインナップ名称・説明・画像を表示する', async () => {
    vi.mocked(api.events.get).mockResolvedValue(eventWithLineup([
      { title: '春の植物', description: '育てやすい植物', image_url: 'https://example.com/plant.jpg' },
    ]))
    renderPage()

    const title = await screen.findByDisplayValue('春の植物')
    expect(screen.getByDisplayValue('育てやすい植物')).toBeInTheDocument()
    const card = screen.getByText('ラインナップ 1').parentElement?.parentElement
    expect(card?.querySelector('img')).toHaveAttribute('src', 'https://example.com/plant.jpg')
    expect(title).toBeInTheDocument()
  })

  it('編集した名称・説明・画像を既存形式の保存 payload に反映する', async () => {
    const saved = eventWithLineup([
      { title: '春の植物', description: '育てやすい植物', image_url: 'https://example.com/plant.jpg' },
    ])
    vi.mocked(api.events.get).mockResolvedValue(saved)
    vi.mocked(api.events.savePageContent).mockResolvedValue(saved)
    renderPage()
    await screen.findByDisplayValue('春の植物')

    fireEvent.change(screen.getByDisplayValue('春の植物'), { target: { value: '夏の植物' } })
    fireEvent.change(screen.getByDisplayValue('育てやすい植物'), { target: { value: '日差しに強い植物' } })
    vi.mocked(api.upload).mockResolvedValue('https://example.com/summer.jpg')
    const imageInput = screen.getByDisplayValue('夏の植物').closest('div')?.parentElement?.querySelector('input[type="file"]')
    fireEvent.change(imageInput as HTMLInputElement, {
      target: { files: [new File(['plant'], 'summer.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(imageInput).toHaveValue(''))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(api.events.savePageContent).toHaveBeenCalledTimes(1))
    const sent = vi.mocked(api.events.savePageContent).mock.calls[0][1] as PageContent
    expect(sent.lineup).toEqual([
      { title: '夏の植物', description: '日差しに強い植物', image_url: 'https://example.com/summer.jpg' },
    ])
  })

  it('行を追加・削除して保存しても既存のラインナップ形式を保つ', async () => {
    const first = { title: '一番目', description: '説明 1', image_url: 'https://example.com/1.jpg' }
    const second = { title: '削除対象', description: '説明 2', image_url: 'https://example.com/2.jpg' }
    const saved = eventWithLineup([first, second])
    vi.mocked(api.events.get).mockResolvedValue(saved)
    vi.mocked(api.events.savePageContent).mockResolvedValue(saved)
    renderPage()
    await screen.findByDisplayValue('一番目')

    fireEvent.click(screen.getByRole('button', { name: '+ ラインナップを追加' }))
    fireEvent.change(screen.getAllByLabelText('名称')[2], { target: { value: '追加した項目' } })
    fireEvent.change(screen.getAllByLabelText('説明')[2], { target: { value: '追加説明' } })
    const secondCard = screen.getByText('ラインナップ 2').parentElement?.parentElement
    fireEvent.click(within(secondCard as HTMLElement).getAllByRole('button', { name: '削除' })[0])
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(api.events.savePageContent).toHaveBeenCalledTimes(1))
    const sent = vi.mocked(api.events.savePageContent).mock.calls[0][1] as PageContent
    expect(sent.lineup).toEqual([
      first,
      { title: '追加した項目', description: '追加説明', image_url: '' },
    ])
  })
})

describe('AdminEventSite のゲスト編集', () => {
  it('保存済みゲストの各項目を表示し、複数項目と画像を編集して既存の順序・値とともに保存する', /**
   * 保存済みプロフィールの表示、複数項目・画像の変更、順序を保った保存 payload を確認する。
   * @returns {Promise<void>} 表示と保存内容の検証が完了したときに解決する。
   */
  async () => {
    const first = {
      name: '山田 花子',
      role: '植物家',
      bio: '季節の草花を育てています。',
      image_url: 'https://example.com/hanako.jpg',
      instagram_url: 'https://instagram.com/hanako',
    }
    const second = {
      name: '佐藤 太郎',
      role: '陶芸作家',
      bio: '土の表情を器にしています。',
      image_url: 'https://example.com/taro.jpg',
      instagram_url: 'https://instagram.com/taro',
    }
    const saved = eventWithGuests([first, second])
    vi.mocked(api.events.get).mockResolvedValue(saved)
    vi.mocked(api.events.savePageContent).mockResolvedValue(saved)
    vi.mocked(api.upload).mockResolvedValue('https://example.com/hanako-new.jpg')
    renderPage()

    // 1. 保存済みの2名について、プロフィール項目と画像がフォームに表示されることを確認する。
    const firstName = await screen.findByDisplayValue(first.name)
    expect(screen.getByDisplayValue(first.role)).toBeInTheDocument()
    expect(screen.getByDisplayValue(first.bio)).toBeInTheDocument()
    expect(screen.getByDisplayValue(first.instagram_url)).toBeInTheDocument()
    expect(screen.getByDisplayValue(second.name)).toBeInTheDocument()
    expect(screen.getByDisplayValue(second.role)).toBeInTheDocument()
    expect(screen.getByDisplayValue(second.bio)).toBeInTheDocument()
    expect(screen.getByDisplayValue(second.instagram_url)).toBeInTheDocument()
    const firstCard = screen.getByText('ゲスト 1').parentElement?.parentElement as HTMLElement
    const secondCard = screen.getByText('ゲスト 2').parentElement?.parentElement as HTMLElement
    expect(firstCard.querySelector('img')).toHaveAttribute('src', first.image_url)
    expect(secondCard.querySelector('img')).toHaveAttribute('src', second.image_url)

    // 2. 1人目の文字項目と画像、2人目のInstagramを変更し、画像アップロード完了を待つ。
    fireEvent.change(firstName, { target: { value: '山田 花子 改' } })
    fireEvent.change(screen.getByDisplayValue(first.role), { target: { value: '園芸家' } })
    fireEvent.change(screen.getByDisplayValue(first.bio), { target: { value: '新しいプロフィールです。' } })
    fireEvent.change(screen.getByDisplayValue(second.instagram_url), { target: { value: 'https://instagram.com/taro_new' } })
    const imageInput = firstCard.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(imageInput, {
      target: { files: [new File(['portrait'], 'hanako.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => expect(api.upload).toHaveBeenCalledWith(expect.any(File)))
    await waitFor(() => expect(imageInput).toHaveValue(''))
    expect(firstCard.querySelector('img')).toHaveAttribute('src', 'https://example.com/hanako-new.jpg')

    // 3. 親画面から保存し、編集した内容と未変更の値が順序を保って送られることを確認する。
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(api.events.savePageContent).toHaveBeenCalledTimes(1))
    const sent = vi.mocked(api.events.savePageContent).mock.calls[0][1] as PageContent
    expect(sent.guests).toEqual([
      {
        ...first,
        name: '山田 花子 改',
        role: '園芸家',
        bio: '新しいプロフィールです。',
        image_url: 'https://example.com/hanako-new.jpg',
      },
      { ...second, instagram_url: 'https://instagram.com/taro_new' },
    ])
  })

  it('ゲストを追加して別のゲストを削除しても、残る順序と空の追加項目を保存する', /**
   * 追加・削除後のゲスト順序と、新規項目の空値が保存 payload に残ることを確認する。
   * @returns {Promise<void>} 画面と保存 payload の検証が完了したときに解決する。
   */
  async () => {
    const first = { name: '残すゲスト', role: '園芸家', bio: '残すプロフィール', image_url: 'https://example.com/keep.jpg', instagram_url: 'https://instagram.com/keep' }
    const removed = { name: '削除するゲスト', role: '作家', bio: '削除するプロフィール', image_url: 'https://example.com/remove.jpg', instagram_url: 'https://instagram.com/remove' }
    const saved = eventWithGuests([first, removed])
    vi.mocked(api.events.get).mockResolvedValue(saved)
    vi.mocked(api.events.savePageContent).mockResolvedValue(saved)
    renderPage()
    await screen.findByDisplayValue(first.name)

    // 1. 末尾に空のゲストを追加し、既存2人目を削除する。
    fireEvent.click(screen.getByRole('button', { name: '+ ゲストを追加' }))
    expect(screen.getByText('ゲスト 3')).toBeInTheDocument()
    const removedCard = screen.getByText('ゲスト 2').parentElement?.parentElement as HTMLElement
    fireEvent.click(within(removedCard).getAllByRole('button', { name: '削除' })[0])

    // 2. 保存前に残ったカードの順序と、新規カードの全フィールドが空であることを確認する。
    expect(screen.getByText('ゲスト 1')).toBeInTheDocument()
    expect(screen.getByText('ゲスト 2')).toBeInTheDocument()
    expect(screen.queryByDisplayValue(removed.name)).toBeNull()
    const addedCard = screen.getByText('ゲスト 2').parentElement?.parentElement as HTMLElement
    expect(within(addedCard).getByLabelText('名前')).toHaveValue('')
    expect(within(addedCard).getByLabelText('役割・肩書き')).toHaveValue('')
    expect(within(addedCard).getByLabelText('プロフィール')).toHaveValue('')
    expect(within(addedCard).getByLabelText('Instagram URL')).toHaveValue('')
    expect(addedCard.querySelector('img')).toBeNull()

    // 3. 保存 payload でも、1人目の値・順序と追加項目の空値が維持されることを確認する。
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(api.events.savePageContent).toHaveBeenCalledTimes(1))
    const sent = vi.mocked(api.events.savePageContent).mock.calls[0][1] as PageContent
    expect(sent.guests).toEqual([
      first,
      { name: '', role: '', bio: '', image_url: '', instagram_url: '' },
    ])
  })
})

describe('AdminEventSite の失敗の表示', () => {
  it('読み込みに失敗すると文言と「再読み込み」が出て、編集フォーム（保存ボタン）は出ない', async () => {
    vi.mocked(api.events.get).mockRejectedValue(new ApiError(500, '500 Internal Server Error', null))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('イベントの読み込みに失敗しました（500 Internal Server Error）')
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
  })

  it('「再読み込み」を押すと読み直し、成功すれば編集フォームが出る', async () => {
    vi.mocked(api.events.get).mockRejectedValueOnce(new Error('network')).mockResolvedValue(EVENT)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '再読み込み' }))
    expect(await screen.findByRole('button', { name: '保存' })).toBeInTheDocument()
    expect(api.events.get).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('保存に失敗すると文言が出て、「保存中...」から「保存」に戻ってまた押せる。印は立たない', async () => {
    vi.mocked(api.events.savePageContent).mockRejectedValue(new ApiError(500, '500 Internal Server Error', null))
    renderPage()
    await screen.findByText('春のイベント')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存に失敗しました（500 Internal Server Error）')
    const button = screen.getByRole('button', { name: '保存' })
    expect(button).toBeEnabled()
    expect(screen.queryByText('保存中...')).toBeNull()
    expect(localStorage.getItem('event_dirty_ev-1')).toBeNull()
  })
})
