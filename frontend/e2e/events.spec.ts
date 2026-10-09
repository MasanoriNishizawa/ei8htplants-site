import { test, expect } from '@playwright/test'

test.describe('Events', () => {
  test('開催予定イベントが表示される', async ({ page }) => {
    await page.goto('/events')
    await expect(page.getByText('Green Market 2027')).toBeVisible()
  })

  test('イベント開催地が表示される', async ({ page }) => {
    await page.goto('/events')
    await expect(page.getByText(/代々木公園/)).toBeVisible()
  })

  test('複数イベントが表示される', async ({ page }) => {
    await page.goto('/events')
    await expect(page.getByText('HUE POP-UP at Spiral')).toBeVisible()
  })
})
