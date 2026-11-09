/*
 * ブラウザの「戻る」「進む」（popstate）で、未保存の変更があるときに確認を出す仕組み（React を使わない部分）
 *
 * App.tsx は BrowserRouter（データルーターではない）なので、React Router の useBlocker は使えない。
 * そこで、React Router より先に window の popstate を受け取り、止めるかどうかをここで決める。
 *
 * 選んだ方法: 「ルーターより先に popstate を受けて、キャンセルならルーターに渡さずに URL だけ元に戻す」
 * - React Router（BrowserRouter）は window の popstate を受けてから location を変え、画面を作り直す。
 *   一度ルーターに渡してから元の URL へ navigate し直すと、その間に画面が作り直されて入力が消えてしまう。
 * - そこで、ルーターより先に呼ばれるリスナーで window.confirm（同期で結果が返る）を出し、
 *   キャンセルなら stopImmediatePropagation でルーターのリスナーを呼ばせない。ルーターは移動に気づかないので、
 *   location も画面もそのまま（入力も残る）。ブラウザの URL だけが先に変わっているので、history.go(-delta) で元の項目へ戻す。
 *   戻したときにもう一度 popstate が来るので、それもルーターに渡さずに捨てる。
 * - OK なら何もせずにイベントを通し、ルーターがいつもどおり画面を移す（変更は破棄）。
 * - 「ルーターより先に呼ばれる」ことを確実にするため、リスナーは main.tsx で描画の前（BrowserRouter が popstate を
 *   聞き始める前）に1つだけ登録する（installHistoryGuard）。同じ window に登録したリスナーは登録した順に呼ばれるため、
 *   ブラウザの違い（target での capture と bubble の順の扱い）に左右されない。念のため capture でも登録する。
 * - 止めるかどうかを決める「ガード」は、未保存の変更がある画面だけが registerHistoryGuard で登録し、
 *   変更がなくなったとき・画面を離れたときに外す。ガードが1つもなければリスナーは何もしないので、公開ページには影響しない。
 *
 * 戻す量（delta）は、React Router が history.state に書いている項目の番号（idx）の差から求める。
 * 番号が読めない項目（React Router を通さずに作られた項目）への移動も確認を出し、キャンセルのときは
 * 記録しておいた元の state と URL を pushState で積み直して留まる（「進む」の行き先は消える）。
 * 一度積み直したあとは番号と実際の距離が一致しないため、以後のキャンセルも pushState で復元する。
 * ハッシュだけが違う移動（同じ画面のまま）は確認しない。
 */

/** 未保存の変更がある画面が登録する「止めるかどうか」の判定 */
export interface HistoryGuard {
  /**
   * この移動を止める（確認を出す）かどうか
   * @param from - 移動する前のパス（pathname）
   * @param to - 移動した先のパス（pathname）
   * @returns 止めるなら true
   */
  shouldBlock: (from: string, to: string) => boolean
  /** 確認で出す文言 */
  message: string
}

/** 最後に画面へ反映された（描画が終わった）ときの履歴の位置 */
interface CommittedEntry {
  /** パス（pathname） */
  pathname: string
  /** パスとクエリ（pathname + search。ハッシュだけが違う移動を見分けるため） */
  pathAndSearch: string
  /** URL（pathname + search + hash。番号の無い項目へ移るのをキャンセルしたときに、この URL を積み直す） */
  href: string
  /** React Router が history.state に書いている項目の番号（読めなければ null） */
  idx: number | null
  /** その項目の history.state 全体（キャンセルで積み直すときに、ルーターが書いた key・idx ごと戻すため） */
  state: unknown
}

/** 登録されているガードの集まり（未保存の変更がある画面の数だけ入る） */
const guards = new Set<HistoryGuard>()

/** 最後に画面へ反映されたときの履歴の位置（移る前の場所として使う。まだ記録していなければ null） */
let committed: CommittedEntry | null = null

/**
 * キャンセルで history.go を使って戻している途中のときの、戻す先（戻していなければ null）。
 * 戻したときに来る popstate をルーターに渡さずに捨てるために照らし合わせる。
 * 戻しているあいだに画面が描画し直されても、recordCommittedEntry で「移る前の場所」を移動先で上書きさせないためにも使う
 * （上書きされると、戻りの popstate が新しい移動と判定され、URL とルーターの場所が食い違ってしまう）
 */
let revertTarget: CommittedEntry | null = null

/** 積み直し後は idx の差が実際の履歴の距離を示さないため、以後は積み直して復元する */
let canRestoreByIndex = true

/** リスナーを登録済みか（2回登録しないため） */
let installed = false

/**
 * 今の履歴の項目の番号（React Router が history.state.idx に書いている値）を読む
 * @returns 番号。読めなければ null
 */
function currentIdx(): number | null {
  /** 今の項目に紐づく状態（React Router が書いたもの。外から作られた項目では null など） */
  const state: unknown = window.history.state
  if (state && typeof state === 'object' && 'idx' in state) {
    const idx = (state as { idx: unknown }).idx
    if (typeof idx === 'number') return idx
  }
  return null
}

/**
 * 今の履歴の位置を「画面に反映された場所」として記録する。
 * 未保存の変更がある画面が、描画のたび（useLayoutEffect）と登録したときに呼ぶ。
 * キャンセルで元の項目へ戻している途中（revertTarget があるあいだ）は、ブラウザの URL がまだ移動先のままなので記録しない
 * @returns なし
 */
export function recordCommittedEntry(): void {
  if (revertTarget) return
  /** 今の URL の各部分 */
  const { pathname, search, hash } = window.location
  committed = {
    pathname,
    pathAndSearch: pathname + search,
    href: pathname + search + hash,
    idx: currentIdx(),
    state: window.history.state,
  }
}

/**
 * popstate を受け取り、止めるかどうかを決める（ルーターより先に呼ばれる）
 * 1. キャンセルで戻している途中なら、戻す先と照らし合わせる。戻す先に着いた popstate はルーターに渡さずに捨てる
 *    （着いた先が違えば、戻すのをやめたものとして、ふつうの移動として 2 からを行う）
 * 2. ガードが無ければ何もしない（ルーターがいつもどおり処理する）
 * 3. パスとクエリが同じで、ハッシュだけが違う移動は通す（同じ画面のままで、入力も消えないため）
 * 4. 移る前と移った先のパスを比べ、止めるガードが無ければ通す
 * 5. 確認を出し、OK なら通す
 * 6. キャンセルならルーターに渡さない（location も画面も入力もそのまま）。ブラウザの URL を元に戻す
 *    - 積み直しがなく、移る前と移った先の両方の番号が分かるとき: history.go(-delta) で元の項目へ戻す（戻りの popstate は 1 で捨てる）
 *    - どちらかの番号が分からないとき、または以前に積み直したとき（番号だけでは距離を判定できない）:
 *      戻す量が分からないので、記録しておいた state と URL を pushState で積み直して元の場所に留まる。
 *      ルーターの持つ番号は移る前のままで、積んだ state の番号も同じなので食い違わない（「進む」の行き先は消える）
 * @param event - ブラウザの「戻る」「進む」のイベント
 * @returns なし
 */
function onPopState(event: PopStateEvent): void {
  /** 移った先の項目の番号 */
  const nextIdx = currentIdx()

  // 1. キャンセルで戻している途中なら、戻す先に着いたかを照らし合わせる
  if (revertTarget) {
    /** 戻す先 */
    const target = revertTarget
    revertTarget = null
    if (nextIdx === target.idx) {
      event.stopImmediatePropagation()
      return
    }
  }

  // 2. 未保存の変更がある画面が無ければ何もしない
  if (guards.size === 0 || !committed) return

  // 3. ハッシュだけが違う移動は通す
  if (window.location.pathname + window.location.search === committed.pathAndSearch) return

  // 4. 止めるガードがあるかを調べる
  /** 移る前のパス */
  const from = committed.pathname
  /** 移った先のパス */
  const to = window.location.pathname
  /** 止めるガード（最初に見つかったもの。文言をこれから取る） */
  const blocker = [...guards].find((guard) => guard.shouldBlock(from, to))
  if (!blocker) return

  // 5. 確認を出す。OK ならそのまま通してルーターに画面を移させる
  if (window.confirm(blocker.message)) return

  // 6. キャンセル: ルーターに渡さず、ブラウザの URL だけ元に戻す
  event.stopImmediatePropagation()
  /** 移った量（戻るなら負、進むなら正。どちらかの番号が分からなければ null） */
  const delta = nextIdx !== null && committed.idx !== null ? nextIdx - committed.idx : null
  if (canRestoreByIndex && delta !== null && delta !== 0) {
    // 番号が分かる: 元の項目へ戻す（戻し終わるまで、移る前の場所を上書きさせない）
    revertTarget = committed
    window.history.go(-delta)
  } else {
    // 番号が分からない（または同じ番号）: 元の場所を積み直す（pushState では popstate は来ない）
    // 進む側の項目が消えると、残った idx と実際の移動件数が一致しなくなる
    canRestoreByIndex = false
    window.history.pushState(committed.state, '', committed.href)
  }
}

/**
 * popstate のリスナーを window に1つだけ登録する。何度呼んでもよい。
 * React Router より先に呼ばれるよう、main.tsx で描画の前に呼ぶ（単体テストなど main.tsx を通らないときのため、
 * useUnsavedChanges からも呼ぶ。そのときは capture の登録で先に呼ばれることを期待する）
 * @returns なし
 */
export function installHistoryGuard(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('popstate', onPopState, { capture: true })
}

/**
 * 「戻る」「進む」を止めるかどうかの判定を登録する
 * 1. リスナーが未登録なら登録する
 * 2. ガードを加え、今の場所を「移る前の場所」として記録する
 * @param guard - 止めるかどうかの判定と文言
 * @returns 登録を外す関数（未保存の変更がなくなったとき・画面を離れたときに呼ぶ）
 */
export function registerHistoryGuard(guard: HistoryGuard): () => void {
  // 1. リスナーの登録
  installHistoryGuard()
  // 2. ガードを加えて、今の場所を記録する
  guards.add(guard)
  recordCommittedEntry()
  return () => {
    guards.delete(guard)
  }
}
