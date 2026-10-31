import { test, expect } from '@playwright/test'

/**
 * イベント別予約画面のスマートフォン用カードから詳細を開けることを確認する。
 * API は E2E 用 MSW が受け持ち、本番データベースや外部サービスには接続しない。
 */
test.describe('イベント別予約の詳細モーダル', /**
 * モバイルカードで詳細を開き、予約情報を読めることを確かめる。
 * @returns 含まれる画面テストを登録する。
 */
() => {
  test('モバイルカードから詳細を開くと当日参加の情報が見え、閉じる操作で戻れる', /**
   * MSW に当日参加予約を作り、イベント別予約画面の詳細モーダルへ表示する。
   * @param page 操作・検証対象の Playwright ページ。
   * @returns {Promise<void>} 画面操作とアサーションが完了したときに解決する。
   */
  async ({ page }) => {
    // 1. モバイル幅でイベント別の予約画面を開く。
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/admin/events/mock-upcoming-1/reservations')
    await expect(page.getByRole('heading', { name: 'Green Market 2027' })).toBeVisible()

    // 2. 当日参加予約を作り、一覧に追加されたモバイルカードを確認する。
    await page.getByRole('button', { name: '当日参加を追加' }).click()
    /** 時間と人数を入力して当日参加を作成するモーダル */
    const walkinDialog = page.getByRole('dialog', { name: '当日参加を追加' })
    await walkinDialog.getByLabel('時間枠').fill('14:00〜15:00')
    await walkinDialog.getByLabel('参加人数').fill('2')
    await walkinDialog.getByRole('button', { name: '登録', exact: true }).click()
    await expect(walkinDialog).toBeHidden()

    // 3. 追加されたカードを押し、予約情報が詳細に表示されることを確認する。
    await page.getByLabel('当日参加 さんの予約の詳細を開く').click()
    /** 追加した当日参加予約の情報を表示する詳細モーダル */
    const detailDialog = page.getByRole('dialog', { name: '当日参加 さんの予約の詳細' })
    await expect(detailDialog).toBeVisible()
    await expect(detailDialog.getByText('14:00〜15:00')).toBeVisible()
    await expect(detailDialog.getByText('2名')).toBeVisible()

    // 4. 閉じる操作で詳細を閉じ、一覧へ戻れることを確かめる。
    await detailDialog.getByRole('button', { name: '閉じる' }).click()
    await expect(detailDialog).toBeHidden()
  })
})

/**
 * イベント別予約画面の当日参加追加モーダルが多日開催・自由時間入力と連動することを確認する。
 */
test.describe('イベント別予約の当日参加追加', () => {
  test('複数日イベントで参加日を表示し、時間と人数を登録して予約詳細へ反映する', async ({ page }) => {
    // 1. WS あり・複数日イベントの予約管理を開く。
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/admin/events/mock-upcoming-1/reservations')
    await expect(page.getByRole('heading', { name: 'Green Market 2027' })).toBeVisible()
    await page.getByRole('button', { name: '当日参加を追加' }).click()
    /** 複数日イベントの当日参加入力欄 */
    const dialog = page.getByRole('dialog', { name: '当日参加を追加' })
    await expect(dialog.getByText('参加日')).toBeVisible()

    // 2. 時間枠が無いイベント用の自由入力欄と参加人数を操作して登録する。
    await dialog.getByLabel('時間枠').fill('14:00〜15:00')
    await dialog.getByLabel('参加人数').fill('2')
    await dialog.getByRole('button', { name: '登録', exact: true }).click()
    await expect(dialog).toBeHidden()

    // 3. 作成された当日参加予約の詳細に送信内容が反映されたことを確認する。
    await page.getByLabel('当日参加 さんの予約の詳細を開く').click()
    /** 新規作成した当日参加予約の詳細 */
    const detailDialog = page.getByRole('dialog', { name: '当日参加 さんの予約の詳細' })
    await expect(detailDialog).toBeVisible()
    await expect(detailDialog.getByText('14:00〜15:00')).toBeVisible()
    await expect(detailDialog.getByText('2名')).toBeVisible()
    await detailDialog.getByRole('button', { name: '閉じる' }).click()
  })
})
