/**
 * 管理画面「ページ画像の編集」（/admin/page-editor/:brand、PageEditor.tsx）のテスト
 *
 * 確かめること:
 * 1. iframe で /admin/page-preview/:brand を出し、PC/スマホの幅を切り替えられる
 * 2. 枠の一覧・プレビューからの選択（postMessage）で右のパネルを出す。origin と送り元の window が違うメッセージは無視する
 * 3. パネルで画像を選ぶ・外す・取り消すと、変更の件数と枠の一覧の「変更あり」が変わり、プレビューに草稿を送る
 * 4. まとめて保存: 成功した枠は件数から消え、失敗した枠は残って「失敗」と理由を出す
 * 5. ブランドのタブ: 未保存なら確認を出し、やめると移動しない
 * 6. 読み込みに失敗したら、画像を選ぶことと保存を止める
 * 7. 正しくないブランドの URL は ei8htplants に移る
 *
 * api はモックにして本番には接続しない。React Router はモックしない。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { api } from '../../../lib/api'
import PageEditor from '../PageEditor'

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
        <Route path="/admin/page-editor/:brand" element={<><PageEditor /><LocationProbe /></>} />
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
    expect(frame()).toHaveAttribute('src', '/admin/page-preview/ei8htplants')
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
    postFromFrame({ type: 'page-editor:select', brand: 'ei8htplants', key: 'ei8ht-hero' }, { origin: 'https://evil.example.com' })
    // 2. iframe 以外の window から
    postFromFrame({ type: 'page-editor:select', brand: 'ei8htplants', key: 'ei8ht-hero' }, { source: window })
    // 3. 違うブランド
    postFromFrame({ type: 'page-editor:select', brand: 'hue', key: 'ei8ht-hero' })
    // 4. 形の違うメッセージ
    postFromFrame({ type: 'page-editor:select', brand: 'ei8htplants' })
    expect(screen.queryByTestId('page-editor-panel')).not.toBeInTheDocument()
    // 5. 正しいメッセージ
    postFromFrame({ type: 'page-editor:select', brand: 'ei8htplants', key: 'ei8ht-wordmark' })
    expect(within(screen.getByTestId('page-editor-panel')).getByRole('heading', { name: 'ロゴ（文字）' })).toBeInTheDocument()
  })

  it('準備ができたメッセージを受けると、草稿と選んだ枠をプレビューに同じオリジン宛てで送る', async () => {
    await renderEditor()
    const post = vi.spyOn(frame().contentWindow as Window, 'postMessage')
    postFromFrame({ type: 'page-editor:ready', brand: 'ei8htplants' })
    expect(post).toHaveBeenLastCalledWith({
      type: 'page-editor:state',
      brand: 'ei8htplants',
      draftUrls: { 'ei8ht-hero': '/saved-hero.jpg', 'ei8ht-wordmark': '' },
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
    postFromFrame({ type: 'page-editor:ready', brand: 'ei8htplants' })
    fireEvent.click(screen.getByTestId('page-editor-slot-ei8ht-wordmark'))
    await chooseFileInPanel()
    expect(countText()).toBe('変更 1 件（未保存）')
    expect(within(screen.getByTestId('page-editor-slot-ei8ht-wordmark')).getByText('変更あり')).toBeInTheDocument()
    expect(screen.getByTestId('page-editor-save')).toBeEnabled()
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({
      draftUrls: { 'ei8ht-hero': '/saved-hero.jpg', 'ei8ht-wordmark': '/uploaded.png' },
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
    expect(frame()).toHaveAttribute('src', '/admin/page-preview/habitat-oides')
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
    postFromFrame({ type: 'page-editor:ready', brand: 'ei8htplants' })
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ draftUrls: {} }), window.location.origin)
    fireEvent.click(screen.getByTestId('page-editor-slot-ei8ht-hero'))
    expect(within(screen.getByTestId('page-editor-panel')).getByLabelText('画像を選ぶ')).toBeDisabled()
    expect(screen.getByTestId('page-editor-save')).toBeDisabled()
  })

  it('正しくないブランドの URL を開くと ei8htplants の編集画面に移る', async () => {
    await renderEditor('/admin/page-editor/unknown')
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/page-editor/ei8htplants')
    expect(frame()).toHaveAttribute('src', '/admin/page-preview/ei8htplants')
  })
})
