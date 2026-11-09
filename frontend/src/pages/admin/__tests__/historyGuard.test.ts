/**
 * historyGuard.ts（ブラウザの「戻る」「進む」で未保存の変更の確認を出す仕組み）の単体テスト
 * - ガードが無いとき・allowNavigation で通すとき・ハッシュだけが違うとき・登録を外したあとは止めない
 * - 確認でキャンセルすると、ルーター（あとから登録したリスナー）に渡さず、history.go(-delta) で元の項目へ戻す。
 *   戻したときに来る popstate もルーターに渡さずに捨てる（戻している途中に再描画されても同じ）
 * - 項目の番号（idx）が無い移動も確認を出し、キャンセルなら元の state と URL を pushState で積み直す
 * - 確認で OK なら止めずにルーターへ渡す
 * jsdom の history.replaceState で「移った先の項目」を作り、popstate を自分で送って確かめる。
 * ルーターの代わりに、window に普通に（capture なしで）登録したリスナーが呼ばれたかを見る
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { installHistoryGuard, registerHistoryGuard, recordCommittedEntry, type HistoryGuard } from '../historyGuard'

/** 確認の文言（テスト用） */
const MESSAGE = '保存していない変更があります。破棄して移動しますか？'

/** ルーター（React Router の popstate のリスナー）の代わり。呼ばれたら「ルーターに渡った」とみなす */
const router = vi.fn()

/** テストの中で登録したガードを外す関数（後片付け用） */
let unregisters: (() => void)[] = []

/**
 * 今の履歴の項目を、指定したパスと番号に置き換える（ブラウザが別の項目へ移ったあとの状態を作る）
 * @param path - パス（pathname）
 * @param idx - React Router が history.state.idx に書く番号。null なら番号の無い項目にする
 * @returns なし
 */
function setEntry(path: string, idx: number | null): void {
  window.history.replaceState(idx === null ? null : { usr: null, key: `k${idx}`, idx }, '', path)
}

/**
 * popstate を送る（ブラウザの「戻る」「進む」が起きたことにする）
 * @returns 送ったイベントと、その stopImmediatePropagation の呼ばれ方を見るスパイ
 */
function firePopState() {
  // ev: 送る popstate（state は今の項目のもの）
  const ev = new PopStateEvent('popstate', { state: window.history.state })
  // stop: ルーターに渡さないための stopImmediatePropagation が呼ばれたかを見る
  const stop = vi.spyOn(ev, 'stopImmediatePropagation')
  window.dispatchEvent(ev)
  return { ev, stop }
}

/**
 * ガードを登録し、後片付けの一覧に加える
 * @param guard - 止めるかどうかの判定と文言
 * @returns なし
 */
function register(guard: HistoryGuard): void {
  unregisters.push(registerHistoryGuard(guard))
}

beforeAll(() => {
  // 1. 本番の main.tsx と同じく、ルーターより先にリスナーを登録する
  installHistoryGuard()
  // 2. そのあとでルーターの代わりのリスナーを登録する（同じ window に登録した順に呼ばれる）
  window.addEventListener('popstate', router)
})

beforeEach(() => {
  router.mockClear()
  unregisters = []
})

afterEach(() => {
  // テストごとにガードを外し、スパイを戻す（ガードの集まりはファイル内で共有しているため）
  unregisters.forEach((off) => off())
  vi.restoreAllMocks()
})

describe('historyGuard — 止めないとき', () => {
  it('ガードが1つも登録されていなければ、確認を出さずにルーターへ渡す', () => {
    // 1. /admin/a（番号 1）を反映済みの場所として記録し、/admin/b（番号 0）へ戻ったことにする
    setEntry('/admin/a', 1)
    recordCommittedEntry()
    const confirm = vi.spyOn(window, 'confirm')
    setEntry('/admin/b', 0)
    const { stop } = firePopState()
    // 2. 確認は出ず、ルーターに渡る
    expect(confirm).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
    expect(router).toHaveBeenCalledTimes(1)
  })

  it('allowNavigation で通す移動（shouldBlock が false）なら、確認を出さずにルーターへ渡し、判定には移る前と移った先のパスが渡る', () => {
    // 1. 同じブランドの中の移動は通すガードを登録する
    setEntry('/admin/page-editor/hue/about', 5)
    // shouldBlock: 判定に渡されたパスを記録し、常に「通す」と答える
    const shouldBlock = vi.fn(() => false)
    register({ shouldBlock, message: MESSAGE })
    const confirm = vi.spyOn(window, 'confirm')
    // 2. 戻る
    setEntry('/admin/page-editor/hue/choose', 4)
    const { stop } = firePopState()
    // 3. 判定には移る前・移った先のパスが渡り、確認は出ずにルーターへ渡る
    expect(shouldBlock).toHaveBeenCalledWith('/admin/page-editor/hue/about', '/admin/page-editor/hue/choose')
    expect(confirm).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
    expect(router).toHaveBeenCalledTimes(1)
  })

  it('パスとクエリが同じでハッシュだけが違う移動は、止めるガードがあっても確認を出さずに通す', () => {
    setEntry('/admin/events/new', 2)
    register({ shouldBlock: () => true, message: MESSAGE })
    const confirm = vi.spyOn(window, 'confirm')
    // 同じ画面のままハッシュだけが変わった項目へ移ったことにする
    setEntry('/admin/events/new#memo', 3)
    const { stop } = firePopState()
    expect(confirm).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
    expect(router).toHaveBeenCalledTimes(1)
  })

  it('登録を外したあとは、止めるガードだったものでも確認を出さない', () => {
    setEntry('/admin/pot-artists', 3)
    // off: 登録を外す関数
    const off = registerHistoryGuard({ shouldBlock: () => true, message: MESSAGE })
    off()
    const confirm = vi.spyOn(window, 'confirm')
    setEntry('/admin', 2)
    const { stop } = firePopState()
    expect(confirm).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
    expect(router).toHaveBeenCalledTimes(1)
  })
})

describe('historyGuard — 確認を出すとき', () => {
  it('戻るで確認をキャンセルすると、ルーターに渡さず history.go(1) で元の項目へ戻し、戻したときの popstate も捨てる', () => {
    // 1. /admin/pot-artists（番号 3）で未保存の変更がある状態にする
    setEntry('/admin/pot-artists', 3)
    register({ shouldBlock: () => true, message: MESSAGE })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    // go: 実際には移らないようにして、呼ばれた量だけ見る
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    // 2. 1つ戻って /admin（番号 2）へ移ったことにする
    setEntry('/admin', 2)
    const first = firePopState()
    // 3. 確認の文言が出て、ルーターには渡らず、1つ進んで元へ戻す
    expect(confirm).toHaveBeenCalledWith(MESSAGE)
    expect(first.stop).toHaveBeenCalledTimes(1)
    expect(router).not.toHaveBeenCalled()
    expect(go).toHaveBeenCalledWith(1)
    // 4. history.go で元の項目（番号 3）へ戻ったときの popstate も、確認を出さずにルーターに渡さず捨てる
    setEntry('/admin/pot-artists', 3)
    const second = firePopState()
    expect(second.stop).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(router).not.toHaveBeenCalled()
    expect(go).toHaveBeenCalledTimes(1)
  })

  it('進むで2つ先へ移ったときにキャンセルすると、history.go(-2) で戻す', () => {
    setEntry('/admin/pot-artists', 4)
    register({ shouldBlock: () => true, message: MESSAGE })
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    // 2つ進んだ（番号 6）ことにする
    setEntry('/admin/gallery', 6)
    const { stop } = firePopState()
    expect(stop).toHaveBeenCalledTimes(1)
    expect(router).not.toHaveBeenCalled()
    expect(go).toHaveBeenCalledWith(-2)
    // 後片付け: 戻したときの popstate を送って、捨てる状態を終わらせる
    setEntry('/admin/pot-artists', 4)
    firePopState()
  })

  it('キャンセルで戻している途中に再描画（recordCommittedEntry）されても移る前の場所は上書きされず、戻りの popstate は捨てられる', () => {
    setEntry('/admin/pot-artists', 3)
    // shouldBlock: 判定に渡されるパスを記録し、常に「止める」と答える
    const shouldBlock = vi.fn(() => true)
    register({ shouldBlock, message: MESSAGE })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    // 1. 戻る → キャンセル（このあとブラウザの URL はまだ /admin のまま）
    setEntry('/admin', 2)
    firePopState()
    // 2. 戻りの popstate が来る前に画面が描画し直され、今の場所を記録しようとする
    recordCommittedEntry()
    // 3. 元の項目へ戻ったときの popstate は、確認を出さずにルーターに渡さず捨てる
    setEntry('/admin/pot-artists', 3)
    const back = firePopState()
    expect(back.stop).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(router).not.toHaveBeenCalled()
    // 4. 移る前の場所は鉢作家管理のまま。次の戻るも「鉢作家管理 → /admin」として判定され、1つ進んで戻す
    setEntry('/admin', 2)
    firePopState()
    expect(shouldBlock).toHaveBeenLastCalledWith('/admin/pot-artists', '/admin')
    expect(go).toHaveBeenLastCalledWith(1)
    // 後片付け: 戻りの popstate を送って、戻している途中の状態を終わらせる（次のテストに持ち越さない）
    setEntry('/admin/pot-artists', 3)
    firePopState()
  })

  it('移った先の項目に番号（idx）が無くても確認を出し、キャンセルすると元の state と URL を pushState で積み直して留まる', () => {
    // 1. /admin/events/new（番号 1）で未保存の変更がある状態にする
    setEntry('/admin/events/new', 1)
    // stateBefore: 移る前の項目の state（積み直すときにそのまま使われる）
    const stateBefore = window.history.state
    register({ shouldBlock: () => true, message: MESSAGE })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    const push = vi.spyOn(window.history, 'pushState')
    // 2. React Router を通さずに作られた項目（state が null。location.hash で作ったものなど）へ戻ったことにする
    setEntry('/admin/events#abc', null)
    const { stop } = firePopState()
    // 3. 確認が出て、ルーターに渡さず、history.go ではなく pushState で元の場所を積み直す
    expect(confirm).toHaveBeenCalledWith(MESSAGE)
    expect(stop).toHaveBeenCalledTimes(1)
    expect(router).not.toHaveBeenCalled()
    expect(go).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith(stateBefore, '', '/admin/events/new')
    expect(window.location.pathname).toBe('/admin/events/new')
  })

  it('移る前の項目に番号が無いときも確認を出し、OK ならルーターへ渡す', () => {
    setEntry('/admin/pot-artists', null)
    register({ shouldBlock: () => true, message: MESSAGE })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const push = vi.spyOn(window.history, 'pushState')
    setEntry('/admin', 0)
    const { stop } = firePopState()
    expect(confirm).toHaveBeenCalledWith(MESSAGE)
    expect(stop).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(router).toHaveBeenCalledTimes(1)
  })

  it('確認で OK を押すと、止めずにルーターへ渡し、元の項目へは戻さない', () => {
    setEntry('/admin/pot-artists', 3)
    register({ shouldBlock: () => true, message: MESSAGE })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    setEntry('/admin', 2)
    const { stop } = firePopState()
    expect(confirm).toHaveBeenCalledWith(MESSAGE)
    expect(stop).not.toHaveBeenCalled()
    expect(go).not.toHaveBeenCalled()
    expect(router).toHaveBeenCalledTimes(1)
  })

  it('ガードが複数あれば、止めると答えたガードの文言で確認を出す', () => {
    setEntry('/admin/pot-artists', 3)
    // 1つ目は通し、2つ目が止める
    register({ shouldBlock: () => false, message: '通すガード' })
    register({ shouldBlock: () => true, message: MESSAGE })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    setEntry('/admin', 2)
    firePopState()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith(MESSAGE)
  })
})
