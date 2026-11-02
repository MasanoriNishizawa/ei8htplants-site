/**
 * ei8ht plants のトップページ（Ei8htPlants.tsx）の画像の差し替えのテスト
 *
 * 確かめること:
 * 1. メインの写真（ei8ht-hero）とロゴ（ei8ht-wordmark）は「保存した URL → localSrc」の順で出す
 * 2. 一括取得に失敗しても localSrc で表示を続ける
 * 3. ふつうの公開ページでは編集の枠（editable-slot-*）を出さない
 * 4. 編集モード（PageImageEditContext の中）では枠を重ね、草稿の URL を出し、クリックで枠を選べる
 *
 * api はモックにして本番には接続しない。React Router と useT はモックしない。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../../lib/api'
import { TEXT_LOGO } from '../../../lib/brands'
import { PageImageEditContext, type PageImageEditValue } from '../../../lib/pageImageEdit'
import Ei8htPlants from '../Ei8htPlants'

// サイト画像の一括取得だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: { siteAssets: { list: vi.fn(), get: vi.fn(), save: vi.fn() } },
  }
})

/** 一括取得のモック */
const listMock = () => vi.mocked(api.siteAssets.list)
/** メインの写真の代替テキスト */
const HERO_ALT = '手のオブジェに載る小さなアガベ'
/** メインの写真の localSrc */
const HERO_LOCAL = '/img/ei8htPlants/ei8htplants_hero.jpg'

/**
 * トップページを描画し、一括取得の応答を反映させる。
 * @param edit - 編集モードの値（省略するとふつうの公開ページ）
 * @returns 描画結果
 */
async function renderPage(edit?: PageImageEditValue) {
  const page = <MemoryRouter><Ei8htPlants /></MemoryRouter>
  const result = render(edit ? <PageImageEditContext.Provider value={edit}>{page}</PageImageEditContext.Provider> : page)
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
  return result
}

/** ロゴ（文字）の画像（alt はブランド名） */
const wordmark = () => document.querySelector('img.ep-home-wordmark')

describe('Ei8htPlants トップページの画像', () => {
  beforeEach(() => {
    listMock().mockReset()
    listMock().mockResolvedValue([{ key: 'ei8ht-hero', url: '' }, { key: 'ei8ht-wordmark', url: '' }])
  })

  it('ei8ht- の prefix で一括取得する', async () => {
    await renderPage()
    expect(listMock()).toHaveBeenCalledWith('ei8ht-')
  })

  it('保存した URL が空ならメインの写真とロゴは localSrc を出す', async () => {
    await renderPage()
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', HERO_LOCAL)
    expect(wordmark()).toHaveAttribute('src', TEXT_LOGO)
  })

  it('保存した URL があればメインの写真とロゴはそちらを優先して出す', async () => {
    listMock().mockResolvedValue([{ key: 'ei8ht-hero', url: '/saved-hero.jpg' }, { key: 'ei8ht-wordmark', url: '/saved-logo.png' }])
    await renderPage()
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', '/saved-hero.jpg')
    expect(wordmark()).toHaveAttribute('src', '/saved-logo.png')
  })

  it('片方だけ保存しているときは、保存していないほうは localSrc のまま', async () => {
    listMock().mockResolvedValue([{ key: 'ei8ht-hero', url: '' }, { key: 'ei8ht-wordmark', url: '/saved-logo.png' }])
    await renderPage()
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', HERO_LOCAL)
    expect(wordmark()).toHaveAttribute('src', '/saved-logo.png')
  })

  it('一括取得に失敗しても localSrc で表示を続ける', async () => {
    listMock().mockRejectedValue(new Error('network'))
    await renderPage()
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', HERO_LOCAL)
    expect(wordmark()).toHaveAttribute('src', TEXT_LOGO)
  })

  it('ふつうの公開ページでは編集の枠（「〜を変更」のボタン）を出さない', async () => {
    await renderPage()
    expect(screen.queryByTestId('editable-slot-ei8ht-hero')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'メインの写真を変更' })).not.toBeInTheDocument()
  })

  it('編集モードでは2つの枠を重ね、草稿の URL を保存した URL より優先して出す', async () => {
    listMock().mockResolvedValue([{ key: 'ei8ht-hero', url: '/saved-hero.jpg' }, { key: 'ei8ht-wordmark', url: '' }])
    const onSelectSlot = vi.fn()
    await renderPage({ editMode: true, draftUrls: { 'ei8ht-hero': '/draft-hero.jpg' }, selectedKey: null, onSelectSlot })
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', '/draft-hero.jpg')
    expect(screen.getByTestId('editable-slot-ei8ht-hero')).toBeInTheDocument()
    expect(screen.getByTestId('editable-slot-ei8ht-wordmark')).toBeInTheDocument()
    // 枠をクリックすると、その枠のキーで onSelectSlot が呼ばれる
    fireEvent.click(screen.getByRole('button', { name: 'ロゴ（文字）を変更' }))
    expect(onSelectSlot).toHaveBeenCalledWith('ei8ht-wordmark')
  })

  it('編集モードで草稿を空文字にすると（外した状態）localSrc に戻り、選んでいる枠は押された状態になる', async () => {
    listMock().mockResolvedValue([{ key: 'ei8ht-hero', url: '/saved-hero.jpg' }, { key: 'ei8ht-wordmark', url: '' }])
    await renderPage({ editMode: true, draftUrls: { 'ei8ht-hero': '' }, selectedKey: 'ei8ht-hero', onSelectSlot: vi.fn() })
    expect(screen.getByRole('img', { name: HERO_ALT })).toHaveAttribute('src', HERO_LOCAL)
    expect(screen.getByRole('button', { name: 'メインの写真を変更' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'ロゴ（文字）を変更' })).toHaveAttribute('aria-pressed', 'false')
  })
})
