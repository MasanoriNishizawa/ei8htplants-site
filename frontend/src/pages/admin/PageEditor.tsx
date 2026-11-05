import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { BRAND_SHOWCASES } from '../../lib/brandShowcase'
import { isPageEditorMessage, type PageEditorStateMessage } from '../../lib/pageImageEdit'
import {
  findPageImagePage,
  isPageImageBrand,
  PAGE_IMAGE_BRAND_ORDER,
  PAGE_IMAGE_BRANDS,
  PAGE_IMAGE_HOME_PAGE,
  pagesUsingSlot,
  type PageImageBrand,
  type PageImagePage,
  type PageImageSlot,
} from '../../lib/pageImageSlots'
import { confirmLeaveIfDirty, useUnsavedChanges } from './UnsavedChanges'
import { failMessage } from './errorMessage'

/** プレビューの表示幅の種類（pc: PC 1280px / sp: スマホ 390px） */
type Viewport = 'pc' | 'sp'

/** 表示幅ごとの iframe の大きさ（px）。高さはよくある画面の高さに合わせる（一番上の画像が画面の高さいっぱいに出るため） */
const VIEWPORT_SIZES: Readonly<Record<Viewport, { width: number; height: number; label: string }>> = {
  pc: { width: 1280, height: 800, label: 'PC（1280px）' },
  sp: { width: 390, height: 844, label: 'スマホ（390px）' },
}

/** 一覧の読み込みに失敗したときの案内 */
const LOAD_ERROR = '画像の設定を読み込めませんでした。再読み込みしてください（読み込めるまで、画像を選ぶことと保存はできません）。'

/** アップロードできる画像の種類（ファイル選択欄の accept） */
const ACCEPT_IMAGES = 'image/jpeg,image/png,image/webp,image/gif'

/** 一覧の読み込みの状態（loading: 読み込み中 / ready: 読み込めた / error: 失敗した） */
type LoadState = 'loading' | 'ready' | 'error'

/** 文字だけのボタン（画像を外す・変更を取り消す・閉じる）の見た目 */
const textButtonStyle: React.CSSProperties = {
  padding: 0, border: 0, background: 'none', fontSize: 14, cursor: 'pointer', textDecoration: 'underline',
}

/**
 * 管理画面「ページ画像の編集」（/admin/page-editor/:brand/:page?）。
 * URL のブランドが正しければ、ブランドごとの編集画面（PageEditorBrand）を出す。
 * 1. ブランドが正しくなければ ei8ht plants の編集画面へ移る
 * 2. :page を省いたらトップページ（home）を出す。定義にないページなら、そのブランドの home へ移る
 * 3. ブランドを切り替えたら編集画面を作り直して、草稿・選んだ枠を空に戻す（切り替える前に未保存の確認を出す）
 * 4. 同じブランドの中でページを切り替えても編集画面は作り直さず、草稿はそのまま残す（保存はブランドごとにまとめて行う）
 * プレビューの表示幅（PC / スマホ）は、ブランド・ページを切り替えても引き継ぐ。
 * @returns 編集画面。ブランド・ページが正しくなければ転送する
 */
export default function PageEditor() {
  // URL の :brand と :page
  const { brand, page } = useParams()
  // プレビューの表示幅（ブランド・ページを切り替えても引き継ぐ）
  const [viewport, setViewport] = useState<Viewport>('pc')
  // 1. ブランドの確認
  if (!isPageImageBrand(brand)) return <Navigate to="/admin/page-editor/ei8htplants" replace />
  // 2. ページの確認（省いたら home、定義にないページならそのブランドの home へ）
  const pageConfig = findPageImagePage(brand, page ?? PAGE_IMAGE_HOME_PAGE)
  if (!pageConfig) return <Navigate to={`/admin/page-editor/${brand}`} replace />
  // 3・4. 編集画面はブランドごとに作り直す（key はブランドだけにして、ページを変えても草稿を残す）
  return <PageEditorBrand key={brand} brand={brand} page={pageConfig} viewport={viewport} onViewportChange={setViewport} />
}

/** PageEditorBrand の引数 */
interface PageEditorBrandProps {
  /** 編集するブランド */
  brand: PageImageBrand
  /** 今プレビューしているページの定義 */
  page: PageImagePage
  /** プレビューの表示幅 */
  viewport: Viewport
  /**
   * プレビューの表示幅を変える
   * @param viewport - 新しい表示幅
   */
  onViewportChange: (viewport: Viewport) => void
}

/**
 * ブランド1つ分の「ページ画像の編集」画面。
 * 1. GET /api/site-assets?prefix=... で、ブランドの全ページの枠の保存済みの URL を読み込む（失敗したら、画像を選ぶことと保存を止める）
 * 2. iframe で /admin/page-preview/:brand/:page を出し、postMessage で草稿の URL と選んだ枠を送る
 * 3. プレビューの枠のクリック（または枠の一覧）で枠を選ぶと、右（スマホ幅では下）にパネルを出す
 * 4. パネルで画像を選ぶ（api.upload）・外す・変更を取り消す。変えたものはプレビューにすぐ反映する
 * 5. 「保存する」で、ブランドの中で変更した枠を（どのページで変えたものも）まとめて PUT する。失敗した枠はエラーを出して草稿に残す
 * 6. ページの選択欄でページを切り替えても、同じブランドの草稿は残す（確認は出さない）
 * 7. 未保存の変更があれば、管理画面のほかの画面へ移るとき・ブランドのタブを切り替えるときに確認する
 * @param props.brand - 編集するブランド
 * @param props.page - 今プレビューしているページの定義
 * @param props.viewport - プレビューの表示幅
 * @param props.onViewportChange - プレビューの表示幅を変える関数
 * @returns 編集画面の React 要素
 */
function PageEditorBrand({ brand, page, viewport, onViewportChange }: PageEditorBrandProps) {
  // ブランドの設定（タブの名前・取得の prefix・ページの一覧・全ページの枠の一覧）
  const config = PAGE_IMAGE_BRANDS[brand]
  // ページの選択欄で別のページへ移る関数
  const navigate = useNavigate()
  // 保存済みの URL（キー → URL。未設定は ''）
  const [savedUrls, setSavedUrls] = useState<Record<string, string>>({})
  // 草稿の URL（キー → URL。保存済みの値に、この画面での変更を重ねたもの）
  const [draftUrls, setDraftUrls] = useState<Record<string, string>>({})
  // Our Brands の HUE の写真を外したときに使う保存済み画像（草稿の保存対象には含めない）
  const [hueFallbackSrc, setHueFallbackSrc] = useState('')
  // 一覧の読み込みの状態
  const [loadState, setLoadState] = useState<LoadState>('loading')
  // 選んでいる枠のキー（選んでいなければ null。選んでいるときだけパネルを出す）
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // 画像をアップロードしている枠のキー（していなければ null）
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  // 保存中か
  const [saving, setSaving] = useState(false)
  // 枠ごとの失敗の文言（キー → 文言。アップロード・保存の失敗）
  const [slotErrors, setSlotErrors] = useState<Record<string, string>>({})
  // 保存の結果の案内（成功・一部失敗）
  const [saveNotice, setSaveNotice] = useState('')
  // 保存に失敗した枠があったか（案内の色を変える）
  const [saveFailed, setSaveFailed] = useState(false)
  // プレビューから「準備ができた」を受け取った回数と、そのときのページ（iframe を読み込み直すたびに増え、草稿を送り直す）。
  // ページを切り替えた直後は、前のページの準備の回数を使わないよう、ページが合うときだけ数える（frameReadyCount）
  const [frameReady, setFrameReady] = useState<{ page: string; count: number }>({ page: page.id, count: 0 })
  // 今のページのプレビューから「準備ができた」を受け取った回数（0 なら未準備）
  const frameReadyCount = frameReady.page === page.id ? frameReady.count : 0
  // 枠の一覧から選んだ回数（増えたら、プレビューを選んだ枠までスクロールさせる）
  const [revealCount, setRevealCount] = useState(0)
  // 最後にプレビューへ「スクロールして」と送ったときの revealCount（同じ指示を2回送らないため）
  const sentRevealRef = useRef(0)
  // プレビューの iframe
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // プレビューを置く枠（幅を測って、iframe を縮小する倍率を決める）
  const stageRef = useRef<HTMLDivElement>(null)
  // プレビューを置く枠の幅（px。測る前は 0）
  const [stageWidth, setStageWidth] = useState(0)

  // 保存していない変更がある枠のキー（ブランドの全ページの枠の定義順。どのページで変えたものも数える）
  const changedKeys = config.slots
    .map(({ key }) => key)
    .filter((key) => (draftUrls[key] ?? '') !== (savedUrls[key] ?? ''))
  // 保存していない変更があるか（ページを離れるときの確認に使う）
  const dirty = changedKeys.length > 0
  useUnsavedChanges(dirty)
  // 画像を選ぶ・外す・保存をできない状態か（読み込み中・読み込み失敗・アップロード中・保存中）
  const locked = loadState !== 'ready' || uploadingKey !== null || saving
  // 選んでいる枠の定義（今のページの枠のときだけ。ほかのページの枠を選んだままページを切り替えたら、パネルは閉じる）
  const selectedSlot = page.slots.find(({ key }) => key === selectedKey) ?? null
  // 今のページで、プレビューへ送る選んでいる枠のキー（今のページの枠でなければ null）
  const selectedKeyOnPage = selectedSlot?.key ?? null

  // 1. 保存済みの URL を読み込む
  useEffect(() => {
    // 画面を離れたあとに応答が届いて state を更新しないための有効フラグ
    let active = true
    api.siteAssets.list(config.prefix).then((assets) => {
      if (!active) return
      // 応答を「キー → URL」にし、このブランドの枠だけを取り出す（hue-color-study など枠でないキーは使わない）
      const urlByKey = Object.fromEntries(assets.map(({ key, url }) => [key, url]))
      const urls = Object.fromEntries(config.slots.map(({ key }) => [key, urlByKey[key] ?? '']))
      setSavedUrls(urls)
      setDraftUrls(urls)
      setLoadState('ready')
    }).catch(() => {
      // 失敗したら案内を出し、画像を選ぶことと保存を止める（プレビューは保存済みの値で表示を続ける）
      if (active) setLoadState('error')
    })
    return () => { active = false }
  }, [config.prefix, config.slots])

  // Our Brands と同じ取得方法で、HUE のカード専用の代替写真を読み込む。
  useEffect(() => {
    if (brand !== 'official' || page.id !== 'brands') return
    // ページを開き直したとき、前の取得値を表示し続けないよう空に戻す
    setHueFallbackSrc('')
    // 1. ページを離れたあとの応答を無視し、2. 取得失敗時は写真なしの表示を続ける
    let active = true
    api.siteAssets.get('hue-color-01')
      .then(({ url }) => { if (active) setHueFallbackSrc(url) })
      .catch(() => {})
    return () => { active = false }
  }, [brand, page.id])

  // 2. プレビューからのメッセージ（準備ができた・枠を選んだ）を受け取る
  useEffect(() => {
    /**
     * プレビューからのメッセージを受け取る。同じオリジンで、この画面の iframe から来た、このブランド・このページのものだけを使う。
     * 選んだ枠のキーは、今のページの枠のときだけ使う。
     * @param event - 受け取ったメッセージのイベント
     * @returns なし
     */
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return
      if (!isPageEditorMessage(event.data) || event.data.brand !== brand || event.data.page !== page.id) return
      if (event.data.type === 'page-editor:ready') {
        setFrameReady((current) => ({ page: page.id, count: (current.page === page.id ? current.count : 0) + 1 }))
      }
      if (event.data.type === 'page-editor:select') {
        const key = event.data.key
        if (page.slots.some((slot) => slot.key === key)) setSelectedKey(key)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [brand, page])

  // 3. 草稿・選んだ枠が変わるたび（とプレビューの準備ができたとき）に、プレビューへ送る
  useEffect(() => {
    const target = iframeRef.current?.contentWindow
    if (frameReadyCount === 0 || !target) return
    // 枠の一覧から選んだ直後だけ、プレビューを選んだ枠までスクロールさせる
    const reveal = revealCount !== sentRevealRef.current
    sentRevealRef.current = revealCount
    const message: PageEditorStateMessage = {
      type: 'page-editor:state',
      brand,
      page: page.id,
      // 読み込めていないときは草稿を送らない（プレビューは保存済みの値で表示する）
      draftUrls: loadState === 'ready' ? draftUrls : {},
      selectedKey: selectedKeyOnPage,
      reveal,
    }
    target.postMessage(message, window.location.origin)
  }, [brand, page.id, draftUrls, frameReadyCount, loadState, revealCount, selectedKeyOnPage])

  // 4. プレビューを置く枠の幅を測り、変わるたびに測り直す（iframe を縮小する倍率に使う）
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    /**
     * 枠の幅を測って state に入れる。
     * @returns なし
     */
    const measure = () => setStageWidth(stage.clientWidth)
    // ResizeObserver がない環境（古いブラウザ・テストの jsdom）は、画面の大きさの変更で測り直す
    if (typeof ResizeObserver === 'undefined') {
      const frame = window.requestAnimationFrame(measure)
      window.addEventListener('resize', measure)
      return () => {
        window.cancelAnimationFrame(frame)
        window.removeEventListener('resize', measure)
      }
    }
    // ResizeObserver は監視を始めたときにも1回呼ばれる
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  /**
   * 枠の一覧から枠を選ぶ（プレビューを、その枠が見えるところまでスクロールさせる）。
   * @param key - 選んだ枠のキー
   * @returns なし
   */
  const selectFromList = (key: string) => {
    setSelectedKey(key)
    setRevealCount((count) => count + 1)
  }

  /**
   * 1つの枠の草稿の URL を変える（プレビューにすぐ反映される）。
   * @param key - 枠のキー
   * @param url - 新しい草稿の URL（'' なら画像を外す）
   * @returns なし
   */
  const setDraft = useCallback((key: string, url: string) => {
    setDraftUrls((current) => ({ ...current, [key]: url }))
  }, [])

  /**
   * 1つの枠の失敗の文言を変える（'' なら消す）。
   * @param key - 枠のキー
   * @param message - 失敗の文言
   * @returns なし
   */
  const setSlotError = (key: string, message: string) => {
    setSlotErrors((current) => {
      const next = { ...current }
      if (message) next[key] = message
      else delete next[key]
      return next
    })
  }

  /**
   * 選んだ画像をアップロードし、枠の草稿の URL にする（保存するまで公開ページは変わらない）。
   * @param key - アップロード先の枠のキー
   * @param event - 画像ファイル選択欄の変更イベント
   * @returns なし
   */
  const chooseImage = async (key: string, event: React.ChangeEvent<HTMLInputElement>) => {
    // 1. 選ばれた先頭のファイルを取り出す。なければ・選べない状態なら終える
    const input = event.target
    const file = input.files?.[0]
    if (!file || locked) return
    setUploadingKey(key)
    setSlotError(key, '')
    setSaveNotice('')
    try {
      // 2. 画像をアップロードし、返った URL を草稿にする
      const url = await api.upload(file)
      setDraft(key, url)
    } catch (e) {
      setSlotError(key, failMessage('画像のアップロードに失敗しました', e))
    } finally {
      // 3. 同じファイルをもう一度選べるよう、選択欄を空に戻す
      setUploadingKey(null)
      input.value = ''
    }
  }

  /**
   * 変更した枠だけを保存する（PUT /api/site-assets/{key}）。
   * 1. 変更した枠をまとめて送り、それぞれの結果を待つ
   * 2. 成功した枠は保存済み・草稿の両方を返った URL にする
   * 3. 失敗した枠はエラーを出し、草稿はそのまま残す（もう一度「保存する」で送り直せる）
   * @returns なし
   */
  const save = async () => {
    if (locked || changedKeys.length === 0) return
    setSaving(true)
    setSaveNotice('')
    setSaveFailed(false)
    // 送る枠と値（送っている間に草稿が変わっても、送った値で結果を判断する）
    const targets = changedKeys.map((key) => ({ key, url: draftUrls[key] ?? '' }))
    // 1. まとめて送る
    const results = await Promise.allSettled(targets.map(({ key, url }) => api.siteAssets.save(key, url)))
    // 成功した枠（キー → 保存された URL）と、失敗した枠（キー → 文言）
    const succeeded: Record<string, string> = {}
    const failed: Record<string, string> = {}
    results.forEach((result, index) => {
      const { key } = targets[index]
      if (result.status === 'fulfilled') succeeded[key] = result.value.url
      else failed[key] = failMessage('保存に失敗しました', result.reason)
    })
    // 2. 成功した枠を保存済みにする
    setSavedUrls((current) => ({ ...current, ...succeeded }))
    setDraftUrls((current) => ({ ...current, ...succeeded }))
    // 3. 失敗の文言を、成功した枠は消し、失敗した枠は出す
    setSlotErrors((current) => {
      const next = { ...current }
      for (const key of Object.keys(succeeded)) delete next[key]
      return { ...next, ...failed }
    })
    // 結果の件数
    const failedCount = Object.keys(failed).length
    const succeededCount = Object.keys(succeeded).length
    setSaveFailed(failedCount > 0)
    setSaveNotice(failedCount > 0
      ? `${succeededCount} 件を保存しました。${failedCount} 件は保存できませんでした（変更は残っています。枠を選ぶと理由を確認できます）。`
      : `${succeededCount} 件を保存しました。公開ページに反映されます。`)
    setSaving(false)
  }

  /**
   * ページの選択欄で別のページを選んだとき、そのページのプレビューへ移る。
   * 草稿はブランドごとに持っているので、確認は出さずにそのまま残す（保存するまで公開ページは変わらない）。
   * @param event - 選択欄の変更イベント
   * @returns なし
   */
  const onPageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    // 1. 選んだページの定義を探す（定義にない値なら何もしない）
    const next = findPageImagePage(brand, event.target.value)
    if (!next || next.id === page.id) return
    // 2. 選んでいる枠が次のページにない枠なら選びを外す（パネルを閉じる）
    if (selectedKey && !next.slots.some(({ key }) => key === selectedKey)) setSelectedKey(null)
    // 3. そのページの URL へ移る（編集画面は作り直さないので、草稿・保存の結果の案内は残る）
    navigate(`/admin/page-editor/${brand}/${next.id}`)
  }

  /**
   * ブランドのタブを押したとき、未保存の変更があれば確認し、やめるならタブの移動を止める。
   * @param event - リンクのクリックイベント
   * @param target - 押したタブのブランド
   * @returns なし
   */
  const onTabClick = (event: React.MouseEvent<HTMLAnchorElement>, target: PageImageBrand) => {
    if (target === brand) {
      event.preventDefault()
      return
    }
    if (!confirmLeaveIfDirty(dirty)) event.preventDefault()
  }

  // 選んでいる枠を使っている、このブランドのページの一覧（枠を選んでいなければ空）
  const pagesOfSelected = selectedSlot ? pagesUsingSlot(brand, selectedSlot.key) : []
  // 選んでいる枠をほかのページでも使っているときの案内（例: 「この写真は HUE の他のページでも使われます（…）。」）。
  // 文字ロゴは写真ではないので「画像」と呼ぶ
  const sharedNote = selectedSlot && pagesOfSelected.length > 1
    ? `この${selectedSlot.key === 'ei8ht-wordmark' ? '画像' : '写真'}は ${config.label} の他のページでも使われます（${pagesOfSelected.map((item) => item.label).join('・')}）。`
    : ''
  // ページごとの、保存していない変更がある枠の数（ページの選択欄に出す）
  const changedCountByPage = Object.fromEntries(
    config.pages.map((item) => [item.id, item.slots.filter(({ key }) => changedKeys.includes(key)).length]),
  )

  // iframe の大きさと、枠の幅に収めるための縮小の倍率（測る前・収まるときは 1）
  const size = VIEWPORT_SIZES[viewport]
  const scale = stageWidth > 0 ? Math.min(1, stageWidth / size.width) : 1

  return (
    <div className="page-editor">
      <h1 style={{ fontSize: 24, fontWeight: 500, margin: '0 0 10px' }}>ページ画像の編集</h1>
      <p style={{ fontSize: 15, lineHeight: 1.8, color: '#555', margin: '0 0 18px' }}>
        ページを見ながら、差し替えたい画像をクリックして選びます。変えた画像はプレビューにすぐ出ますが、
        「保存する」を押すまで公開ページは変わりません。同じブランドの中なら、ページを切り替えても変更は残り、まとめて保存できます。
      </p>

      {/* ブランドのタブ（切り替える前に、未保存の変更があれば確認する） */}
      <nav className="page-editor-tabs" role="tablist" aria-label="編集するブランド">
        {PAGE_IMAGE_BRAND_ORDER.map((item) => (
          <Link
            key={item}
            to={`/admin/page-editor/${item}`}
            role="tab"
            aria-selected={item === brand}
            className={`page-editor-tab${item === brand ? ' is-active' : ''}`}
            onClick={(event) => onTabClick(event, item)}
          >
            {PAGE_IMAGE_BRANDS[item].label}
          </Link>
        ))}
      </nav>

      {/* ページの選択欄（同じブランドの中の切り替え。変更は残るので確認は出さない） */}
      <div className="page-editor-pages">
        <label htmlFor="page-editor-page-select" className="page-editor-pages-label">編集するページ</label>
        <select
          id="page-editor-page-select"
          className="page-editor-page-select"
          data-testid="page-editor-page-select"
          value={page.id}
          onChange={onPageChange}
        >
          {config.pages.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}（{config.host}{item.path}）{changedCountByPage[item.id] > 0 ? ` - 変更 ${changedCountByPage[item.id]} 件` : ''}
            </option>
          ))}
        </select>
        {/* 今のページの公開時の URL */}
        <span className="page-editor-page-url">公開時の URL: {config.host}{page.path}</span>
      </div>

      {/* 上の操作（表示幅の切り替え・変更の件数・保存） */}
      <div className="page-editor-toolbar">
        <div className="page-editor-viewports" role="group" aria-label="プレビューの表示幅">
          {(Object.keys(VIEWPORT_SIZES) as Viewport[]).map((item) => (
            <button
              key={item}
              type="button"
              className={`page-editor-viewport${item === viewport ? ' is-active' : ''}`}
              aria-pressed={item === viewport}
              data-testid={`page-editor-viewport-${item}`}
              onClick={() => onViewportChange(item)}
            >
              {VIEWPORT_SIZES[item].label}
            </button>
          ))}
        </div>
        <div className="page-editor-save-area">
          <span className="page-editor-count" role="status" data-testid="page-editor-changed-count">
            {changedKeys.length > 0 ? `変更 ${changedKeys.length} 件（未保存）` : '変更はありません'}
          </span>
          <button
            type="button"
            className="page-editor-save"
            data-testid="page-editor-save"
            onClick={() => { void save() }}
            disabled={locked || changedKeys.length === 0}
          >
            {saving ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>

      {loadState === 'error' && <p role="alert" className="page-editor-message page-editor-message--error">{LOAD_ERROR}</p>}
      {saveNotice && (
        <p role={saveFailed ? 'alert' : 'status'} className={`page-editor-message${saveFailed ? ' page-editor-message--error' : ' page-editor-message--ok'}`}>
          {saveNotice}
        </p>
      )}

      {/* 枠の一覧（プレビューで見つけにくい枠も、ここから選べる） */}
      <div className="page-editor-slots" role="group" aria-label="差し替えられる画像の枠">
        <span className="page-editor-slots-title">枠の一覧（{page.label}）</span>
        {page.slots.map((slot) => (
          <button
            key={slot.key}
            type="button"
            className={`page-editor-slot-chip${slot.key === selectedKey ? ' is-active' : ''}`}
            aria-pressed={slot.key === selectedKey}
            data-testid={`page-editor-slot-${slot.key}`}
            onClick={() => selectFromList(slot.key)}
          >
            {slot.label}
            {changedKeys.includes(slot.key) && <span className="page-editor-slot-changed">変更あり</span>}
            {slotErrors[slot.key] && <span className="page-editor-slot-failed">失敗</span>}
          </button>
        ))}
      </div>

      <div className={`page-editor-layout${selectedSlot ? ' has-panel' : ''}`}>
        {/* プレビュー。iframe を表示幅の大きさで置き、枠に収まらないときは縮小して全体を見せる */}
        <div className="page-editor-stage" ref={stageRef}>
          <div
            className="page-editor-frame-box"
            style={{ width: Math.round(size.width * scale), height: Math.round(size.height * scale) }}
          >
            <iframe
              ref={iframeRef}
              src={`/admin/page-preview/${brand}/${page.id}`}
              title={`${config.label} の${page.label}のプレビュー`}
              data-testid="page-editor-frame"
              className="page-editor-frame"
              style={{ width: size.width, height: size.height, transform: `scale(${scale})` }}
            />
          </div>
          <p className="page-editor-stage-note">
            {viewport === 'pc' ? 'PC 幅（1280px）' : 'スマホ幅（390px）'}で表示しています
            {scale < 1 ? `（${Math.round(scale * 100)}% に縮小）` : ''}。プレビューの中のリンクやボタンは押しても移動しません。
          </p>
        </div>

        {/* 枠を選んだときのパネル（PC 幅では右、狭い幅では下） */}
        {selectedSlot && (
          <SlotPanel
            slot={selectedSlot}
            sharedNote={sharedNote}
            pageId={page.id}
            hueFallbackSrc={hueFallbackSrc}
            draftUrl={draftUrls[selectedSlot.key] ?? ''}
            savedUrl={savedUrls[selectedSlot.key] ?? ''}
            error={slotErrors[selectedSlot.key] ?? ''}
            uploading={uploadingKey === selectedSlot.key}
            locked={locked}
            onChooseImage={(event) => { void chooseImage(selectedSlot.key, event) }}
            onRemove={() => { setDraft(selectedSlot.key, ''); setSaveNotice('') }}
            onRevert={() => { setDraft(selectedSlot.key, savedUrls[selectedSlot.key] ?? ''); setSlotError(selectedSlot.key, '') }}
            onClose={() => setSelectedKey(null)}
          />
        )}
      </div>
    </div>
  )
}

/** SlotPanel の引数 */
interface SlotPanelProps {
  /** 選んでいる枠 */
  slot: PageImageSlot
  /** 今表示しているページ（公式 HUE 枠の代替表示の判定に使う） */
  pageId: string
  /** Our Brands で使う、保存済みの HUE の写真 URL */
  hueFallbackSrc: string
  /** 同じ枠をブランドのほかのページでも使っているときの案内（'' なら出さない） */
  sharedNote: string
  /** 草稿の URL（'' なら未設定・外した） */
  draftUrl: string
  /** 保存済みの URL（'' なら未設定） */
  savedUrl: string
  /** この枠の失敗の文言（'' ならなし） */
  error: string
  /** この枠の画像をアップロード中か */
  uploading: boolean
  /** 画像を選ぶ・外すをできない状態か */
  locked: boolean
  /**
   * 画像ファイルを選んだとき
   * @param event - ファイル選択欄の変更イベント
   */
  onChooseImage: (event: React.ChangeEvent<HTMLInputElement>) => void
  /** 「画像を外す」を押したとき */
  onRemove: () => void
  /** 「変更を取り消す」を押したとき */
  onRevert: () => void
  /** 「閉じる」を押したとき */
  onClose: () => void
}

/**
 * 選んだ枠の差し替えパネル（枠の名前・推奨サイズ・今の画像・画像を選ぶ・外す・変更を取り消す）。
 * @param props - パネルの引数（SlotPanelProps）
 * @returns パネルの要素
 */
function SlotPanel({ slot, pageId, hueFallbackSrc, sharedNote, draftUrl, savedUrl, error, uploading, locked, onChooseImage, onRemove, onRevert, onClose }: SlotPanelProps) {
  // 保存していない変更があるか
  const changed = draftUrl !== savedUrl
  // 公式 HUE の未設定時は、トップではロゴ、Our Brands では HUE 側の写真を表示する。
  const officialHue = slot.key === 'official-brand-hue'
  // 今のページで使う代替画像と、その出どころ（公開ページの表示条件に合わせる）
  const fallbackSrc = officialHue
    ? (pageId === 'home' ? BRAND_SHOWCASES[2].logo : hueFallbackSrc)
    : slot.localSrc
  const fallbackNote = officialHue
    ? (pageId === 'home' ? 'HUE のロゴ' : (hueFallbackSrc ? 'HUE の写真（hue-color-01）' : '未設定（HUE の写真なし）'))
    : (slot.localSrc ? `プロジェクト内の画像（${slot.localSrc}）` : '未設定（画像なし）')
  // 今プレビューに出ている画像（草稿 → ページごとの代替画像 → なし）
  const shownSrc = draftUrl || fallbackSrc
  // ファイル選択欄の id（ラベルと結びつける）
  const inputId = `page-editor-file-${slot.key}`
  // 見出しの id（パネルの名前として読み上げる）
  const titleId = `page-editor-panel-title-${slot.key}`
  // 画像を外したときに何が出るかの説明
  const removeNote = officialHue
    ? '外すと、公式トップでは HUE のロゴ、Our Brands では HUE の写真（hue-color-01）が表示されます。HUE の写真が未設定の場合、Our Brands の背景写真は表示されません。'
    : slot.localSrc
    ? `外すと、プロジェクト内の画像（${slot.localSrc}）が表示されます。`
    : '外すと、画像のない状態（空の枠）になります。'
  // 今の画像の出どころの説明
  const sourceNote = draftUrl
    ? '管理画面で設定した画像'
    : fallbackNote

  return (
    <aside className="page-editor-panel" data-testid="page-editor-panel" aria-labelledby={titleId}>
      <div className="page-editor-panel-head">
        <h2 id={titleId}>{slot.label}</h2>
        {/* 閉じるボタン: 見出しが長くても折り返さず、縮めない */}
        <button type="button" onClick={onClose} style={{ ...textButtonStyle, color: '#555', whiteSpace: 'nowrap', flexShrink: 0 }}>閉じる</button>
      </div>
      <p className="page-editor-panel-note">{slot.note}</p>
      {/* 同じ枠をほかのページでも使っているときの案内（差し替えると、そのページの画像も変わる） */}
      {sharedNote && <p className="page-editor-panel-shared" data-testid="page-editor-panel-shared">{sharedNote}</p>}

      {/* 今の画像のプレビュー（透過画像が分かるよう、格子の背景に置く） */}
      <div className={`page-editor-panel-preview${shownSrc ? '' : ' page-editor-panel-preview--empty'}`}>
        {shownSrc ? <img src={shownSrc} alt={`${slot.label} の今の画像`} /> : <span>画像なし</span>}
      </div>
      <p className="page-editor-panel-source">
        {sourceNote}
        {changed && <strong className="page-editor-panel-changed">未保存の変更あり</strong>}
      </p>

      <label htmlFor={inputId} className="page-editor-panel-label">画像を選ぶ</label>
      <input
        id={inputId}
        type="file"
        accept={ACCEPT_IMAGES}
        onChange={onChooseImage}
        disabled={locked}
        style={{ width: '100%', maxWidth: '100%', fontSize: 14, marginBottom: 12 }}
      />
      {uploading && <p role="status" style={{ fontSize: 14, margin: '0 0 12px' }}>アップロード中…</p>}

      {/* 外す・変更を取り消す（保存するまでは公開ページは変わらない） */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, margin: '0 0 8px' }}>
        {draftUrl && (
          <button type="button" onClick={onRemove} disabled={locked} style={{ ...textButtonStyle, color: '#a33' }}>
            画像を外す
          </button>
        )}
        {changed && (
          <button type="button" onClick={onRevert} disabled={locked} style={{ ...textButtonStyle, color: '#555' }}>
            変更を取り消す
          </button>
        )}
      </div>
      {draftUrl && <p className="page-editor-panel-hint">{removeNote}</p>}

      {error && <p role="alert" style={{ color: '#a33', fontSize: 14, lineHeight: 1.6, margin: '8px 0 0' }}>{error}</p>}
    </aside>
  )
}
