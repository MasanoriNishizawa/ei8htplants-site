import { usePageImageEditMode } from '../../../lib/pageImageEdit'
import PageImageSlotTarget from '../../../components/PageImageSlotTarget'
import HabitatPlaceholder from './HabitatPlaceholder'

/** サインの枠のキー（site_assets のキー） */
const SIGN_KEY = 'habitat-sign'

/** HabitatBrandSign の引数 */
interface HabitatBrandSignProps {
  /** サインの画像の URL。null なら何も出さない（サインのための空の枠は出さない。編集モードのときだけ空の枠を出す） */
  src: string | null
}

/**
 * ブランドの看板（サイン）の画像を、画面の右下に固定して出す（参考サイトのサイン）。
 * トップページの部品の中に置くので、トップページを見ている間だけ表示される。
 * クリックの邪魔をしないよう pointer-events:none にし、ヘッダー（z-index 1000）より下に重ねる。
 * 飾りなので読み上げの対象から外す。
 * 管理画面「ページ画像の編集」のプレビュー（編集モード）では、画像がなくても空の枠を出し、
 * クリックで枠を選べるよう pointer-events を戻して、枠（PageImageSlotTarget）を重ねる。
 * @param props.src - サインの画像の URL
 * @returns 固定表示のサインの要素。画像がなく編集モードでもなければ null
 */
export default function HabitatBrandSign({ src }: HabitatBrandSignProps) {
  // 管理画面のプレビュー（編集モード）か
  const editMode = usePageImageEditMode()
  // 1. ふつうの公開ページで画像がなければ何も出さない
  if (!src && !editMode) return null
  // 2. 編集モードでは押せるようにし、読み上げの対象にも戻す（中の枠のボタンを読めるように）
  return (
    <div
      className={`habitat-brand-sign${editMode ? ' habitat-brand-sign--edit' : ''}`}
      data-testid="habitat-brand-sign"
      aria-hidden={editMode ? undefined : 'true'}
    >
      {src
        ? <img src={src} alt="" decoding="async" />
        : <HabitatPlaceholder slotKey={SIGN_KEY} className="habitat-placeholder--sign" />}
      {/* 編集モードのときだけ、サインの上に枠を重ねる */}
      <PageImageSlotTarget slotKey={SIGN_KEY} empty={!src} />
    </div>
  )
}
