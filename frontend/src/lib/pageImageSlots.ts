/*
 * 3ブランドのトップページで、管理画面から差し替えられる画像の枠（スロット）の一覧
 *
 * 管理画面「ページ画像の編集」（/admin/page-editor/:brand）と、公開ページの表示の両方がこの一覧を使う。
 * - ei8ht plants   : ei8ht-hero・ei8ht-wordmark（GET /api/site-assets?prefix=ei8ht- でまとめて取得）
 * - Habitat Oides  : habitat-hero-01〜05・habitat-object-01〜06（habitatMotionSlots.ts の11枠をそのまま使う。右下のサインは差し替えの対象外）
 * - HUE            : hue-color-01〜06（prefix=hue-color- で取ると hue-color-study も返るが、この一覧にないので使わない）
 *
 * 表示する画像は、次の優先順で決める（resolvePageImageSrc）。
 *   1. 管理画面で保存した URL
 *   2. この一覧の localSrc（プロジェクト内に置いた画像のパス）
 *   3. どちらもなければ null（ページごとに、空の枠を出すか、何も出さないかを決める）
 */
import { TEXT_LOGO } from './brands'
import { HABITAT_MOTION_PREFIX, HABITAT_MOTION_SLOTS } from './habitatMotionSlots'

/** 画像を差し替えられるブランド（管理画面の URL の :brand に使う文字列） */
export type PageImageBrand = 'ei8htplants' | 'habitat-oides' | 'hue'

/** 画像の枠1つ分の定義（3ブランドで共通の形。habitatMotionSlots.ts の枠もこの形を満たす） */
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

/** ブランド1つ分の設定 */
export interface PageImageBrandConfig {
  /** ブランドの識別子（URL の :brand） */
  brand: PageImageBrand
  /** 管理画面のタブに出すブランド名 */
  label: string
  /** 一括取得（GET /api/site-assets?prefix=...）で使うキーの頭の文字列 */
  prefix: string
  /** このブランドのトップページで差し替えられる枠の一覧（表示順） */
  slots: readonly PageImageSlot[]
}

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
    note: '背景を透過した横長の PNG / WebP。高さ 96px 程度（表示は高さ 48px まで）。見出しの上に出します。',
    localSrc: TEXT_LOGO,
  },
]

/** HUE のトップページ（frontend/src/pages/brands/Hue.tsx）の枠。管理画面「サイト画像」の6枚と同じキー */
export const HUE_PAGE_SLOTS: readonly PageImageSlot[] = Array.from({ length: 6 }, (_, index) => {
  // 1 始まりの2桁の番号（'01' 〜 '06'）
  const number = String(index + 1).padStart(2, '0')
  return {
    key: `hue-color-${number}`,
    label: `色の写真 ${number}`,
    note: '横長 1200×900px 程度（JPEG / WebP）。トップページの写真の並びと、読みものの案内（01・03・05 は横に流れる3章、02・04・06 は下のカード）にも使います。',
    localSrc: null,
  }
})

/** 3ブランドの設定（キーは URL の :brand） */
export const PAGE_IMAGE_BRANDS: Readonly<Record<PageImageBrand, PageImageBrandConfig>> = {
  ei8htplants: { brand: 'ei8htplants', label: 'ei8ht plants', prefix: 'ei8ht-', slots: EI8HT_PAGE_SLOTS },
  'habitat-oides': { brand: 'habitat-oides', label: 'Habitat Oides', prefix: HABITAT_MOTION_PREFIX, slots: HABITAT_MOTION_SLOTS },
  hue: { brand: 'hue', label: 'HUE', prefix: 'hue-color-', slots: HUE_PAGE_SLOTS },
}

/** 管理画面のタブに並べるブランドの順 */
export const PAGE_IMAGE_BRAND_ORDER: readonly PageImageBrand[] = ['ei8htplants', 'habitat-oides', 'hue']

/**
 * 文字列がブランドの識別子かを確かめる（URL の :brand の確認に使う）。
 * @param value - 確かめる文字列
 * @returns ブランドの識別子なら true
 */
export function isPageImageBrand(value: string | undefined): value is PageImageBrand {
  return value === 'ei8htplants' || value === 'habitat-oides' || value === 'hue'
}

/**
 * キーから枠の定義を探す（3ブランドすべてから探す）。
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
