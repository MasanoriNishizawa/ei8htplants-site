/**
 * 管理画面「Habitat Oides 画像」（/admin/habitat-images、HabitatImages.tsx）のテスト
 *
 * 確かめること:
 * 1. 12枠を3つのグループ（一番上の画像 5・サイン 1・動くオブジェクト 6）に分けて並べる
 * 2. 保存済みの画像はプレビューを出し、未設定の枠は「未設定」と、何が表示されるかを出す
 * 3. 画像を選ぶ（アップロード）・保存・外す・取り消すができる
 * 4. 保存していない変更があると、ページを離れるとき（beforeunload）に止める
 * 5. 読み込みに失敗したときは、案内を出して保存・アップロードをできないようにする
 * 6. アップロード・保存の失敗はその枠に出し、変更は残す
 *
 * api はモックにして本番には接続しない。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { api, ApiError } from '../../../lib/api'
import HabitatImages from '../HabitatImages'

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

/** 読み込みに失敗したときの案内 */
const LOAD_ERROR = '画像の設定を読み込めませんでした。再読み込みしてください（読み込めるまで保存はできません）。'

/**
 * 枠のカードを取り出す。
 * @param key - 枠のキー
 * @returns カードの要素
 */
const card = (key: string) => screen.getByTestId(`habitat-image-card-${key}`)

/**
 * beforeunload を発火し、止められたかを返す。
 * @returns preventDefault されたら true
 */
function fireBeforeUnload(): boolean {
  const ev = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(ev)
  return ev.defaultPrevented
}

/**
 * 画面を描画して、読み込みが終わるまで待つ。
 * @returns なし
 */
async function renderLoaded() {
  render(<HabitatImages />)
  await screen.findByTestId('habitat-image-group-hero')
}

/**
 * 枠のファイル選択欄で画像を選ぶ。
 * @param key - 枠のキー
 * @returns なし
 */
function chooseFile(key: string) {
  const input = within(card(key)).getByLabelText('画像を選ぶ')
  fireEvent.change(input, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
}

describe('HabitatImages（Habitat Oides 画像の管理画面）', () => {
  beforeEach(() => {
    vi.mocked(api.siteAssets.list).mockReset()
    vi.mocked(api.siteAssets.save).mockReset()
    vi.mocked(api.upload).mockReset()
    vi.mocked(api.siteAssets.list).mockResolvedValue([
      { key: 'habitat-hero-01', url: '/saved-hero1.jpg' },
      { key: 'habitat-sign', url: '' },
    ])
    vi.mocked(api.upload).mockResolvedValue('/uploaded.png')
    vi.mocked(api.siteAssets.save).mockImplementation(async (key, url) => ({ key, url }))
  })

  it('habitat- の prefix で一括取得し、3つのグループに 5・1・6 枠を並べる', async () => {
    await renderLoaded()
    expect(api.siteAssets.list).toHaveBeenCalledWith('habitat-')
    expect(screen.getByRole('heading', { level: 2, name: '一番上の画像' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'サイン' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '動くオブジェクト' })).toBeInTheDocument()
    const count = (group: string) => within(screen.getByTestId(`habitat-image-group-${group}`)).getAllByTestId(/^habitat-image-card-/).length
    expect(count('hero')).toBe(5)
    expect(count('sign')).toBe(1)
    expect(count('object')).toBe(6)
  })

  it('保存済みの枠はプレビューを出し、未設定の枠は「未設定」と表示される内容を出す', async () => {
    await renderLoaded()
    expect(within(card('habitat-hero-01')).getByRole('img', { name: '一番上の画像 01 のプレビュー' })).toHaveAttribute('src', '/saved-hero1.jpg')
    expect(within(card('habitat-sign')).getByTestId('habitat-image-empty-habitat-sign')).toHaveTextContent('サインは表示しません')
    expect(within(card('habitat-object-02')).getByTestId('habitat-image-empty-habitat-object-02')).toHaveTextContent('空の枠を表示中')
  })

  it('変更がない枠の「画像を保存」は押せず、ページを離れても止めない', async () => {
    await renderLoaded()
    expect(within(card('habitat-hero-02')).getByRole('button', { name: '画像を保存' })).toBeDisabled()
    expect(fireBeforeUnload()).toBe(false)
  })

  it('画像を選ぶとアップロードした画像がプレビューに出て、保存できるようになり、離れるときに止める', async () => {
    await renderLoaded()
    chooseFile('habitat-object-02')
    expect(await within(card('habitat-object-02')).findByRole('img', { name: /のプレビュー$/ })).toHaveAttribute('src', '/uploaded.png')
    expect(within(card('habitat-object-02')).getByRole('button', { name: '画像を保存' })).toBeEnabled()
    expect(within(card('habitat-object-02')).getByRole('button', { name: '変更を取り消す' })).toBeInTheDocument()
    expect(fireBeforeUnload()).toBe(true)
  })

  it('「画像を保存」でその枠のキーと URL を保存し、保存後は未保存の変更がなくなる', async () => {
    await renderLoaded()
    chooseFile('habitat-object-02')
    await within(card('habitat-object-02')).findByRole('img', { name: /のプレビュー$/ })
    fireEvent.click(within(card('habitat-object-02')).getByRole('button', { name: '画像を保存' }))
    expect(await within(card('habitat-object-02')).findByText('画像を保存しました。')).toBeInTheDocument()
    expect(api.siteAssets.save).toHaveBeenCalledWith('habitat-object-02', '/uploaded.png')
    expect(within(card('habitat-object-02')).getByRole('button', { name: '画像を保存' })).toBeDisabled()
    expect(fireBeforeUnload()).toBe(false)
  })

  it('「画像を外す」を押して保存すると空文字で保存され、「画像を外しました。」と出る', async () => {
    await renderLoaded()
    fireEvent.click(within(card('habitat-hero-01')).getByRole('button', { name: '画像を外す' }))
    // 外すと「未設定」と localSrc の案内になる
    expect(within(card('habitat-hero-01')).getByTestId('habitat-image-empty-habitat-hero-01')).toHaveTextContent('プロジェクト内の画像')
    fireEvent.click(within(card('habitat-hero-01')).getByRole('button', { name: '画像を保存' }))
    expect(await within(card('habitat-hero-01')).findByText('画像を外しました。')).toBeInTheDocument()
    expect(api.siteAssets.save).toHaveBeenCalledWith('habitat-hero-01', '')
  })

  it('「変更を取り消す」で保存済みの画像に戻り、保存ボタンは押せなくなる', async () => {
    await renderLoaded()
    fireEvent.click(within(card('habitat-hero-01')).getByRole('button', { name: '画像を外す' }))
    fireEvent.click(within(card('habitat-hero-01')).getByRole('button', { name: '変更を取り消す' }))
    expect(within(card('habitat-hero-01')).getByRole('img', { name: '一番上の画像 01 のプレビュー' })).toHaveAttribute('src', '/saved-hero1.jpg')
    expect(within(card('habitat-hero-01')).getByRole('button', { name: '画像を保存' })).toBeDisabled()
    expect(fireBeforeUnload()).toBe(false)
  })

  it('保存に失敗するとその枠に PageEditor と同じ形の失敗の文言（422 は入力内容の案内）を出し、変更は残る', async () => {
    vi.mocked(api.siteAssets.save).mockRejectedValue(new ApiError(422, '422', [{ loc: ['body', 'url'], msg: 'bad', type: 'value_error' }]))
    await renderLoaded()
    chooseFile('habitat-object-03')
    await within(card('habitat-object-03')).findByRole('img', { name: /のプレビュー$/ })
    fireEvent.click(within(card('habitat-object-03')).getByRole('button', { name: '画像を保存' }))
    const alert = await within(card('habitat-object-03')).findByRole('alert')
    expect(alert.textContent).toMatch(/^保存に失敗しました（入力内容を確認してください: /)
    expect(within(card('habitat-object-03')).getByRole('button', { name: '画像を保存' })).toBeEnabled()
    expect(fireBeforeUnload()).toBe(true)
  })

  it('アップロードに失敗するとその枠に「画像のアップロードに失敗しました（理由）」を出し、プレビューは変わらない', async () => {
    vi.mocked(api.upload).mockRejectedValue(new Error('アップロード失敗'))
    await renderLoaded()
    chooseFile('habitat-object-04')
    expect(await within(card('habitat-object-04')).findByRole('alert')).toHaveTextContent('画像のアップロードに失敗しました（アップロード失敗）')
    expect(within(card('habitat-object-04')).getByTestId('habitat-image-empty-habitat-object-04')).toBeInTheDocument()
  })

  it('読み込みに失敗すると案内を出し、ファイルの選択と保存をできないようにする', async () => {
    vi.mocked(api.siteAssets.list).mockRejectedValue(new Error('network'))
    render(<HabitatImages />)
    expect(await screen.findByText(LOAD_ERROR)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('habitat-image-group-hero')).toBeInTheDocument())
    for (const input of document.querySelectorAll('input[type="file"]')) {
      expect(input).toBeDisabled()
    }
    for (const button of screen.getAllByRole('button', { name: '画像を保存' })) {
      expect(button).toBeDisabled()
    }
  })
})
