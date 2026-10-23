/*
 * 3 つのブランド（ei8ht plants・Habitat Oides・HUE by ei8ht plants）の名前・Instagram・ロゴをまとめた定数
 *
 * 公開ページ（Home・Events・Gallery・EventSite・Footer など）と管理画面（EventForm・Stockists・Gallery）で
 * 同じ値を何か所にも書いていたため、ここに集める。URL やロゴを変えるときはこのファイルだけを直す
 *
 * 注意: DB に保存されているブランドの値は 2 種類ある
 * - イベント（events.brand）・公開のイベント一覧の絞り込み: 正式名「HUE by ei8ht plants」（BRAND_NAMES）
 * - 取扱店・ギャラリーの登録: 短い表記「HUE」（SHORT_BRAND_NAMES）。
 *   公開ギャラリーはタブに正式名を出し、サーバーへは短い表記に直して問い合わせる（pages/Gallery.tsx）
 * 既存のデータと合わなくなるので、片方に寄せるときはデータの移行も合わせて行う
 */

/** ブランド 1 つ分の情報 */
export interface BrandInfo {
  /** 正式名（イベントのブランドの値・画像の説明に使う） */
  name: string
  /** 短い表記（取扱店・ギャラリーの登録で使う値。HUE だけ正式名と違う） */
  shortName: string
  /** ブランドページのパス */
  path: string
  /** Instagram のアカウントの URL */
  instagramUrl: string
  /** Instagram のアカウント名（@ 付き。フッターの表示用） */
  instagramHandle: string
  /** 正方形のロゴ画像のパス */
  logo: string
}

/** ei8ht plants の情報 */
const EI8HT_PLANTS: BrandInfo = {
  name: 'ei8ht plants',
  shortName: 'ei8ht plants',
  path: '/ei8htplants',
  instagramUrl: 'https://www.instagram.com/ei8ht.plants/',
  instagramHandle: '@ei8ht.plants',
  logo: '/img/logo-ei8htplants.png',
}

/** Habitat Oides の情報 */
const HABITAT_OIDES: BrandInfo = {
  name: 'Habitat Oides',
  shortName: 'Habitat Oides',
  path: '/habitatoides',
  instagramUrl: 'https://www.instagram.com/habitatoides/',
  instagramHandle: '@habitatoides',
  logo: '/img/logo-habitatoides.png',
}

/** HUE by ei8ht plants の情報 */
const HUE: BrandInfo = {
  name: 'HUE by ei8ht plants',
  shortName: 'HUE',
  path: '/hue',
  instagramUrl: 'https://www.instagram.com/hue_by.ei8ht.plants/',
  instagramHandle: '@hue_by.ei8ht.plants',
  logo: '/img/logo-hue.png',
}

/** ブランドの情報（キーで 1 つずつ取り出す用） */
export const BRAND = { ei8htPlants: EI8HT_PLANTS, habitatOides: HABITAT_OIDES, hue: HUE } as const

/** 3 ブランドの情報（サイトでの標準の並び順） */
export const BRANDS: readonly BrandInfo[] = [EI8HT_PLANTS, HABITAT_OIDES, HUE]

/** 正式名の一覧（イベントのブランドの選択肢・公開のイベント一覧の絞り込み） */
export const BRAND_NAMES: readonly string[] = BRANDS.map((b) => b.name)

/** 短い表記の一覧（管理画面の取扱店・ギャラリーの選択肢と絞り込み。保存する値が「HUE」になる） */
export const SHORT_BRAND_NAMES: readonly string[] = BRANDS.map((b) => b.shortName)

/** 正式名 → Instagram の URL（イベントページのブランドのラベルのリンク先） */
export const BRAND_INSTAGRAM: Readonly<Record<string, string>> = Object.fromEntries(
  BRANDS.map((b) => [b.name, b.instagramUrl]),
)

/** 横長の文字ロゴ（ei8ht plants）の画像のパス。ヘッダー・フッター・トップページで使う */
export const TEXT_LOGO = '/img/text-logo-ei8htplants.png'
