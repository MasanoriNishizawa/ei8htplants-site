import { BRAND } from './brands'
import { BRAND_SITE_URLS } from './siteHost'

/** トップとOUR BRANDSで共通して使う、3ブランドの紹介データ。 */
export const BRAND_SHOWCASES = [
  {
    to: BRAND_SITE_URLS.ei8htplants,
    name: BRAND.ei8htPlants.name,
    shortName: BRAND.ei8htPlants.shortName,
    descJa: 'アガベや塊根植物など、個性的なフォルムを持つビザールプランツ。',
    descEn: 'Bizarre plants with distinctive forms, from agaves to caudiciforms.',
    bg: '#2d4a27',
    img: '/img/ei8htPlants/ei8htplants_hero.jpg',
    logo: BRAND.ei8htPlants.logo,
    descriptorJa: 'ビザールプランツ',
    descriptorEn: 'BIZARRE PLANTS',
  },
  {
    to: BRAND_SITE_URLS['habitat-oides'],
    name: BRAND.habitatOides.name,
    shortName: BRAND.habitatOides.shortName,
    descJa: '植物と石、砂、鉢を重ねて、自生地の景色を仕立てる。',
    descEn: 'Shape habitat-inspired landscapes with plants, stone, sand, and vessels.',
    bg: '#1e3272',
    img: '/img/habitatOides/habitat_oides_workshop_main.jpg',
    logo: BRAND.habitatOides.logo,
    descriptorJa: '植物の景色を仕立てる',
    descriptorEn: 'SHAPE A LIVING LANDSCAPE',
  },
  {
    to: BRAND_SITE_URLS.hue,
    name: BRAND.hue.name,
    shortName: BRAND.hue.shortName,
    descJa: '葉の色とフォルムを楽しみ、植物を暮らしの景色に迎える。',
    descEn: 'Celebrate foliage color and form, and make plants part of your space.',
    bg: 'linear-gradient(135deg, #f9eef3 0%, #eee8f8 28%, #e6f4ef 58%, #fdf8e8 82%, #fdf0ea 100%)',
    img: null,
    logo: BRAND.hue.logo,
    descriptorJa: '植物と暮らす',
    descriptorEn: 'LIVE WITH PLANTS',
  },
] as const
