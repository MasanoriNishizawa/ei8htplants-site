/*
 * 4つのサイト（3ブランドと公式サイト）のページで、管理画面から差し替えられる画像の枠（スロット）の一覧
 *
 * 管理画面「ページ画像の編集」（/admin/page-editor/:brand/:page?）と、公開ページの表示の両方がこの一覧を使う。
 * 定義は「ブランド → ページ → 枠」の形にしている。同じ枠（キー）を複数のページで使うことがある
 * （ei8ht plants の文字ロゴ・HUE の6枚の写真・公式サイトのブランド紹介の写真）。
 *
 * - ei8ht plants   : トップ（ei8ht-hero・ei8ht-wordmark）・About（ei8ht-about-hero・ei8ht-wordmark）
 *                    植物のライン（/plants）は差し替えられる画像がないので、ページの一覧に入れない
 * - Habitat Oides  : トップ（habitatMotionSlots.ts の11枠 + habitat-world・habitat-workshop-photo）・Workshop（habitat-workshop-main）
 *                    右下のサインと、Collaborations（データベースのコラボ記事の写真）は対象外
 * - HUE            : トップ（01〜06）・About（01・02・03・05）・Choose（01・03・05）・Living（02・04・06）
 *                    prefix=hue-color- で取ると hue-color-study も返るが、この一覧にないので使わない
 * - 公式サイト     : トップ（official-hero・ブランド紹介の3枚）・Our Brands（ブランド紹介の3枚）
 *                    データベースから出している写真（商品・記事・イベント・ギャラリー・Media）とヘッダー・フッターのロゴは対象外
 *
 * 取得は、ブランドごとの prefix の一括取得（GET /api/site-assets?prefix=...）でまとめて行う（lib/usePageImageAssets.ts）。
 *
 * 表示する画像は、次の優先順で決める（resolvePageImageSrc）。
 *   1. 管理画面で保存した URL
 *   2. この一覧の localSrc（プロジェクト内に置いた画像のパス）
 *   3. どちらもなければ null（ページごとに、空の枠を出すか、今までどおりの出し方にするかを決める）
 */
import { TEXT_LOGO } from './brands'
import { BRAND_SHOWCASES } from './brandShowcase'
import { HABITAT_MOTION_PREFIX, HABITAT_MOTION_SLOTS } from './habitatMotionSlots'

/** 画像を差し替えられるブランド（管理画面の URL の :brand に使う文字列。official は会社の公式サイト /official 以下） */
export type PageImageBrand = 'ei8htplants' | 'habitat-oides' | 'hue' | 'official'

/** 画像の枠1つ分の定義（全ブランドで共通の形。habitatMotionSlots.ts の枠もこの形を満たす） */
export interface PageImageSlot {
  /** site_assets のキー（例: 'ei8ht-hero'）。管理画面の保存と公開ページの取得で共通に使う */
  key: string
  /** 管理画面に出す枠の名前（編集モードの hover のラベルと、「<label>を変更」のボタン名にも使う） */
  label: string
  /** 管理画面に出す推奨サイズ・用途の説明 */
  note: string
  /** プロジェクト内に置いた画像の公開パス。まだ画像がない枠は null */
  localSrc: string | null
}

/** ページ1つ分の定義 */
export interface PageImagePage {
  /** ページの識別子（管理画面の URL の :page に使う。例: 'home'・'about'） */
  id: string
  /** 管理画面のページの選択欄に出すページ名 */
  label: string
  /** 公開時の URL のパス（ブランドのドメインから見たもの。例: '/about'） */
  path: string
  /** このページで差し替えられる枠の一覧（表示順） */
  slots: readonly PageImageSlot[]
}

/** ブランド1つ分の設定 */
export interface PageImageBrandConfig {
  /** ブランドの識別子（URL の :brand） */
  brand: PageImageBrand
  /** 管理画面のタブに出すブランド名 */
  label: string
  /** 公開時のドメイン（管理画面のページの選択欄に、URL として path と合わせて出す） */
  host: string
  /** 一括取得（GET /api/site-assets?prefix=...）で使うキーの頭の文字列 */
  prefix: string
  /** 画像を差し替えられるページの一覧（表示順。先頭は必ず home） */
  pages: readonly PageImagePage[]
  /** このブランドの全ページの枠を、重なりを除いて1つにまとめた一覧（読み込み・保存・変更の件数に使う） */
  slots: readonly PageImageSlot[]
}

/** 各ブランドで最初に開くページの識別子（URL で :page を省いたとき・正しくないときに使う） */
export const PAGE_IMAGE_HOME_PAGE = 'home'

/* ---- ei8ht plants ---- */

/** ei8ht plants のトップページ（frontend/src/pages/brands/Ei8htPlants.tsx）の枠 */
export const EI8HT_PAGE_SLOTS: readonly PageImageSlot[] = [
  {
    key: 'ei8ht-hero',
    label: 'メインの写真',
    note: '縦長〜正方形に近い 1600×1800px 程度（JPEG / WebP）。PC では画面の左半分、スマホでは横長に切り抜いて表示します。',
    localSrc: '/img/ei8htPlants/ei8htplants_hero.jpg',
  },
  {
    key: 'ei8ht-wordmark',
    label: 'ロゴ（文字）',
    note: '背景を透過した横長の PNG / WebP。高さ 96px 程度（表示は高さ 48px まで）。トップページの見出しの上と、About ページの本文の下に出します。',
    localSrc: TEXT_LOGO,
  },
]

/** ei8ht plants の About ページ（frontend/src/pages/brands/Ei8htPlantsAbout.tsx）のメインの写真の枠 */
export const EI8HT_ABOUT_HERO_SLOT: PageImageSlot = {
  key: 'ei8ht-about-hero',
  label: 'About のメインの写真',
  note: '横長 1600×1100px 程度（JPEG / WebP）。About ページの一番上の右側（スマホでは文章の下）に、枠いっぱいに切り抜いて表示します。',
  localSrc: '/img/ei8htPlants/ei8htplants_hero.jpg',
}

/** ei8ht plants の About ページの枠（メインの写真と、トップページと共通の文字ロゴ） */
const EI8HT_ABOUT_SLOTS: readonly PageImageSlot[] = [
  EI8HT_ABOUT_HERO_SLOT,
  // 文字ロゴはトップページと同じ枠（ei8ht-wordmark）を使う
  EI8HT_PAGE_SLOTS[1],
]

/* ---- Habitat Oides ---- */

/** Habitat Oides のページ写真（今は3つとも同じワークショップの写真を、別々の枠として出している） */
const HABITAT_WORKSHOP_PHOTO_SRC = '/img/habitatOides/habitat_oides_workshop_main.jpg'

/** Habitat Oides のトップページの、動く画像以外の写真の枠（「考え方」の写真・ワークショップの欄の写真） */
export const HABITAT_HOME_PHOTO_SLOTS: readonly PageImageSlot[] = [
  {
    key: 'habitat-world',
    label: '考え方の写真',
    note: '縦長 1200×1500px 程度（JPEG / WebP）。「私たちの考え方」の欄の左に、枠いっぱいに切り抜いて表示します。',
    localSrc: HABITAT_WORKSHOP_PHOTO_SRC,
  },
  {
    key: 'habitat-workshop-photo',
    label: 'ワークショップの欄の写真',
    note: '横長 1600×1200px 程度（JPEG / WebP）。ワークショップの案内の欄の左（スマホでは上）に、枠いっぱいに切り抜いて表示します。',
    localSrc: HABITAT_WORKSHOP_PHOTO_SRC,
  },
]

/** Habitat Oides の Workshop ページ（frontend/src/pages/brands/HabitatOidesWorkshop.tsx）のメインの写真の枠 */
export const HABITAT_WORKSHOP_MAIN_SLOT: PageImageSlot = {
  key: 'habitat-workshop-main',
  label: 'Workshop のメインの写真',
  note: '正方形 1200×1200px 程度（JPEG / WebP）。「ワークショップについて」の欄の左（スマホでは上）に、正方形に切り抜いて表示します。',
  localSrc: HABITAT_WORKSHOP_PHOTO_SRC,
}

/* ---- HUE ---- */

/** HUE の写真6枚の枠。トップは全枠を使い、読みものの各ページは実際に表示する枠だけを共有する */
export const HUE_PAGE_SLOTS: readonly PageImageSlot[] = Array.from({ length: 6 }, (_, index) => {
  // 1 始まりの2桁の番号（'01' 〜 '06'）
  const number = String(index + 1).padStart(2, '0')
  return {
    key: `hue-color-${number}`,
    label: `色の写真 ${number}`,
    note: '横長 1200×900px 程度（JPEG / WebP）。トップページの写真の並びと読みものの案内（01・03・05 は横に流れる3章、02・04・06 は下のカード）、About は01・02・03・05、Choose は01・03・05、Living は02・04・06を使います。',
    localSrc: null,
  }
})

/* ---- 公式サイト ---- */

/** 公式サイトのブランド紹介の写真の枠のキー（lib/brandShowcase.ts の並び順と同じ: ei8ht plants・Habitat Oides・HUE） */
export const OFFICIAL_BRAND_SLOT_KEYS = ['official-brand-ei8ht', 'official-brand-habitat', 'official-brand-hue'] as const

/** 公式サイトのブランド紹介の写真の枠の名前（OFFICIAL_BRAND_SLOT_KEYS と同じ並び） */
const OFFICIAL_BRAND_SLOT_LABELS = ['ブランド紹介の写真（ei8ht plants）', 'ブランド紹介の写真（Habitat Oides）', 'ブランド紹介の写真（HUE）'] as const

/** 公式サイトのトップページ（frontend/src/pages/Home.tsx）のメインの写真の枠 */
export const OFFICIAL_HERO_SLOT: PageImageSlot = {
  key: 'official-hero',
  label: '公式トップのメインの写真',
  note: '横長 2400×1500px 程度（JPEG / WebP）。トップページの一番上に、画面いっぱいに広げて表示します（端が切れることがあります）。',
  localSrc: '/img/ei8htPlants/ei8htplants_hero.jpg',
}

/**
 * 公式サイトのブランド紹介の写真の枠（トップページのブランドの帯と、Our Brands のカードで共通）。
 * localSrc は lib/brandShowcase.ts の img（HUE は null。未保存なら今までどおりロゴ・管理画面の HUE の写真を出す）
 */
export const OFFICIAL_BRAND_SLOTS: readonly PageImageSlot[] = OFFICIAL_BRAND_SLOT_KEYS.map((key, index) => ({
  key,
  label: OFFICIAL_BRAND_SLOT_LABELS[index],
  note: '縦長 1200×1500px 程度（JPEG / WebP）。トップページのブランドの帯と、Our Brands のカードに、枠いっぱいに切り抜いて表示します。',
  localSrc: BRAND_SHOWCASES[index]?.img ?? null,
}))

/* ---- まとめ ---- */

/**
 * 複数のページの枠を、重なり（同じキー）を除いて1つの一覧にする（先に出てきた順）。
 * @param pages - ページの一覧
 * @returns 重なりを除いた枠の一覧
 */
function uniqueSlots(pages: readonly PageImagePage[]): PageImageSlot[] {
  // 1. すでに入れたキーを覚えておき、2. まだ入れていない枠だけを順に足す
  const seen = new Set<string>()
  const result: PageImageSlot[] = []
  for (const page of pages) {
    for (const slot of page.slots) {
      if (seen.has(slot.key)) continue
      seen.add(slot.key)
      result.push(slot)
    }
  }
  return result
}

/**
 * ブランドの設定を作る（slots はページの枠から自動でまとめる）。
 * @param config - slots 以外のブランドの設定
 * @returns ブランドの設定
 */
function brandConfig(config: Omit<PageImageBrandConfig, 'slots'>): PageImageBrandConfig {
  return { ...config, slots: uniqueSlots(config.pages) }
}

/** 4つのブランドの設定（キーは URL の :brand） */
export const PAGE_IMAGE_BRANDS: Readonly<Record<PageImageBrand, PageImageBrandConfig>> = {
  ei8htplants: brandConfig({
    brand: 'ei8htplants',
    label: 'ei8ht plants',
    host: 'ei8htplants.com',
    prefix: 'ei8ht-',
    pages: [
      { id: 'home', label: 'トップページ', path: '/', slots: EI8HT_PAGE_SLOTS },
      { id: 'about', label: 'About', path: '/about', slots: EI8HT_ABOUT_SLOTS },
    ],
  }),
  'habitat-oides': brandConfig({
    brand: 'habitat-oides',
    label: 'Habitat Oides',
    host: 'habitatoides.com',
    prefix: HABITAT_MOTION_PREFIX,
    pages: [
      { id: 'home', label: 'トップページ', path: '/', slots: [...HABITAT_MOTION_SLOTS, ...HABITAT_HOME_PHOTO_SLOTS] },
      { id: 'workshop', label: 'Workshop', path: '/workshop', slots: [HABITAT_WORKSHOP_MAIN_SLOT] },
    ],
  }),
  hue: brandConfig({
    brand: 'hue',
    label: 'HUE',
    host: 'huebyei8htplants.com',
    prefix: 'hue-color-',
    pages: [
      { id: 'home', label: 'トップページ', path: '/', slots: HUE_PAGE_SLOTS },
      { id: 'about', label: 'About（HUEについて）', path: '/about', slots: HUE_PAGE_SLOTS.filter((_, index) => [0, 1, 2, 4].includes(index)) },
      { id: 'choose', label: 'Choose（一鉢の選び方）', path: '/choose', slots: HUE_PAGE_SLOTS.filter((_, index) => [0, 2, 4].includes(index)) },
      { id: 'living', label: 'Living（植物のある部屋）', path: '/living', slots: HUE_PAGE_SLOTS.filter((_, index) => [1, 3, 5].includes(index)) },
    ],
  }),
  official: brandConfig({
    brand: 'official',
    label: '公式サイト',
    host: 'ei8htplants.com',
    prefix: 'official-',
    pages: [
      { id: 'home', label: 'トップページ', path: '/official', slots: [OFFICIAL_HERO_SLOT, ...OFFICIAL_BRAND_SLOTS] },
      { id: 'brands', label: 'Our Brands', path: '/official/brands', slots: OFFICIAL_BRAND_SLOTS },
    ],
  }),
}

/** 管理画面のタブに並べるブランドの順 */
export const PAGE_IMAGE_BRAND_ORDER: readonly PageImageBrand[] = ['ei8htplants', 'habitat-oides', 'hue', 'official']

/**
 * 文字列がブランドの識別子かを確かめる（URL の :brand の確認に使う）。
 * @param value - 確かめる文字列
 * @returns ブランドの識別子なら true
 */
export function isPageImageBrand(value: string | undefined): value is PageImageBrand {
  return value === 'ei8htplants' || value === 'habitat-oides' || value === 'hue' || value === 'official'
}

/**
 * ブランドの中から、識別子でページの定義を探す。
 * @param brand - 対象のブランド
 * @param pageId - ページの識別子（URL の :page。undefined なら見つからない扱い）
 * @returns 見つかったページの定義。なければ undefined
 */
export function findPageImagePage(brand: PageImageBrand, pageId: string | undefined): PageImagePage | undefined {
  if (pageId === undefined) return undefined
  return PAGE_IMAGE_BRANDS[brand].pages.find((page) => page.id === pageId)
}

/**
 * キーから枠の定義を探す（全ブランドから探す）。
 * @param key - site_assets のキー（例: 'hue-color-03'）
 * @returns 見つかった枠の定義。定義にないキーなら undefined
 */
export function findPageImageSlot(key: string): PageImageSlot | undefined {
  for (const brand of PAGE_IMAGE_BRAND_ORDER) {
    const slot = PAGE_IMAGE_BRANDS[brand].slots.find((item) => item.key === key)
    if (slot) return slot
  }
  return undefined
}

/**
 * 枠のキーを使っている、そのブランドのページの一覧を返す（「他のページでも使われます」の案内に使う）。
 * @param brand - 対象のブランド
 * @param key - site_assets のキー
 * @returns その枠を使っているページの一覧（定義順）
 */
export function pagesUsingSlot(brand: PageImageBrand, key: string): PageImagePage[] {
  return PAGE_IMAGE_BRANDS[brand].pages.filter((page) => page.slots.some((slot) => slot.key === key))
}

/**
 * 枠に表示する画像の URL を、優先順（保存した URL → localSrc → なし）で決める。
 * @param slot - 対象の枠
 * @param urls - 保存した URL（キー → URL。'' や含まれないキーは「未設定」として扱う）
 * @returns 表示する画像の URL。どちらもなければ null
 */
export function resolvePageImageSrc(slot: PageImageSlot, urls: Readonly<Record<string, string>>): string | null {
  // 1. 保存した URL があれば最優先で使う
  const remote = urls[slot.key]
  if (remote) return remote
  // 2. なければプロジェクト内に置いた画像、3. それもなければ null
  return slot.localSrc
}
