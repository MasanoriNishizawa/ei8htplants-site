/**
 * 公開 Media ページのユニットテスト
 *
 * - api.mediaAppearances.list をモックして外部APIや本番DBへの接続を防ぐ
 * - APIが返す掲載タイトルと説明が公開画面に表示されることを確認する
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import Media from '../Media'
import { api } from '../../lib/api'
import type { MediaAppearance } from '../../lib/api'

// APIモジュールをモックし、公開掲載一覧の取得をテスト内のデータに固定する。
vi.mock('../../lib/api', () => ({
  api: {
    mediaAppearances: {
      list: vi.fn(),
    },
  },
}))

/**
 * 公開画面で使う掲載レコードを作る。
 * @param overrides - テストケースごとに上書きする掲載情報
 * @returns 公開 Media ページへ渡せる掲載レコード
 */
function makeMediaAppearance(overrides: Partial<MediaAppearance> = {}): MediaAppearance {
  return {
    id: 'media-1',
    title: '植物と暮らす日々',
    youtube_url: 'https://www.youtube.com/watch?v=abcdefghijk',
    description: '朝の光の中で育つ植物を紹介します。',
    published_at: '2026-10-01',
    display_order: 1,
    created_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

describe('公開 Media ページ', () => {
  beforeEach(() => {
    // 各テストの前に一覧APIの応答と呼び出し履歴を初期化する。
    vi.mocked(api.mediaAppearances.list).mockReset()
  })

  it('FE-MEDIA-01: APIから取得した掲載タイトルと説明を一覧に表示する', async () => {
    // 1. 公開一覧APIが返すタイトルと説明を含む掲載データを用意する。
    /** 公開画面に表示する掲載情報 */
    const appearance = makeMediaAppearance({
      title: '一鉢から始まる植物のある暮らし',
      description: '窓辺で育てる植物の楽しみ方を紹介します。',
    })
    vi.mocked(api.mediaAppearances.list).mockResolvedValue([appearance])

    // 2. 公開 Media ページを表示し、一覧取得の完了を待つ。
    render(<Media />)

    // 3. APIが返したタイトルと説明が画面に現れ、カードが元動画へリンクすることを確かめる。
    expect(await screen.findByText(appearance.title)).toBeVisible()
    expect(screen.getByText(appearance.description!)).toBeVisible()
    expect(screen.getByRole('link', { name: /一鉢から始まる植物のある暮らし/ })).toHaveAttribute(
      'href',
      appearance.youtube_url,
    )
    expect(api.mediaAppearances.list).toHaveBeenCalledTimes(1)
  })
})
