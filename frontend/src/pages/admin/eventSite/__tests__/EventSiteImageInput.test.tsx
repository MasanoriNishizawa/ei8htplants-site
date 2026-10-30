/**
 * 公開イベントページ編集の単画像入力を検証する。
 * 1. 画像 URL がない場合とある場合の表示条件を確かめる
 * 2. ファイル選択時のアップロード・URL通知・input の初期化を確かめる
 * 3. アップロード失敗時の通知と再選択可能な状態への復帰を確かめる
 * 4. 削除操作が親への空 URL 通知になることを確かめる
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventSiteImageInput from '../EventSiteImageInput'
import { api } from '../../../../lib/api'

// 実 API へ接続せず、アップロード関数だけを置き換える
vi.mock('../../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../../lib/api')>()
  return { ...actual, api: { ...actual.api, upload: vi.fn() } }
})

/** テストで繰り返し使う小さな画像ファイルを作る */
function createImageFile(name = 'plant.png'): File {
  return new File(['image data'], name, { type: 'image/png' })
}

/** 表示中のファイル選択欄を取得する */
function getFileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"][accept="image/*"]')
  if (!(input instanceof HTMLInputElement)) throw new Error('画像選択 input が見つかりません')
  return input
}

describe('EventSiteImageInput の単画像表示と操作', () => {
  beforeEach(() => {
    vi.mocked(api.upload).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('画像 URL が空なら追加記号だけを表示し、画像と削除ボタンは出さない', () => {
    const onChange = vi.fn()
    render(<EventSiteImageInput value="" onChange={onChange} />)

    expect(screen.getByText('+')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
    expect(getFileInput()).toHaveAttribute('accept', 'image/*')
    expect(getFileInput()).toBeEnabled()
  })

  it('画像 URL があればサムネイルと削除ボタンを表示する', () => {
    const { container } = render(<EventSiteImageInput value="https://example.com/plant.png" onChange={vi.fn()} />)

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/plant.png')
    expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument()
  })

  it('blob URL は仮表示として扱い、画像と削除ボタンを出さず追加記号を表示する', () => {
    const { container } = render(<EventSiteImageInput value="blob:temporary-preview" onChange={vi.fn()} />)

    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getByText('+')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
  })

  it('ファイルを選ぶとアップロード URL を onChange に渡し、選択値を空に戻す', async () => {
    const onChange = vi.fn()
    const file = createImageFile()
    vi.mocked(api.upload).mockResolvedValue('https://example.com/uploaded.png')
    render(<EventSiteImageInput value="" onChange={onChange} />)

    await userEvent.upload(getFileInput(), file)

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://example.com/uploaded.png'))
    expect(api.upload).toHaveBeenCalledWith(file)
    expect(getFileInput().value).toBe('')
    expect(getFileInput()).toBeEnabled()
  })

  it('同じファイルを続けて選び直せるよう、アップロード後に input を空へ戻す', async () => {
    const onChange = vi.fn()
    const file = createImageFile('same.png')
    vi.mocked(api.upload)
      .mockResolvedValueOnce('https://example.com/same-1.png')
      .mockResolvedValueOnce('https://example.com/same-2.png')
    render(<EventSiteImageInput value="" onChange={onChange} />)
    const input = getFileInput()

    await userEvent.upload(input, file)
    await waitFor(() => expect(onChange).toHaveBeenNthCalledWith(1, 'https://example.com/same-1.png'))
    expect(input.value).toBe('')

    await userEvent.upload(input, file)
    await waitFor(() => expect(onChange).toHaveBeenNthCalledWith(2, 'https://example.com/same-2.png'))
    expect(api.upload).toHaveBeenCalledTimes(2)
    expect(api.upload).toHaveBeenNthCalledWith(1, file)
    expect(api.upload).toHaveBeenNthCalledWith(2, file)
    expect(input.value).toBe('')
  })

  it('アップロードに失敗したら alert を出し、uploading と input の状態を戻す', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const onChange = vi.fn()
    vi.mocked(api.upload).mockRejectedValue(new Error('upload failed'))
    render(<EventSiteImageInput value="" onChange={onChange} />)
    const input = getFileInput()

    await userEvent.upload(input, createImageFile())

    expect(alertSpy).toHaveBeenCalledWith('アップロードに失敗しました')
    expect(onChange).not.toHaveBeenCalled()
    expect(input.value).toBe('')
    expect(input).toBeEnabled()
    expect(screen.getByText('+')).toBeInTheDocument()
  })

  it('削除を押すと空 URL を onChange に渡す', async () => {
    const onChange = vi.fn()
    render(<EventSiteImageInput value="https://example.com/plant.png" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: '削除' }))

    expect(onChange).toHaveBeenCalledWith('')
  })
})
