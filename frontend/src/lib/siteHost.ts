import { ei8htPlantsSite } from '../sites/ei8htplants/site'

/** 公開ホスト名ごとの独立サイト設定。管理画面は ei8htplants.com に置く。 */
export type SiteKey = 'ei8htplants' | 'habitat-oides' | 'hue'

export interface SiteHostInfo {
  key: SiteKey
  origin: string
  brandName: string
}

/** サイトキーから各ブランドの公開設定を引く対応表 */
const SITES: Readonly<Record<SiteKey, SiteHostInfo>> = {
  ei8htplants: ei8htPlantsSite,
  'habitat-oides': { key: 'habitat-oides', origin: 'https://habitatoides.com', brandName: 'Habitat Oides' },
  hue: { key: 'hue', origin: 'https://huebyei8htplants.com', brandName: 'HUE by ei8ht plants' },
}

/** ホスト名をサイトキーへ変換する対応表。www 付きも同じブランドに集約する */
const HOST_TO_SITE: Readonly<Record<string, SiteKey>> = {
  'ei8htplants.com': 'ei8htplants',
  'www.ei8htplants.com': 'ei8htplants',
  'habitatoides.com': 'habitat-oides',
  'www.habitatoides.com': 'habitat-oides',
  'huebyei8htplants.com': 'hue',
  'www.huebyei8htplants.com': 'hue',
}

/**
 * 開いているホスト名からブランドサイトの設定を選ぶ。開発環境や不明なホストは ei8ht plants として扱う。
 * @param hostname - URL のホスト名
 * @returns 一致するブランドサイト情報。不明なホストは ei8ht plants として扱う
 */
export function siteForHost(hostname: string): SiteHostInfo {
  return SITES[HOST_TO_SITE[hostname.toLowerCase()] ?? 'ei8htplants']
}

/** 各ブランドの公開トップ URL（既存ページからブランドサイトへ移動するリンク用）。 */
export const BRAND_SITE_URLS: Readonly<Record<SiteKey, string>> = Object.fromEntries(
  Object.values(SITES).map((site) => [site.key, site.key === 'ei8htplants' ? `${site.origin}${ei8htPlantsSite.brandPagePath}` : site.origin]),
) as Record<SiteKey, string>
