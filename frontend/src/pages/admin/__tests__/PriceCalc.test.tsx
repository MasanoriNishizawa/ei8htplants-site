/**
 * 管理画面「販売価格計算」（pages/admin/PriceCalc.tsx）の画面のテスト
 * - ブランド別の既定原価率（ei8ht plants 33.4%、Habitat Oides・HUE 40%）と、明示設定した目標率での推奨価格
 * - 任意価格を入れたときの「登録価格: ¥x,xxx（原価率 xx.x%）」と、40% を超えたときの注意（登録は止めない）
 * - HUE のタブ: 植物名・植物仕入れ値・鉢仕入れ値の計算フォーム（鉢作家の選択は無い）と登録時に送る内容
 * - Habitat Oides のタブ: 鉢作家を選べて、選んだ作家名が送られる
 * - 登録リストの植物名の下の 2 行目（鉢作家名 or「量産鉢」）は Habitat Oides の行だけ
 * - 実生の種子20粒分の上代・1粒分の原価、鉢代加算、任意価格の登録、入力エラー時の登録可否と登録失敗時の入力保持
 * - HUE の書きかけ保護（タブの切り替えで確認が出る・登録に成功したら出ない）
 * - 目標原価率の欄（ブランド別既定値・変更時の見出しと推奨価格と注意・入力検証・ブランド別 localStorage の保存と復元・
 *   既定値に戻す・書きかけ扱いしない・ブランド切替時の独立値）
 * api はモックにして本番には接続しない
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import PriceCalc from '../PriceCalc'
import { UnsavedChangesProvider, UNSAVED_LEAVE_MESSAGE } from '../UnsavedChanges'
import { api, type PotArtist, type PriceCalcEntry, type PriceCalcEntryBody } from '../../../lib/api'

// 使う api の関数だけをモックする（ApiError などの実装はそのまま）
vi.mock('../../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      potArtists: { list: vi.fn() },
      priceCalcEntries: { list: vi.fn(), add: vi.fn(), delete: vi.fn() },
    },
  }
})

/** 鉢の作家の一覧（Habitat Oides の選択肢。HUE には出ないことも確かめる） */
const ARTISTS: PotArtist[] = [
  { id: 'a-1', name: '山田陶房', created_at: '2026-10-01T00:00:00Z' },
  { id: 'a-2', name: '佐藤窯', created_at: '2026-10-02T00:00:00Z' },
]

/**
 * 登録した内容を、サーバーが返す記録の形にする（add のモックの戻り値に使う）
 * @param body - 送った内容
 * @returns id・登録日時を付けた記録
 */
const toEntry = (body: PriceCalcEntryBody): PriceCalcEntry => ({ ...body, mode: body.mode ?? null, id: `new-${body.plant_name}`, created_at: '2026-10-23T00:00:00Z' })

/**
 * 計算フォームの金額の入力欄（type="number"）を上から順に返す
 * - ei8ht plants（仕入れ）: [仕入れ値, 任意価格]
 * - Habitat Oides・HUE: [植物仕入れ値, 鉢仕入れ値, 任意価格]
 * @returns 金額の入力欄の一覧
 */
const numberInputs = () => screen.getAllByRole('spinbutton')

/**
 * 計算フォームのブランドのタブ（登録リストの絞り込みにも同じ文言のボタンがあるので、絞り込みの group の外のものを選ぶ）
 * @param name - ブランドの表示名（ei8ht plants・Habitat Oides・HUE）
 * @returns 計算フォームのタブのボタン
 */
const brandTab = (name: string): HTMLElement => {
  const found = screen.getAllByRole('button', { name }).filter((b) => !b.closest('[role="group"]'))
  expect(found).toHaveLength(1)
  return found[0]
}

/**
 * 登録リストの絞り込みのボタン
 * @param name - 「すべて」またはブランドの表示名
 * @returns 絞り込みのボタン
 */
const filterButton = (name: string): HTMLElement =>
  within(screen.getByRole('group', { name: '登録リストの絞り込み' })).getByRole('button', { name })

/**
 * 販売価格計算を描画し、2 段目の「仕入れ」タブに切り替える（初期は「生産」のため、仕入れのテストはこれで始める）
 * @param withProvider - 書きかけ保護の Provider の中で描画するか
 * @returns render の戻り値
 * @param setTestRate - テスト用の原価率を設定するかどうか
 */
const renderPurchase = (withProvider = false, setTestRate = true) => {
  const result = render(withProvider ? <UnsavedChangesProvider><PriceCalc /></UnsavedChangesProvider> : <PriceCalc />)
  fireEvent.click(screen.getByRole('button', { name: '仕入れ' }))
  // 仕入れ計算の共通ケースでは目標原価率40%を明示して、ei8ht plants の既定値33.4%と分けて検証する。
  if (setTestRate) fireEvent.change(screen.getByRole('textbox', { name: '目標原価率（%）' }), { target: { value: '40' } })
  return result
}

/**
 * HUE のタブを開く（何も入力していないので確認は出ない）
 * @returns 戻り値なし。
 */
const openHue = () => {
  fireEvent.click(brandTab('HUE'))
  // HUE の植物名の placeholder が出るまで待たずに使えるよう、ここで確かめておく
  expect(screen.getByPlaceholderText('例: ユーフォルビア オベサ')).toBeInTheDocument()
}

/**
 * 実生タブを開き、選んだブランドの入力欄が表示された状態にする
 * @param brand - 表示するブランド（省略時は ei8ht plants）
 * @returns 戻り値なし
 */
const openSeedling = (brand: 'ei8ht plants' | 'Habitat Oides' = 'ei8ht plants') => {
  if (brand === 'Habitat Oides') fireEvent.click(brandTab(brand))
  fireEvent.click(screen.getByRole('button', { name: '実生' }))
  expect(screen.getByText('種子 20粒の値段')).toBeInTheDocument()
}

beforeEach(() => {
  // 目標原価率はブランドごとに localStorage へ保存するので、テストごとに状態を消す
  localStorage.clear()
  vi.mocked(api.potArtists.list).mockReset().mockResolvedValue(ARTISTS)
  vi.mocked(api.priceCalcEntries.list).mockReset().mockResolvedValue([])
  vi.mocked(api.priceCalcEntries.add).mockReset().mockImplementation(async (body) => toEntry(body))
  vi.mocked(api.priceCalcEntries.delete).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('推奨販売価格の表示', () => {
  it('見出しは「推奨販売価格（原価率 40% 以下）」で、原価を入れる前は「¥ —」になり原価率は出ない', async () => {
    renderPurchase()
    await screen.findByText('まだ登録されていません。')
    expect(screen.getByText('推奨販売価格（原価率 40% 以下）')).toBeInTheDocument()
    expect(screen.getAllByText('¥ —').length).toBeGreaterThan(0)
    expect(screen.queryByText(/^原価率 \d/)).toBeNull()
  })

  it('目標原価率を40%に設定して仕入れ値 1,500 円を入れると推奨価格は ¥3,800・原価率 39.5% になる', async () => {
    renderPurchase()
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    expect(screen.getByText('¥3,800')).toBeInTheDocument()
    expect(screen.queryByText('¥3,000')).toBeNull()
    expect(screen.queryByText('¥4,000')).toBeNull()
    expect(screen.getByText('原価率 39.5%')).toBeInTheDocument()
    // 登録ボタンにも推奨価格が出る
    expect(screen.getByRole('button', { name: /^登録\s+¥3,800$/ })).toBeInTheDocument()
  })

  it('仕入れ値 400 円（ちょうど割り切れる）なら推奨価格は ¥1,000 で上に跳ねず、原価率 40.0% になる', async () => {
    renderPurchase()
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '400' } })
    expect(screen.getByText('¥1,000')).toBeInTheDocument()
    expect(screen.getByText('原価率 40.0%')).toBeInTheDocument()
  })

  it('仕入れ値 5,000 円なら 100 円単位で ¥12,500、原価率 40.0% になる', async () => {
    renderPurchase()
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '5000' } })
    expect(screen.getByText('¥12,500')).toBeInTheDocument()
    expect(screen.getByText('原価率 40.0%')).toBeInTheDocument()
  })

  it('仕入れ値が 0 なら推奨価格は「¥ —」のままで、植物名があっても登録ボタンは押せない', async () => {
    renderPurchase()
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'アガベ' } })
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '0' } })
    expect(screen.getAllByText('¥ —').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '登録' })).toBeDisabled()
  })
})

describe('任意価格の原価率と超過の注意', () => {
  it('任意価格を入れる前は「登録価格」も注意も出ない', async () => {
    renderPurchase()
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    expect(screen.queryByText(/^登録価格:/)).toBeNull()
    expect(screen.queryByText('原価率が 40% を超えています')).toBeNull()
    // 任意価格の placeholder には推奨価格が出る
    expect(numberInputs()[1]).toHaveAttribute('placeholder', '3800')
  })

  it('原価 1,500 円に任意価格 5,000 円なら「登録価格: ¥5,000（原価率 30.0%）」で、注意は出ない', async () => {
    renderPurchase()
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    fireEvent.change(numberInputs()[1], { target: { value: '5000' } })
    expect(screen.getByText('登録価格: ¥5,000（原価率 30.0%）')).toBeInTheDocument()
    expect(screen.queryByText('原価率が 40% を超えています')).toBeNull()
    expect(screen.getByRole('button', { name: /^登録\s+¥5,000$/ })).toBeInTheDocument()
  })

  it('原価 400 円に任意価格 1,000 円（ちょうど 40%）なら注意は出ない', async () => {
    renderPurchase()
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '400' } })
    fireEvent.change(numberInputs()[1], { target: { value: '1000' } })
    expect(screen.getByText('登録価格: ¥1,000（原価率 40.0%）')).toBeInTheDocument()
    expect(screen.queryByText('原価率が 40% を超えています')).toBeNull()
  })

  it('原価 1,500 円に任意価格 3,000 円（50%）なら「原価率が 40% を超えています」が出るが、登録はでき、その価格で送られる', async () => {
    renderPurchase()
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'アガベ チタノタ' } })
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    fireEvent.change(numberInputs()[1], { target: { value: '3000' } })
    // 1. 登録価格と原価率、超過の注意が出る
    expect(screen.getByText('登録価格: ¥3,000（原価率 50.0%）')).toBeInTheDocument()
    expect(screen.getByText('原価率が 40% を超えています')).toBeInTheDocument()
    // 2. 登録ボタンは押せる（止めない）
    const button = screen.getByRole('button', { name: /^登録\s+¥3,000$/ })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    // 3. 任意価格で送られる
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledTimes(1))
    expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'ei8htplants', plant_name: 'アガベ チタノタ', pot_artist_name: null, cost: 1500, selling_price: 3000, mode: 'purchase',
    })
  })

  it('原価 401 円に任意価格 1,000 円（40.1%）なら注意が出る', async () => {
    renderPurchase()
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '401' } })
    fireEvent.change(numberInputs()[1], { target: { value: '1000' } })
    expect(screen.getByText('登録価格: ¥1,000（原価率 40.1%）')).toBeInTheDocument()
    expect(screen.getByText('原価率が 40% を超えています')).toBeInTheDocument()
  })

  it('原価を入れずに任意価格だけ入れても、原価率と注意は出ない', async () => {
    renderPurchase()
    fireEvent.change(numberInputs()[1], { target: { value: '3000' } })
    // 見出しの「原価率 40% 以下」以外に、原価率の数値・登録価格の原価率・注意は出ない
    expect(screen.queryByText(/原価率 \d+\.\d%/)).toBeNull()
    expect(screen.queryByText('原価率が 40% を超えています')).toBeNull()
  })
})

describe('HUE の計算フォーム', () => {
  it('HUE のタブには植物名・植物仕入れ値・鉢仕入れ値があり、鉢作家の選択（select）は無い', async () => {
    renderPurchase()
    await waitFor(() => expect(api.potArtists.list).toHaveBeenCalled())
    openHue()
    expect(screen.getByText('植物名')).toBeInTheDocument()
    expect(screen.getByText('植物仕入れ値')).toBeInTheDocument()
    expect(screen.getByText('鉢仕入れ値')).toBeInTheDocument()
    expect(screen.queryByText('鉢作家')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByText('量産鉢')).toBeNull()
    expect(screen.queryByText('山田陶房')).toBeNull()
    // 植物仕入れ値・鉢仕入れ値・任意価格の 3 つ
    expect(numberInputs()).toHaveLength(3)
  })

  it('植物 1,000 円 + 鉢 500 円 = 原価 1,500 円で推奨価格 ¥3,800・原価率 39.5% になる', async () => {
    renderPurchase()
    openHue()
    fireEvent.change(screen.getByPlaceholderText('例: 3000'), { target: { value: '1000' } })
    fireEvent.change(screen.getByPlaceholderText('例: 5000'), { target: { value: '500' } })
    expect(screen.getByText('¥3,800')).toBeInTheDocument()
    expect(screen.getByText('原価率 39.5%')).toBeInTheDocument()
  })

  it('登録すると brand「hue」・鉢作家 null・原価は植物 + 鉢で送られ、成功したら入力が空になり登録リストに HUE の行が出る', async () => {
    renderPurchase()
    await screen.findByText('まだ登録されていません。')
    openHue()
    // 1. 入力する
    fireEvent.change(screen.getByPlaceholderText('例: ユーフォルビア オベサ'), { target: { value: '  オベサ  ' } })
    fireEvent.change(screen.getByPlaceholderText('例: 3000'), { target: { value: '1000' } })
    fireEvent.change(screen.getByPlaceholderText('例: 5000'), { target: { value: '500' } })
    // 2. 登録する
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥3,800$/ }))
    // 3. 送る内容（植物名は前後の空白を除く）
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledTimes(1))
    expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'hue', plant_name: 'オベサ', pot_artist_name: null, cost: 1500, selling_price: 3800, mode: 'purchase',
    })
    // 4. 入力が空になる
    await waitFor(() => expect(screen.getByPlaceholderText('例: ユーフォルビア オベサ')).toHaveValue(''))
    expect(screen.getByPlaceholderText('例: 3000')).toHaveValue(null)
    expect(screen.getByPlaceholderText('例: 5000')).toHaveValue(null)
    // 5. 登録リストに HUE の行が出て、2 行目（量産鉢）は無い
    const row = screen.getByText('オベサ').closest('tr') as HTMLElement
    expect(within(row).getByText('HUE')).toBeInTheDocument()
    expect(within(row).getByText('¥1,500')).toBeInTheDocument()
    expect(within(row).getByText('¥3,800')).toBeInTheDocument()
    expect(within(row).queryByText('量産鉢')).toBeNull()
  })

  it('鉢仕入れ値が空でも植物仕入れ値だけで原価になり、任意価格でも登録できる', async () => {
    renderPurchase()
    openHue()
    fireEvent.change(screen.getByPlaceholderText('例: ユーフォルビア オベサ'), { target: { value: 'オベサ' } })
    fireEvent.change(screen.getByPlaceholderText('例: 3000'), { target: { value: '300' } })
    // 推奨価格は 300 ÷ 0.4 = 750 → ¥800
    expect(screen.getByText('¥800')).toBeInTheDocument()
    fireEvent.change(numberInputs()[2], { target: { value: '1200' } })
    expect(screen.getByText('登録価格: ¥1,200（原価率 25.0%）')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥1,200$/ }))
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'hue', plant_name: 'オベサ', pot_artist_name: null, cost: 300, selling_price: 1200, mode: 'purchase',
    }))
  })

  it('植物名が空、または植物と鉢の仕入れ値が両方空なら登録ボタンは押せない', async () => {
    renderPurchase()
    openHue()
    // 1. 金額だけ（植物名なし）
    fireEvent.change(screen.getByPlaceholderText('例: 3000'), { target: { value: '1000' } })
    expect(screen.getByRole('button', { name: /^登録/ })).toBeDisabled()
    // 2. 植物名だけ（金額なし）
    fireEvent.change(screen.getByPlaceholderText('例: 3000'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('例: ユーフォルビア オベサ'), { target: { value: 'オベサ' } })
    expect(screen.getByRole('button', { name: '登録' })).toBeDisabled()
  })
})

describe('Habitat Oides の計算フォーム', () => {
  it('鉢作家を選べて（未選択は「量産鉢」）、選んだ作家名と brand「habitatoides」・植物 + 鉢の原価が送られる', async () => {
    renderPurchase()
    await waitFor(() => expect(api.potArtists.list).toHaveBeenCalled())
    fireEvent.click(brandTab('Habitat Oides'))
    // 1. 鉢作家の選択肢
    const select = await screen.findByRole('combobox')
    await within(select).findByRole('option', { name: '山田陶房' })
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['量産鉢', '山田陶房', '佐藤窯'])
    // 2. 入力して作家を選ぶ
    fireEvent.change(screen.getByPlaceholderText('例: アガベ ポタトルム'), { target: { value: 'ポタトルム' } })
    fireEvent.change(screen.getByPlaceholderText('例: 3000'), { target: { value: '3000' } })
    fireEvent.change(screen.getByPlaceholderText('例: 5000'), { target: { value: '5000' } })
    fireEvent.change(select, { target: { value: 'a-2' } })
    // 8000 ÷ 0.4 = 20000 → ¥20,000
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥20,000$/ }))
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'habitatoides', plant_name: 'ポタトルム', pot_artist_name: '佐藤窯', cost: 8000, selling_price: 20000, mode: 'purchase',
    }))
  })

  it('鉢作家を選ばずに登録すると pot_artist_name は null で送られる', async () => {
    renderPurchase()
    fireEvent.click(brandTab('Habitat Oides'))
    fireEvent.change(screen.getByPlaceholderText('例: アガベ ポタトルム'), { target: { value: 'ポタトルム' } })
    fireEvent.change(screen.getByPlaceholderText('例: 3000'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥3,800$/ }))
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'habitatoides', plant_name: 'ポタトルム', pot_artist_name: null, cost: 1500, selling_price: 3800, mode: 'purchase',
    }))
  })
})

describe('実生の計算フォーム', () => {
  it('ei8ht plants は種子20粒の値段を上代、1粒分を原価として計算し、目標原価率によらず原価率だけを表示する', async () => {
    render(<PriceCalc />)
    fireEvent.click(screen.getByRole('button', { name: '仕入れ' }))
    fireEvent.change(screen.getByRole('textbox', { name: '目標原価率（%）' }), { target: { value: '' } })
    openSeedling()
    fireEvent.change(screen.getByPlaceholderText('例: 600'), { target: { value: '600' } })

    expect(screen.getByText('上代（種子 20粒の値段）')).toBeInTheDocument()
    expect(screen.getByText('¥600')).toBeInTheDocument()
    expect(screen.getByText('1粒あたり ¥30')).toBeInTheDocument()
    expect(screen.getByText('原価率 5.0%')).toBeInTheDocument()
    expect(screen.queryByText(/目標原価率/)).toBeNull()
  })

  it('植物名を trim し、任意価格を上代の代わりに登録して成功後に入力を空にする', async () => {
    render(<PriceCalc />)
    openSeedling()
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: '  アガベ  ' } })
    fireEvent.change(screen.getByPlaceholderText('例: 600'), { target: { value: '600' } })
    fireEvent.change(numberInputs()[1], { target: { value: '1200' } })
    expect(screen.getByText('登録価格: ¥1,200（原価率 2.5%）')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥1,200$/ }))

    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'ei8htplants', plant_name: 'アガベ', pot_artist_name: null, cost: 30, selling_price: 1200, mode: 'seedling',
    }))
    await waitFor(() => expect(screen.getByPlaceholderText('例: アガベ チタノタ')).toHaveValue(''))
    expect(screen.getByPlaceholderText('例: 600')).toHaveValue(null)
    expect(numberInputs()[1]).toHaveValue(null)
  })

  it('種子の価格が空・0・負数なら上代を計算せず、植物名や鉢代だけでは登録できない', async () => {
    render(<PriceCalc />)
    openSeedling('Habitat Oides')
    fireEvent.change(screen.getByPlaceholderText('例: アガベ ポタトルム'), { target: { value: 'ポタトルム' } })
    fireEvent.change(screen.getByPlaceholderText('例: 5000'), { target: { value: '500' } })
    expect(screen.getByRole('button', { name: '登録' })).toBeDisabled()
    expect(screen.getAllByText('¥ —').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByPlaceholderText('例: 600'), { target: { value: '0' } })
    expect(screen.getByRole('button', { name: '登録' })).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('例: 600'), { target: { value: '-1' } })
    expect(screen.getByRole('button', { name: '登録' })).toBeDisabled()
    expect(api.priceCalcEntries.add).not.toHaveBeenCalled()
  })

  it('Habitat Oides は種子原価に鉢代を加算し、選んだ鉢作家と合計を登録する', async () => {
    render(<PriceCalc />)
    openSeedling('Habitat Oides')
    fireEvent.change(screen.getByPlaceholderText('例: アガベ ポタトルム'), { target: { value: 'ポタトルム' } })
    fireEvent.change(screen.getByPlaceholderText('例: 600'), { target: { value: '600' } })
    fireEvent.change(screen.getByPlaceholderText('例: 5000'), { target: { value: '500' } })
    const artistSelect = screen.getByRole('combobox')
    await within(artistSelect).findByRole('option', { name: '佐藤窯' })
    fireEvent.change(artistSelect, { target: { value: 'a-2' } })
    expect(screen.getByText('上代（種子 20粒の値段 + 鉢）')).toBeInTheDocument()
    expect(screen.getByText('¥1,100')).toBeInTheDocument()
    expect(screen.getByText('原価率 48.2%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥1,100$/ }))

    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'habitatoides', plant_name: 'ポタトルム', pot_artist_name: '佐藤窯', cost: 530, selling_price: 1100, mode: 'seedling',
    }))
  })

  it('登録に失敗するとエラーを出し、種子と植物名を残して再登録できる', async () => {
    vi.mocked(api.priceCalcEntries.add).mockRejectedValueOnce(new Error('通信に失敗しました'))
    render(<PriceCalc />)
    openSeedling()
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'アガベ' } })
    fireEvent.change(screen.getByPlaceholderText('例: 600'), { target: { value: '600' } })
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥600$/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('登録に失敗しました')
    expect(screen.getByPlaceholderText('例: アガベ チタノタ')).toHaveValue('アガベ')
    expect(screen.getByPlaceholderText('例: 600')).toHaveValue(600)
    expect(screen.getByRole('button', { name: /^登録\s+¥600$/ })).toBeEnabled()
  })

  it('登録処理中は「登録中...」を表示してボタンを無効にし、完了したら再び操作可能になる', async () => {
    /** モック登録を完了させる関数。クリック後、登録中表示を確認してから呼ぶ */
    let finishSave: (() => void) | undefined
    vi.mocked(api.priceCalcEntries.add).mockImplementationOnce((body) => new Promise<PriceCalcEntry>((resolve) => {
      finishSave = () => resolve(toEntry(body))
    }))
    render(<PriceCalc />)
    openSeedling()
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'アガベ' } })
    fireEvent.change(screen.getByPlaceholderText('例: 600'), { target: { value: '600' } })
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥600$/ }))

    expect(screen.getByRole('button', { name: '登録中...' })).toBeDisabled()
    finishSave?.()
    await waitFor(() => expect(screen.getByPlaceholderText('例: アガベ チタノタ')).toHaveValue(''))
    expect(screen.getByRole('button', { name: '登録' })).toBeDisabled()
  })
})

describe('登録リストの植物名の下の 2 行目', () => {
  /** 3 ブランド分の登録（Habitat Oides は作家あり・量産鉢の 2 件） */
  const ENTRIES: PriceCalcEntry[] = [
    { id: 'e-1', brand: 'habitatoides', plant_name: 'ハビタット作家鉢', pot_artist_name: '山田陶房', cost: 8000, selling_price: 20000, mode: null, created_at: '2026-10-23T00:00:00Z' },
    { id: 'e-2', brand: 'habitatoides', plant_name: 'ハビタット量産鉢', pot_artist_name: null, cost: 1500, selling_price: 3800, mode: null, created_at: '2026-10-22T00:00:00Z' },
    { id: 'e-3', brand: 'ei8htplants', plant_name: 'エイトの植物', pot_artist_name: null, cost: 1500, selling_price: 3800, mode: null, created_at: '2026-10-21T00:00:00Z' },
    { id: 'e-4', brand: 'hue', plant_name: 'ヒューの植物', pot_artist_name: null, cost: 1500, selling_price: 3800, mode: null, created_at: '2026-10-20T00:00:00Z' },
    // 古いデータなどで HUE に作家名が入っていても 2 行目は出さない
    { id: 'e-5', brand: 'hue', plant_name: 'ヒュー作家名あり', pot_artist_name: '佐藤窯', cost: 1500, selling_price: 3800, mode: null, created_at: '2026-10-19T00:00:00Z' },
  ]

  /**
   * 植物名の行の、最初のセル（植物名 / 鉢作家）を返す
   * @param plantName - 植物名
   * @returns 最初のセル
   */
  const firstCell = (plantName: string) => (screen.getByText(plantName).closest('td') as HTMLElement)

  beforeEach(() => {
    vi.mocked(api.priceCalcEntries.list).mockResolvedValue(ENTRIES)
  })

  it('Habitat Oides で作家ありの行は、2 行目に作家名が出る', async () => {
    render(<PriceCalc />)
    await screen.findByText('ハビタット作家鉢')
    expect(firstCell('ハビタット作家鉢')).toHaveTextContent(/^ハビタット作家鉢山田陶房$/)
  })

  it('Habitat Oides で作家なしの行は、2 行目に「量産鉢」が出る', async () => {
    render(<PriceCalc />)
    await screen.findByText('ハビタット量産鉢')
    expect(within(firstCell('ハビタット量産鉢')).getByText('量産鉢')).toBeInTheDocument()
  })

  it('ei8ht plants の行は 2 行目が無く、植物名だけになる', async () => {
    render(<PriceCalc />)
    await screen.findByText('エイトの植物')
    expect(firstCell('エイトの植物')).toHaveTextContent(/^エイトの植物$/)
    expect(firstCell('エイトの植物').children).toHaveLength(1)
  })

  it('HUE の行は 2 行目が無く、作家名が入っていても出さない', async () => {
    render(<PriceCalc />)
    await screen.findByText('ヒューの植物')
    expect(firstCell('ヒューの植物')).toHaveTextContent(/^ヒューの植物$/)
    expect(firstCell('ヒューの植物').children).toHaveLength(1)
    expect(firstCell('ヒュー作家名あり')).toHaveTextContent(/^ヒュー作家名あり$/)
    // 「量産鉢」は Habitat Oides の作家なしの 1 行だけ（計算フォームの ei8ht plants には select が無い）
    expect(screen.getAllByText('量産鉢')).toHaveLength(1)
  })
})

describe('HUE の書きかけ保護（Provider の中）', () => {
  it('HUE で植物名を入れてから別のタブに切り替えようとすると確認が出て、キャンセルすると HUE のまま入力が残る', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPurchase(true)
    openHue()
    fireEvent.change(screen.getByPlaceholderText('例: ユーフォルビア オベサ'), { target: { value: 'オベサ' } })
    fireEvent.click(brandTab('ei8ht plants'))
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_LEAVE_MESSAGE)
    expect(screen.getByPlaceholderText('例: ユーフォルビア オベサ')).toHaveValue('オベサ')
    expect(screen.queryByPlaceholderText('例: アガベ チタノタ')).toBeNull()
  })

  it('HUE で鉢仕入れ値だけ入れても確認が出て、OK を押すと切り替わり、戻ると HUE の入力は消えている', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPurchase(true)
    openHue()
    fireEvent.change(screen.getByPlaceholderText('例: 5000'), { target: { value: '500' } })
    fireEvent.click(brandTab('Habitat Oides'))
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(await screen.findByPlaceholderText('例: アガベ ポタトルム')).toBeInTheDocument()
    // Habitat Oides は何も入れていないので確認なしで HUE に戻れ、入力は作り直されている
    fireEvent.click(brandTab('HUE'))
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByPlaceholderText('例: 5000')).toHaveValue(null)
  })

  it('HUE で登録に成功したあとは、タブを切り替えても確認が出ない', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPurchase(true)
    openHue()
    fireEvent.change(screen.getByPlaceholderText('例: ユーフォルビア オベサ'), { target: { value: 'オベサ' } })
    fireEvent.change(screen.getByPlaceholderText('例: 3000'), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥2,500$/ }))
    await waitFor(() => expect(screen.getByPlaceholderText('例: ユーフォルビア オベサ')).toHaveValue(''))
    fireEvent.click(brandTab('ei8ht plants'))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('例: アガベ チタノタ')).toBeInTheDocument()
  })

  it('HUE で何も入れていなければ、確認なしでタブを切り替えられる', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPurchase(true)
    openHue()
    fireEvent.click(brandTab('Habitat Oides'))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('例: アガベ ポタトルム')).toBeInTheDocument()
  })
})

describe('目標原価率の欄', () => {
  /**
   * 目標原価率の入力欄を返す
   * @returns 入力欄
   */
  const rateInput = () => screen.getByRole('textbox', { name: '目標原価率（%）' })

  it('ei8ht plants の初期値は 33.4 で、「33.4% に戻す」ボタンは出ず、見出しも 33.4% 以下', async () => {
    render(<PriceCalc />)
    fireEvent.click(screen.getByRole('button', { name: '仕入れ' }))
    expect(rateInput()).toHaveValue('33.4')
    expect(rateInput()).toHaveAttribute('inputmode', 'decimal')
    expect(screen.queryByRole('button', { name: '33.4% に戻す' })).toBeNull()
    expect(screen.getByText('推奨販売価格（原価率 33.4% 以下）')).toBeInTheDocument()
  })

  it('35 に変えると見出しが「原価率 35% 以下」になり、原価 1,500 円の推奨価格は ¥4,300（原価率 34.9%）になる', async () => {
    renderPurchase()
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    expect(screen.getByText('¥3,800')).toBeInTheDocument()
    fireEvent.change(rateInput(), { target: { value: '35' } })
    expect(screen.getByText('推奨販売価格（原価率 35% 以下）')).toBeInTheDocument()
    expect(screen.getByText('¥4,300')).toBeInTheDocument()
    expect(screen.getByText('原価率 34.9%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^登録\s+¥4,300$/ })).toBeInTheDocument()
  })

  it('37.5 のような小数も使え、見出しは「原価率 37.5% 以下」になる', async () => {
    renderPurchase()
    fireEvent.change(rateInput(), { target: { value: '37.5' } })
    expect(screen.getByText('推奨販売価格（原価率 37.5% 以下）')).toBeInTheDocument()
    // 1500 ÷ 0.375 = 4000 → ¥4,000
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    expect(screen.getByText('¥4,000')).toBeInTheDocument()
  })

  it('目標 35% で任意価格の原価率が 35% を超えると「原価率が 35% を超えています」が出て、ちょうど 35% なら出ない', async () => {
    renderPurchase()
    fireEvent.change(rateInput(), { target: { value: '35' } })
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '350' } })
    // 1. ちょうど 35%（350 円・1,000 円）は注意なし
    fireEvent.change(numberInputs()[1], { target: { value: '1000' } })
    expect(screen.getByText('登録価格: ¥1,000（原価率 35.0%）')).toBeInTheDocument()
    expect(screen.queryByText(/を超えています/)).toBeNull()
    // 2. 38.9%（350 円・900 円）は注意あり（40% 以下でも目標の 35% を超えるので出る）
    fireEvent.change(numberInputs()[1], { target: { value: '900' } })
    expect(screen.getByText('登録価格: ¥900（原価率 38.9%）')).toBeInTheDocument()
    expect(screen.getByText('原価率が 35% を超えています')).toBeInTheDocument()
    expect(screen.queryByText('原価率が 40% を超えています')).toBeNull()
  })

  it.each([[''], ['0'], ['-5'], ['101'], ['abc']])(
    '使えない値「%s」では推奨価格「¥ —」・見出し「推奨販売価格（目標原価率が未設定）」・案内が出て、登録ボタンは押せない',
    async (value) => {
      renderPurchase()
      fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'アガベ' } })
      fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
      fireEvent.change(rateInput(), { target: { value } })
      expect(screen.getAllByText('¥ —').length).toBeGreaterThan(0)
      expect(screen.getByText('推奨販売価格（目標原価率が未設定）')).toBeInTheDocument()
      expect(screen.getByText('0 より大きく 100 以下の数を入れてください')).toBeInTheDocument()
      expect(rateInput()).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByRole('button', { name: /^登録/ })).toBeDisabled()
      // 任意価格を入れても登録はできず、原価率と注意も出ない
      fireEvent.change(numberInputs()[1], { target: { value: '3000' } })
      expect(screen.getByRole('button', { name: /^登録/ })).toBeDisabled()
      expect(screen.queryByText(/原価率 \d+\.\d%/)).toBeNull()
      expect(screen.queryByText(/を超えています/)).toBeNull()
    },
  )

  it('使えない値から正しい値に直すと、案内が消えて推奨価格が出て登録できる', async () => {
    renderPurchase()
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'アガベ' } })
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    fireEvent.change(rateInput(), { target: { value: '' } })
    fireEvent.change(rateInput(), { target: { value: '50' } })
    expect(screen.queryByText('0 より大きく 100 以下の数を入れてください')).toBeNull()
    expect(screen.getByText('¥3,000')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥3,000$/ }))
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'ei8htplants', plant_name: 'アガベ', pot_artist_name: null, cost: 1500, selling_price: 3000, mode: 'purchase',
    }))
  })

  it('「33.4% に戻す」は既定値と違うときだけ出て、押すと既定値に戻る', async () => {
    renderPurchase()
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    fireEvent.change(rateInput(), { target: { value: '35' } })
    fireEvent.click(screen.getByRole('button', { name: '33.4% に戻す' }))
    expect(rateInput()).toHaveValue('33.4')
    expect(screen.queryByRole('button', { name: '33.4% に戻す' })).toBeNull()
    expect(screen.getByText('推奨販売価格（原価率 33.4% 以下）')).toBeInTheDocument()
    expect(screen.getByText('¥4,500')).toBeInTheDocument()
    expect(localStorage.getItem('price-calc-cost-rate:ei8htplants')).toBe('33.4')
  })

  it.each([['40.0'], ['４０'], [' 40 ']])('「%s」は 40% と同じ率なので「40% に戻す」は出ず、見出しは「原価率 40% 以下」', async (value) => {
    renderPurchase()
    fireEvent.change(rateInput(), { target: { value } })
    expect(screen.queryByRole('button', { name: '40% に戻す' })).toBeNull()
    // ei8ht plants の画面既定値は33.4%なので、40%を入力すると既定値へ戻すボタンが表示される。
    expect(screen.getByRole('button', { name: '33.4% に戻す' })).toBeInTheDocument()
    expect(screen.queryByText('0 より大きく 100 以下の数を入れてください')).toBeNull()
    expect(screen.getByText('推奨販売価格（原価率 40% 以下）')).toBeInTheDocument()
  })

  it('全角で「３５」と入れても 35% として計算する（原価 1,500 円 → ¥4,300）', async () => {
    renderPurchase()
    fireEvent.change(rateInput(), { target: { value: '３５' } })
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    expect(screen.getByText('推奨販売価格（原価率 35% 以下）')).toBeInTheDocument()
    expect(screen.getByText('¥4,300')).toBeInTheDocument()
  })

  it.each([['1e2'], ['0x28'], ['0.00004']])('「%s」は使えない値として案内が出て、推奨価格は「¥ —」', async (value) => {
    renderPurchase()
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    fireEvent.change(rateInput(), { target: { value } })
    expect(screen.getByText('0 より大きく 100 以下の数を入れてください')).toBeInTheDocument()
    expect(screen.getAllByText('¥ —').length).toBeGreaterThan(0)
  })

  it('変えた率はブランド別 localStorage に保存され、開き直すとその率から始まる', async () => {
    const { unmount } = renderPurchase()
    fireEvent.change(rateInput(), { target: { value: '35' } })
    expect(localStorage.getItem('price-calc-cost-rate:ei8htplants')).toBe('35')
    unmount()
    renderPurchase(false, false)
    expect(rateInput()).toHaveValue('35')
    expect(screen.getByText('推奨販売価格（原価率 35% 以下）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '33.4% に戻す' })).toBeInTheDocument()
  })

  it('使えない値は保存されず、開き直すと前に保存した率から始まる', async () => {
    const { unmount } = renderPurchase()
    fireEvent.change(rateInput(), { target: { value: '35' } })
    fireEvent.change(rateInput(), { target: { value: '150' } })
    expect(localStorage.getItem('price-calc-cost-rate:ei8htplants')).toBe('35')
    unmount()
    renderPurchase(false, false)
    expect(rateInput()).toHaveValue('35')
  })

  it('localStorage に使えない値が入っていれば 40 から始まる', async () => {
    localStorage.setItem('price-calc-cost-rate:ei8htplants', '0')
    render(<PriceCalc />)
    fireEvent.click(screen.getByRole('button', { name: '仕入れ' }))
    expect(rateInput()).toHaveValue('33.4')
  })

  it('率だけ変えても書きかけ扱いにならず、タブを切り替えても確認は出ない', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPurchase(true)
    fireEvent.change(rateInput(), { target: { value: '35' } })
    fireEvent.click(brandTab('HUE'))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('例: ユーフォルビア オベサ')).toBeInTheDocument()
  })

  it('ブランドごとに率を分け、HUE は独立して保存した率を使う', async () => {
    renderPurchase()
    openHue()
    expect(rateInput()).toHaveValue('40')
    fireEvent.change(rateInput(), { target: { value: '35' } })
    expect(screen.getByText('推奨販売価格（原価率 35% 以下）')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('例: ユーフォルビア オベサ'), { target: { value: 'オベサ' } })
    fireEvent.change(screen.getByPlaceholderText('例: 3000'), { target: { value: '1000' } })
    fireEvent.change(screen.getByPlaceholderText('例: 5000'), { target: { value: '500' } })
    // 1500 ÷ 0.35 = 4285.7… → ¥4,300
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥4,300$/ }))
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'hue', plant_name: 'オベサ', pot_artist_name: null, cost: 1500, selling_price: 4300, mode: 'purchase',
    }))
    // Habitat Oides は ei8ht plants と独立した既定値 40% を使う
    fireEvent.click(brandTab('Habitat Oides'))
    expect(rateInput()).toHaveValue('40')
  })
})


describe('生産（卸価格の 2 倍）', () => {
  /**
   * 生産の卸価格の入力欄を返す（生産の画面では「例: 1500」は卸価格の欄だけ）
   * @returns 卸価格の入力欄
   */
  const wholesaleInput = () => screen.getByPlaceholderText('例: 1500')

  it('初期は「生産」で、見出しは「販売価格（卸価格の 2 倍）」・「¥ —」。目標原価率の欄・実生のラジオ・仕入れ値の欄は無い', async () => {
    render(<PriceCalc />)
    await screen.findByText('まだ登録されていません。')
    expect(screen.getByRole('button', { name: '生産' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '仕入れ' })).toBeInTheDocument()
    expect(screen.getByText('卸価格')).toBeInTheDocument()
    expect(screen.getByText('販売価格（卸価格の 2 倍）')).toBeInTheDocument()
    expect(screen.getAllByText('¥ —').length).toBeGreaterThan(0)
    expect(screen.queryByRole('textbox', { name: '目標原価率（%）' })).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByRole('button', { name: '実生' })).toBeInTheDocument()
    expect(screen.queryByText(/上代/)).toBeNull()
    expect(screen.queryByText('仕入れ値')).toBeNull()
    expect(screen.queryByText(/^推奨販売価格/)).toBeNull()
  })

  it.each([
    // [卸価格, 販売価格の表示]
    ['1500', '¥3,000'],
    ['735', '¥1,470'],
    ['1', '¥2'],
    ['12345', '¥24,690'],
  ])('卸価格 %s 円なら販売価格は %s（ちょうど 2 倍。100 円単位に切り上げない）で、原価率の行は出ない', async (wholesale, label) => {
    render(<PriceCalc />)
    fireEvent.change(wholesaleInput(), { target: { value: wholesale } })
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.queryByText(/原価率 \d/)).toBeNull()
    expect(screen.getByRole('button', { name: new RegExp(`^登録\\s+${label}$`) })).toBeInTheDocument()
  })

  it('生産の任意価格の項目名は「任意価格（販売価格を上書き）」で、仕入れに切り替えると「任意価格（推奨価格を上書き）」になる', async () => {
    render(<PriceCalc />)
    expect(screen.getByText('任意価格（販売価格を上書き）')).toBeInTheDocument()
    expect(screen.queryByText('任意価格（推奨価格を上書き）')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '仕入れ' }))
    expect(screen.getByText('任意価格（推奨価格を上書き）')).toBeInTheDocument()
    expect(screen.queryByText('任意価格（販売価格を上書き）')).toBeNull()
    // HUE の生産でも同じ項目名
    fireEvent.click(screen.getByRole('button', { name: '生産' }))
    fireEvent.click(brandTab('HUE'))
    expect(screen.getByText('任意価格（販売価格を上書き）')).toBeInTheDocument()
  })

  it('任意価格を入れると「登録価格: ¥5,000」だけが出て（原価率なし）、卸価格より安くしても超過の注意は出ない', async () => {
    render(<PriceCalc />)
    fireEvent.change(wholesaleInput(), { target: { value: '1500' } })
    // 任意価格の placeholder には卸価格の 2 倍が出る
    expect(numberInputs()[1]).toHaveAttribute('placeholder', '3000')
    fireEvent.change(numberInputs()[1], { target: { value: '5000' } })
    expect(screen.getByText('登録価格: ¥5,000')).toBeInTheDocument()
    expect(screen.queryByText(/原価率/)).toBeNull()
    fireEvent.change(numberInputs()[1], { target: { value: '1000' } })
    expect(screen.getByText('登録価格: ¥1,000')).toBeInTheDocument()
    expect(screen.queryByText(/を超えています/)).toBeNull()
  })

  it('ei8ht plants の生産で登録すると brand「ei8htplants」・cost は卸価格・selling_price は 2 倍・鉢作家 null で送られ、入力が空になる', async () => {
    render(<PriceCalc />)
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: ' チタノタ ' } })
    fireEvent.change(wholesaleInput(), { target: { value: '735' } })
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥1,470$/ }))
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'ei8htplants', plant_name: 'チタノタ', pot_artist_name: null, cost: 735, selling_price: 1470, mode: 'production',
    }))
    await waitFor(() => expect(screen.getByPlaceholderText('例: アガベ チタノタ')).toHaveValue(''))
    expect(wholesaleInput()).toHaveValue(null)
  })

  it('生産で任意価格を入れて登録すると、selling_price は任意価格で送られる', async () => {
    render(<PriceCalc />)
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'チタノタ' } })
    fireEvent.change(wholesaleInput(), { target: { value: '1500' } })
    fireEvent.change(numberInputs()[1], { target: { value: '3500' } })
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥3,500$/ }))
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'ei8htplants', plant_name: 'チタノタ', pot_artist_name: null, cost: 1500, selling_price: 3500, mode: 'production',
    }))
  })

  it('植物名が空、または卸価格が空・0 なら登録ボタンは押せない', async () => {
    render(<PriceCalc />)
    fireEvent.change(wholesaleInput(), { target: { value: '1500' } })
    expect(screen.getByRole('button', { name: /^登録/ })).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'チタノタ' } })
    fireEvent.change(wholesaleInput(), { target: { value: '0' } })
    expect(screen.getAllByText('¥ —').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '登録' })).toBeDisabled()
  })

  it('Habitat Oides の生産には鉢作家の選択があり、選んだ作家名と brand「habitatoides」で送られる', async () => {
    render(<PriceCalc />)
    await waitFor(() => expect(api.potArtists.list).toHaveBeenCalled())
    fireEvent.click(brandTab('Habitat Oides'))
    expect(screen.getByText('販売価格（卸価格の 2 倍）')).toBeInTheDocument()
    const select = await screen.findByRole('combobox')
    await within(select).findByRole('option', { name: '佐藤窯' })
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['量産鉢', '山田陶房', '佐藤窯'])
    fireEvent.change(screen.getByPlaceholderText('例: アガベ ポタトルム'), { target: { value: 'ポタトルム' } })
    fireEvent.change(wholesaleInput(), { target: { value: '4000' } })
    fireEvent.change(select, { target: { value: 'a-2' } })
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥8,000$/ }))
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'habitatoides', plant_name: 'ポタトルム', pot_artist_name: '佐藤窯', cost: 4000, selling_price: 8000, mode: 'production',
    }))
  })

  it('Habitat Oides の生産で鉢作家を選ばなければ pot_artist_name は null で送られる', async () => {
    render(<PriceCalc />)
    fireEvent.click(brandTab('Habitat Oides'))
    fireEvent.change(screen.getByPlaceholderText('例: アガベ ポタトルム'), { target: { value: 'ポタトルム' } })
    fireEvent.change(wholesaleInput(), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥2,000$/ }))
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'habitatoides', plant_name: 'ポタトルム', pot_artist_name: null, cost: 1000, selling_price: 2000, mode: 'production',
    }))
  })

  it('HUE の生産には鉢作家の選択が無く、brand「hue」・鉢作家 null で送られる', async () => {
    render(<PriceCalc />)
    await waitFor(() => expect(api.potArtists.list).toHaveBeenCalled())
    fireEvent.click(brandTab('HUE'))
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByText('鉢作家')).toBeNull()
    expect(screen.queryByText('植物仕入れ値')).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('例: ユーフォルビア オベサ'), { target: { value: 'オベサ' } })
    fireEvent.change(wholesaleInput(), { target: { value: '1200' } })
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥2,400$/ }))
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'hue', plant_name: 'オベサ', pot_artist_name: null, cost: 1200, selling_price: 2400, mode: 'production',
    }))
  })

  it('目標原価率が正しくない値（空）でも、生産では欄が出ず登録できる。仕入れに戻ると空のまま残っている', async () => {
    render(<PriceCalc />)
    // 1. 仕入れで目標原価率を空にする
    fireEvent.click(screen.getByRole('button', { name: '仕入れ' }))
    fireEvent.change(screen.getByRole('textbox', { name: '目標原価率（%）' }), { target: { value: '' } })
    // 2. 生産に戻ると欄も案内も無く、登録できる
    fireEvent.click(screen.getByRole('button', { name: '生産' }))
    expect(screen.queryByRole('textbox', { name: '目標原価率（%）' })).toBeNull()
    expect(screen.queryByText('0 より大きく 100 以下の数を入れてください')).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'チタノタ' } })
    fireEvent.change(wholesaleInput(), { target: { value: '1500' } })
    const button = screen.getByRole('button', { name: /^登録\s+¥3,000$/ })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledTimes(1))
    // 3. 仕入れに戻ると、目標原価率は空のまま
    await waitFor(() => expect(screen.getByPlaceholderText('例: アガベ チタノタ')).toHaveValue(''))
    fireEvent.click(screen.getByRole('button', { name: '仕入れ' }))
    expect(screen.getByRole('textbox', { name: '目標原価率（%）' })).toHaveValue('')
  })
})

describe('生産・仕入れのタブ', () => {
  it('目標原価率の欄は仕入れのときだけ、2 段目のタブの下に出る。生産に切り替えても値と保存は残る', async () => {
    render(<PriceCalc />)
    expect(screen.queryByRole('textbox', { name: '目標原価率（%）' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '仕入れ' }))
    const rate = screen.getByRole('textbox', { name: '目標原価率（%）' })
    // 2 段目のタブ（仕入れ）より後ろ、計算フォーム（植物名）より前にある
    expect(screen.getByRole('button', { name: '仕入れ' }).compareDocumentPosition(rate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(rate.compareDocumentPosition(screen.getByPlaceholderText('例: アガベ チタノタ')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.change(rate, { target: { value: '35' } })
    fireEvent.click(screen.getByRole('button', { name: '生産' }))
    expect(screen.queryByRole('textbox', { name: '目標原価率（%）' })).toBeNull()
    expect(localStorage.getItem('price-calc-cost-rate:ei8htplants')).toBe('35')
    fireEvent.click(screen.getByRole('button', { name: '仕入れ' }))
    expect(screen.getByRole('textbox', { name: '目標原価率（%）' })).toHaveValue('35')
  })

  it('仕入れを選んでからブランドを切り替えても仕入れのまま（3 ブランドとも仕入れのフォームになる）', async () => {
    render(<PriceCalc />)
    fireEvent.click(screen.getByRole('button', { name: '仕入れ' }))
    expect(screen.getByText('仕入れ値')).toBeInTheDocument()
    fireEvent.click(brandTab('HUE'))
    expect(screen.getByText('植物仕入れ値')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '目標原価率（%）' })).toBeInTheDocument()
    fireEvent.click(brandTab('Habitat Oides'))
    expect(screen.getByText('植物仕入れ値')).toBeInTheDocument()
    expect(screen.queryByText('卸価格')).toBeNull()
  })

  it('生産のままブランドを切り替えても生産のまま（3 ブランドとも卸価格のフォームになる）', async () => {
    render(<PriceCalc />)
    for (const brand of ['HUE', 'Habitat Oides', 'ei8ht plants']) {
      fireEvent.click(brandTab(brand))
      expect(screen.getByText('卸価格')).toBeInTheDocument()
      expect(screen.getByText('販売価格（卸価格の 2 倍）')).toBeInTheDocument()
      expect(screen.queryByText('植物仕入れ値')).toBeNull()
    }
  })

  it('生産で入力があるまま「仕入れ」を押すと確認が出て、キャンセルすると生産のまま入力が残る', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<UnsavedChangesProvider><PriceCalc /></UnsavedChangesProvider>)
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: '仕入れ' }))
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_LEAVE_MESSAGE)
    expect(screen.getByText('卸価格')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('例: 1500')).toHaveValue(1500)
    expect(screen.queryByRole('textbox', { name: '目標原価率（%）' })).toBeNull()
  })

  it('確認で OK を押すと仕入れに切り替わり、生産に戻ると入力は消えている（フォームは種類ごとに作り直される）', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<UnsavedChangesProvider><PriceCalc /></UnsavedChangesProvider>)
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'チタノタ' } })
    fireEvent.click(screen.getByRole('button', { name: '仕入れ' }))
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByText('仕入れ値')).toBeInTheDocument()
    // 仕入れの植物名は空（生産の入力は引き継がない）
    expect(screen.getByPlaceholderText('例: アガベ チタノタ')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: '生産' }))
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByPlaceholderText('例: アガベ チタノタ')).toHaveValue('')
  })

  it('仕入れで入力があるまま「生産」を押しても確認が出る（キャンセルで仕入れのまま）', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<UnsavedChangesProvider><PriceCalc /></UnsavedChangesProvider>)
    fireEvent.click(screen.getByRole('button', { name: '仕入れ' }))
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: '生産' }))
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_LEAVE_MESSAGE)
    expect(screen.getByText('仕入れ値')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('例: 1500')).toHaveValue(1500)
  })

  it('生産で入力があるままブランドを切り替えようとしても確認が出て、キャンセルすると残る', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<UnsavedChangesProvider><PriceCalc /></UnsavedChangesProvider>)
    fireEvent.click(brandTab('HUE'))
    fireEvent.change(screen.getByPlaceholderText('例: ユーフォルビア オベサ'), { target: { value: 'オベサ' } })
    fireEvent.click(brandTab('Habitat Oides'))
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_LEAVE_MESSAGE)
    expect(screen.getByPlaceholderText('例: ユーフォルビア オベサ')).toHaveValue('オベサ')
  })

  it('生産で登録に成功したあとは、仕入れに切り替えても確認が出ない', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<UnsavedChangesProvider><PriceCalc /></UnsavedChangesProvider>)
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'チタノタ' } })
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥3,000$/ }))
    await waitFor(() => expect(screen.getByPlaceholderText('例: アガベ チタノタ')).toHaveValue(''))
    fireEvent.click(screen.getByRole('button', { name: '仕入れ' }))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.getByText('仕入れ値')).toBeInTheDocument()
  })
})

describe('登録リストの種類（生産・仕入れ）の表示と絞り込み', () => {
  /** 3 ブランド・2 種類の登録（mode が null の古い記録も含む） */
  const LIST: PriceCalcEntry[] = [
    { id: 'l-1', brand: 'ei8htplants', plant_name: 'エイト生産', pot_artist_name: null, cost: 1500, selling_price: 3000, mode: 'production', created_at: '2026-10-25T00:00:00Z' },
    { id: 'l-2', brand: 'ei8htplants', plant_name: 'エイト仕入れ', pot_artist_name: null, cost: 1500, selling_price: 3800, mode: 'purchase', created_at: '2026-10-24T00:00:00Z' },
    { id: 'l-3', brand: 'habitatoides', plant_name: 'ハビタット生産', pot_artist_name: '山田陶房', cost: 4000, selling_price: 8000, mode: 'production', created_at: '2026-10-23T00:00:00Z' },
    { id: 'l-4', brand: 'hue', plant_name: 'ヒュー仕入れ', pot_artist_name: null, cost: 1500, selling_price: 3800, mode: 'purchase', created_at: '2026-10-22T00:00:00Z' },
    { id: 'l-5', brand: 'hue', plant_name: 'ヒュー古い記録', pot_artist_name: null, cost: 1000, selling_price: 2000, mode: null, created_at: '2026-10-01T00:00:00Z' },
  ]

  /**
   * 植物名の行の、ブランドの列（2 番目のセル）を返す
   * @param plantName - 植物名
   * @returns ブランドの列のセル
   */
  const brandCell = (plantName: string) => (screen.getByText(plantName).closest('tr') as HTMLElement).querySelectorAll('td')[1] as HTMLElement

  /**
   * 表に出ている植物名を上から順に返す
   * @returns 植物名の一覧
   */
  const listedPlants = () => screen.queryAllByRole('row').slice(1).map((r) => r.querySelector('td div')?.textContent)

  it('ブランドの列は 1 行目がブランド名、2 行目に「生産」「仕入れ」が出る', async () => {
    vi.mocked(api.priceCalcEntries.list).mockResolvedValue(LIST)
    render(<PriceCalc />)
    await screen.findByText('エイト生産')
    expect(Array.from(brandCell('エイト生産').children).map((c) => c.textContent)).toEqual(['ei8ht plants', '生産'])
    expect(Array.from(brandCell('エイト仕入れ').children).map((c) => c.textContent)).toEqual(['ei8ht plants', '仕入れ'])
    expect(Array.from(brandCell('ハビタット生産').children).map((c) => c.textContent)).toEqual(['Habitat Oides', '生産'])
    expect(Array.from(brandCell('ヒュー仕入れ').children).map((c) => c.textContent)).toEqual(['HUE', '仕入れ'])
  })

  it('mode が null の古い記録は、ブランドの列に 2 行目が無い', async () => {
    vi.mocked(api.priceCalcEntries.list).mockResolvedValue(LIST)
    render(<PriceCalc />)
    await screen.findByText('ヒュー古い記録')
    expect(Array.from(brandCell('ヒュー古い記録').children).map((c) => c.textContent)).toEqual(['HUE'])
  })

  it('絞り込みは「すべて」・ei8ht plants・Habitat Oides・HUE の 4 つで、初期は「すべて」（全件が出る）', async () => {
    vi.mocked(api.priceCalcEntries.list).mockResolvedValue(LIST)
    render(<PriceCalc />)
    await screen.findByText('エイト生産')
    const group = screen.getByRole('group', { name: '登録リストの絞り込み' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['すべて', 'ei8ht plants', 'Habitat Oides', 'HUE'])
    expect(listedPlants()).toEqual(['エイト生産', 'エイト仕入れ', 'ハビタット生産', 'ヒュー仕入れ', 'ヒュー古い記録'])
  })

  it.each([
    ['ei8ht plants', ['エイト生産', 'エイト仕入れ']],
    ['Habitat Oides', ['ハビタット生産']],
    ['HUE', ['ヒュー仕入れ', 'ヒュー古い記録']],
  ])('「%s」で絞り込むと、そのブランドの行だけが出る', async (name, plants) => {
    vi.mocked(api.priceCalcEntries.list).mockResolvedValue(LIST)
    render(<PriceCalc />)
    await screen.findByText('エイト生産')
    fireEvent.click(filterButton(name))
    expect(listedPlants()).toEqual(plants)
  })

  it('絞り込みを変えても計算フォームのブランドのタブは変わらず、「すべて」に戻すと全件が出る', async () => {
    vi.mocked(api.priceCalcEntries.list).mockResolvedValue(LIST)
    render(<PriceCalc />)
    await screen.findByText('エイト生産')
    fireEvent.click(filterButton('HUE'))
    // 計算フォームは ei8ht plants のまま
    expect(screen.getByPlaceholderText('例: アガベ チタノタ')).toBeInTheDocument()
    fireEvent.click(filterButton('すべて'))
    expect(listedPlants()).toHaveLength(5)
  })

  it('計算フォームのブランドのタブを変えても、絞り込みは変わらない', async () => {
    vi.mocked(api.priceCalcEntries.list).mockResolvedValue(LIST)
    render(<PriceCalc />)
    await screen.findByText('エイト生産')
    fireEvent.click(brandTab('HUE'))
    expect(listedPlants()).toHaveLength(5)
  })

  it('絞り込んだ結果が 0 件なら「このブランドの登録はありません。」が出る', async () => {
    vi.mocked(api.priceCalcEntries.list).mockResolvedValue(LIST.filter((e) => e.brand !== 'habitatoides'))
    render(<PriceCalc />)
    await screen.findByText('エイト生産')
    fireEvent.click(filterButton('Habitat Oides'))
    expect(screen.getByText('このブランドの登録はありません。')).toBeInTheDocument()
    expect(screen.queryByText('まだ登録されていません。')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('全体が 0 件なら、どの絞り込みでも「まだ登録されていません。」が出る', async () => {
    render(<PriceCalc />)
    await screen.findByText('まだ登録されていません。')
    fireEvent.click(filterButton('HUE'))
    expect(screen.getByText('まだ登録されていません。')).toBeInTheDocument()
    expect(screen.queryByText('このブランドの登録はありません。')).toBeNull()
  })

  it('計算フォームに書きかけがあっても、絞り込みの切り替えでは確認が出ず、入力も残る', async () => {
    vi.mocked(api.priceCalcEntries.list).mockResolvedValue(LIST)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<UnsavedChangesProvider><PriceCalc /></UnsavedChangesProvider>)
    await screen.findByText('エイト生産')
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: '書きかけ' } })
    fireEvent.click(filterButton('HUE'))
    fireEvent.click(filterButton('すべて'))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('例: アガベ チタノタ')).toHaveValue('書きかけ')
  })

  it('生産で登録すると mode「production」で送られ、登録リストの行のブランドの列に「生産」が出る', async () => {
    render(<PriceCalc />)
    await screen.findByText('まだ登録されていません。')
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: '新しい生産' } })
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥2,000$/ }))
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith(expect.objectContaining({ mode: 'production' })))
    await screen.findByText('新しい生産')
    expect(Array.from(brandCell('新しい生産').children).map((c) => c.textContent)).toEqual(['ei8ht plants', '生産'])
  })

  it.each([
    ['ei8ht plants', '例: アガベ チタノタ', '例: 1500'],
    ['Habitat Oides', '例: アガベ ポタトルム', '例: 3000'],
    ['HUE', '例: ユーフォルビア オベサ', '例: 3000'],
  ])('%s の仕入れで登録すると mode「purchase」で送られ、行に「仕入れ」が出る', async (brand, plantPh, pricePh) => {
    render(<PriceCalc />)
    await screen.findByText('まだ登録されていません。')
    fireEvent.click(brandTab(brand))
    fireEvent.click(screen.getByRole('button', { name: '仕入れ' }))
    fireEvent.change(screen.getByPlaceholderText(plantPh), { target: { value: '新しい仕入れ' } })
    fireEvent.change(screen.getByPlaceholderText(pricePh), { target: { value: '1500' } })
    const expectedPrice = brand === 'ei8ht plants' ? '¥4,500' : '¥3,800'
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^登録\\s+${expectedPrice.replace(',', ',')}$`) }))
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith(expect.objectContaining({ mode: 'purchase' })))
    await screen.findByText('新しい仕入れ')
    expect(Array.from(brandCell('新しい仕入れ').children).map((c) => c.textContent)).toEqual([brand, '仕入れ'])
  })
})
