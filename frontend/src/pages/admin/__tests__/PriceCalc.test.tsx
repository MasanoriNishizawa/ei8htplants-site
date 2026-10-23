/**
 * 管理画面「販売価格計算」（pages/admin/PriceCalc.tsx）の画面のテスト
 * - 推奨価格の見出し「推奨販売価格（原価率 40% 以下）」・推奨価格（原価 ÷ 0.4 をキリの良い値に切り上げ）・その原価率
 * - 任意価格を入れたときの「登録価格: ¥x,xxx（原価率 xx.x%）」と、40% を超えたときの注意（登録は止めない）
 * - HUE のタブ: 植物名・植物仕入れ値・鉢仕入れ値の計算フォーム（鉢作家の選択は無い）と登録時に送る内容
 * - Habitat Oides のタブ: 鉢作家を選べて、選んだ作家名が送られる
 * - 登録リストの植物名の下の 2 行目（鉢作家名 or「量産鉢」）は Habitat Oides の行だけ
 * - HUE の書きかけ保護（タブの切り替えで確認が出る・登録に成功したら出ない）
 * - 目標原価率の欄（初期値 40%・変えると見出しと推奨価格と注意が変わる・使えない値・localStorage の保存と復元・
 *   「40% に戻す」・書きかけ扱いしない・タブを切り替えても残る）
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
const toEntry = (body: PriceCalcEntryBody): PriceCalcEntry => ({ ...body, id: `new-${body.plant_name}`, created_at: '2026-10-23T00:00:00Z' })

/**
 * 計算フォームの金額の入力欄（type="number"）を上から順に返す
 * - ei8ht plants（仕入れ）: [仕入れ値, 任意価格]
 * - Habitat Oides・HUE: [植物仕入れ値, 鉢仕入れ値, 任意価格]
 * @returns 金額の入力欄の一覧
 */
const numberInputs = () => screen.getAllByRole('spinbutton')

/**
 * HUE のタブを開く（何も入力していないので確認は出ない）
 */
const openHue = () => {
  fireEvent.click(screen.getByRole('button', { name: 'HUE' }))
  // HUE の植物名の placeholder が出るまで待たずに使えるよう、ここで確かめておく
  expect(screen.getByPlaceholderText('例: ユーフォルビア オベサ')).toBeInTheDocument()
}

beforeEach(() => {
  // 目標原価率はこのブラウザ（localStorage）に覚えるので、テストごとに消して既定の 40% から始める
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
    render(<PriceCalc />)
    await screen.findByText('まだ登録されていません。')
    expect(screen.getByText('推奨販売価格（原価率 40% 以下）')).toBeInTheDocument()
    expect(screen.getByText('¥ —')).toBeInTheDocument()
    expect(screen.queryByText(/^原価率 \d/)).toBeNull()
  })

  it('ei8ht plants で仕入れ値 1,500 円を入れると推奨価格は ¥3,800（原価 × 2 の ¥3,000 でも 500 円単位の ¥4,000 でもない）、原価率 39.5% になる', async () => {
    render(<PriceCalc />)
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    expect(screen.getByText('¥3,800')).toBeInTheDocument()
    expect(screen.queryByText('¥3,000')).toBeNull()
    expect(screen.queryByText('¥4,000')).toBeNull()
    expect(screen.getByText('原価率 39.5%')).toBeInTheDocument()
    // 登録ボタンにも推奨価格が出る
    expect(screen.getByRole('button', { name: /^登録\s+¥3,800$/ })).toBeInTheDocument()
  })

  it('仕入れ値 400 円（ちょうど割り切れる）なら推奨価格は ¥1,000 で上に跳ねず、原価率 40.0% になる', async () => {
    render(<PriceCalc />)
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '400' } })
    expect(screen.getByText('¥1,000')).toBeInTheDocument()
    expect(screen.getByText('原価率 40.0%')).toBeInTheDocument()
  })

  it('仕入れ値 5,000 円なら 100 円単位で ¥12,500、原価率 40.0% になる', async () => {
    render(<PriceCalc />)
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '5000' } })
    expect(screen.getByText('¥12,500')).toBeInTheDocument()
    expect(screen.getByText('原価率 40.0%')).toBeInTheDocument()
  })

  it('実生で種子 20 粒 600 円（1 粒 30 円）なら見出しは「上代（種子 20粒の値段）」で、上代は 600 円そのまま（¥600）、原価率 5.0% になる', async () => {
    render(<PriceCalc />)
    fireEvent.click(screen.getByRole('radio', { name: '実生' }))
    fireEvent.change(screen.getByPlaceholderText('例: 600'), { target: { value: '600' } })
    expect(screen.getByText('1粒あたり ¥30')).toBeInTheDocument()
    expect(screen.getByText('上代（種子 20粒の値段）')).toBeInTheDocument()
    expect(screen.queryByText(/^推奨販売価格（/)).toBeNull()
    expect(screen.getByText('¥600')).toBeInTheDocument()
    expect(screen.queryByText('¥100')).toBeNull()
    expect(screen.getByText('原価率 5.0%')).toBeInTheDocument()
  })

  it('仕入れ値が 0 なら推奨価格は「¥ —」のままで、植物名があっても登録ボタンは押せない', async () => {
    render(<PriceCalc />)
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'アガベ' } })
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '0' } })
    expect(screen.getByText('¥ —')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '登録' })).toBeDisabled()
  })
})

describe('任意価格の原価率と超過の注意', () => {
  it('任意価格を入れる前は「登録価格」も注意も出ない', async () => {
    render(<PriceCalc />)
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    expect(screen.queryByText(/^登録価格:/)).toBeNull()
    expect(screen.queryByText('原価率が 40% を超えています')).toBeNull()
    // 任意価格の placeholder には推奨価格が出る
    expect(numberInputs()[1]).toHaveAttribute('placeholder', '3800')
  })

  it('原価 1,500 円に任意価格 5,000 円なら「登録価格: ¥5,000（原価率 30.0%）」で、注意は出ない', async () => {
    render(<PriceCalc />)
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    fireEvent.change(numberInputs()[1], { target: { value: '5000' } })
    expect(screen.getByText('登録価格: ¥5,000（原価率 30.0%）')).toBeInTheDocument()
    expect(screen.queryByText('原価率が 40% を超えています')).toBeNull()
    expect(screen.getByRole('button', { name: /^登録\s+¥5,000$/ })).toBeInTheDocument()
  })

  it('原価 400 円に任意価格 1,000 円（ちょうど 40%）なら注意は出ない', async () => {
    render(<PriceCalc />)
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '400' } })
    fireEvent.change(numberInputs()[1], { target: { value: '1000' } })
    expect(screen.getByText('登録価格: ¥1,000（原価率 40.0%）')).toBeInTheDocument()
    expect(screen.queryByText('原価率が 40% を超えています')).toBeNull()
  })

  it('原価 1,500 円に任意価格 3,000 円（50%）なら「原価率が 40% を超えています」が出るが、登録はでき、その価格で送られる', async () => {
    render(<PriceCalc />)
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
      brand: 'ei8htplants', plant_name: 'アガベ チタノタ', pot_artist_name: null, cost: 1500, selling_price: 3000,
    })
  })

  it('原価 401 円に任意価格 1,000 円（40.1%）なら注意が出る', async () => {
    render(<PriceCalc />)
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '401' } })
    fireEvent.change(numberInputs()[1], { target: { value: '1000' } })
    expect(screen.getByText('登録価格: ¥1,000（原価率 40.1%）')).toBeInTheDocument()
    expect(screen.getByText('原価率が 40% を超えています')).toBeInTheDocument()
  })

  it('原価を入れずに任意価格だけ入れても、原価率と注意は出ない', async () => {
    render(<PriceCalc />)
    fireEvent.change(numberInputs()[1], { target: { value: '3000' } })
    // 見出しの「原価率 40% 以下」以外に、原価率の数値・登録価格の原価率・注意は出ない
    expect(screen.queryByText(/原価率 \d+\.\d%/)).toBeNull()
    expect(screen.queryByText('原価率が 40% を超えています')).toBeNull()
  })
})

describe('HUE の計算フォーム', () => {
  it('HUE のタブには植物名・植物仕入れ値・鉢仕入れ値があり、鉢作家の選択（select）は無い', async () => {
    render(<PriceCalc />)
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
    render(<PriceCalc />)
    openHue()
    fireEvent.change(screen.getByPlaceholderText('例: 3000'), { target: { value: '1000' } })
    fireEvent.change(screen.getByPlaceholderText('例: 5000'), { target: { value: '500' } })
    expect(screen.getByText('¥3,800')).toBeInTheDocument()
    expect(screen.getByText('原価率 39.5%')).toBeInTheDocument()
  })

  it('登録すると brand「hue」・鉢作家 null・原価は植物 + 鉢で送られ、成功したら入力が空になり登録リストに HUE の行が出る', async () => {
    render(<PriceCalc />)
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
      brand: 'hue', plant_name: 'オベサ', pot_artist_name: null, cost: 1500, selling_price: 3800,
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
    render(<PriceCalc />)
    openHue()
    fireEvent.change(screen.getByPlaceholderText('例: ユーフォルビア オベサ'), { target: { value: 'オベサ' } })
    fireEvent.change(screen.getByPlaceholderText('例: 3000'), { target: { value: '300' } })
    // 推奨価格は 300 ÷ 0.4 = 750 → ¥800
    expect(screen.getByText('¥800')).toBeInTheDocument()
    fireEvent.change(numberInputs()[2], { target: { value: '1200' } })
    expect(screen.getByText('登録価格: ¥1,200（原価率 25.0%）')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥1,200$/ }))
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'hue', plant_name: 'オベサ', pot_artist_name: null, cost: 300, selling_price: 1200,
    }))
  })

  it('植物名が空、または植物と鉢の仕入れ値が両方空なら登録ボタンは押せない', async () => {
    render(<PriceCalc />)
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
    render(<PriceCalc />)
    await waitFor(() => expect(api.potArtists.list).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Habitat Oides' }))
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
      brand: 'habitatoides', plant_name: 'ポタトルム', pot_artist_name: '佐藤窯', cost: 8000, selling_price: 20000,
    }))
  })

  it('鉢作家を選ばずに登録すると pot_artist_name は null で送られる', async () => {
    render(<PriceCalc />)
    fireEvent.click(screen.getByRole('button', { name: 'Habitat Oides' }))
    fireEvent.change(screen.getByPlaceholderText('例: アガベ ポタトルム'), { target: { value: 'ポタトルム' } })
    fireEvent.change(screen.getByPlaceholderText('例: 3000'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥3,800$/ }))
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'habitatoides', plant_name: 'ポタトルム', pot_artist_name: null, cost: 1500, selling_price: 3800,
    }))
  })
})

describe('登録リストの植物名の下の 2 行目', () => {
  /** 3 ブランド分の登録（Habitat Oides は作家あり・量産鉢の 2 件） */
  const ENTRIES: PriceCalcEntry[] = [
    { id: 'e-1', brand: 'habitatoides', plant_name: 'ハビタット作家鉢', pot_artist_name: '山田陶房', cost: 8000, selling_price: 20000, created_at: '2026-10-23T00:00:00Z' },
    { id: 'e-2', brand: 'habitatoides', plant_name: 'ハビタット量産鉢', pot_artist_name: null, cost: 1500, selling_price: 3800, created_at: '2026-10-22T00:00:00Z' },
    { id: 'e-3', brand: 'ei8htplants', plant_name: 'エイトの植物', pot_artist_name: null, cost: 1500, selling_price: 3800, created_at: '2026-10-21T00:00:00Z' },
    { id: 'e-4', brand: 'hue', plant_name: 'ヒューの植物', pot_artist_name: null, cost: 1500, selling_price: 3800, created_at: '2026-10-20T00:00:00Z' },
    // 古いデータなどで HUE に作家名が入っていても 2 行目は出さない
    { id: 'e-5', brand: 'hue', plant_name: 'ヒュー作家名あり', pot_artist_name: '佐藤窯', cost: 1500, selling_price: 3800, created_at: '2026-10-19T00:00:00Z' },
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
    render(<UnsavedChangesProvider><PriceCalc /></UnsavedChangesProvider>)
    openHue()
    fireEvent.change(screen.getByPlaceholderText('例: ユーフォルビア オベサ'), { target: { value: 'オベサ' } })
    fireEvent.click(screen.getByRole('button', { name: 'ei8ht plants' }))
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_LEAVE_MESSAGE)
    expect(screen.getByPlaceholderText('例: ユーフォルビア オベサ')).toHaveValue('オベサ')
    expect(screen.queryByPlaceholderText('例: アガベ チタノタ')).toBeNull()
  })

  it('HUE で鉢仕入れ値だけ入れても確認が出て、OK を押すと切り替わり、戻ると HUE の入力は消えている', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<UnsavedChangesProvider><PriceCalc /></UnsavedChangesProvider>)
    openHue()
    fireEvent.change(screen.getByPlaceholderText('例: 5000'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Habitat Oides' }))
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(await screen.findByPlaceholderText('例: アガベ ポタトルム')).toBeInTheDocument()
    // Habitat Oides は何も入れていないので確認なしで HUE に戻れ、入力は作り直されている
    fireEvent.click(screen.getByRole('button', { name: 'HUE' }))
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByPlaceholderText('例: 5000')).toHaveValue(null)
  })

  it('HUE で登録に成功したあとは、タブを切り替えても確認が出ない', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<UnsavedChangesProvider><PriceCalc /></UnsavedChangesProvider>)
    openHue()
    fireEvent.change(screen.getByPlaceholderText('例: ユーフォルビア オベサ'), { target: { value: 'オベサ' } })
    fireEvent.change(screen.getByPlaceholderText('例: 3000'), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥2,500$/ }))
    await waitFor(() => expect(screen.getByPlaceholderText('例: ユーフォルビア オベサ')).toHaveValue(''))
    fireEvent.click(screen.getByRole('button', { name: 'ei8ht plants' }))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('例: アガベ チタノタ')).toBeInTheDocument()
  })

  it('HUE で何も入れていなければ、確認なしでタブを切り替えられる', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<UnsavedChangesProvider><PriceCalc /></UnsavedChangesProvider>)
    openHue()
    fireEvent.click(screen.getByRole('button', { name: 'Habitat Oides' }))
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

  it('初期値は 40 で、「40% に戻す」ボタンは出ず、見出しは「推奨販売価格（原価率 40% 以下）」', async () => {
    render(<PriceCalc />)
    expect(rateInput()).toHaveValue('40')
    expect(rateInput()).toHaveAttribute('inputmode', 'decimal')
    expect(screen.queryByRole('button', { name: '40% に戻す' })).toBeNull()
    expect(screen.getByText('推奨販売価格（原価率 40% 以下）')).toBeInTheDocument()
  })

  it('35 に変えると見出しが「原価率 35% 以下」になり、原価 1,500 円の推奨価格は ¥4,300（原価率 34.9%）になる', async () => {
    render(<PriceCalc />)
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    expect(screen.getByText('¥3,800')).toBeInTheDocument()
    fireEvent.change(rateInput(), { target: { value: '35' } })
    expect(screen.getByText('推奨販売価格（原価率 35% 以下）')).toBeInTheDocument()
    expect(screen.getByText('¥4,300')).toBeInTheDocument()
    expect(screen.getByText('原価率 34.9%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^登録\s+¥4,300$/ })).toBeInTheDocument()
  })

  it('37.5 のような小数も使え、見出しは「原価率 37.5% 以下」になる', async () => {
    render(<PriceCalc />)
    fireEvent.change(rateInput(), { target: { value: '37.5' } })
    expect(screen.getByText('推奨販売価格（原価率 37.5% 以下）')).toBeInTheDocument()
    // 1500 ÷ 0.375 = 4000 → ¥4,000
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    expect(screen.getByText('¥4,000')).toBeInTheDocument()
  })

  it('目標 35% で任意価格の原価率が 35% を超えると「原価率が 35% を超えています」が出て、ちょうど 35% なら出ない', async () => {
    render(<PriceCalc />)
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
      render(<PriceCalc />)
      fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'アガベ' } })
      fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
      fireEvent.change(rateInput(), { target: { value } })
      expect(screen.getByText('¥ —')).toBeInTheDocument()
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
    render(<PriceCalc />)
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'アガベ' } })
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    fireEvent.change(rateInput(), { target: { value: '' } })
    fireEvent.change(rateInput(), { target: { value: '50' } })
    expect(screen.queryByText('0 より大きく 100 以下の数を入れてください')).toBeNull()
    expect(screen.getByText('¥3,000')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥3,000$/ }))
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'ei8htplants', plant_name: 'アガベ', pot_artist_name: null, cost: 1500, selling_price: 3000,
    }))
  })

  it('「40% に戻す」は 40 と違うときだけ出て、押すと 40 に戻り見出しと推奨価格も戻る', async () => {
    render(<PriceCalc />)
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    fireEvent.change(rateInput(), { target: { value: '35' } })
    fireEvent.click(screen.getByRole('button', { name: '40% に戻す' }))
    expect(rateInput()).toHaveValue('40')
    expect(screen.queryByRole('button', { name: '40% に戻す' })).toBeNull()
    expect(screen.getByText('推奨販売価格（原価率 40% 以下）')).toBeInTheDocument()
    expect(screen.getByText('¥3,800')).toBeInTheDocument()
    expect(localStorage.getItem('price-calc-cost-rate')).toBe('40')
  })

  it.each([['40.0'], ['４０'], [' 40 ']])('「%s」は 40% と同じ率なので「40% に戻す」は出ず、見出しは「原価率 40% 以下」', async (value) => {
    render(<PriceCalc />)
    fireEvent.change(rateInput(), { target: { value } })
    expect(screen.queryByRole('button', { name: '40% に戻す' })).toBeNull()
    expect(screen.queryByText('0 より大きく 100 以下の数を入れてください')).toBeNull()
    expect(screen.getByText('推奨販売価格（原価率 40% 以下）')).toBeInTheDocument()
  })

  it('全角で「３５」と入れても 35% として計算する（原価 1,500 円 → ¥4,300）', async () => {
    render(<PriceCalc />)
    fireEvent.change(rateInput(), { target: { value: '３５' } })
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    expect(screen.getByText('推奨販売価格（原価率 35% 以下）')).toBeInTheDocument()
    expect(screen.getByText('¥4,300')).toBeInTheDocument()
  })

  it.each([['1e2'], ['0x28'], ['0.00004']])('「%s」は使えない値として案内が出て、推奨価格は「¥ —」', async (value) => {
    render(<PriceCalc />)
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '1500' } })
    fireEvent.change(rateInput(), { target: { value } })
    expect(screen.getByText('0 より大きく 100 以下の数を入れてください')).toBeInTheDocument()
    expect(screen.getByText('¥ —')).toBeInTheDocument()
  })

  it('変えた率は localStorage（price-calc-cost-rate）に保存され、開き直すとその率から始まる', async () => {
    const { unmount } = render(<PriceCalc />)
    fireEvent.change(rateInput(), { target: { value: '35' } })
    expect(localStorage.getItem('price-calc-cost-rate')).toBe('35')
    unmount()
    render(<PriceCalc />)
    expect(rateInput()).toHaveValue('35')
    expect(screen.getByText('推奨販売価格（原価率 35% 以下）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '40% に戻す' })).toBeInTheDocument()
  })

  it('使えない値は保存されず、開き直すと前に保存した率から始まる', async () => {
    const { unmount } = render(<PriceCalc />)
    fireEvent.change(rateInput(), { target: { value: '35' } })
    fireEvent.change(rateInput(), { target: { value: '150' } })
    expect(localStorage.getItem('price-calc-cost-rate')).toBe('35')
    unmount()
    render(<PriceCalc />)
    expect(rateInput()).toHaveValue('35')
  })

  it('localStorage に使えない値が入っていれば 40 から始まる', async () => {
    localStorage.setItem('price-calc-cost-rate', '0')
    render(<PriceCalc />)
    expect(rateInput()).toHaveValue('40')
  })

  it('率だけ変えても書きかけ扱いにならず、タブを切り替えても確認は出ない', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<UnsavedChangesProvider><PriceCalc /></UnsavedChangesProvider>)
    fireEvent.change(rateInput(), { target: { value: '35' } })
    fireEvent.click(screen.getByRole('button', { name: 'HUE' }))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('例: ユーフォルビア オベサ')).toBeInTheDocument()
  })

  it('タブを切り替えても率は残り、HUE の推奨価格と登録にもその率が使われる', async () => {
    render(<PriceCalc />)
    fireEvent.change(rateInput(), { target: { value: '35' } })
    openHue()
    expect(rateInput()).toHaveValue('35')
    expect(screen.getByText('推奨販売価格（原価率 35% 以下）')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('例: ユーフォルビア オベサ'), { target: { value: 'オベサ' } })
    fireEvent.change(screen.getByPlaceholderText('例: 3000'), { target: { value: '1000' } })
    fireEvent.change(screen.getByPlaceholderText('例: 5000'), { target: { value: '500' } })
    // 1500 ÷ 0.35 = 4285.7… → ¥4,300
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥4,300$/ }))
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'hue', plant_name: 'オベサ', pot_artist_name: null, cost: 1500, selling_price: 4300,
    }))
    // Habitat Oides に切り替えても 35 のまま
    fireEvent.click(screen.getByRole('button', { name: 'Habitat Oides' }))
    expect(rateInput()).toHaveValue('35')
  })
})

describe('ei8ht plants の実生（種子 20 粒の値段を上代にする）', () => {
  /**
   * 実生に切り替えて種子 20 粒の金額を入れる
   * @param price - 種子 20 粒の金額（文字のまま）
   */
  const enterSeed = (price: string) => {
    fireEvent.click(screen.getByRole('radio', { name: '実生' }))
    fireEvent.change(screen.getByPlaceholderText('例: 600'), { target: { value: price } })
  }

  it('種子の金額を入れる前は見出しが「上代（種子 20粒の値段）」で「¥ —」、登録ボタンは押せない', async () => {
    render(<PriceCalc />)
    fireEvent.click(screen.getByRole('radio', { name: '実生' }))
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'パキポディウム' } })
    expect(screen.getByText('上代（種子 20粒の値段）')).toBeInTheDocument()
    expect(screen.getByText('¥ —')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '登録' })).toBeDisabled()
  })

  it('登録すると元値は 1 粒の値段（cost 30）、販売価格は 20 粒の値段（selling_price 600）で送られる', async () => {
    render(<PriceCalc />)
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'パキポディウム' } })
    enterSeed('600')
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥600$/ }))
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'ei8htplants', plant_name: 'パキポディウム', pot_artist_name: null, cost: 30, selling_price: 600,
    }))
  })

  it('100 円に満たない金額（20 粒 70 円）も切り上げず ¥70 のまま上代になる', async () => {
    render(<PriceCalc />)
    enterSeed('70')
    expect(screen.getByText('¥70')).toBeInTheDocument()
    expect(screen.getByText('原価率 5.0%')).toBeInTheDocument()
  })

  it('キリの悪い金額（20 粒 1,234 円）も切り上げず ¥1,234 のまま上代になる', async () => {
    render(<PriceCalc />)
    enterSeed('1234')
    expect(screen.getByText('¥1,234')).toBeInTheDocument()
    expect(screen.queryByText('¥1,300')).toBeNull()
  })

  it('目標原価率を 35 に変えても上代は ¥600 のままで、見出しも「上代（種子 20粒の値段）」のまま', async () => {
    render(<PriceCalc />)
    enterSeed('600')
    fireEvent.change(screen.getByRole('textbox', { name: '目標原価率（%）' }), { target: { value: '35' } })
    expect(screen.getByText('¥600')).toBeInTheDocument()
    expect(screen.getByText('上代（種子 20粒の値段）')).toBeInTheDocument()
    expect(screen.queryByText('推奨販売価格（原価率 35% 以下）')).toBeNull()
    expect(screen.getByText('原価率 5.0%')).toBeInTheDocument()
  })

  it('目標原価率が正しくない（空）ときも上代 ¥600 は出るが、登録ボタンは押せない', async () => {
    render(<PriceCalc />)
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'パキポディウム' } })
    enterSeed('600')
    fireEvent.change(screen.getByRole('textbox', { name: '目標原価率（%）' }), { target: { value: '' } })
    expect(screen.getByText('¥600')).toBeInTheDocument()
    expect(screen.getByText('0 より大きく 100 以下の数を入れてください')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^登録/ })).toBeDisabled()
  })

  it('任意価格で上書きでき、原価率が目標を超えると注意が出る（1 粒 30 円・任意価格 50 円 = 60.0%）が登録はできる', async () => {
    render(<PriceCalc />)
    fireEvent.change(screen.getByPlaceholderText('例: アガベ チタノタ'), { target: { value: 'パキポディウム' } })
    enterSeed('600')
    fireEvent.change(numberInputs()[1], { target: { value: '50' } })
    expect(screen.getByText('登録価格: ¥50（原価率 60.0%）')).toBeInTheDocument()
    expect(screen.getByText('原価率が 40% を超えています')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^登録\s+¥50$/ }))
    await waitFor(() => expect(api.priceCalcEntries.add).toHaveBeenCalledWith({
      brand: 'ei8htplants', plant_name: 'パキポディウム', pot_artist_name: null, cost: 30, selling_price: 50,
    }))
  })

  it('任意価格 1,000 円（原価率 3.0%）なら注意は出ない', async () => {
    render(<PriceCalc />)
    enterSeed('600')
    fireEvent.change(numberInputs()[1], { target: { value: '1000' } })
    expect(screen.getByText('登録価格: ¥1,000（原価率 3.0%）')).toBeInTheDocument()
    expect(screen.queryByText(/を超えています/)).toBeNull()
  })

  it('仕入れに戻すと見出しは「推奨販売価格（原価率 40% 以下）」に戻り、仕入れ値は目標原価率から計算される', async () => {
    render(<PriceCalc />)
    enterSeed('600')
    fireEvent.click(screen.getByRole('radio', { name: '仕入れ' }))
    expect(screen.getByText('推奨販売価格（原価率 40% 以下）')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('例: 1500'), { target: { value: '600' } })
    // 600 ÷ 0.4 = 1,500
    expect(screen.getByText('¥1,500')).toBeInTheDocument()
  })
})
