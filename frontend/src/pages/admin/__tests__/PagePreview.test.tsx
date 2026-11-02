/**
 * 管理画面「ページ画像の編集」の iframe の中のプレビュー（/admin/page-preview/:brand、PagePreview.tsx）のテスト
 *
 * 確かめること:
 * 1. 開くと親（編集画面）に page-editor:ready を同じオリジン宛てで送る
 * 2. 親からの page-editor:state を受けて、公開ページを編集モード（枠のボタン・草稿の URL）で出す
 * 3. origin・送り元の window・ブランドが違うメッセージは無視する
 * 4. 枠をクリックすると親に page-editor:select を送り、選んだ枠は押された状態になる
 * 5. プレビューの中のリンクを押しても移動しない
 * 6. 正しくないブランドの URL は「プレビューできないページです。」を出す
 *
 * 親の window は、テスト用に作った iframe の contentWindow を window.parent に差し替えて用意する。
 * api はモックにして本番には接続しない。React Router はモックしない。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../../lib/api'
import PagePreview from '../PagePreview'

// サイト画像の一括取得だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return { ...actual, api: { siteAssets: { list: vi.fn(), get: vi.fn(), save: vi.fn() } } }
})

/** メインの写真の代替テキスト（ei8ht plants） */
const HERO_ALT = '手のオブジェに載る小さなアガベ'

/** 親の代わりの window（テスト用の iframe の contentWindow） */
let parentWindow: Window
/** 親の postMessage のスパイ */
let parentPost: ReturnType<typeof vi.fn>
/** 差し替える前の window.parent の設定 */
let originalParent: PropertyDescriptor | undefined

/**
 * プレビューを描画し、公開ページの遅延読み込みと一括取得を待つ。
 * @param brand - URL の :brand
 * @returns なし
 */
async function renderPreview(brand = 'ei8htplants') {
  render(
    <MemoryRouter initialEntries={[`/admin/page-preview/${brand}`]}>
      <Routes>
        <Route path="/admin/page-preview/:brand" element={<PagePreview />} />
      </Routes>
    </MemoryRouter>,
  )
}

/**
 * 親からメッセージが届いたことにする。
 * @param data - メッセージの中身
 * @param options - origin と送り元（省略すると同じオリジン・親の window）
 * @returns なし
 */
function postFromParent(data: unknown, options: { origin?: string; source?: Window } = {}) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data,
      origin: options.origin ?? window.location.origin,
      source: options.source ?? parentWindow,
    }))
  })
}

/**
 * ei8ht plants の state メッセージを作る。
 * @param patch - 上書きする値
 * @returns state メッセージ
 */
const stateMessage = (patch: Record<string, unknown> = {}) => ({
  type: 'page-editor:state',
  brand: 'ei8htplants',
  draftUrls: { 'ei8ht-hero': '/draft-hero.jpg' },
  selectedKey: null,
  reveal: false,
  ...patch,
})

describe('PagePreview（ページ画像の編集のプレビュー）', () => {
  beforeEach(() => {
    vi.mocked(api.siteAssets.list).mockReset()
    vi.mocked(api.siteAssets.list).mockResolvedValue([{ key: 'ei8ht-hero', url: '/saved-hero.jpg' }])
    // 1. 親の代わりの window を用意して window.parent に差し替える
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    parentWindow = iframe.contentWindow as Window
    parentPost = vi.fn()
    parentWindow.postMessage = parentPost as unknown as Window['postMessage']
    originalParent = Object.getOwnPropertyDescriptor(window, 'parent')
    Object.defineProperty(window, 'parent', { value: parentWindow, configurable: true })
  })

  afterEach(() => {
    // 2. window.parent を元に戻す
    if (originalParent) Object.defineProperty(window, 'parent', originalParent)
    else delete (window as unknown as Record<string, unknown>).parent
    document.querySelectorAll('iframe').forEach((el) => el.remove())
  })

  it('開くと親に page-editor:ready を同じオリジン宛てで送る', async () => {
    await renderPreview()
    expect(parentPost).toHaveBeenCalledWith({ type: 'page-editor:ready', brand: 'ei8htplants' }, window.location.origin)
  })

  it('メッセージを受け取る前でも編集モードで出し、保存した画像と枠のボタンが出る', async () => {
    await renderPreview()
    expect(await screen.findByRole('button', { name: 'メインの写真を変更' })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: HERO_ALT })).toHaveAttribute('src', '/saved-hero.jpg')
  })

  it('親からの state を受けると草稿の URL を出し、選んだ枠は押された状態になる', async () => {
    await renderPreview()
    await screen.findByRole('button', { name: 'メインの写真を変更' })
    postFromParent(stateMessage({ selectedKey: 'ei8ht-hero' }))
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', '/draft-hero.jpg')
    expect(screen.getByRole('button', { name: 'メインの写真を変更' })).toHaveAttribute('aria-pressed', 'true')
  })

  it.each([
    ['違うオリジン', { origin: 'https://evil.example.com' }, {}],
    ['親以外の window', { source: window }, {}],
    ['違うブランド', {}, { brand: 'hue' }],
    ['state 以外の type', {}, { type: 'page-editor:ready' }],
  ])('%s からのメッセージは無視する', async (_label, options, patch) => {
    await renderPreview()
    await screen.findByRole('button', { name: 'メインの写真を変更' })
    await screen.findByRole('img', { name: HERO_ALT })
    await act(async () => { await Promise.resolve() })
    postFromParent(stateMessage(patch), options as { origin?: string; source?: Window })
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', '/saved-hero.jpg')
  })

  it('そのブランドの枠ではない selectedKey を受け取っても、選んだ枠にしない', async () => {
    await renderPreview()
    await screen.findByRole('button', { name: 'メインの写真を変更' })
    postFromParent(stateMessage({ selectedKey: 'ei8ht-hero' }))
    expect(screen.getByRole('button', { name: 'メインの写真を変更' })).toHaveAttribute('aria-pressed', 'true')
    // ほかのブランドの枠のキー・定義にないキーは無視して、選んでいない状態にする
    postFromParent(stateMessage({ selectedKey: 'habitat-sign' }))
    expect(screen.getByRole('button', { name: 'メインの写真を変更' })).toHaveAttribute('aria-pressed', 'false')
    postFromParent(stateMessage({ selectedKey: 'ei8ht-hero"], body' }))
    expect(screen.getByRole('button', { name: 'メインの写真を変更' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reveal: true で届いた枠まではスクロールし、ブランドの枠ではないキーではスクロールしない', async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    await renderPreview()
    await screen.findByRole('button', { name: 'メインの写真を変更' })
    // 1. ほかのブランドの枠のキー
    postFromParent(stateMessage({ selectedKey: 'hue-color-01', reveal: true }))
    await act(async () => { await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null))) })
    expect(scroll).not.toHaveBeenCalled()
    // 2. このブランドの枠のキー
    postFromParent(stateMessage({ selectedKey: 'ei8ht-wordmark', reveal: true }))
    await act(async () => { await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null))) })
    expect(scroll).toHaveBeenCalledTimes(1)
  })

  it('枠をクリックすると親に page-editor:select を送り、その枠が押された状態になる', async () => {
    await renderPreview()
    fireEvent.click(await screen.findByRole('button', { name: 'ロゴ（文字）を変更' }))
    expect(parentPost).toHaveBeenCalledWith({ type: 'page-editor:select', brand: 'ei8htplants', key: 'ei8ht-wordmark' }, window.location.origin)
    expect(screen.getByRole('button', { name: 'ロゴ（文字）を変更' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('プレビューの中のリンクを押しても既定の動き（移動）が止められる', async () => {
    await renderPreview()
    await screen.findByRole('button', { name: 'メインの写真を変更' })
    const link = document.querySelector('a[href]') as HTMLAnchorElement
    expect(link).not.toBeNull()
    // fireEvent.click は preventDefault されたら false を返す
    expect(fireEvent.click(link)).toBe(false)
  })

  it('正しくないブランドの URL では「プレビューできないページです。」を出し、ready も送らない', async () => {
    await renderPreview('unknown')
    expect(screen.getByText('プレビューできないページです。')).toBeInTheDocument()
    expect(parentPost).not.toHaveBeenCalled()
  })
})
