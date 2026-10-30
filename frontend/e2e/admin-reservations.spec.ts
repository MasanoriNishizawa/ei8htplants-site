import { test, expect } from '@playwright/test'

/**
 * 管理画面から時間枠が未設定のイベントへ当日参加を追加できることを確認する。
 * API は E2E 用 MSW が受け持ち、本番のデータベースや外部サービスには接続しない。
 */
test.describe('管理画面の当日参加登録', /**
  * 当日参加モーダルから時間枠なしの予約を作る画面テストをまとめる。
  * @returns 含まれるテストケースを登録する。
  */
  () => {
  test('/admin/reservations — 当日参加登録後、PCとスマホの予約一覧表示を切り替える', /**
     * 時間枠がないイベントへ当日参加を登録し、PC・スマホ幅で予約一覧表示が切り替わることを確かめる。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} 画面の操作とアサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. MSW を使う管理画面の予約一覧を開き、予約一覧と当日参加の追加操作を確認する。
    await page.goto('/admin/reservations')
    await expect(page.getByRole('heading', { name: 'WS予約一覧' })).toBeVisible()
    await page.getByRole('button', { name: '当日参加を追加' }).click()

    // 2. モーダルでイベントを選ぶ。mock-upcoming-1 は WS 対応で、初期状態では時間枠がない。
    const dialog = page.getByRole('dialog', { name: '当日参加を追加' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('イベント').selectOption({ label: 'Green Market 2027' })
    await expect(dialog.getByText('この日の枠はありません')).toBeVisible()

    // 3. 時間枠を選ばずに登録し、成功後モーダルが閉じることを確認する。
    await dialog.getByRole('button', { name: '登録', exact: true }).click()
    await expect(dialog).toBeHidden()

    // 4. PC幅では、MSW が返した当日参加予約がテーブルの新しい行に表示される。
    const reservationRow = page.getByRole('table').getByRole('row').filter({ hasText: '当日参加' })
    await expect(reservationRow).toHaveCount(1)
    await expect(reservationRow).toContainText('Green Market 2027')
    await expect(reservationRow).toContainText('当日参加')
    await expect(page.getByRole('table')).toBeVisible()
    const reservationCard = page.getByLabel('当日参加 さんの予約の詳細を開く')
    await expect(reservationCard).toBeHidden()

    // 5. スマホ幅ではカードへ切り替わり、予約の要約とイベント名を確認する。
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('table')).toBeHidden()
    await expect(reservationCard).toBeVisible()
    await expect(reservationCard).toContainText('Green Market 2027')
    await expect(reservationCard).toContainText('当日参加')

    // 6. PC幅へ戻すとカードが隠れ、同じ予約行がテーブルに表示される。
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(reservationCard).toBeHidden()
    await expect(page.getByRole('table')).toBeVisible()
    await expect(reservationRow).toBeVisible()
  })
})
