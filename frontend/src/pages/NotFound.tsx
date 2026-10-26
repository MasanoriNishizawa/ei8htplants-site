import { Link } from 'react-router-dom'
import PageMeta from '../components/PageMeta'
import { useT } from '../lib/lang'

/**
 * 存在しない URL を開いたときのページ（App.tsx の path="*"）。公開サイトのレイアウトの中に出す。
 * サーバーも存在しないページに noindex を付けているが、サイト内の移動でここへ来たときのために
 * 画面側でも検索エンジンに登録しないよう noindex を付ける
 * @returns 見つからない旨の案内とトップへのリンク
 */
export default function NotFound() {
  const t = useT()
  return (
    <>
      <PageMeta title={t('ページが見つかりません', 'Page Not Found')} description={t('お探しのページは見つかりませんでした。', 'The page you are looking for could not be found.')} />
      <meta name="robots" content="noindex" />
      {/* 案内の枠。中身の領域いっぱいに広げて中央に置く */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '96px 20px' }}>
        <p style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 'clamp(48px, 10vw, 88px)', fontWeight: 300, letterSpacing: '0.08em', color: 'var(--c-muted)', margin: '0 0 8px', lineHeight: 1 }}>
          404
        </p>
        <h1 style={{ fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 300, letterSpacing: '0.06em', color: 'var(--c-ink)', margin: '0 0 16px' }}>
          {t('ページが見つかりません', 'Page Not Found')}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--c-muted)', lineHeight: 1.9, margin: '0 0 32px' }}>
          {t(
            <>お探しのページは移動または削除された可能性があります。<br />URL をご確認ください。</>,
            <>The page may have been moved or deleted.<br />Please check the URL.</>
          )}
        </p>
        {/* トップへ戻るリンク（枠線の四角いボタン） */}
        <Link to="/official" style={{ display: 'inline-block', padding: '12px 28px', border: '1px solid var(--c-border)', borderRadius: 4, color: 'var(--c-ink)', textDecoration: 'none', fontSize: 14, letterSpacing: 1 }}>
          {t('トップページへ', 'Back to Home')}
        </Link>
      </div>
    </>
  )
}
