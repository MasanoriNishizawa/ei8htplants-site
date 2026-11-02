/**
 * Habitat Oides のトップページ（HabitatOides.tsx と habitatMotion/ の部品）の動きのテスト
 *
 * 確かめること:
 * 1. スプラッシュ: sessionStorage `habitat-oides-splash-shown` でタブごとに1回だけ出す
 * 2. 一番上の画像: 2枚以上で番号と前後のボタンを出し、3秒ごとに切り替わる。0〜1枚なら番号を出さず自動で切り替えない
 * 3. 右下のサイン: 管理画面の保存値は使わず、常にプロジェクト内の HABITAT_SIGN_SRC を出す。読み込みに失敗（onError）したら何も出さない。編集モードでも枠を付けない
 * 4. 画像の出方（overlay・brightness）と縦書き見出し
 * 5. パララックスのオブジェクト: 画像のない枠は habitat-placeholder-<key> を出す
 * 6. prefers-reduced-motion: スプラッシュなし・自動切り替えなし・画像は最初から表示・パララックスなし
 * 7. 画像の優先順（保存した URL → localSrc → placeholder）と、一括取得に失敗しても表示を続けること
 *
 * api はモックにして本番には接続しない。React Router と useT はモックしない。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../../lib/api'
import HabitatOides from '../HabitatOides'
import HabitatHeroSlider from '../habitatMotion/HabitatHeroSlider'
import { HABITAT_SPLASH_STORAGE_KEY } from '../habitatMotion/useHabitatSplashPhase'
import { PageImageEditContext, type PageImageEditValue } from '../../../lib/pageImageEdit'
import { HABITAT_SIGN_SRC } from '../../../lib/habitatMotionSlots'

// サイト画像の一括取得だけをモックする
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: { siteAssets: { list: vi.fn(), get: vi.fn(), save: vi.fn() } },
  }
})

/** 一括取得のモック */
const listMock = () => vi.mocked(api.siteAssets.list)

/**
 * 「動きを減らす」の設定を matchMedia のモックで切り替える。
 * @param reduce - true なら (prefers-reduced-motion: reduce) に当てはまる
 * @returns なし
 */
function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })))
}

/**
 * トップページを描画し、一括取得の応答を反映させる。
 * @param edit - 編集モードの値（省略するとふつうの公開ページ）
 * @returns 描画結果
 */
async function renderPage(edit?: PageImageEditValue) {
  const page = <MemoryRouter><HabitatOides /></MemoryRouter>
  const result = render(edit ? <PageImageEditContext.Provider value={edit}>{page}</PageImageEditContext.Provider> : page)
  // 一括取得の Promise を解決させる
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
  return result
}

/** 表示中のスライドの番号表示（例: '01 / 03'） */
const counterText = () => (screen.getByTestId('habitat-hero-counter').textContent ?? '').replace(/\s+/g, ' ').trim()

describe('HabitatOides トップページ', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    listMock().mockReset()
    listMock().mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  describe('スプラッシュ', () => {
    it('このタブで初めて開くとスプラッシュが出て、sessionStorage に出したことが記録される', async () => {
      await renderPage()
      expect(screen.getByTestId('habitat-splash')).toBeInTheDocument()
      expect(window.sessionStorage.getItem(HABITAT_SPLASH_STORAGE_KEY)).toBe('1')
    })

    it('sessionStorage に記録があるとスプラッシュは出ない（タブごとに1回だけ）', async () => {
      window.sessionStorage.setItem(HABITAT_SPLASH_STORAGE_KEY, '1')
      await renderPage()
      expect(screen.queryByTestId('habitat-splash')).not.toBeInTheDocument()
    })

    it('スプラッシュは leaving を経て 1.8 秒後に消える', async () => {
      vi.useFakeTimers()
      await renderPage()
      // 1. 読み込み済みなので次のフレームで leaving に進む
      await act(async () => { vi.advanceTimersByTime(50) })
      expect(screen.getByTestId('habitat-splash')).toHaveAttribute('data-phase', 'leaving')
      // 2. 幕が縮み終わると消える
      await act(async () => { vi.advanceTimersByTime(1800) })
      expect(screen.queryByTestId('habitat-splash')).not.toBeInTheDocument()
    })
  })

  describe('スプラッシュの最長の待ち時間', () => {
    afterEach(() => {
      // document.readyState の差し替えを元に戻す
      delete (document as unknown as Record<string, unknown>).readyState
    })

    it('読み込みが終わらなくても、3秒たつとスプラッシュの演出を始める（3秒前は待ったまま）', async () => {
      Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true })
      vi.useFakeTimers()
      await renderPage()
      await act(async () => { vi.advanceTimersByTime(2999) })
      expect(screen.getByTestId('habitat-splash')).toHaveAttribute('data-phase', 'waiting')
      await act(async () => { vi.advanceTimersByTime(1) })
      expect(screen.getByTestId('habitat-splash')).toHaveAttribute('data-phase', 'leaving')
    })

    it('3秒より前に load が来れば、そこで演出を始める', async () => {
      Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true })
      vi.useFakeTimers()
      await renderPage()
      await act(async () => { window.dispatchEvent(new Event('load')) })
      expect(screen.getByTestId('habitat-splash')).toHaveAttribute('data-phase', 'leaving')
    })
  })

  describe('一番上の画像（スライダー）', () => {
    beforeEach(() => {
      window.sessionStorage.setItem(HABITAT_SPLASH_STORAGE_KEY, '1')
    })

    it('保存した画像がないと localSrc の hero-01 だけの1枚になり、番号を出さず自動で切り替えない', async () => {
      await renderPage()
      const slides = screen.getByTestId('habitat-hero-slides')
      expect(slides).toHaveAttribute('data-autoplay', 'false')
      expect(slides.querySelectorAll('img')).toHaveLength(1)
      expect(screen.getByTestId('habitat-hero-slide-habitat-hero-01')).toHaveAttribute('src', '/img/habitatOides/habitat_oides_hero.jpg')
      expect(screen.queryByTestId('habitat-hero-controls')).not.toBeInTheDocument()
    })

    it('保存した URL がある枠は localSrc より優先して表示される', async () => {
      listMock().mockResolvedValue([{ key: 'habitat-hero-01', url: '/remote-hero.jpg' }])
      await renderPage()
      expect(screen.getByTestId('habitat-hero-slide-habitat-hero-01')).toHaveAttribute('src', '/remote-hero.jpg')
    })

    it('3枚あると「01 / 03」と前後のボタンが出て、自動の切り替えが有効になる', async () => {
      listMock().mockResolvedValue([
        { key: 'habitat-hero-02', url: '/h2.jpg' },
        { key: 'habitat-hero-04', url: '/h4.jpg' },
      ])
      await renderPage()
      expect(screen.getByTestId('habitat-hero-slides')).toHaveAttribute('data-autoplay', 'true')
      expect(counterText()).toBe('01 / 03')
      expect(screen.getByRole('button', { name: /Prev/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Next/ })).toBeInTheDocument()
      // 画像のない枠（hero-03・05）はスライドに入らない
      expect(screen.queryByTestId('habitat-hero-slide-habitat-hero-03')).not.toBeInTheDocument()
    })

    it('3秒ごとに次の画像へ進み、最後の次は最初に戻る', async () => {
      vi.useFakeTimers()
      listMock().mockResolvedValue([{ key: 'habitat-hero-02', url: '/h2.jpg' }])
      await renderPage()
      expect(counterText()).toBe('01 / 02')
      // 1. 3秒たつ前は変わらない
      await act(async () => { vi.advanceTimersByTime(2999) })
      expect(counterText()).toBe('01 / 02')
      // 2. 3秒で次へ進み、表示中の画像が入れ替わる
      await act(async () => { vi.advanceTimersByTime(1) })
      expect(counterText()).toBe('02 / 02')
      expect(screen.getByTestId('habitat-hero-slide-habitat-hero-02')).toHaveAttribute('data-active', 'true')
      expect(screen.getByTestId('habitat-hero-slide-habitat-hero-01')).toHaveAttribute('data-active', 'false')
      // 3. 最後の次は最初へ戻る
      await act(async () => { vi.advanceTimersByTime(3000) })
      expect(counterText()).toBe('01 / 02')
    })

    it('前後のボタンで切り替えられ、最初の前は最後へ回り込む', async () => {
      listMock().mockResolvedValue([
        { key: 'habitat-hero-02', url: '/h2.jpg' },
        { key: 'habitat-hero-03', url: '/h3.jpg' },
      ])
      await renderPage()
      fireEvent.click(screen.getByRole('button', { name: /Prev/ }))
      expect(counterText()).toBe('03 / 03')
      fireEvent.click(screen.getByRole('button', { name: /Next/ }))
      expect(counterText()).toBe('01 / 03')
    })

    it('スライダーは role="region" で「ブランドの写真」という名前の領域になり、前後のボタン名に Prev / Next を含む', async () => {
      listMock().mockResolvedValue([{ key: 'habitat-hero-02', url: '/h2.jpg' }])
      await renderPage()
      expect(screen.getByRole('region', { name: 'ブランドの写真' })).toBe(screen.getByTestId('habitat-hero-slides'))
      expect(screen.getByRole('button', { name: /Prev/ })).toHaveTextContent('Prev')
      expect(screen.getByRole('button', { name: /Next/ })).toHaveTextContent('Next')
    })

    it('マウスがヒーローに乗っている間は自動で切り替わらず、外れると再開する', async () => {
      vi.useFakeTimers()
      listMock().mockResolvedValue([{ key: 'habitat-hero-02', url: '/h2.jpg' }])
      await renderPage()
      const hero = screen.getByTestId('habitat-hero-slides').parentElement as HTMLElement
      // 1. ヒーローの上の文言にマウスが乗る（親まで伝わる）
      await act(async () => { fireEvent.mouseOver(screen.getByRole('heading', { level: 1 })) })
      expect(screen.getByTestId('habitat-hero-slides')).toHaveAttribute('data-paused', 'true')
      await act(async () => { vi.advanceTimersByTime(6000) })
      expect(counterText()).toBe('01 / 02')
      // 2. ヒーローの中の別の要素へ移っただけなら止めたまま
      await act(async () => { fireEvent.mouseOut(screen.getByRole('heading', { level: 1 }), { relatedTarget: hero }) })
      await act(async () => { vi.advanceTimersByTime(3000) })
      expect(counterText()).toBe('01 / 02')
      // 3. ヒーローの外へ出ると再開し、そこから3秒で進む
      await act(async () => { fireEvent.mouseOut(hero, { relatedTarget: document.body }) })
      expect(screen.getByTestId('habitat-hero-slides')).toHaveAttribute('data-paused', 'false')
      await act(async () => { vi.advanceTimersByTime(3000) })
      expect(counterText()).toBe('02 / 02')
    })

    it('フォーカスがヒーローの中にある間は自動で切り替わらず、外へ出ると再開する', async () => {
      vi.useFakeTimers()
      listMock().mockResolvedValue([{ key: 'habitat-hero-02', url: '/h2.jpg' }])
      await renderPage()
      const next = screen.getByRole('button', { name: /Next/ })
      await act(async () => { fireEvent.focusIn(next) })
      await act(async () => { vi.advanceTimersByTime(6000) })
      expect(counterText()).toBe('01 / 02')
      await act(async () => { fireEvent.focusOut(next, { relatedTarget: document.body }) })
      await act(async () => { vi.advanceTimersByTime(3000) })
      expect(counterText()).toBe('02 / 02')
    })

    it('一括取得に失敗しても止まらず、localSrc の画像と空の枠で表示を続ける', async () => {
      listMock().mockRejectedValue(new Error('network'))
      await renderPage()
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
      expect(screen.getByTestId('habitat-hero-slide-habitat-hero-01')).toHaveAttribute('src', '/img/habitatOides/habitat_oides_hero.jpg')
      expect(screen.getByTestId('habitat-placeholder-habitat-object-01')).toBeInTheDocument()
      // サインは一括取得に関係なく、プロジェクト内のファイルで出す
      expect(screen.getByTestId('habitat-brand-sign').querySelector('img')).toHaveAttribute('src', HABITAT_SIGN_SRC)
    })
  })

  describe('HabitatHeroSlider（画像が0枚のとき）', () => {
    it('スライドが0枚なら emptySlotKey の空の枠だけを出し、番号は出さない', () => {
      render(<HabitatHeroSlider slides={[]} reduced={false} emptySlotKey="habitat-hero-01" />)
      expect(screen.getByTestId('habitat-placeholder-habitat-hero-01')).toBeInTheDocument()
      expect(screen.queryByTestId('habitat-hero-slides')).not.toBeInTheDocument()
      expect(screen.queryByTestId('habitat-hero-controls')).not.toBeInTheDocument()
    })
  })

  describe('右下のサイン・オブジェクト・画像の出方・縦書き見出し', () => {
    beforeEach(() => {
      window.sessionStorage.setItem(HABITAT_SPLASH_STORAGE_KEY, '1')
    })

    it('サインは常にプロジェクト内の HABITAT_SIGN_SRC を右下に出す（読み上げの対象外・空の枠は出さない）', async () => {
      await renderPage()
      const sign = screen.getByTestId('habitat-brand-sign')
      expect(sign).toHaveAttribute('aria-hidden', 'true')
      expect(sign.querySelector('img')).toHaveAttribute('src', HABITAT_SIGN_SRC)
      expect(screen.queryByTestId('habitat-placeholder-habitat-sign')).not.toBeInTheDocument()
    })

    it('一括取得の応答に habitat-sign の URL があっても使わず、HABITAT_SIGN_SRC を出す', async () => {
      listMock().mockResolvedValue([{ key: 'habitat-sign', url: '/sign.png' }])
      await renderPage()
      expect(screen.getByTestId('habitat-brand-sign').querySelector('img')).toHaveAttribute('src', HABITAT_SIGN_SRC)
    })

    it('サインの画像の読み込みに失敗する（onError）と、サインの要素ごと消える', async () => {
      await renderPage()
      const img = screen.getByTestId('habitat-brand-sign').querySelector('img')
      expect(img).not.toBeNull()
      await act(async () => { fireEvent.error(img!) })
      expect(screen.queryByTestId('habitat-brand-sign')).not.toBeInTheDocument()
    })

    it('画像のないオブジェクトの枠は habitat-placeholder-<key> を出し、画像のある枠は画像を出す', async () => {
      listMock().mockResolvedValue([{ key: 'habitat-object-03', url: '/o3.png' }])
      await renderPage()
      for (const n of ['01', '02', '04', '05', '06']) {
        expect(screen.getByTestId(`habitat-placeholder-habitat-object-${n}`)).toBeInTheDocument()
      }
      expect(screen.queryByTestId('habitat-placeholder-habitat-object-03')).not.toBeInTheDocument()
      expect(screen.getByTestId('habitat-floating-item-habitat-object-03').querySelector('img')).toHaveAttribute('src', '/o3.png')
    })

    it('画像の出方は overlay と brightness の2種類があり、縦書き見出しが出る', async () => {
      await renderPage()
      const reveals = screen.getAllByTestId('habitat-reveal')
      expect(reveals.some((el) => el.classList.contains('habitat-reveal--overlay'))).toBe(true)
      expect(reveals.some((el) => el.classList.contains('habitat-reveal--brightness'))).toBe(true)
      expect(screen.getByTestId('habitat-vertical-title')).toHaveTextContent('景色を仕立てる')
    })

    it('動きを減らす設定でなければ、オブジェクトにパララックスのずれ（translate3d）がかかる', async () => {
      await renderPage()
      expect(screen.getByTestId('habitat-floating-item-habitat-object-01').style.transform).toMatch(/^translate3d\(/)
    })
  })

  describe('prefers-reduced-motion のとき', () => {
    beforeEach(() => {
      stubReducedMotion(true)
    })

    it('スプラッシュを出さず、sessionStorage にも記録しない', async () => {
      await renderPage()
      expect(screen.queryByTestId('habitat-splash')).not.toBeInTheDocument()
      expect(window.sessionStorage.getItem(HABITAT_SPLASH_STORAGE_KEY)).toBeNull()
    })

    it('画像が複数あっても自動で切り替えず、3秒たっても 01 のまま', async () => {
      vi.useFakeTimers()
      listMock().mockResolvedValue([{ key: 'habitat-hero-02', url: '/h2.jpg' }])
      await renderPage()
      const slides = screen.getByTestId('habitat-hero-slides')
      expect(slides).toHaveAttribute('data-autoplay', 'false')
      expect(slides).toHaveClass('habitat-hero-slides--static')
      await act(async () => { vi.advanceTimersByTime(6000) })
      expect(counterText()).toBe('01 / 02')
    })

    it('画像は最初から表示済み（is-visible）になり、パララックスのずれもかからない', async () => {
      await renderPage()
      for (const reveal of screen.getAllByTestId('habitat-reveal')) {
        expect(reveal).toHaveAttribute('data-revealed', 'true')
        expect(reveal).toHaveClass('is-visible')
      }
      expect(screen.getByTestId('habitat-floating-item-habitat-object-01').style.transform).toBe('')
    })
  })
  describe('管理画面のプレビュー（編集モード）のとき', () => {
    /**
     * 編集モードの値を作る。
     * @param patch - 上書きする値
     * @returns 編集モードの値
     */
    const editValue = (patch: Partial<PageImageEditValue> = {}): PageImageEditValue => ({
      editMode: true, draftUrls: {}, selectedKey: null, onSelectSlot: vi.fn(), ...patch,
    })

    it('スプラッシュを出さず、画像のない枠も含めた5枠のスライドを自動で切り替えない', async () => {
      await renderPage(editValue())
      expect(screen.queryByTestId('habitat-splash')).not.toBeInTheDocument()
      expect(window.sessionStorage.getItem(HABITAT_SPLASH_STORAGE_KEY)).toBeNull()
      expect(screen.getByTestId('habitat-hero-slides')).toHaveAttribute('data-autoplay', 'false')
      expect(counterText()).toBe('01 / 05')
      expect(screen.getByTestId('habitat-placeholder-habitat-hero-02')).toBeInTheDocument()
    })

    it('一番上の画像の枠（「〜を変更」のボタン）は表示中のスライドにだけ出る', async () => {
      await renderPage(editValue())
      expect(screen.getByTestId('editable-slot-habitat-hero-01')).toBeInTheDocument()
      expect(screen.queryByTestId('editable-slot-habitat-hero-02')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /Next/ }))
      expect(screen.queryByTestId('editable-slot-habitat-hero-01')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '一番上の画像 02を変更' })).toBeInTheDocument()
    })

    it('編集画面で hero-04 を選ぶと、そのスライドが表示される', async () => {
      await renderPage(editValue({ selectedKey: 'habitat-hero-04' }))
      expect(counterText()).toBe('04 / 05')
      expect(screen.getByTestId('editable-slot-habitat-hero-04')).toHaveAttribute('aria-pressed', 'true')
    })

    it('編集モードでもサインには差し替えの枠・空の枠を付けず、草稿に habitat-sign があっても HABITAT_SIGN_SRC を出す', async () => {
      await renderPage(editValue({ draftUrls: { 'habitat-sign': '/draft-sign.png' } }))
      const sign = screen.getByTestId('habitat-brand-sign')
      expect(sign.querySelector('img')).toHaveAttribute('src', HABITAT_SIGN_SRC)
      expect(sign.querySelector('button')).toBeNull()
      expect(screen.queryByTestId('editable-slot-habitat-sign')).not.toBeInTheDocument()
      expect(screen.queryByTestId('habitat-placeholder-habitat-sign')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /サイン/ })).not.toBeInTheDocument()
    })

    it('編集モードでもサインの読み込みに失敗すると、何も出さない', async () => {
      await renderPage(editValue())
      await act(async () => { fireEvent.error(screen.getByTestId('habitat-brand-sign').querySelector('img')!) })
      expect(screen.queryByTestId('habitat-brand-sign')).not.toBeInTheDocument()
      expect(screen.queryByTestId('habitat-placeholder-habitat-sign')).not.toBeInTheDocument()
    })

    it('草稿で保存した URL を外す（空文字）と、localSrc のない枠は空の枠に戻る', async () => {
      listMock().mockResolvedValue([{ key: 'habitat-object-01', url: '/o1.png' }])
      await renderPage(editValue({ draftUrls: { 'habitat-object-01': '' } }))
      expect(screen.getByTestId('habitat-placeholder-habitat-object-01')).toBeInTheDocument()
    })

    it('オブジェクトの枠をクリックすると onSelectSlot にそのキーが渡る', async () => {
      const onSelectSlot = vi.fn()
      await renderPage(editValue({ onSelectSlot }))
      fireEvent.click(screen.getByTestId('editable-slot-habitat-object-05'))
      expect(onSelectSlot).toHaveBeenCalledWith('habitat-object-05')
    })
  })
})
