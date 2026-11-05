/**
 * 管理画面「ページ画像の編集」（/admin/page-editor/:brand/:page?、PageEditor.tsx）のテスト
 *
 * 確かめること:
 * 1. iframe で /admin/page-preview/:brand/:page を出し、PC/スマホの幅を切り替えられる
 * 2. 枠の一覧・プレビューからの選択（postMessage）で右のパネルを出す。origin と送り元の window が違うメッセージは無視する
 * 3. パネルで画像を選ぶ・外す・取り消すと、変更の件数と枠の一覧の「変更あり」が変わり、プレビューに草稿を送る
 * 4. まとめて保存: 成功した枠は件数から消え、失敗した枠は残って「失敗」と理由を出す
 * 5. ブランドのタブ: 未保存なら確認を出し、やめると移動しない
 * 6. 読み込みに失敗したら、画像を選ぶことと保存を止める
 * 7. 正しくないブランドの URL は ei8htplants に移る
 * 8. ブランド × ページ: :page を省くと home、正しくないページはそのブランドの home へ移る。ページの選択欄で切り替えても
 *    確認を出さず草稿が残り、「変更 N 件」と保存はブランド全体が対象。複数のページで使う枠は共通の案内を出す。公式サイトの枠
 *
 * api はモックにして本番には接続しない。React Router はモックしない。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { api } from '../../../lib/api'
import PageEditor from '../PageEditor'
import { BRAND_SHOWCASES } from '../../../lib/brandShowcase'

// 使う api の関数だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      siteAssets: { list: vi.fn(), get: vi.fn(), save: vi.fn() },
      upload: vi.fn(),
    },
  }
})

/**
 * 今のパスを表示する部品（タブで移動したかを確かめる）。
 * @returns パスを出す要素
 */
function LocationProbe() {
  return <p data-testid="location">{useLocation().pathname}</p>
}

/**
 * 編集画面を指定のパスで描画し、読み込みを待つ。
 * @param path - 開くパス
 * @returns なし
 */
async function renderEditor(path = '/admin/page-editor/ei8htplants') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/page-editor/:brand/:page?" element={<><PageEditor /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  )
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
}

/** プレビューの iframe */
const frame = () => screen.getByTestId('page-editor-frame') as HTMLIFrameElement
/** 変更の件数の表示 */
const countText = () => screen.getByTestId('page-editor-changed-count').textContent

/**
 * プレビュー（iframe）から親へメッセージが届いたことにする。
 * @param data - メッセージの中身
 * @param options - origin と送り元（省略すると同じオリジン・iframe の window）
 * @returns なし
 */
function postFromFrame(data: unknown, options: { origin?: string; source?: Window | null } = {}) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data,
      origin: options.origin ?? window.location.origin,
      source: options.source === undefined ? frame().contentWindow : options.source,
    }))
  })
}

/**
 * パネルのファイル選択欄で画像を選び、アップロードの完了を待つ。
 * @returns なし
 */
async function chooseFileInPanel() {
  const panel = screen.getByTestId('page-editor-panel')
  fireEvent.change(within(panel).getByLabelText('画像を選ぶ'), {
    target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] },
  })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
}

describe('PageEditor（ページ画像の編集）', () => {
  beforeEach(() => {
    vi.mocked(api.siteAssets.list).mockReset()
    vi.mocked(api.siteAssets.save).mockReset()
    vi.mocked(api.upload).mockReset()
    vi.mocked(api.siteAssets.list).mockImplementation(async (prefix: string) => (
      prefix === 'ei8ht-'
        ? [{ key: 'ei8ht-hero', url: '/saved-hero.jpg' }, { key: 'ei8ht-wordmark', url: '' }]
        : []
    ))
    vi.mocked(api.upload).mockResolvedValue('/uploaded.png')
    vi.mocked(api.siteAssets.save).mockImplementation(async (key, url) => ({ key, url }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('iframe でブランドのプレビューを出し、変更がなければ「変更はありません」で保存は押せない', async () => {
    await renderEditor()
    expect(frame()).toHaveAttribute('src', '/admin/page-preview/ei8htplants/home')
    expect(api.siteAssets.list).toHaveBeenCalledWith('ei8ht-')
    expect(countText()).toBe('変更はありません')
    expect(screen.getByTestId('page-editor-save')).toBeDisabled()
    expect(screen.queryByTestId('page-editor-panel')).not.toBeInTheDocument()
  })

  it('PC/スマホのボタンで iframe の幅が 1280px と 390px に切り替わる', async () => {
    await renderEditor()
    expect(screen.getByTestId('page-editor-viewport-pc')).toHaveAttribute('aria-pressed', 'true')
    expect(frame().style.width).toBe('1280px')
    fireEvent.click(screen.getByTestId('page-editor-viewport-sp'))
    expect(screen.getByTestId('page-editor-viewport-sp')).toHaveAttribute('aria-pressed', 'true')
    expect(frame().style.width).toBe('390px')
  })

  it('枠の一覧から選ぶとその枠のパネルが出て、閉じると消える', async () => {
    await renderEditor()
    fireEvent.click(screen.getByTestId('page-editor-slot-ei8ht-hero'))
    const panel = screen.getByTestId('page-editor-panel')
    expect(within(panel).getByRole('heading', { name: 'メインの写真' })).toBeInTheDocument()
    expect(within(panel).getByRole('img', { name: 'メインの写真 の今の画像' })).toHaveAttribute('src', '/saved-hero.jpg')
    fireEvent.click(within(panel).getByRole('button', { name: '閉じる' }))
    expect(screen.queryByTestId('page-editor-panel')).not.toBeInTheDocument()
  })

  it('プレビューからの select のメッセージでパネルが出る。origin・送り元・ブランドが違うものは無視する', async () => {
    await renderEditor()
    // 1. 違うオリジン
    postFromFrame({ type: 'page-editor:select', brand: 'ei8htplants', page: 'home', key: 'ei8ht-hero' }, { origin: 'https://evil.example.com' })
    // 2. iframe 以外の window から
    postFromFrame({ type: 'page-editor:select', brand: 'ei8htplants', page: 'home', key: 'ei8ht-hero' }, { source: window })
    // 3. 違うブランド
    postFromFrame({ type: 'page-editor:select', brand: 'hue', page: 'home', key: 'ei8ht-hero' })
    // 4. 形の違うメッセージ
    postFromFrame({ type: 'page-editor:select', brand: 'ei8htplants', page: 'home' })
    expect(screen.queryByTestId('page-editor-panel')).not.toBeInTheDocument()
    postFromFrame({ type: 'page-editor:select', brand: 'ei8htplants', page: 'about', key: 'ei8ht-wordmark' })
    expect(screen.queryByTestId('page-editor-panel')).not.toBeInTheDocument()
    // 5. 正しいメッセージ
    postFromFrame({ type: 'page-editor:select', brand: 'ei8htplants', page: 'home', key: 'ei8ht-wordmark' })
    expect(within(screen.getByTestId('page-editor-panel')).getByRole('heading', { name: 'ロゴ（文字）' })).toBeInTheDocument()
  })

  it('準備ができたメッセージを受けると、草稿と選んだ枠をプレビューに同じオリジン宛てで送る', async () => {
    await renderEditor()
    const post = vi.spyOn(frame().contentWindow as Window, 'postMessage')
    postFromFrame({ type: 'page-editor:ready', brand: 'ei8htplants', page: 'home' })
    expect(post).toHaveBeenLastCalledWith({
      type: 'page-editor:state',
      brand: 'ei8htplants', page: 'home',
      draftUrls: { 'ei8ht-hero': '/saved-hero.jpg', 'ei8ht-wordmark': '', 'ei8ht-about-hero': '' },
      selectedKey: null,
      reveal: false,
    }, window.location.origin)
    // 一覧から選ぶと reveal: true で送り直す
    fireEvent.click(screen.getByTestId('page-editor-slot-ei8ht-wordmark'))
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ selectedKey: 'ei8ht-wordmark', reveal: true }), window.location.origin)
  })

  it('パネルで画像を選ぶと件数が「変更 1 件（未保存）」になり、一覧に「変更あり」が付き、草稿がプレビューに送られる', async () => {
    await renderEditor()
    const post = vi.spyOn(frame().contentWindow as Window, 'postMessage')
    postFromFrame({ type: 'page-editor:ready', brand: 'ei8htplants', page: 'home' })
    fireEvent.click(screen.getByTestId('page-editor-slot-ei8ht-wordmark'))
    await chooseFileInPanel()
    expect(countText()).toBe('変更 1 件（未保存）')
    expect(within(screen.getByTestId('page-editor-slot-ei8ht-wordmark')).getByText('変更あり')).toBeInTheDocument()
    expect(screen.getByTestId('page-editor-save')).toBeEnabled()
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({
      draftUrls: { 'ei8ht-hero': '/saved-hero.jpg', 'ei8ht-wordmark': '/uploaded.png', 'ei8ht-about-hero': '' },
    }), window.location.origin)
  })

  it('「画像を外す」で件数が増え、「変更を取り消す」で 0 件に戻る', async () => {
    await renderEditor()
    fireEvent.click(screen.getByTestId('page-editor-slot-ei8ht-hero'))
    const panel = screen.getByTestId('page-editor-panel')
    fireEvent.click(within(panel).getByRole('button', { name: '画像を外す' }))
    expect(countText()).toBe('変更 1 件（未保存）')
    // 外すと localSrc の画像がプレビューに出る
    expect(within(panel).getByRole('img', { name: 'メインの写真 の今の画像' })).toHaveAttribute('src', '/img/ei8htPlants/ei8htplants_hero.jpg')
    fireEvent.click(within(panel).getByRole('button', { name: '変更を取り消す' }))
    expect(countText()).toBe('変更はありません')
  })

  it('「保存する」で変更した枠だけを保存し、成功すると件数が 0 件になる', async () => {
    await renderEditor()
    fireEvent.click(screen.getByTestId('page-editor-slot-ei8ht-wordmark'))
    await chooseFileInPanel()
    fireEvent.click(screen.getByTestId('page-editor-save'))
    expect(await screen.findByText('1 件を保存しました。公開ページに反映されます。')).toBeInTheDocument()
    expect(api.siteAssets.save).toHaveBeenCalledTimes(1)
    expect(api.siteAssets.save).toHaveBeenCalledWith('ei8ht-wordmark', '/uploaded.png')
    expect(countText()).toBe('変更はありません')
  })

  it('一部の枠の保存に失敗すると、失敗した枠は変更に残り「失敗」と理由が出る', async () => {
    vi.mocked(api.siteAssets.save).mockImplementation(async (key, url) => {
      if (key === 'ei8ht-hero') throw new Error('サーバーエラー')
      return { key, url }
    })
    await renderEditor()
    // 1. 2枠を変える（hero は外す、wordmark は画像を選ぶ）
    fireEvent.click(screen.getByTestId('page-editor-slot-ei8ht-hero'))
    fireEvent.click(within(screen.getByTestId('page-editor-panel')).getByRole('button', { name: '画像を外す' }))
    fireEvent.click(screen.getByTestId('page-editor-slot-ei8ht-wordmark'))
    await chooseFileInPanel()
    expect(countText()).toBe('変更 2 件（未保存）')
    // 2. 保存すると、成功1件・失敗1件の案内が出る
    fireEvent.click(screen.getByTestId('page-editor-save'))
    expect(await screen.findByText(/1 件を保存しました。1 件は保存できませんでした/)).toBeInTheDocument()
    expect(countText()).toBe('変更 1 件（未保存）')
    expect(within(screen.getByTestId('page-editor-slot-ei8ht-hero')).getByText('失敗')).toBeInTheDocument()
    expect(within(screen.getByTestId('page-editor-slot-ei8ht-wordmark')).queryByText('変更あり')).not.toBeInTheDocument()
    // 3. 失敗した枠を選ぶと理由が出る
    fireEvent.click(screen.getByTestId('page-editor-slot-ei8ht-hero'))
    expect(within(screen.getByTestId('page-editor-panel')).getByRole('alert')).toHaveTextContent('保存に失敗しました')
  })

  it('未保存の変更があるときにタブを押すと確認を出し、やめると移動しない', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await renderEditor()
    fireEvent.click(screen.getByTestId('page-editor-slot-ei8ht-hero'))
    fireEvent.click(within(screen.getByTestId('page-editor-panel')).getByRole('button', { name: '画像を外す' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Habitat Oides' }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/page-editor/ei8htplants')
    expect(countText()).toBe('変更 1 件（未保存）')
  })

  it('未保存の変更があっても確認で OK すると移動し、新しいブランドの枠と prefix に切り替わる', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await renderEditor()
    fireEvent.click(screen.getByTestId('page-editor-slot-ei8ht-hero'))
    fireEvent.click(within(screen.getByTestId('page-editor-panel')).getByRole('button', { name: '画像を外す' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Habitat Oides' }))
    await act(async () => { await Promise.resolve() })
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/page-editor/habitat-oides')
    expect(api.siteAssets.list).toHaveBeenLastCalledWith('habitat-')
    expect(frame()).toHaveAttribute('src', '/admin/page-preview/habitat-oides/home')
    expect(screen.getByTestId('page-editor-slot-habitat-object-06')).toBeInTheDocument()
    expect(countText()).toBe('変更はありません')
  })

  it('未保存の変更がなければタブを押しても確認を出さずに移動する', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    await renderEditor()
    fireEvent.click(screen.getByRole('tab', { name: 'HUE' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/page-editor/hue')
  })

  it('読み込みに失敗すると案内を出し、パネルの画像の選択と保存を止め、プレビューには草稿を送らない', async () => {
    vi.mocked(api.siteAssets.list).mockRejectedValue(new Error('network'))
    await renderEditor()
    expect(screen.getByRole('alert')).toHaveTextContent('画像の設定を読み込めませんでした')
    const post = vi.spyOn(frame().contentWindow as Window, 'postMessage')
    postFromFrame({ type: 'page-editor:ready', brand: 'ei8htplants', page: 'home' })
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ draftUrls: {} }), window.location.origin)
    fireEvent.click(screen.getByTestId('page-editor-slot-ei8ht-hero'))
    expect(within(screen.getByTestId('page-editor-panel')).getByLabelText('画像を選ぶ')).toBeDisabled()
    expect(screen.getByTestId('page-editor-save')).toBeDisabled()
  })

  it('正しくないブランドの URL を開くと ei8htplants の編集画面に移る', async () => {
    await renderEditor('/admin/page-editor/unknown')
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/page-editor/ei8htplants')
    expect(frame()).toHaveAttribute('src', '/admin/page-preview/ei8htplants/home')
  })
})

/** 同じブランドのページ間では、草稿と共通枠の選択を保持する。 */
describe('PageEditorのページ切替', () => {
  it('共有ロゴを変更してAboutへ切り替えると草稿と選択を保つ', async () => {
    vi.mocked(api.siteAssets.list).mockResolvedValue([])
    vi.mocked(api.upload).mockResolvedValue('/shared-logo.png')
    await renderEditor()
    fireEvent.click(screen.getByTestId('page-editor-slot-ei8ht-wordmark'))
    await chooseFileInPanel()
    fireEvent.change(screen.getByLabelText('編集するページ'), { target: { value: 'about' } })
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/page-editor/ei8htplants/about')
    expect(frame()).toHaveAttribute('src', '/admin/page-preview/ei8htplants/about')
    expect(countText()).toBe('変更 1 件（未保存）')
    expect(screen.getByTestId('page-editor-panel-shared')).toHaveTextContent('トップページ・About')
    expect(within(screen.getByTestId('page-editor-panel')).getByRole('img')).toHaveAttribute('src', '/shared-logo.png')
    expect(screen.queryByTestId('page-editor-slot-ei8ht-hero')).not.toBeInTheDocument()
    expect(screen.getByTestId('page-editor-slot-ei8ht-about-hero')).toBeInTheDocument()
  })
})

/** 公式サイトの HUE 枠は、ページごとに異なる既存表示へ戻る。 */
describe('PageEditorの公式HUE画像の削除', () => {
  it.each([
    ['home', '/hue-photo.jpg', BRAND_SHOWCASES[2].logo, 'HUE のロゴ'],
    ['brands', '/hue-photo.jpg', '/hue-photo.jpg', 'HUE の写真（hue-color-01）'],
    ['brands', '', null, '未設定（HUE の写真なし）'],
  ])('%s で画像を外すと公開ページと同じ代替表示と説明になる（HUE写真=%s）', async (pageId, hueUrl, expectedSrc, sourceNote) => {
    // 1. 公式カードの保存済み画像と、別管理の HUE 写真を用意する。
    vi.mocked(api.siteAssets.list).mockResolvedValue([{ key: 'official-brand-hue', url: '/official-hue.jpg' }])
    vi.mocked(api.siteAssets.get).mockResolvedValue({ key: 'hue-color-01', url: hueUrl })
    vi.mocked(api.siteAssets.save).mockImplementation(async (key, url) => ({ key, url }))
    await renderEditor(`/admin/page-editor/official/${pageId}`)
    fireEvent.click(screen.getByTestId('page-editor-slot-official-brand-hue'))
    const panel = screen.getByTestId('page-editor-panel')
    expect(within(panel).getByRole('img')).toHaveAttribute('src', '/official-hue.jpg')
    // 2. 削除の案内と、削除した直後の画像・出どころを確認する。
    expect(within(panel).getByText('外すと、公式トップでは HUE のロゴ、Our Brands では HUE の写真（hue-color-01）が表示されます。HUE の写真が未設定の場合、Our Brands の背景写真は表示されません。')).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: '画像を外す' }))
    if (expectedSrc) expect(within(panel).getByRole('img')).toHaveAttribute('src', expectedSrc)
    else expect(within(panel).getByText('画像なし')).toBeInTheDocument()
    expect(within(panel).getByText(sourceNote, { exact: true })).toBeInTheDocument()
    expect(countText()).toBe('変更 1 件（未保存）')
    // 3. HUE 側の写真を消さず、公式カードだけを空 URL で保存する。
    fireEvent.click(screen.getByTestId('page-editor-save'))
    await screen.findByText('1 件を保存しました。公開ページに反映されます。')
    expect(api.siteAssets.save).toHaveBeenLastCalledWith('official-brand-hue', '')
  })
})

/**
 * ブランド × ページの切り替え（:page の確認・ページの選択欄・草稿の扱い・共通の枠の案内・公式サイトの枠）を確かめる。
 */
describe('PageEditor のブランド × ページ', () => {
  /** ページの選択欄 */
  const pageSelect = () => screen.getByTestId('page-editor-page-select') as HTMLSelectElement
  /** 今の枠の一覧に出ている枠のキー（表示順） */
  const slotKeys = () => screen.getAllByTestId(/^page-editor-slot-/).map((el) => el.getAttribute('data-testid')!.replace('page-editor-slot-', ''))
  /**
   * ページの選択欄で別のページを選ぶ。
   * @param pageId - 選ぶページの識別子
   * @returns なし
   */
  const choosePage = async (pageId: string) => {
    fireEvent.change(pageSelect(), { target: { value: pageId } })
    await act(async () => { await Promise.resolve() })
  }

  beforeEach(() => {
    vi.mocked(api.siteAssets.list).mockReset()
    vi.mocked(api.siteAssets.get).mockReset()
    vi.mocked(api.siteAssets.save).mockReset()
    vi.mocked(api.upload).mockReset()
    vi.mocked(api.siteAssets.list).mockResolvedValue([])
    vi.mocked(api.siteAssets.get).mockImplementation(async (key: string) => ({ key, url: '' }))
    vi.mocked(api.upload).mockResolvedValue('/uploaded.png')
    vi.mocked(api.siteAssets.save).mockImplementation(async (key, url) => ({ key, url }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['ei8htplants', ['home', 'about']],
    ['habitat-oides', ['home', 'workshop']],
    ['hue', ['home', 'about', 'choose', 'living']],
    ['official', ['home', 'brands']],
  ])('%s のページの選択欄には %s が並び、:page を省くと home を開く', async (brand, pages) => {
    await renderEditor(`/admin/page-editor/${brand}`)
    expect([...pageSelect().options].map((option) => option.value)).toEqual(pages)
    expect(pageSelect().value).toBe('home')
    expect(frame()).toHaveAttribute('src', `/admin/page-preview/${brand}/home`)
  })

  it('ei8ht plants の選択欄に植物のライン（plants）は出さない', async () => {
    await renderEditor('/admin/page-editor/ei8htplants')
    expect([...pageSelect().options].map((option) => option.value)).not.toContain('plants')
  })

  it.each([
    ['/admin/page-editor/hue/unknown', '/admin/page-editor/hue', 'hue'],
    ['/admin/page-editor/ei8htplants/plants', '/admin/page-editor/ei8htplants', 'ei8htplants'],
    ['/admin/page-editor/official/workshop', '/admin/page-editor/official', 'official'],
  ])('正しくないページ %s を開くと、そのブランドの home（%s）に移る', async (path, to, brand) => {
    await renderEditor(path)
    expect(screen.getByTestId('location')).toHaveTextContent(new RegExp(`^${to}$`))
    expect(pageSelect().value).toBe('home')
    expect(frame()).toHaveAttribute('src', `/admin/page-preview/${brand}/home`)
  })

  it('URL でページを指定すると、そのページの枠だけを一覧に出す（HUE の Choose は 01・03・05）', async () => {
    await renderEditor('/admin/page-editor/hue/choose')
    expect(pageSelect().value).toBe('choose')
    expect(frame()).toHaveAttribute('src', '/admin/page-preview/hue/choose')
    expect(slotKeys()).toEqual(['hue-color-01', 'hue-color-03', 'hue-color-05'])
    expect(screen.getByText('公開時の URL: huebyei8htplants.com/choose')).toBeInTheDocument()
  })

  it('ページを切り替えても確認を出さず、別のページで変えた草稿も残り、「変更 N 件」はブランド全体を数え、選択欄にページごとの件数が出る', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    await renderEditor('/admin/page-editor/ei8htplants')
    // 1. トップページで ei8ht-hero を変える
    fireEvent.click(screen.getByTestId('page-editor-slot-ei8ht-hero'))
    await chooseFileInPanel()
    expect(countText()).toBe('変更 1 件（未保存）')
    // 2. About へ移る（確認は出さない。トップページの枠を選んでいたのでパネルは閉じる）
    await choosePage('about')
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/page-editor/ei8htplants/about')
    expect(screen.queryByTestId('page-editor-panel')).not.toBeInTheDocument()
    expect(countText()).toBe('変更 1 件（未保存）')
    // 3. About で ei8ht-about-hero を変えると、ブランド全体で2件
    fireEvent.click(screen.getByTestId('page-editor-slot-ei8ht-about-hero'))
    await chooseFileInPanel()
    expect(countText()).toBe('変更 2 件（未保存）')
    // 4. 選択欄の各ページに、そのページの変更の件数が出る
    const labels = [...pageSelect().options].map((option) => option.textContent)
    expect(labels[0]).toContain('トップページ（ei8htplants.com/） - 変更 1 件')
    expect(labels[1]).toContain('About（ei8htplants.com/about） - 変更 1 件')
    // 5. トップページへ戻っても、最初の草稿は残っている
    await choosePage('home')
    expect(within(screen.getByTestId('page-editor-slot-ei8ht-hero')).getByText('変更あり')).toBeInTheDocument()
  })

  it('「保存する」は、どのページで変えた枠もまとめて保存する', async () => {
    await renderEditor('/admin/page-editor/ei8htplants')
    fireEvent.click(screen.getByTestId('page-editor-slot-ei8ht-hero'))
    await chooseFileInPanel()
    await choosePage('about')
    fireEvent.click(screen.getByTestId('page-editor-slot-ei8ht-about-hero'))
    await chooseFileInPanel()
    fireEvent.click(screen.getByTestId('page-editor-save'))
    expect(await screen.findByText('2 件を保存しました。公開ページに反映されます。')).toBeInTheDocument()
    expect(api.siteAssets.save).toHaveBeenCalledTimes(2)
    expect(api.siteAssets.save).toHaveBeenCalledWith('ei8ht-hero', '/uploaded.png')
    expect(api.siteAssets.save).toHaveBeenCalledWith('ei8ht-about-hero', '/uploaded.png')
    expect(countText()).toBe('変更はありません')
  })

  it('別のページの草稿が残っているときにブランドのタブを押すと、確認を出す', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await renderEditor('/admin/page-editor/hue')
    fireEvent.click(screen.getByTestId('page-editor-slot-hue-color-02'))
    await chooseFileInPanel()
    await choosePage('living')
    fireEvent.click(screen.getByRole('tab', { name: '公式サイト' }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/page-editor/hue/living')
  })

  it('ページを切り替えると、前のページのプレビューからの ready を数えず、新しいページの ready で草稿を送る', async () => {
    await renderEditor('/admin/page-editor/hue')
    fireEvent.click(screen.getByTestId('page-editor-slot-hue-color-02'))
    await chooseFileInPanel()
    await choosePage('living')
    const post = vi.spyOn(frame().contentWindow as Window, 'postMessage')
    // 1. 前のページ（home）からの ready は無視する
    postFromFrame({ type: 'page-editor:ready', brand: 'hue', page: 'home' })
    expect(post).not.toHaveBeenCalled()
    // 2. 今のページ（living）からの ready で、page: 'living' と、選んだままの枠（Living にもある 02）を送る
    postFromFrame({ type: 'page-editor:ready', brand: 'hue', page: 'living' })
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'page-editor:state', brand: 'hue', page: 'living', selectedKey: 'hue-color-02',
      draftUrls: expect.objectContaining({ 'hue-color-02': '/uploaded.png' }),
    }), window.location.origin)
  })

  it('今のページにない枠の select のメッセージは無視する（HUE の Living で 01 を選んでもパネルは出ない）', async () => {
    await renderEditor('/admin/page-editor/hue/living')
    postFromFrame({ type: 'page-editor:select', brand: 'hue', page: 'living', key: 'hue-color-01' })
    expect(screen.queryByTestId('page-editor-panel')).not.toBeInTheDocument()
    postFromFrame({ type: 'page-editor:select', brand: 'hue', page: 'living', key: 'hue-color-06' })
    expect(within(screen.getByTestId('page-editor-panel')).getByRole('heading', { name: '色の写真 06' })).toBeInTheDocument()
  })

  it.each([
    ['hue', 'home', 'hue-color-01', 'この写真は HUE の他のページでも使われます（トップページ・About（HUEについて）・Choose（一鉢の選び方））。'],
    ['hue', 'living', 'hue-color-06', 'この写真は HUE の他のページでも使われます（トップページ・Living（植物のある部屋））。'],
    ['ei8htplants', 'about', 'ei8ht-wordmark', 'この画像は ei8ht plants の他のページでも使われます（トップページ・About）。'],
    ['official', 'brands', 'official-brand-hue', 'この写真は 公式サイト の他のページでも使われます（トップページ・Our Brands）。'],
  ])('複数のページで使う枠（%s / %s の %s）を選ぶと、パネルに共通の案内を出す', async (brand, pageId, key, note) => {
    await renderEditor(`/admin/page-editor/${brand}/${pageId}`)
    fireEvent.click(screen.getByTestId(`page-editor-slot-${key}`))
    expect(screen.getByTestId('page-editor-panel-shared')).toHaveTextContent(note)
  })

  it.each([
    ['ei8htplants', 'home', 'ei8ht-hero'],
    ['ei8htplants', 'about', 'ei8ht-about-hero'],
    ['habitat-oides', 'home', 'habitat-world'],
    ['habitat-oides', 'workshop', 'habitat-workshop-main'],
    ['official', 'home', 'official-hero'],
  ])('1つのページだけで使う枠（%s / %s の %s）では、共通の案内を出さない', async (brand, pageId, key) => {
    await renderEditor(`/admin/page-editor/${brand}/${pageId}`)
    fireEvent.click(screen.getByTestId(`page-editor-slot-${key}`))
    expect(screen.getByTestId('page-editor-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('page-editor-panel-shared')).not.toBeInTheDocument()
  })

  it('公式サイトのトップは official- で読み込み、メインの写真とブランド紹介の3枚の枠を出し、Our Brands は3枚だけを出す', async () => {
    await renderEditor('/admin/page-editor/official')
    expect(api.siteAssets.list).toHaveBeenCalledWith('official-')
    expect(slotKeys()).toEqual(['official-hero', 'official-brand-ei8ht', 'official-brand-habitat', 'official-brand-hue'])
    await choosePage('brands')
    expect(frame()).toHaveAttribute('src', '/admin/page-preview/official/brands')
    expect(slotKeys()).toEqual(['official-brand-ei8ht', 'official-brand-habitat', 'official-brand-hue'])
    expect(screen.getByText('公開時の URL: ei8htplants.com/official/brands')).toBeInTheDocument()
  })

  it('公式サイトのメインの写真を差し替えて保存すると、official-hero を PUT する', async () => {
    await renderEditor('/admin/page-editor/official')
    fireEvent.click(screen.getByTestId('page-editor-slot-official-hero'))
    const panel = screen.getByTestId('page-editor-panel')
    expect(within(panel).getByRole('img', { name: '公式トップのメインの写真 の今の画像' })).toHaveAttribute('src', '/img/ei8htPlants/ei8htplants_hero.jpg')
    await chooseFileInPanel()
    expect(within(panel).getByRole('img', { name: '公式トップのメインの写真 の今の画像' })).toHaveAttribute('src', '/uploaded.png')
    fireEvent.click(screen.getByTestId('page-editor-save'))
    expect(await screen.findByText('1 件を保存しました。公開ページに反映されます。')).toBeInTheDocument()
    expect(api.siteAssets.save).toHaveBeenCalledWith('official-hero', '/uploaded.png')
  })

  it('公式サイトの HUE の枠が未保存のとき、パネルの今の画像はトップでは HUE のロゴ、Our Brands では hue-color-01 の写真になる', async () => {
    vi.mocked(api.siteAssets.get).mockImplementation(async (key: string) => ({ key, url: key === 'hue-color-01' ? '/hue-01.jpg' : '' }))
    await renderEditor('/admin/page-editor/official')
    fireEvent.click(screen.getByTestId('page-editor-slot-official-brand-hue'))
    expect(within(screen.getByTestId('page-editor-panel')).getByRole('img')).toHaveAttribute('src', '/img/logo-hue.png')
    await choosePage('brands')
    await act(async () => { await Promise.resolve() })
    expect(api.siteAssets.get).toHaveBeenCalledWith('hue-color-01')
    expect(within(screen.getByTestId('page-editor-panel')).getByRole('img')).toHaveAttribute('src', '/hue-01.jpg')
  })
})
