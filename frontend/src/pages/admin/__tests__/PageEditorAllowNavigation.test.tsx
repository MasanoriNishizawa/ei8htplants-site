/**
 * 「ページ画像の編集」（PageEditor.tsx）が useUnsavedChanges に渡す allowNavigation（isSamePageEditorBrand）のテスト
 *
 * ブラウザの「戻る」「進む」で、未保存の変更があっても確認を出さずに通す移動（＝同じブランドの中のページの切り替え）を決める関数。
 * 関数は書き出されていないので、useUnsavedChanges をモックして PageEditor が渡した関数を受け取り、直接呼んで確かめる。
 *
 * 確かめること:
 * 1. 同じブランドの中のページの移動（ページを省いた形・末尾の / を含む）は通す（true）
 * 2. ブランドをまたぐ移動は通さない（false）
 * 3. 編集画面として開けないパス（ページの後ろに余分な区切りがある 404・定義にないページ・ほかのブランドにしかないページ・
 *    正しくないブランド・編集画面の外）が、移る前・移った先のどちらかにあれば通さない（false。移ると編集画面が外れて草稿が消えるため）
 *
 * api はモックにして本番には接続しない。React Router はモックしない。
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { act, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../../lib/api'
import PageEditor from '../PageEditor'
import { useUnsavedChanges, type UnsavedChangesOptions } from '../UnsavedChanges'

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

// useUnsavedChanges だけをモックし、PageEditor が渡す指定（allowNavigation）を受け取る。ほかは本物を使う
vi.mock('../UnsavedChanges', async (importActual) => {
  const actual = await importActual<typeof import('../UnsavedChanges')>()
  return { ...actual, useUnsavedChanges: vi.fn() }
})

/** PageEditor が useUnsavedChanges に渡した allowNavigation */
let allowNavigation: (from: string, to: string) => boolean

beforeAll(async () => {
  // 1. 保存済みの画像は無い状態で編集画面を描画する
  vi.mocked(api.siteAssets.list).mockResolvedValue([])
  render(
    <MemoryRouter initialEntries={['/admin/page-editor/hue/about']}>
      <Routes>
        <Route path="/admin/page-editor/:brand/:page?" element={<PageEditor />} />
      </Routes>
    </MemoryRouter>,
  )
  await act(async () => { await Promise.resolve() })
  // 2. 最後に渡された指定から allowNavigation を取り出す
  // calls: ES2020 の配列操作で最後の呼び出しを参照するため、呼び出し履歴を保持する
  const calls = vi.mocked(useUnsavedChanges).mock.calls
  // options: useUnsavedChanges の2つ目の引数
  const options = calls[calls.length - 1]?.[1] as UnsavedChangesOptions | undefined
  if (!options?.allowNavigation) throw new Error('PageEditor が allowNavigation を渡していません')
  allowNavigation = options.allowNavigation
})

describe('PageEditor の allowNavigation（同じブランドの中の移動かどうか）', () => {
  it.each([
    ['ページを省いたトップ → About', '/admin/page-editor/hue', '/admin/page-editor/hue/about'],
    ['About → Choose', '/admin/page-editor/hue/about', '/admin/page-editor/hue/choose'],
    ['Living → トップ（home を書いた形）', '/admin/page-editor/hue/living', '/admin/page-editor/hue/home'],
    ['末尾に / があるトップ → 末尾に / がある About', '/admin/page-editor/hue/', '/admin/page-editor/hue/about/'],
    ['ei8ht plants のトップ → About', '/admin/page-editor/ei8htplants', '/admin/page-editor/ei8htplants/about'],
    ['公式サイトの Our Brands → トップ', '/admin/page-editor/official/brands', '/admin/page-editor/official'],
  ])('同じブランドの中の移動（%s）は確認を出さずに通す', (_label, from, to) => {
    expect(allowNavigation(from, to)).toBe(true)
  })

  it.each([
    ['HUE → ei8ht plants', '/admin/page-editor/hue/about', '/admin/page-editor/ei8htplants'],
    ['Habitat Oides → 公式サイト', '/admin/page-editor/habitat-oides/workshop', '/admin/page-editor/official'],
  ])('ブランドをまたぐ移動（%s）は通さない', (_label, from, to) => {
    expect(allowNavigation(from, to)).toBe(false)
  })

  it.each([
    ['ページの後ろに余分な区切りがある 404 へ', '/admin/page-editor/ei8htplants', '/admin/page-editor/ei8htplants/home/extra'],
    ['ページの後ろに余分な区切りがある 404 から', '/admin/page-editor/ei8htplants/home/extra', '/admin/page-editor/ei8htplants'],
    ['定義にないページへ', '/admin/page-editor/hue/about', '/admin/page-editor/hue/unknown'],
    ['定義にないページから', '/admin/page-editor/hue/unknown', '/admin/page-editor/hue/about'],
    ['ほかのブランドにしかないページ（ei8ht plants の choose）へ', '/admin/page-editor/ei8htplants', '/admin/page-editor/ei8htplants/choose'],
    ['正しくないブランドへ', '/admin/page-editor/hue', '/admin/page-editor/nope'],
    ['編集画面の外（ダッシュボード）へ', '/admin/page-editor/hue', '/admin'],
    ['編集画面の外から', '/admin', '/admin/page-editor/hue'],
    ['頭だけ（ブランドなし）へ', '/admin/page-editor/hue', '/admin/page-editor/'],
  ])('編集画面として開けないパスがからむ移動（%s）は、同じブランドの名前が入っていても通さない', (_label, from, to) => {
    expect(allowNavigation(from, to)).toBe(false)
  })
})
