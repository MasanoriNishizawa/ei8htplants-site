/**
 * useHueImages（HUE のトップページの6枚の写真の取得）のテスト
 *
 * 確かめること:
 * 1. ふつうの公開ページでは、今までどおり保存した6件の URL を並び順で返す（個別の失敗は空文字）
 * 2. 編集モードでは、草稿に含まれる枠だけ草稿の URL に置き換え、含まれない枠は保存した値のまま
 *
 * api はモックにして本番には接続しない。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { api } from '../../../lib/api'
import { PageImageEditContext, type PageImageEditValue } from '../../../lib/pageImageEdit'
import { useHueImages } from '../useHueImages'

// サイト画像の1件取得だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return { ...actual, api: { siteAssets: { get: vi.fn(), list: vi.fn(), save: vi.fn() } } }
})

/**
 * フックの戻り値を「|」区切りで表示する部品。
 * @returns 6件の URL を並べた要素
 */
function Probe() {
  const images = useHueImages()
  return <p data-testid="hue-images">{images.join('|')}</p>
}

/**
 * Probe を描画し、取得を反映させる。
 * @param edit - 編集モードの値（省略するとふつうの公開ページ）
 * @returns 表示された文字列
 */
async function renderProbe(edit?: PageImageEditValue) {
  render(edit ? <PageImageEditContext.Provider value={edit}><Probe /></PageImageEditContext.Provider> : <Probe />)
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
  return screen.getByTestId('hue-images').textContent
}

describe('useHueImages', () => {
  beforeEach(() => {
    // hue-color-03 だけ失敗し、ほかは '/hN.jpg' を返す
    vi.mocked(api.siteAssets.get).mockReset()
    vi.mocked(api.siteAssets.get).mockImplementation(async (key: string) => {
      if (key === 'hue-color-03') throw new Error('fail')
      return { key, url: `/h${key.slice(-1)}.jpg` }
    })
  })

  it('ふつうの公開ページでは保存した6件を並び順で返し、失敗した枠は空文字になる', async () => {
    expect(await renderProbe()).toBe('/h1.jpg|/h2.jpg||/h4.jpg|/h5.jpg|/h6.jpg')
  })

  it('編集モードでは草稿に含まれる枠だけ置き換え、空文字の草稿は画像を外した状態になる', async () => {
    const text = await renderProbe({
      editMode: true,
      draftUrls: { 'hue-color-02': '/draft2.jpg', 'hue-color-05': '' },
      selectedKey: null,
      onSelectSlot: vi.fn(),
    })
    expect(text).toBe('/h1.jpg|/draft2.jpg||/h4.jpg||/h6.jpg')
  })
})
