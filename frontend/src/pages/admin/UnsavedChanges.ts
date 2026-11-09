/*
 * 管理画面の「保存していない変更」を画面の外（サイドメニューなど）に知らせる仕組み
 *
 * App.tsx は BrowserRouter（データルーターではない）を使っているため、React Router の useBlocker は使えない。
 * そこで次の形にしている。
 * - AdminLayout が UnsavedChangesProvider で中身を包む
 * - 編集画面は useUnsavedChanges(isDirty) を呼ぶだけで「未保存の変更がある」ことを登録できる
 *   （同時に、再読み込み・タブを閉じるときのブラウザの確認（beforeunload）も出す）
 * - サイドメニューのリンクは useConfirmLeave() で受け取った関数を押したときに呼び、未保存なら確認ダイアログを出す
 * - ブラウザの「戻る」「進む」（popstate）は historyGuard.ts が React Router より先に受け取り、未保存なら確認ダイアログを出す
 *   （キャンセルならルーターに渡さず URL だけ元に戻すので、画面も入力もそのまま残る。仕組みの詳細は historyGuard.ts）
 *   確認を出さない移動（ページ画像の編集で同じブランドの中のページの切り替えなど）は、allowNavigation で画面ごとに指定できる
 *
 * Provider の外（単体テストなどで編集画面だけを描画したとき）でも、登録は何もせずに動く（beforeunload だけ効く。
 * 「戻る」「進む」の確認も管理画面の Provider の中だけで出し、公開ページには影響させない）
 *
 * 開発中の画面の自動更新（Fast Refresh）が効くよう、部品（UnsavedChangesProvider.tsx）とフック・定数（このファイル）を分けている。
 * これまでどおり `import { UnsavedChangesProvider, useUnsavedChanges } from './UnsavedChanges'` で使える
 */
import { useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { UNSAFE_LocationContext } from 'react-router-dom'
import { UnsavedChangesContext } from './unsavedChangesContext'
import { recordCommittedEntry, registerHistoryGuard } from './historyGuard'

export { UnsavedChangesProvider } from './UnsavedChangesProvider'

/** 未保存の変更があるまま別の画面へ移ろうとしたときに出す確認の文言 */
export const UNSAVED_LEAVE_MESSAGE = '保存していない変更があります。破棄して移動しますか？'

/** 未保存の変更があるまま編集のモーダル（ダイアログ）を閉じようとしたときに出す確認の文言 */
export const UNSAVED_CLOSE_MESSAGE = '保存していない変更があります。破棄して閉じますか？'

/**
 * 編集のモーダルを閉じる前の確認。モーダルの外側のクリックなど、うっかり閉じやすい操作で使う
 * @param isDirty - 開いたときから入力が変わっているかどうか
 * @returns 閉じてよければ true（変更が無い、または「OK」を押した）、やめるなら false
 */
export function confirmDiscard(isDirty: boolean): boolean {
  if (!isDirty) return true
  return window.confirm(UNSAVED_CLOSE_MESSAGE)
}

/**
 * 画面の中のリンク・「キャンセル」「戻る」ボタンで移る前の確認（サイドメニュー以外の移動で使う）
 * @param isDirty - 未保存の変更があるかどうか
 * @returns 移ってよければ true（変更が無い、または「OK」を押した）、やめるなら false
 */
export function confirmLeaveIfDirty(isDirty: boolean): boolean {
  if (!isDirty) return true
  return window.confirm(UNSAVED_LEAVE_MESSAGE)
}

/**
 * 未保存の変更の判定用に、値を比べやすい JSON 文字列にする。
 * 空の文字列・null・undefined は「未入力」として同じに扱う（オブジェクトの項目からは取り除く）。
 * 読み込んだ値が null で、入力して消すと '' になる、のような見た目が同じ違いで「変更あり」にしないため
 * @param value - 比べる値
 * @returns 比べるための JSON 文字列
 */
export function dirtySnapshotJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => (v === null || v === '' ? undefined : v)) ?? ''
}

/**
 * 入力欄の値を「基準の値」（読み込み直後・保存した直後の値）と比べて、未保存の変更があるかを判定するフック。
 * 値は dirtySnapshotJson で JSON 文字列にして比べる（'' と null は同じ扱い。判定を描画中に行うため、ref ではなく state で基準を持つ）。
 * 並び順に意味の無い配列（ブランドの選択など）は、呼ぶ側で並べ替えてから渡す
 * 1. 基準は initial（省略時は null = まだ読み込んでいないので「変更なし」）から始める
 * 2. 読み込みが終わったとき・保存に成功したときは resetBaseline で基準を今の値（または渡した値）に置き直す
 * @param current - 今の入力欄の値一式
 * @param initial - 最初の基準の値（新規作成のフォームなど、読み込みを待たない画面で渡す）
 * @returns isDirty（基準から変わっているか）と resetBaseline（基準を置き直す関数）
 */
export function useDirtyTracker<T>(current: T, initial: T | null = null): {
  isDirty: boolean
  resetBaseline: (value?: T) => void
} {
  /** 基準の値の JSON 文字列（null は基準なし = 変更なしとして扱う） */
  const [baseline, setBaseline] = useState<string | null>(() => (initial === null ? null : dirtySnapshotJson(initial)))
  /** 今の値の JSON 文字列 */
  const currentJson = dirtySnapshotJson(current)
  /** 基準を置き直す。引数を省略したら今の値を基準にする */
  const resetBaseline = useCallback((value?: T) => {
    setBaseline(value === undefined ? currentJson : dirtySnapshotJson(value))
  }, [currentJson])
  return { isDirty: baseline !== null && currentJson !== baseline, resetBaseline }
}

/** useUnsavedChanges の追加の指定 */
export interface UnsavedChangesOptions {
  /**
   * ブラウザの「戻る」「進む」で、未保存の変更があっても確認を出さずに通す移動を決める（省略したらすべて確認する）
   * @param from - 移動する前のパス（pathname）
   * @param to - 移動した先のパス（pathname）
   * @returns 確認を出さずに通すなら true
   */
  allowNavigation?: (from: string, to: string) => boolean
}

/**
 * 編集画面から「未保存の変更があるかどうか」を登録するフック。ほかの編集画面でも同じように使える
 * 1. Provider（AdminLayout）があれば、isDirty をサイドメニューの確認に使えるよう登録する
 * 2. 画面を閉じたら登録を外す
 * 3. 未保存の変更があるあいだは、再読み込み・タブを閉じるときにブラウザの確認（beforeunload）を出す
 * 4. Provider の中で未保存の変更があるあいだは、ブラウザの「戻る」「進む」でも確認を出す（historyGuard.ts に登録する）。
 *    変更がなくなったとき・画面を離れたときに登録を外す
 * 5. 4 のあいだは、描画のたびに今の場所を「移る前の場所」として記録する（同じ画面の中でページを移ったときのため）
 * @param isDirty - 未保存の変更があるかどうか
 * @param options - 追加の指定（allowNavigation: 「戻る」「進む」で確認を出さない移動）
 * @returns なし
 */
export function useUnsavedChanges(isDirty: boolean, options?: UnsavedChangesOptions): void {
  /** Provider が配る操作一式（Provider の外では null で、登録は何もしない） */
  const ctx = useContext(UnsavedChangesContext)
  /**
   * URL・state・key の更新でも描画し直して履歴を記録する。
   * useLocation は Router の外で例外になるため、公開されている LocationContext を直接購読する。
   * Router の外（画面単体のテストなど）は null のまま、従来の beforeunload の処理を続ける。
   */
  useContext(UNSAFE_LocationContext)
  /** この画面を見分けるキー（同じ画面を2つ開いても重ならない） */
  const key = useId()
  /** 最新の allowNavigation（毎回作り直される関数でも、登録し直さずに最新のものを使うため） */
  const allowNavigationRef = useRef(options?.allowNavigation)
  useEffect(() => {
    allowNavigationRef.current = options?.allowNavigation
  })
  /** 「戻る」「進む」の確認を出すか（管理画面の Provider の中で、未保存の変更があるときだけ） */
  const guardHistory = ctx !== null && isDirty

  // 1. isDirty が変わるたびに登録内容を更新する
  useEffect(() => {
    ctx?.setDirty(key, isDirty)
  }, [ctx, key, isDirty])

  // 2. 画面を閉じたら登録を外す
  useEffect(() => {
    return () => ctx?.unregister(key)
  }, [ctx, key])

  // 3. 再読み込み・タブを閉じるときの確認
  useEffect(() => {
    if (!isDirty) return
    /**
     * 再読み込み・タブを閉じる直前に呼ばれ、ブラウザの確認ダイアログを出させる
     * @param e - ページを離れる直前のイベント
     * @returns 戻り値なし。
     */
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // 古いブラウザは returnValue の設定で確認を出す
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  // 4. 「戻る」「進む」の確認。未保存の変更があるあいだだけ登録し、なくなったとき・画面を離れたときに外す
  useEffect(() => {
    if (!guardHistory) return
    return registerHistoryGuard({
      shouldBlock: (from, to) => !(allowNavigationRef.current?.(from, to) ?? false),
      message: UNSAVED_LEAVE_MESSAGE,
    })
  }, [guardHistory])

  // 5. 描画のたびに今の場所を記録する（依存配列なし = 毎回。ルーターが画面を移したあとの描画で、移った先が「移る前の場所」になる）
  useLayoutEffect(() => {
    if (guardHistory) recordCommittedEntry()
  })
}

/**
 * 別の画面へ移る前に、未保存の変更があれば確認ダイアログを出す関数を返すフック（サイドメニューのリンクで使う）
 * @returns 確認関数。移動してよければ true（未保存の変更がない、または「OK」を押した）、やめるなら false
 */
export function useConfirmLeave(): () => boolean {
  /** Provider が配る操作一式（Provider の外では null） */
  const ctx = useContext(UnsavedChangesContext)
  return useCallback(() => {
    if (!ctx || !ctx.hasUnsaved()) return true
    return window.confirm(UNSAVED_LEAVE_MESSAGE)
  }, [ctx])
}

/**
 * 編集のモーダル・フォームを開いているあいだ、Esc キーで閉じる操作を受け付けるフック（記事・商品・問い合わせの返信・取扱店・チャットQ&A で共通）
 * 1. 開いているときだけ window の keydown を聞く
 * 2. 日本語の変換中の Esc と、ほかの部品（写真の拡大表示など）が preventDefault で受け取り済みの Esc は無視する
 * 3. それ以外の Esc で onEscape を呼ぶ（書きかけの確認・保存中は閉じない、などは onEscape の中で決める）
 * @param open - モーダル・フォームを開いているか
 * @param onEscape - Esc で呼ぶ処理
 * @returns なし
 */
export function useEscapeToClose(open: boolean, onEscape: () => void): void {
  /** 最新の onEscape（毎回作り直される関数でも、聞き直さずに最新のものを呼ぶため） */
  const onEscapeRef = useRef(onEscape)
  useEffect(() => {
    onEscapeRef.current = onEscape
  })
  useEffect(() => {
    // 1. 開いているときだけ聞く
    if (!open) return
    /**
     *  Esc が押されたときの処理
     * @param e - 押されたキーと入力変換状態を含むキーボードイベント
     * @returns 戻り値なし。
     */
    const onKeyDown = (e: KeyboardEvent) => {
      // 2. 変換中・受け取り済みの Esc は無視する
      if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented) return
      // 3. 閉じる処理を呼ぶ
      onEscapeRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])
}
