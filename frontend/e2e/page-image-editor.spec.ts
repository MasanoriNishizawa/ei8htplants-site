import { test, expect } from '@playwright/test'

// 管理画面「ページ画像の編集」（/admin/page-editor/:brand）の流れを確かめる。
// プレビューの枠をクリック → パネル → アップロード → プレビューに反映 → 保存 → 件数が 0。
// API は MSW のモック（アップロードは /img/logo-habitatoides.png を返す）で受ける。

/** アップロードに使う手元の画像 */
const UPLOAD_FILE = 'public/img/habitatOides/habitat_oides_hero.jpg'
/** モックのアップロードが返す URL */
const UPLOADED_URL = '/img/logo-habitatoides.png'

test.describe('ページ画像の編集', () => {
  test('E2E-AF-01: ei8ht plants のメインの写真をプレビューから選んで差し替え、保存すると件数が 0 になる', /**
     * /admin/page-editor を開き（ei8htplants へ転送）、プレビューの枠をクリックしてパネルを出し、画像をアップロードして
     * プレビューに出ることと件数を確かめ、保存して件数が 0 に戻ることを確かめる。
     * @param page 操作・検証対象の Playwright ページ
     * @returns {Promise<void>} すべての確認が終わったら解決する
     */
    async ({ page }) => {
    // 1. ブランドを指定せずに開くと ei8htplants に転送される
    await page.goto('/admin/page-editor')
    await expect(page).toHaveURL(/\/admin\/page-editor\/ei8htplants$/)
    // 初回は開発サーバーが画面の部品を変換するので、長めに待つ
    await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更はありません', { timeout: 20000 })
    const preview = page.frameLocator('[data-testid="page-editor-frame"]')
    // プレビューの中ではメニューを出さない
    await expect(preview.getByRole('complementary')).toHaveCount(0)

    // 2. プレビューの中の枠をクリックするとパネルが出る
    await preview.getByRole('button', { name: 'メインの写真を変更' }).click()
    const panel = page.getByTestId('page-editor-panel')
    await expect(panel.getByRole('heading', { name: 'メインの写真' })).toBeVisible()

    // 3. 画像をアップロードすると、プレビューと件数に反映される（保存はまだ）
    await panel.getByLabel('画像を選ぶ').setInputFiles(UPLOAD_FILE)
    await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更 1 件（未保存）')
    await expect(page.getByTestId('page-editor-slot-ei8ht-hero')).toContainText('変更あり')
    await expect(preview.locator('.ep-home-visual img')).toHaveAttribute('src', UPLOADED_URL)

    // 4. 保存すると件数が 0 に戻る
    await page.getByTestId('page-editor-save').click()
    await expect(page.getByText('1 件を保存しました。公開ページに反映されます。')).toBeVisible()
    await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更はありません')
    await expect(page.getByTestId('page-editor-save')).toBeDisabled()
  })

  test('E2E-AF-02: Habitat Oides のタブで空の枠に画像を入れて保存し、プレビューのリンクを押しても移動しない', /**
     * Habitat Oides のタブに切り替え、枠の一覧が11枠でサインを含まないことを確かめてから、object-02 を選んで画像をアップロードし、プレビューの空の枠が画像に
     * 変わることと保存できることを確かめる。プレビューのリンクを押しても iframe の中の URL が変わらないことも確かめる。
     * @param page 操作・検証対象の Playwright ページ
     * @returns {Promise<void>} すべての確認が終わったら解決する
     */
    async ({ page }) => {
    await page.goto('/admin/page-editor/ei8htplants')
    // 1. 未保存の変更がないので、確認なしでタブを切り替えられる
    await page.getByRole('tab', { name: 'Habitat Oides' }).click()
    await expect(page).toHaveURL(/\/admin\/page-editor\/habitat-oides$/)
    const preview = page.frameLocator('[data-testid="page-editor-frame"]')
    await expect(preview.getByTestId('habitat-placeholder-habitat-object-02')).toHaveCount(1)
    // 1-2. 枠の一覧は11枠（一番上の画像 5・動くオブジェクト 6）で、サインは差し替えの対象に入らない
    await expect(page.locator('[data-testid^="page-editor-slot-habitat-"]')).toHaveCount(11)
    await expect(page.getByTestId('page-editor-slot-habitat-sign')).toHaveCount(0)
    // プレビューのサインにも差し替えの枠（「〜を変更」のボタン）は付かない
    await expect(preview.getByTestId('editable-slot-habitat-sign')).toHaveCount(0)

    // 2. 枠の一覧から選び、画像をアップロードするとプレビューの空の枠が画像になる
    await page.getByTestId('page-editor-slot-habitat-object-02').click()
    await page.getByTestId('page-editor-panel').getByLabel('画像を選ぶ').setInputFiles(UPLOAD_FILE)
    await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更 1 件（未保存）')
    await expect(preview.getByTestId('habitat-floating-item-habitat-object-02').locator('img')).toHaveAttribute('src', UPLOADED_URL)
    await expect(preview.getByTestId('habitat-placeholder-habitat-object-02')).toHaveCount(0)

    // 3. プレビューの中のリンク（ワークショップ）を押しても移動しない
    const frameUrl = () => page.frames().find((f) => f.url().includes('/admin/page-preview/'))?.url()
    const before = frameUrl()
    await preview.locator('a[href="/workshop"]').first().dispatchEvent('click')
    // 移動していれば消えるはずのトップページの部品が残り、iframe の URL も変わらない
    await expect(preview.getByTestId('habitat-floating-objects')).toBeVisible()
    expect(frameUrl()).toBe(before)

    // 4. 保存すると件数が 0 になる
    await page.getByTestId('page-editor-save').click()
    await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更はありません')
  })

  test('E2E-AF-03: 未保存の変更があるときにタブを押すと確認が出て、キャンセルすると移動しない', /**
     * 枠の一覧から ei8ht-wordmark を選んで画像を入れ、HUE のタブを押したときに確認ダイアログが出て、
     * キャンセルすると URL と件数がそのままであることを確かめる。
     * @param page 操作・検証対象の Playwright ページ
     * @returns {Promise<void>} すべての確認が終わったら解決する
     */
    async ({ page }) => {
    await page.goto('/admin/page-editor/ei8htplants')
    await page.getByTestId('page-editor-slot-ei8ht-wordmark').click()
    await page.getByTestId('page-editor-panel').getByLabel('画像を選ぶ').setInputFiles(UPLOAD_FILE)
    await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更 1 件（未保存）')
    // 確認ダイアログをキャンセルする
    let dialogShown = false
    page.once('dialog', (dialog) => { dialogShown = true; void dialog.dismiss() })
    await page.getByRole('tab', { name: 'HUE' }).click()
    expect(dialogShown).toBe(true)
    await expect(page).toHaveURL(/\/admin\/page-editor\/ei8htplants$/)
    await expect(page.getByTestId('page-editor-changed-count')).toHaveText('変更 1 件（未保存）')
  })

  test('E2E-AF-04: スマホのボタンでプレビューの幅が 390px になる', /**
     * スマホ（390px）のボタンを押して、iframe の幅が 390px になり、ボタンが押された状態になることを確かめる。
     * @param page 操作・検証対象の Playwright ページ
     * @returns {Promise<void>} すべての確認が終わったら解決する
     */
    async ({ page }) => {
    await page.goto('/admin/page-editor/hue')
    await page.getByTestId('page-editor-viewport-sp').click()
    await expect(page.getByTestId('page-editor-viewport-sp')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('page-editor-frame')).toHaveCSS('width', '390px')
  })
})
