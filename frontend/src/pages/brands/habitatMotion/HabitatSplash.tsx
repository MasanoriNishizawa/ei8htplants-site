import { BRAND } from '../../../lib/brands'
import { useT } from '../../../lib/lang'
import type { HabitatSplashPhase } from './useHabitatSplashPhase'

/** HabitatSplash の引数 */
interface HabitatSplashProps {
  /** 今の段階（done のときは何も出さない） */
  phase: HabitatSplashPhase
}

/**
 * ページを開いたときの最初の演出（参考サイトの splash）。
 * 白い全画面の中央に、ロゴ（上段）とブランドの言葉（下段）を出し、それぞれ枠の下から上がって上へ抜ける。
 * そのあと白い幕が上へ縮んで、ページが見えるようになる。飾りなので読み上げの対象から外す。
 * @param props.phase - 今の段階
 * @returns スプラッシュの要素。done なら null
 */
export default function HabitatSplash({ phase }: HabitatSplashProps) {
  // 現在の表示言語に合わせて文言を選ぶ翻訳関数
  const t = useT()
  if (phase === 'done') return null
  return (
    <div className={`habitat-splash habitat-splash--${phase}`} data-testid="habitat-splash" data-phase={phase} aria-hidden="true">
      {/* 白い幕（前半は下を軸に広がった状態を保ち、後半は上を軸に縮む） */}
      <div className="habitat-splash-curtain" />
      {/* ロゴの2段。overflow:hidden の枠の中で、下から上がって上へ抜ける */}
      <div className="habitat-splash-logo">
        <span className="habitat-splash-line habitat-splash-line--upper">
          <img src={BRAND.habitatOides.logo} alt="" />
        </span>
        <span className="habitat-splash-line habitat-splash-line--lower">
          <span>{t('植物の景色を仕立てる', 'SHAPE A LIVING LANDSCAPE')}</span>
        </span>
      </div>
    </div>
  )
}
