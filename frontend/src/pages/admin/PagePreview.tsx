import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import PageLoading from '../../components/PageLoading'
import {
  isPageEditorMessage,
  PageImageEditContext,
  type PageEditorReadyMessage,
  type PageEditorSelectMessage,
  type PageImageEditValue,
} from '../../lib/pageImageEdit'
import { findPageImageSlot, isPageImageBrand, PAGE_IMAGE_BRANDS, type PageImageBrand } from '../../lib/pageImageSlots'
import { habitatOidesSite } from '../../sites/habitat-oides/site'
import { hueSite } from '../../sites/hue/site'

// 公開ページ（トップページ）の部品。公開サイトと同じものを、開いたときに別ファイルとして読み込む
const Ei8htPlants = lazy(() => import('../brands/Ei8htPlants'))
const HabitatOides = lazy(() => import('../brands/HabitatOides'))
const Hue = lazy(() => import('../brands/Hue'))

/**
 * 親（編集画面）へメッセージを送る。iframe の中で開いたときだけ送り、送り先は同じオリジンに限る。
 * @param message - 送るメッセージ
 * @returns なし
 */
function postToParent(message: PageEditorReadyMessage | PageEditorSelectMessage): void {
  if (window.parent === window) return
  window.parent.postMessage(message, window.location.origin)
}

/**
 * 受け取った草稿の URL から、文字列の値だけを取り出す（形の違う値が混じっても表示を壊さないため）。
 * @param value - 受け取った草稿の URL
 * @returns キー → URL（文字列）の辞書
 */
function toStringRecord(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

/**
 * キーが、そのブランドのトップページの枠のキーかを確かめる（親から届いたキーをそのまま使わないため）。
 * 1. findPageImageSlot で、定義にある枠のキーかを確かめる
 * 2. その枠が、プレビューしているブランドの枠の一覧に入っているかを確かめる
 * @param brand - プレビューしているブランド
 * @param key - 確かめるキー
 * @returns このブランドの枠のキーなら true
 */
function isSlotKeyOfBrand(brand: PageImageBrand, key: string): boolean {
  // 1. 3ブランドのどこかの枠の定義にあるか
  const slot = findPageImageSlot(key)
  if (!slot) return false
  // 2. そのブランドの枠か（ほかのブランドの枠のキーは使わない）
  return PAGE_IMAGE_BRANDS[brand].slots.some((item) => item.key === slot.key)
}

/**
 * 属性セレクターに入れる文字列をエスケープする。
 * CSS.escape があればそれを使い、ない環境（テストの jsdom など）ではそのまま返す。
 * 呼び出す前に isSlotKeyOfBrand で枠のキー（英数字とハイフンだけ）だと確かめているので、そのままでも壊れない。
 * @param value - エスケープする文字列
 * @returns セレクターに入れてよい文字列
 */
function escapeSelectorValue(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value
}

/** BrandFrame の引数 */
interface BrandFrameProps {
  /** プレビューするブランド */
  brand: PageImageBrand
  /** ページ本体 */
  children: ReactNode
}

/**
 * ブランドの公開サイトと同じ CSS クラスでページを包み、見た目を本物に近づける。
 * ヘッダー・フッターは出さない（ブランドサイトのレイアウトは計測やアイコンの差し替えも行うため、使わない）。
 * ヘッダーがないので、ヘッダーの高さの CSS 変数を 0 にして、上の余白をなくす。
 * @param props.brand - プレビューするブランド
 * @param props.children - ページ本体
 * @returns ブランドの外枠で包んだページ
 */
function BrandFrame({ brand, children }: BrandFrameProps) {
  // 1. ei8ht plants: 公開サイトのレイアウト（components/Layout.tsx）の main と同じクラス。ヘッダー分の上の余白はなくす
  if (brand === 'ei8htplants') {
    return (
      <main className="site-main" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    )
  }
  // 2. Habitat Oides・HUE: ブランドサイトのレイアウト（components/BrandSiteLayout.tsx）と同じクラスとテーマ色
  const site = brand === 'habitat-oides' ? habitatOidesSite : hueSite
  // ブランドの外枠に渡す CSS 変数（テーマ色と、ヘッダーの高さ 0）
  const frameStyle = { '--brand-accent': site.accent, '--brand-site-header-height': '0px' } as CSSProperties
  return (
    <div className={`brand-site brand-site-${site.key}`} style={frameStyle}>
      {/* ヘッダーがないので、上の余白（padding-top）をなくす */}
      <main className="brand-site-main" style={{ paddingTop: 0 }}>
        {children}
      </main>
    </div>
  )
}

/**
 * 管理画面「ページ画像の編集」の iframe の中に出す、ブランドのトップページのプレビュー（/admin/page-preview/:brand）。
 * 管理画面のログインが必要なルートの下に置くが、AdminLayout のメニューは出さず、ページ本体だけを出す。
 * 1. 公開ページの部品をそのまま使い、PageImageEditContext で「編集モード」にする
 * 2. 親（編集画面）から postMessage で草稿の URL と選んでいる枠を受け取る（同じオリジン・親の window からだけ）
 * 3. 準備ができたら親に知らせ、枠をクリックしたら親に「この枠を選んだ」と知らせる
 * 4. 枠と、許可した操作（Habitat のスライダーの前後のボタン）以外のクリックを止め、リンクで移動しないようにする
 * @returns プレビューの React 要素
 */
export default function PagePreview() {
  // URL の :brand
  const { brand: brandParam } = useParams()
  // プレビューするブランド（URL が違えば null）
  const brand = isPageImageBrand(brandParam) ? brandParam : null
  // 親から受け取った草稿の URL（キー → URL）。受け取るまでは空（保存した値のまま表示する）
  const [draftUrls, setDraftUrls] = useState<Record<string, string>>({})
  // 選んでいる枠のキー
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // 選んだ枠が見えるところまでスクロールしたい枠のキー（親の枠の一覧から選んだとき）。スクロールしたら null に戻す
  const [revealKey, setRevealKey] = useState<string | null>(null)

  // 1. 親からのメッセージを受け取り、準備ができたことを知らせる
  useEffect(() => {
    if (!brand) return
    /**
     * 親からのメッセージを受け取る。同じオリジン・親の window から来た、このブランドの state のメッセージだけを使う。
     * 1. 送り元・形・ブランドを確かめる
     * 2. 草稿の URL を受け取る（文字列の値だけ）
     * 3. 選んでいる枠のキーは、このブランドの枠のキーのときだけ使う（合わなければ選んでいない扱いにし、スクロールもしない）
     * @param event - 受け取ったメッセージのイベント
     * @returns なし
     */
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return
      if (!isPageEditorMessage(event.data) || event.data.type !== 'page-editor:state' || event.data.brand !== brand) return
      setDraftUrls(toStringRecord(event.data.draftUrls))
      // このブランドの枠のキーだと確かめた、選んでいる枠のキー（合わないキー・null は null）
      const key = event.data.selectedKey !== null && isSlotKeyOfBrand(brand, event.data.selectedKey) ? event.data.selectedKey : null
      setSelectedKey(key)
      if (event.data.reveal && key) setRevealKey(key)
    }
    window.addEventListener('message', onMessage)
    // 受け取れるようになったので、親に「準備ができた」と知らせる（親はこれを受けて草稿を送る）
    postToParent({ type: 'page-editor:ready', brand })
    return () => window.removeEventListener('message', onMessage)
  }, [brand])

  // 2. 枠と許可した操作以外のクリック・送信を止める（ページのリンク・ボタンで移動しないように）
  useEffect(() => {
    /**
     * クリックを捕まえて、枠（data-page-edit-target）と許可した操作（data-page-edit-allow）以外なら止める。
     * React の処理より先に動くよう、document の capture で受け取る。
     * @param event - クリック・送信のイベント
     * @returns なし
     */
    const block = (event: Event) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-page-edit-target], [data-page-edit-allow]')) return
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('click', block, true)
    document.addEventListener('submit', block, true)
    return () => {
      document.removeEventListener('click', block, true)
      document.removeEventListener('submit', block, true)
    }
  }, [])

  // 3. 親の枠の一覧から選んだときは、その枠が見えるところまでスクロールする（描画が終わってから）。
  //    キーがこのブランドの枠のキーでなければ何もしない。セレクターに入れるキーは CSS.escape でエスケープする
  useEffect(() => {
    if (!revealKey || !brand || !isSlotKeyOfBrand(brand, revealKey)) return
    const frame = window.requestAnimationFrame(() => {
      const element = document.querySelector(`[data-page-edit-target][data-slot-key="${escapeSelectorValue(revealKey)}"]`)
      element?.scrollIntoView({ block: 'center', behavior: 'auto' })
      setRevealKey(null)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [revealKey, brand])

  /**
   * プレビューの中で枠をクリックしたとき、選んだ枠にして親に知らせる。
   * @param key - 選んだ枠のキー
   * @returns なし
   */
  const onSelectSlot = useCallback((key: string) => {
    setSelectedKey(key)
    if (brand) postToParent({ type: 'page-editor:select', brand, key })
  }, [brand])

  // 公開ページに配る編集モードの値（中身が変わったときだけ作り直す）
  const editValue = useMemo<PageImageEditValue>(() => ({
    editMode: true,
    draftUrls,
    selectedKey,
    onSelectSlot,
  }), [draftUrls, selectedKey, onSelectSlot])

  if (!brand) {
    return <p style={{ padding: 24, fontSize: 15 }}>プレビューできないページです。</p>
  }

  return (
    <PageImageEditContext.Provider value={editValue}>
      <BrandFrame brand={brand}>
        <Suspense fallback={<PageLoading />}>
          {brand === 'ei8htplants' && <Ei8htPlants />}
          {brand === 'habitat-oides' && <HabitatOides />}
          {brand === 'hue' && <Hue />}
        </Suspense>
      </BrandFrame>
    </PageImageEditContext.Provider>
  )
}
