import { useState } from 'react'
import { HABITAT_SIGN_SRC } from '../../../lib/habitatMotionSlots'

/**
 * ブランドの看板（サイン）の画像を、画面の右下に固定して出す（参考サイトのサイン）。
 * トップページの部品の中に置くので、トップページを見ている間だけ表示される。
 * クリックの邪魔をしないよう pointer-events:none にし、ヘッダー（z-index 1000）より下に重ねる。
 * 飾りなので読み上げの対象から外す。
 *
 * サインは変更することがないため、管理画面で差し替える枠には含めず、プロジェクト内のファイルだけで出す。
 * - 置き場所: frontend/public/img/habitatOides/motion/sign/sign.svg（公開パスは HABITAT_SIGN_SRC）
 * - ファイル名: sign.svg（背景は透過）
 * - ファイルがまだないなど、読み込みに失敗したときは onError で何も表示しない状態にする
 * 管理画面「ページ画像の編集」のプレビュー（編集モード）でも、差し替えの枠や空の枠は出さず、
 * ファイルがあれば公開ページと同じように表示するだけにする。
 * @returns 固定表示のサインの要素。読み込みに失敗したら null
 */
export default function HabitatBrandSign() {
  // サインの画像の読み込みに失敗したか（true なら何も出さない）
  const [failed, setFailed] = useState(false)
  // 1. 読み込みに失敗していたら（ファイルがまだないときなど）何も出さない
  if (failed) return null
  // 2. 右下に固定した枠の中に、プロジェクト内のサインの画像を出す。失敗したら 1. の状態にする
  return (
    <div className="habitat-brand-sign" data-testid="habitat-brand-sign" aria-hidden="true">
      <img src={HABITAT_SIGN_SRC} alt="" decoding="async" onError={() => setFailed(true)} />
    </div>
  )
}
