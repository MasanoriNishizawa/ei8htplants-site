import { Link } from 'react-router-dom'

/** 予約完了画面の確認内容に使う表示行 */
export type ReserveConfirmRow = {
  /** 表示する項目名 */
  label: string
  /** 項目の値。備考など画面要素も表示できる */
  value: React.ReactNode
}

/** 予約フォームの通常入力以外に表示する結果の種類 */
export type ReserveResultState = 'closed' | 'full' | 'done'

/** 予約の終了・満席・完了画面を表示するための値と操作通知 */
interface ReserveResultViewProps {
  /** 表示する予約結果の種類 */
  state: ReserveResultState
  /** 完了画面に表示する確認メールの宛先 */
  email: string
  /** 完了画面に表示する予約内容 */
  confirmRows: ReserveConfirmRow[]
  /** 満席画面から戻る操作を親へ通知する */
  onBackFromFull: () => void
  /** 日本語・英語から現在の表示言語の文言を選ぶ関数 */
  t: <T>(ja: T, en: T) => T
}

/**
 * 受付終了・満席・予約完了の案内を表示する。予約状態の変更や送信処理は親へ委ねる。
 * 1. 親から受け取った結果種別に対応する案内を選ぶ
 * 2. 完了の場合は親から受け取った予約内容を一覧表示する
 * @param props - 予約結果、完了内容、戻る操作、翻訳関数
 * @returns 予約結果に応じた案内画面
 */
export default function ReserveResultView({ state, email, confirmRows, onBackFromFull, t }: ReserveResultViewProps) {
  if (state === 'closed') {
    // 終了案内は中央揃えにし、上下48px・左右20pxの余白を確保する。
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px' }}>
        <p style={{ fontSize: 18, fontWeight: 300, letterSpacing: '0.05em', color: 'var(--c-ink)', marginBottom: 12 }}>
          {t('受付を終了しました', 'Registration is closed')}
        </p>
        <p style={{ fontSize: 14, color: 'var(--c-muted)', lineHeight: 1.8, marginBottom: 28 }}>
          {t('このイベントの予約受付は終了しています。次回のワークショップをお待ちください。', 'Reservations for this event are no longer available. Please look forward to the next workshop.')}
        </p>
        <Link to="/official/events" style={{ display: 'inline-block', padding: '10px 24px', border: '1px solid #dddde8', borderRadius: 4, color: 'var(--c-muted)', textDecoration: 'none', fontSize: 14 }}>
          {t('イベント一覧へ', 'Back to events')}
        </Link>
      </div>
    )
  }

  if (state === 'full') {
    // 満席案内は中央揃えで表示し、戻る操作の周囲に既存の余白を設ける。
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <p style={{ fontSize: 18, color: '#c0392b', marginBottom: 16 }}>{t('このセッションは満席になりました', 'This session is now full')}</p>
        <p style={{ fontSize: 14, color: 'var(--c-muted)', marginBottom: 24 }}>{t('別の回をお選びいただくか、次回のワークショップをお待ちください。', 'Please choose another time slot or wait for the next workshop.')}</p>
        <button onClick={onBackFromFull} style={{ padding: '10px 24px', border: '1px solid #dddde8', borderRadius: 4, background: 'none', cursor: 'pointer', fontSize: 14 }}>
          {t('戻る', 'Back')}
        </button>
      </div>
    )
  }

  // 受付完了画面全体は中央揃えにし、内容カードの文章は既存どおり左揃えにする。
  return (
    <div style={{ textAlign: 'center' }}>
      {/* 受付結果は淡い緑のカードで強調する */}
      <div style={{ background: '#f0f6f0', border: '1px solid #b0d4b0', borderRadius: 4, padding: '36px 32px', marginBottom: 32 }}>
        <p style={{ fontSize: 22, fontWeight: 300, letterSpacing: '0.08em', color: '#2d5a2d', margin: '0 0 16px' }}>{t('予約を受け付けました', 'Reservation received')}</p>
        <p style={{ fontSize: 14, color: 'var(--c-body)', lineHeight: 1.9, margin: 0 }}>
          {t(
            <><span>確認メールを </span><strong>{email}</strong><span> にお送りしました。</span><br />届かない場合は迷惑メールフォルダをご確認ください。</>,
            <><span>A confirmation email has been sent to </span><strong>{email}</strong><span>.</span><br />If you don't see it, check your spam folder.</>
          )}
        </p>
      </div>
      {/* 予約内容は白いカードの中に2列で表示する */}
      <div style={{ background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, padding: '24px 28px', textAlign: 'left', marginBottom: 32 }}>
        <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 16px' }}>{t('予約内容', 'Reservation Details')}</p>
        {/* 1. 予約内容をラベルと値の2列で並べ、項目間に既存の区切り線を表示する */}
        {confirmRows.map(({ label, value }) => (
          <div key={label} style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 12, padding: '8px 0', borderBottom: '1px solid #f0f0f5' }}>
            <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>{label}</span>
            <span style={{ fontSize: 14, color: 'var(--c-ink)' }}>{value}</span>
          </div>
        ))}
      </div>
      <Link to="/official/events" style={{ display: 'inline-block', padding: '12px 28px', border: '1px solid #dddde8', borderRadius: 4, color: 'var(--c-muted)', textDecoration: 'none', fontSize: 14 }}>
        {t('イベント一覧へ戻る', 'Back to events')}
      </Link>
    </div>
  )
}
