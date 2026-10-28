import { useState, useEffect } from 'react'
import { useConfirmLeave } from './UnsavedChanges'
import { api, type PotArtist, type PriceCalcEntry, type PriceCalcEntryBody, type PriceCalcMode } from '../../lib/api'
import { BRAND } from '../../lib/brands'
import {
  loadCostRateInput, parseCostRateInput, saveCostRateInput,
} from '../../lib/priceCalc'
import { failMessage } from './errorMessage'
import { PriceCalcEntriesList } from './PriceCalcEntriesList'
import {
  CostRateField, Ei8htPlantsPurchaseCalc, PLANT_PLACEHOLDERS, PlantPotCalc, ProductionCalc,
  SEEDLING_BRANDS, SeedlingCalc, type Brand,
} from './PriceCalcForms'

/** 計算の種類（production: 自分たちで生産して卸価格から決める、purchase: 仕入れて目標原価率から決める、seedling: 種から育てて種子の値段から決める） */
type CalcMode = PriceCalcMode
/** 登録リストの絞り込み（all: すべてのブランド、それ以外はそのブランドだけ） */
type ListFilter = Brand | 'all'

/** ブランドのキー → 表示名（短い表記）。保存済みの記録の brand（文字列）でも引けるよう string のキーにする */
const BRAND_LABELS: Readonly<Record<string, string>> = {
  ei8htplants: BRAND.ei8htPlants.shortName,
  habitatoides: BRAND.habitatOides.shortName,
  hue: BRAND.hue.shortName,
}

/** 画面上部のブランドの切り替えタブ */
const TABS: { id: Brand; label: string }[] = (['ei8htplants', 'habitatoides', 'hue'] as const).map((id) => ({ id, label: BRAND_LABELS[id] }))

/** 計算の種類 → 表示名（2 段目のタブの文言と、登録リストのブランドの列の 2 行目に使う） */
const MODE_LABELS: Readonly<Record<CalcMode, string>> = { production: '生産', purchase: '仕入れ', seedling: '実生' }

/**
 * ブランドのタブの下の、計算の種類の切り替えタブ（2 段目）を返す
 * 並びは 生産 → 仕入れ → 実生。実生は SEEDLING_BRANDS のブランドだけ
 * @param brand - 選んでいるブランド
 * @returns タブの id と表示名
 */
const modeTabsFor = (brand: Brand): { id: CalcMode; label: string }[] =>
  (['production', 'purchase', 'seedling'] as const)
    .filter((id) => id !== 'seedling' || SEEDLING_BRANDS.includes(brand))
    .map((id) => ({ id, label: MODE_LABELS[id] }))

/** 登録リストの絞り込みの切り替え（「すべて」とブランドのタブ。初期は「すべて」） */
const LIST_FILTER_TABS: { id: ListFilter; label: string }[] = [{ id: 'all', label: 'すべて' }, ...TABS]

/**
 * 切り替えタブの並び（ブランドのタブ・2 段目の生産・仕入れ・実生のタブ・登録リストの絞り込みで共通）
 *   計算フォームのブランドのタブと同じ文言のボタンが並ぶとき、テストや読み上げで区別できるようにする）
 * @param tabs - タブの id と表示名
 * @param current - 選んでいるタブの id
 * @param onSelect - 選んでいないタブを押したときのコールバック（書きかけの確認は呼び出し側で行う）
 * @param small - 2 段目のタブとして小さく出すか（文字 13px・下線 1px・余白を詰める）
 * @param groupLabel - 指定すると role="group" と aria-label を付ける（登録リストの絞り込みなどで、同じ名前のタブ群を区別する）
 * @returns タブのボタンの並び
 */
function TabBar<T extends string>({ tabs, current, onSelect, small = false, groupLabel }: {
  tabs: { id: T; label: string }[]
  current: T
  onSelect: (id: T) => void
  small?: boolean
  groupLabel?: string
}) {
  /** 選んでいるタブの下線の太さ（2 段目は細くする） */
  const lineWidth = small ? 1 : 2

  return (
    <div
      role={groupLabel ? 'group' : undefined} aria-label={groupLabel}
      style={{ display: 'flex', gap: 0, marginBottom: small ? 24 : 16, borderBottom: '1px solid #dddde8' }}
    >
      {tabs.map(({ id, label }) => (
        <button
          key={id} onClick={() => { if (id !== current) onSelect(id) }}
          style={{
            padding: small ? '8px 16px' : '10px 20px', background: 'none', border: 'none',
            borderBottom: `${lineWidth}px solid ${current === id ? '#1c2417' : 'transparent'}`,
            cursor: 'pointer', fontSize: small ? 13 : 14,
            fontWeight: current === id ? 600 : 400,
            color: current === id ? '#1c2417' : '#888',
            marginBottom: -1, transition: 'color 0.15s',
            fontFamily: 'inherit', letterSpacing: 0.5,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/**
 * ブランド別の販売価格計算ツール。生産は卸価格の 2 倍、仕入れは仕入れ値とブランドごとの目標原価率から推奨価格、
 * 実生は種子の値段（Habitat Oides は + 鉢）を上代として算出し、登録リストとして保存する
 * @returns ブランドのタブ・生産／仕入れ／実生のタブ・（目標原価率）・計算フォーム・登録リスト
 */
export default function PriceCalc() {
  /** 表示中のブランドのタブ */
  const [tab, setTab] = useState<Brand>('ei8htplants')
  /** 表示中の計算の種類（生産・仕入れ・実生）。ブランドを切り替えてもそのまま（実生の無い HUE へ切り替えたときだけ生産に戻す） */
  const [mode, setMode] = useState<CalcMode>('production')
  /** 登録リスト（新しい順） */
  const [entries, setEntries] = useState<PriceCalcEntry[]>([])
  /** 登録リストの絞り込み（計算フォームのブランドのタブとは別に持つ。画面の中だけで絞り込み、API は変えない） */
  const [listFilter, setListFilter] = useState<ListFilter>('all')
  /** 絞り込んだ登録リスト */
  const filteredEntries = listFilter === 'all' ? entries : entries.filter((e) => e.brand === listFilter)
  /** 鉢の作家の一覧（Habitat Oides の計算の選択肢） */
  const [potArtists, setPotArtists] = useState<PotArtist[]>([])
  /** 登録リストを読み込み中なら true */
  const [loadingEntries, setLoadingEntries] = useState(true)
  /** 読み込み・登録・削除の失敗の文言。null なら出さない */
  const [error, setError] = useState<string | null>(null)
  /** 書きかけの計算フォームがあれば確認する関数（タブを切り替えると入力が消えるため） */
  const confirmLeave = useConfirmLeave()
  /**
   * ブランドごとの目標原価率の入力（% の数値の文字列）。初期値はこのブラウザに覚えさせた値
   * （無ければそのブランドの既定値: ei8ht plants は 33.4、ほかは 40）。タブを切り替えても残る
   */
  const [costRateInputs, setCostRateInputs] = useState<Record<Brand, string>>(() => ({
    ei8htplants: loadCostRateInput('ei8htplants'),
    habitatoides: loadCostRateInput('habitatoides'),
    hue: loadCostRateInput('hue'),
  }))
  /** 表示中のブランドの目標原価率（0.4 = 40%）。入力が正しくなければ null で、仕入れのフォームは推奨価格を出さず登録もできない */
  const maxRate = parseCostRateInput(costRateInputs[tab])

  /**
   * 表示中のブランドの目標原価率の入力を変え、正しい値ならこのブラウザに覚えさせる
   * @param v - 入力欄の文字列（% の数値）
   * @returns 戻り値なし。
   */
  const handleCostRateChange = (v: string) => {
    setCostRateInputs((prev) => ({ ...prev, [tab]: v }))
    saveCostRateInput(tab, v)
  }

  // 鉢の作家と登録リストを読み込む（失敗したら文言を出し、空のリストと区別できるようにする）
  useEffect(() => {
    api.potArtists.list().then(setPotArtists)
      .catch((e: unknown) => setError(failMessage('鉢の作家の読み込みに失敗しました', e)))
    api.priceCalcEntries.list()
      .then(setEntries)
      .catch((e: unknown) => setError(failMessage('登録リストの読み込みに失敗しました', e)))
      .finally(() => setLoadingEntries(false))
  }, [])

  /**
   * 計算結果を登録リストに追加する。失敗したら文言を出してから投げ直す（呼び出し側は入力を残す）
   * @param data - 登録する内容
   * @returns 登録が終わる Promise（失敗したら reject する）
   */
  const handleRegister = async (data: PriceCalcEntryBody) => {
    setError(null)
    try {
      /** 登録された記録 */
      const entry = await api.priceCalcEntries.add(data)
      setEntries((prev) => [entry, ...prev])
    } catch (e: unknown) {
      setError(failMessage('登録に失敗しました', e))
      throw e
    }
  }

  /**
   * 確認してから登録を 1 件削除する。失敗したらリストはそのままにして文言を出す
   * @param id - 削除する登録の id
   * @returns 戻り値なし。
   */
  const handleDelete = async (id: string) => {
    if (!confirm('この登録を削除しますか？')) return
    setError(null)
    try {
      await api.priceCalcEntries.delete(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } catch (e: unknown) {
      setError(failMessage('削除に失敗しました', e))
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 28px', letterSpacing: 1 }}>
        販売価格計算
      </h1>

      {/* 読み込み・登録・削除の失敗 */}
      {error && (
        <p role="alert" style={{ color: '#c0392b', fontSize: 13, margin: '0 0 16px', padding: '8px 14px', background: '#fdf0ee', borderRadius: 4, border: '1px solid #f5c6c0' }}>{error}</p>
      )}

      {/* ブランドの切り替えタブ（書きかけなら切り替える前に確認する）。
          実生の無いブランド（HUE）へ実生のまま切り替えたら、種類を生産に戻す */}
      <TabBar
        tabs={TABS} current={tab}
        onSelect={(id) => {
          if (!confirmLeave()) return
          setTab(id)
          if (mode === 'seedling' && !SEEDLING_BRANDS.includes(id)) setMode('production')
        }}
      />

      {/* 2 段目: 生産・仕入れ・実生の切り替えタブ（実生は ei8ht plants・Habitat Oides だけ。ブランドのタブと同じく、書きかけなら確認する） */}
      <TabBar tabs={modeTabsFor(tab)} current={mode} onSelect={(id) => { if (confirmLeave()) setMode(id) }} small />

      {/* 表示中のブランドの目標原価率（仕入れだけで使う。生産・実生では隠すが値と保存は残る。書きかけの確認の対象にはしない） */}
      {mode === 'purchase' && <CostRateField value={costRateInputs[tab]} onChange={handleCostRateChange} brand={tab} />}

      {/* 選んだブランド・種類の計算フォーム。key をブランド＋種類にして、切り替えたら入力を作り直す（入力が混ざらないように） */}
      {mode === 'production' && (
        <ProductionCalc
          key={`${tab}-production`} brand={tab} withPotArtist={tab === 'habitatoides'}
          plantPlaceholder={PLANT_PLACEHOLDERS[tab]} potArtists={potArtists} onRegister={handleRegister}
        />
      )}
      {mode === 'purchase' && tab === 'ei8htplants' && (
        <Ei8htPlantsPurchaseCalc
          key="ei8htplants-purchase" plantPlaceholder={PLANT_PLACEHOLDERS.ei8htplants}
          maxRate={maxRate} onRegister={handleRegister}
        />
      )}
      {/* Habitat Oides と HUE の仕入れは同じ PlantPotCalc（鉢作家の欄は Habitat Oides だけ） */}
      {mode === 'purchase' && tab !== 'ei8htplants' && (
        <PlantPotCalc
          key={`${tab}-purchase`} brand={tab} withPotArtist={tab === 'habitatoides'}
          plantPlaceholder={PLANT_PLACEHOLDERS[tab]} potArtists={potArtists} maxRate={maxRate} onRegister={handleRegister}
        />
      )}
      {/* 実生（ei8ht plants・Habitat Oides だけ。鉢の欄は Habitat Oides だけ） */}
      {mode === 'seedling' && SEEDLING_BRANDS.includes(tab) && (
        <SeedlingCalc
          key={`${tab}-seedling`} brand={tab} withPot={tab === 'habitatoides'}
          plantPlaceholder={PLANT_PLACEHOLDERS[tab]} potArtists={potArtists} onRegister={handleRegister}
        />
      )}

      {/* 登録リスト（全ブランド分。見出しの下の切り替えでブランドを絞り込める） */}
      <div style={{ marginTop: 56, paddingTop: 40, borderTop: '2px solid #dddde8' }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 20px', letterSpacing: 1 }}>
          登録リスト
        </h2>
        {/* 絞り込み（入力は消えないので確認はしない。ボタンの文言が計算フォームのタブと同じなので group で区別する） */}
        <TabBar
          tabs={LIST_FILTER_TABS} current={listFilter} onSelect={setListFilter}
          small groupLabel="登録リストの絞り込み"
        />
        {loadingEntries ? (
          <p style={{ color: '#aaa', fontSize: 14 }}>読み込み中...</p>
        ) : (
          <PriceCalcEntriesList
            entries={filteredEntries} onDelete={handleDelete}
            emptyMessage={entries.length === 0 ? 'まだ登録されていません。' : 'このブランドの登録はありません。'}
          />
        )}
      </div>
    </div>
  )
}
