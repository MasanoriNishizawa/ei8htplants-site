/*
 * Habitat Oides トップページの「動く画像」の枠（スロット）一覧
 *
 * トップページ（habitatoides.com の `/`）では、次の2種類の画像を、管理画面から差し替えられる枠として動きのある演出で表示する（全11枠）。
 * - hero   : 一番上の全画面スライダー（フェードで切り替わる）。habitat-hero-01 〜 05
 * - object : スクロールに合わせてふわっと動くオブジェクト。habitat-object-01 〜 06
 *
 * 画面の右下に固定するブランドの看板（サイン）は、変更することがないため管理画面で差し替える枠には含めない。
 * プロジェクト内のファイル（下の HABITAT_SIGN_SRC）だけで表示する。
 *
 * 枠に表示する画像は、次の優先順で決める（resolveHabitatSlotSrc）。
 *   1. 管理画面（/admin/habitat-images）で保存した URL（GET /api/site-assets?prefix=habitat- で取得）
 *   2. この一覧の localSrc（プロジェクト内に置いた画像のパス）
 *   3. どちらもなければ、大きさだけ確保した空の枠（placeholder）
 *
 * ---- プロジェクト内に画像を置くときの手順 ----
 * 1. 画像を次のフォルダに、決まったファイル名で置く（frontend/public 以下。公開 URL は /img/... になる）
 *    - 一番上の画像   : frontend/public/img/habitatOides/motion/hero/hero-01.jpg 〜 hero-05.jpg
 *    - 動くオブジェクト: frontend/public/img/habitatOides/motion/objects/object-01.png 〜 object-06.png（背景を透過した PNG）
 *    - サイン         : frontend/public/img/habitatOides/motion/sign/sign.svg（背景を透過した SVG。ファイル名は固定。HABITAT_SIGN_SRC を参照）
 * 2. 一番上の画像・動くオブジェクトは、下の HABITAT_MOTION_SLOTS の該当する枠の localSrc に、公開 URL を書く
 *    例: localSrc: '/img/habitatOides/motion/hero/hero-02.jpg'
 *    （サインは置くだけでよい。パスは HABITAT_SIGN_SRC に決めてある）
 * 3. 管理画面で URL を保存していない枠では、その画像が表示される（管理画面で保存した画像のほうが優先）
 * 4. 拡張子を変えたとき（jpg → webp など）は、localSrc のパスも合わせて書き換える
 */

/**
 * 右下に固定するブランドのサインの画像の公開パス（管理画面では差し替えない。プロジェクト内のファイルだけで出す）
 * - 置き場所: frontend/public/img/habitatOides/motion/sign/sign.svg
 * - ファイル名: sign.svg（背景は透過）
 * - ファイルがまだないとき（読み込みに失敗したとき）は、サインは何も表示しない（HabitatBrandSign の onError）
 */
export const HABITAT_SIGN_SRC = '/img/habitatOides/motion/sign/sign.svg'

/** 枠の種類（hero: 一番上の画像 / object: 動くオブジェクト） */
export type HabitatMotionGroup = 'hero' | 'object'

/** 画像の枠1つ分の定義 */
export interface HabitatMotionSlot {
  /** site_assets のキー（例: 'habitat-hero-01'）。管理画面の保存と公開ページの取得で共通に使う */
  key: string
  /** 枠の種類。公開ページの置き場所と、管理画面の見出しの分け方に使う */
  group: HabitatMotionGroup
  /** 管理画面に出す枠の名前 */
  label: string
  /** 管理画面に出す推奨サイズ・用途の説明 */
  note: string
  /** プロジェクト内に置いた画像の公開パス。まだ画像がない枠は null（場所だけ空けておく） */
  localSrc: string | null
}

/** 管理画面で使う、枠の種類ごとの見出し（表示順もこの順にする） */
export const HABITAT_MOTION_GROUP_LABELS: Record<HabitatMotionGroup, string> = {
  hero: '一番上の画像',
  object: '動くオブジェクト',
}

/** 枠の種類の表示順（管理画面の見出しの並び） */
export const HABITAT_MOTION_GROUP_ORDER: readonly HabitatMotionGroup[] = ['hero', 'object']

/** 一番上の画像の推奨サイズ（5枠で共通） */
const HERO_NOTE = '横長 2400×1500px 程度（JPEG / WebP）。全画面に広げて表示し、端が切れることがあるので、主役は中央付近に置いてください。'

/** 動くオブジェクトの推奨サイズの共通部分 */
const OBJECT_NOTE = '背景を透過した PNG / WebP。スクロールに合わせてゆっくり動きます。'

/**
 * Habitat Oides トップページの画像の枠の一覧（11枠。公開ページ・管理画面・MSW モックで共通に使う。サインは含めない）
 * キーはバックエンド（backend/app/routes/site_assets.py の HABITAT_MOTION_KEYS）と同じにする
 */
export const HABITAT_MOTION_SLOTS: readonly HabitatMotionSlot[] = [
  { key: 'habitat-hero-01', group: 'hero', label: '一番上の画像 01', note: HERO_NOTE, localSrc: '/img/habitatOides/habitat_oides_hero.jpg' },
  { key: 'habitat-hero-02', group: 'hero', label: '一番上の画像 02', note: HERO_NOTE, localSrc: null },
  { key: 'habitat-hero-03', group: 'hero', label: '一番上の画像 03', note: HERO_NOTE, localSrc: null },
  { key: 'habitat-hero-04', group: 'hero', label: '一番上の画像 04', note: HERO_NOTE, localSrc: null },
  { key: 'habitat-hero-05', group: 'hero', label: '一番上の画像 05', note: HERO_NOTE, localSrc: null },
  { key: 'habitat-object-01', group: 'object', label: 'オブジェクト 01（左上）', note: `縦長 700×900px 程度。${OBJECT_NOTE}`, localSrc: null },
  { key: 'habitat-object-02', group: 'object', label: 'オブジェクト 02（右上）', note: `横長 800×600px 程度。${OBJECT_NOTE}`, localSrc: null },
  { key: 'habitat-object-03', group: 'object', label: 'オブジェクト 03（右寄り中段）', note: `正方形 500×500px 程度。${OBJECT_NOTE}`, localSrc: null },
  { key: 'habitat-object-04', group: 'object', label: 'オブジェクト 04（左下）', note: `横長 1200×800px 程度。${OBJECT_NOTE}`, localSrc: null },
  { key: 'habitat-object-05', group: 'object', label: 'オブジェクト 05（右下）', note: `縦長 600×800px 程度。${OBJECT_NOTE}`, localSrc: null },
  { key: 'habitat-object-06', group: 'object', label: 'オブジェクト 06（スマホだけ）', note: `横長 800×600px 程度。スマホ表示（767px 以下）でだけ使います。${OBJECT_NOTE}`, localSrc: null },
]

/** 公開ページの一括取得と管理画面の一覧取得で使う、キーの頭の文字列 */
export const HABITAT_MOTION_PREFIX = 'habitat-'

/**
 * 指定した種類の枠だけを、定義順に取り出す。
 * @param group - 取り出したい枠の種類
 * @returns その種類の枠の一覧（定義順）
 */
export function habitatSlotsByGroup(group: HabitatMotionGroup): HabitatMotionSlot[] {
  return HABITAT_MOTION_SLOTS.filter((slot) => slot.group === group)
}

/**
 * キーから枠の定義を探す。
 * @param key - site_assets のキー（例: 'habitat-object-01'）
 * @returns 見つかった枠の定義。定義にないキーなら undefined
 */
export function findHabitatSlot(key: string): HabitatMotionSlot | undefined {
  return HABITAT_MOTION_SLOTS.find((slot) => slot.key === key)
}

/**
 * 枠に表示する画像の URL を、優先順（管理画面で保存した URL → localSrc → なし）で決める。
 * @param slot - 対象の枠
 * @param remoteUrls - 管理画面で保存した URL（キー → URL。'' や未取得のキーは「未設定」として扱う）
 * @returns 表示する画像の URL。どちらもなければ null（呼び出し側で placeholder を出す）
 */
export function resolveHabitatSlotSrc(slot: HabitatMotionSlot, remoteUrls: Readonly<Record<string, string>>): string | null {
  // 1. 管理画面で保存した URL があれば最優先で使う
  const remote = remoteUrls[slot.key]
  if (remote) return remote
  // 2. なければプロジェクト内に置いた画像、3. それもなければ null
  return slot.localSrc
}
