/**
 * ImageLightbox コンポーネントのユニットテスト
 *
 * - 画像表示・閉じるボタン・前後ナビゲーション・キーボード操作を確認する
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ImageLightbox from '../ImageLightbox'

/** テスト用の画像 URL 配列 */
const SINGLE_IMAGE = ['https://example.com/photo1.jpg']
const TWO_IMAGES = [
  'https://example.com/photo1.jpg',
  'https://example.com/photo2.jpg',
]
const THREE_IMAGES = [
  'https://example.com/photo1.jpg',
  'https://example.com/photo2.jpg',
  'https://example.com/photo3.jpg',
]

describe('ImageLightbox コンポーネント', () => {
  it('渡した画像 URL の img が表示される', () => {
    // 1. images[0] の URL で img が描画されることを確認する
    // ※ alt="" の img は role="presentation" になるため document.querySelector を使う
    const onClose = vi.fn()
    const onChange = vi.fn()
    const { container } = render(
      <ImageLightbox
        images={SINGLE_IMAGE}
        index={0}
        onClose={onClose}
        onChange={onChange}
      />
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toBe(SINGLE_IMAGE[0])
  })

  it('index に対応する画像が表示される（2枚目を指定した場合）', () => {
    // 1. index=1 のとき images[1] の URL が img の src になる
    const onClose = vi.fn()
    const onChange = vi.fn()
    const { container } = render(
      <ImageLightbox
        images={TWO_IMAGES}
        index={1}
        onClose={onClose}
        onChange={onChange}
      />
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toBe(TWO_IMAGES[1])
  })

  it('閉じるボタン（✕）をクリックすると onClose がちょうど1回呼ばれる', () => {
    // 1. ✕ ボタンをクリックする
    // 2. クリックが外側の背景（onClick={onClose}）に伝わらず、onClose が1回だけ呼ばれることを確認する
    const onClose = vi.fn()
    const onChange = vi.fn()
    render(
      <ImageLightbox
        images={SINGLE_IMAGE}
        index={0}
        onClose={onClose}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByText('✕'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('複数画像のとき次へ（❯）・前へ（❮）ボタンが表示される', () => {
    // 1. 2 枚以上の場合に前後ナビゲーションボタンが存在する
    const onClose = vi.fn()
    const onChange = vi.fn()
    render(
      <ImageLightbox
        images={TWO_IMAGES}
        index={0}
        onClose={onClose}
        onChange={onChange}
      />
    )
    // HTML エンティティ &#10095; → ❯、&#10094; → ❮ として DOM に展開される
    expect(screen.getByText('❯')).toBeDefined()
    expect(screen.getByText('❮')).toBeDefined()
  })

  it('画像が 1 枚のとき前後ナビゲーションボタンが表示されない', () => {
    // 1. 画像が 1 枚のときは ❯・❮ ボタンが存在しない
    const onClose = vi.fn()
    const onChange = vi.fn()
    render(
      <ImageLightbox
        images={SINGLE_IMAGE}
        index={0}
        onClose={onClose}
        onChange={onChange}
      />
    )
    expect(screen.queryByText('❯')).toBeNull()
    expect(screen.queryByText('❮')).toBeNull()
  })

  it('次へボタン（❯）をクリックすると onChange が次のインデックスで呼ばれる', () => {
    // 1. index=0 のとき ❯ をクリックすると onChange(1) が呼ばれる
    const onClose = vi.fn()
    const onChange = vi.fn()
    render(
      <ImageLightbox
        images={TWO_IMAGES}
        index={0}
        onClose={onClose}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByText('❯'))
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('前へボタン（❮）をクリックすると onChange が前のインデックスで呼ばれる', () => {
    // 1. index=1 のとき ❮ をクリックすると onChange(0) が呼ばれる
    const onClose = vi.fn()
    const onChange = vi.fn()
    render(
      <ImageLightbox
        images={TWO_IMAGES}
        index={1}
        onClose={onClose}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByText('❮'))
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('末尾で次へボタンをクリックすると先頭（インデックス 0）に循環する', () => {
    // 1. index が末尾のとき ❯ をクリックすると onChange(0) が呼ばれる
    const onClose = vi.fn()
    const onChange = vi.fn()
    render(
      <ImageLightbox
        images={TWO_IMAGES}
        index={1}
        onClose={onClose}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByText('❯'))
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('先頭で前へボタンをクリックすると末尾に循環する', () => {
    // 1. index=0 のとき ❮ をクリックすると onChange(n-1) が呼ばれる
    const onClose = vi.fn()
    const onChange = vi.fn()
    render(
      <ImageLightbox
        images={THREE_IMAGES}
        index={0}
        onClose={onClose}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByText('❮'))
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('キーボード Escape キーで onClose が呼ばれる', () => {
    // 1. window に keydown イベント（key: 'Escape'）を発火して onClose が呼ばれることを確認する
    const onClose = vi.fn()
    const onChange = vi.fn()
    render(
      <ImageLightbox
        images={SINGLE_IMAGE}
        index={0}
        onClose={onClose}
        onChange={onChange}
      />
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('キーボード ArrowRight キーで onChange が次のインデックスで呼ばれる', () => {
    // 1. ArrowRight を押すと onChange(1) が呼ばれる（index=0 の場合）
    const onClose = vi.fn()
    const onChange = vi.fn()
    render(
      <ImageLightbox
        images={TWO_IMAGES}
        index={0}
        onClose={onClose}
        onChange={onChange}
      />
    )
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('キーボード ArrowLeft キーで onChange が前のインデックスで呼ばれる', () => {
    // 1. ArrowLeft を押すと onChange(n-1) が呼ばれる（index=0 の場合は循環）
    const onClose = vi.fn()
    const onChange = vi.fn()
    render(
      <ImageLightbox
        images={TWO_IMAGES}
        index={0}
        onClose={onClose}
        onChange={onChange}
      />
    )
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith(1)
  })
})
