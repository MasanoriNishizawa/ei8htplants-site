import { describe, expect, it } from 'vitest'
import { BRAND_SITE_URLS, siteForHost } from '../siteHost'

// テスト対象: ホスト名を各ブランドサイトへ対応付ける処理と、公開トップURLの定義。
describe('ブランドサイトのホスト判定', () => {
  // 確認内容: ei8ht plants の通常ドメインと www 付きドメインを同じサイトとして扱う。
  it('ei8htplants.com と www は既存サイトを返す', () => {
    expect(siteForHost('ei8htplants.com')).toMatchObject({ key: 'ei8htplants', origin: 'https://ei8htplants.com' })
    expect(siteForHost('www.ei8htplants.com')).toMatchObject({ key: 'ei8htplants', origin: 'https://ei8htplants.com' })
  })

  // 確認内容: Habitat Oides の通常ドメインと www 付きドメインを同じサイトとして扱う。
  it('habitatoides.com と www は Habitat Oides を返す', () => {
    expect(siteForHost('habitatoides.com')).toMatchObject({ key: 'habitat-oides', origin: 'https://habitatoides.com' })
    expect(siteForHost('www.habitatoides.com')).toMatchObject({ key: 'habitat-oides', origin: 'https://habitatoides.com' })
  })

  // 確認内容: HUE の通常ドメインと www 付きドメインを同じサイトとして扱う。
  it('huebyei8htplants.com と www は HUE を返す', () => {
    expect(siteForHost('huebyei8htplants.com')).toMatchObject({ key: 'hue', origin: 'https://huebyei8htplants.com' })
    expect(siteForHost('www.huebyei8htplants.com')).toMatchObject({ key: 'hue', origin: 'https://huebyei8htplants.com' })
  })

  // 確認内容: 大文字小文字を正規化し、未登録ホストには既定のブランドを割り当てる。
  it('大文字小文字を区別せず、未知のホストは既存サイトにする', () => {
    expect(siteForHost('HABITATOIDES.COM').key).toBe('habitat-oides')
    expect(siteForHost('localhost').key).toBe('ei8htplants')
  })

  // 確認内容: ブランドごとの公開トップURLが専用ドメインに設定されている。
  it('ブランドの公開トップURLを各専用ドメインへ向ける', () => {
    expect(BRAND_SITE_URLS).toEqual({
      ei8htplants: 'https://ei8htplants.com/',
      'habitat-oides': 'https://habitatoides.com',
      hue: 'https://huebyei8htplants.com',
    })
  })
})
