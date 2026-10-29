import { test, expect } from '@playwright/test'

/**
 * 「開催時間」ラベルの2階層上にある div から開始・終了の select 要素を取得する
 * @param page - 対象の管理画面ページ
 * @returns 開始時刻と終了時刻の select 要素をまとめた Locator
 */

function timeSelects(page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never) {
  return page.locator('label', { hasText: '開催時間' }).locator('..').locator('..').locator('select')
}

test.describe('イベントフォーム 開催時間プルダウン', () => {
  test('新規作成画面に開始・終了のプルダウンが2つ表示される', /**
     イベント新規作成画面を開き、開始時刻と終了時刻のプルダウンが2つ表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. イベント新規作成画面を開き、開始時刻と終了時刻の選択欄が2つ表示されることを確認する。
    await page.goto('/admin/events/new')
    await expect(timeSelects(page)).toHaveCount(2)
  })

  test('開始と終了を両方選ぶとそれぞれ反映される', /**
     新規イベントの開始を10:00、終了を16:00に選び、それぞれのプルダウンに選択値が反映されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 新規イベントフォームを開き、開始・終了時刻を選択する
    await page.goto('/admin/events/new')

    const sels = timeSelects(page)
    await sels.nth(0).selectOption('10:00')
    await sels.nth(1).selectOption('16:00')

    await expect(sels.nth(0)).toHaveValue('10:00')
    await expect(sels.nth(1)).toHaveValue('16:00')
  })

  test('開始だけ選んでも終了プルダウンは初期値のまま', /**
     新規イベントで開始時刻だけ10:00に設定し、終了時刻は未選択のまま保持されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 新規イベントフォームで開始時刻だけを選ぶ
    await page.goto('/admin/events/new')

    const sels = timeSelects(page)
    await sels.nth(0).selectOption('10:00')

    await expect(sels.nth(0)).toHaveValue('10:00')
    await expect(sels.nth(1)).toHaveValue('')
  })

  test('既存イベント編集時に time フィールドがプルダウンに展開される', /**
     既存イベントの編集画面を開き、開始・終了時刻の値がそれぞれプルダウンに読み込まれることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 開催時間が設定された既存イベントを開き、開始・終了時刻が各プルダウンに読み込まれることを確認する。
    // mock-upcoming-1 は time: '10:00〜17:00'
    await page.goto('/admin/events/mock-upcoming-1/edit')

    const sels = timeSelects(page)
    await expect(sels.nth(0)).toHaveValue('10:00')
    await expect(sels.nth(1)).toHaveValue('17:00')
  })

  test('既存イベント編集時にプルダウンで時間を変更すると変更後の値が表示される', /**
     既存イベントの編集画面で開始・終了時刻を順に変更し、選択後の値が各プルダウンに反映されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 開始・終了時刻を持つ既存イベントを開く
    await page.goto('/admin/events/mock-upcoming-1/edit')

    const sels = timeSelects(page)
    // 2. 読み込み後の開始・終了時刻がモックどおりか確認する
    await expect(sels.nth(0)).toHaveValue('10:00')
    await expect(sels.nth(1)).toHaveValue('17:00')

    // 3. 開始時刻だけを変更し、終了時刻が維持されることを確認する
    await sels.nth(0).selectOption('11:00')
    await expect(sels.nth(0)).toHaveValue('11:00')
    await expect(sels.nth(1)).toHaveValue('17:00')

    // 4. 終了時刻も変更し、両方の更新値を確認する
    await sels.nth(1).selectOption('18:00')
    await expect(sels.nth(0)).toHaveValue('11:00')
    await expect(sels.nth(1)).toHaveValue('18:00')
  })

  test('time が null のイベントを編集するとき、開始・終了を両方選べば値が表示される', /**
     時刻未設定のイベントを編集し、開始・終了を選ぶと未設定状態から両方の選択値が表示されることを確認する。
     * @param page 操作・検証対象の Playwright ページ。
     * @returns {Promise<void>} すべての画面アサーションが完了したときに解決する。
     */
    async ({ page }) => {
    // 1. 時刻が未設定の既存イベントを開く（モック値は time: null）
    await page.goto('/admin/events/mock-no-time/edit')

    const sels = timeSelects(page)
    // 2. 初期状態では開始・終了がどちらも未選択であることを確認する
    await expect(sels.nth(0)).toHaveValue('')
    await expect(sels.nth(1)).toHaveValue('')

    // 3. 開始時刻だけを選び、終了時刻は未選択のままか確認する
    await sels.nth(0).selectOption('10:00')
    await expect(sels.nth(0)).toHaveValue('10:00')
    await expect(sels.nth(1)).toHaveValue('')

    // 4. 終了時刻を選び、両方の選択値が表示されることを確認する
    await sels.nth(1).selectOption('16:00')
    await expect(sels.nth(0)).toHaveValue('10:00')
    await expect(sels.nth(1)).toHaveValue('16:00')
  })
})
