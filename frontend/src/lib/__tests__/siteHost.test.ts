import { describe, expect, it } from 'vitest'
import { BRAND_SITE_URLS, siteForHost } from '../siteHost'

describe('ブランドサイトのホスト判定', () => {
  it('ei8htplants.com と www は既存サイトを返す', () => {
    expect(siteForHost('ei8htplants.com')).toMatchObject({ key: 'ei8htplants', origin: 'https://ei8htplants.com' })
    expect(siteForHost('www.ei8htplants.com')).toMatchObject({ key: 'ei8htplants', origin: 'https://ei8htplants.com' })
  })

  it('habitatoides.com と www は Habitat Oides を返す', () => {
    expect(siteForHost('habitatoides.com')).toMatchObject({ key: 'habitat-oides', origin: 'https://habitatoides.com' })
    expect(siteForHost('www.habitatoides.com')).toMatchObject({ key: 'habitat-oides', origin: 'https://habitatoides.com' })
  })

  it('huebyei8htplants.com と www は HUE を返す', () => {
    expect(siteForHost('huebyei8htplants.com')).toMatchObject({ key: 'hue', origin: 'https://huebyei8htplants.com' })
    expect(siteForHost('www.huebyei8htplants.com')).toMatchObject({ key: 'hue', origin: 'https://huebyei8htplants.com' })
  })

  it('大文字小文字を区別せず、未知のホストは既存サイトにする', () => {
    expect(siteForHost('HABITATOIDES.COM').key).toBe('habitat-oides')
    expect(siteForHost('localhost').key).toBe('ei8htplants')
  })

  it('ブランドの公開トップURLを各専用ドメインへ向ける', () => {
    expect(BRAND_SITE_URLS).toEqual({
      ei8htplants: 'https://ei8htplants.com/',
      'habitat-oides': 'https://habitatoides.com',
      hue: 'https://huebyei8htplants.com',
    })
  })
})
