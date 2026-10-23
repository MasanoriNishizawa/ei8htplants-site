import { Link, useLocation } from 'react-router-dom'

/**
 * 管理画面で存在しない URL（/admin/xxx）を開いたときのページ（App.tsx の /admin の中の path="*"）。
 * 公開サイトの 404 ではなく、管理画面のレイアウト（サイドメニュー）の中に出し、ダッシュボードへ戻れるようにする
 * @returns 見つからない旨の案内とダッシュボードへのリンク
 */
export default function AdminNotFound() {
  // 開こうとした URL（どのアドレスが間違っていたかを分かるように出す）
  const { pathname } = useLocation()
  return (
    <div style={{ padding: '48px 0', maxWidth: 560 }}>
      {/* 検索エンジンに登録させない（管理画面は元々 noindex だが念のため） */}
      <meta name="robots" content="noindex" />
      <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, margin: '0 0 12px' }}>
        ページが見つかりません
      </h2>
      <p style={{ fontSize: 14, color: 'var(--c-muted)', lineHeight: 1.8, margin: '0 0 8px' }}>
        このアドレスの管理画面はありません。左のメニューから開き直してください。
      </p>
      {/* 開こうとしたアドレス（長い URL でも折り返す） */}
      <p style={{ fontSize: 12, color: 'var(--c-muted)', margin: '0 0 28px', wordBreak: 'break-all' }}>
        <code>{pathname}</code>
      </p>
      {/* ダッシュボードへ戻るリンク（濃い色の四角いボタン） */}
      <Link
        to="/admin"
        style={{ display: 'inline-block', padding: '10px 24px', background: 'var(--c-ink)', color: '#fff', borderRadius: 4, textDecoration: 'none', fontSize: 14 }}
      >
        ダッシュボードへ
      </Link>
    </div>
  )
}
