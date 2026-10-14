import { test, expect } from '@playwright/test'

// 開催時間ラベルの2階層上の div 以下にある select 要素（開始・終了の2つ）を取得する
function timeSelects(page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never) {
  return page.locator('label', { hasText: '開催時間' }).locator('..').locator('..').locator('select')
}

test.describe('イベントフォーム 開催時間プルダウン', () => {
  test('新規作成画面に開始・終了のプルダウンが2つ表示される', async ({ page }) => {
    await page.goto('/admin/events/new')
    await expect(timeSelects(page)).toHaveCount(2)
  })

  test('開始と終了を両方選ぶとそれぞれ反映される', async ({ page }) => {
    await page.goto('/admin/events/new')

    const sels = timeSelects(page)
    await sels.nth(0).selectOption('10:00')
    await sels.nth(1).selectOption('16:00')

    await expect(sels.nth(0)).toHaveValue('10:00')
    await expect(sels.nth(1)).toHaveValue('16:00')
  })

  test('開始だけ選んでも終了プルダウンは初期値のまま', async ({ page }) => {
    await page.goto('/admin/events/new')

    const sels = timeSelects(page)
    await sels.nth(0).selectOption('10:00')

    await expect(sels.nth(0)).toHaveValue('10:00')
    await expect(sels.nth(1)).toHaveValue('')
  })

  test('既存イベント編集時に time フィールドがプルダウンに展開される', async ({ page }) => {
    // mock-upcoming-1 は time: '10:00〜17:00'
    await page.goto('/admin/events/mock-upcoming-1/edit')

    const sels = timeSelects(page)
    await expect(sels.nth(0)).toHaveValue('10:00')
    await expect(sels.nth(1)).toHaveValue('17:00')
  })
})
