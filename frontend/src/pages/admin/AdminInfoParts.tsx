import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'

/*
 * イベント管理情報の確認画面（EventAdminInfoView.tsx）と編集画面（EventAdminInfo.tsx）で
 * 共通に使う部品（セクションの枠・画像の拡大表示）
 */

/**
 * セクション（搬入・搬出、宿泊など）を囲む枠コンポーネント。確認画面・編集画面で共通に使う
 * @param label - セクション見出し
 * @param hint - 見出し右側に表示する補足テキスト（任意）
 * @param children - セクション内のコンテンツ
 * @returns 見出しと白い枠で囲んだ中身
 */
export function SectionBox({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      {/* 見出しと補足。狭い幅では補足が下に折り返す */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10, rowGap: 2, marginBottom: 8 }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: 'var(--c-muted)', textTransform: 'uppercase' }}>
          {label}
        </div>
        {/* 補足（指定されたときだけ） */}
        {hint && <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>{hint}</span>}
      </div>
      {/* 中身を囲む白い枠 */}
      <div style={{ background: '#ffffff', border: '1px solid #dddde8', borderRadius: 4, padding: '16px', minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}

/** 拡大表示の操作ボタン（閉じる・前へ・次へ）の見た目。スマホでも押しやすいよう 44px 以上にする */
const viewerButtonStyle: React.CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  padding: '10px 16px',
  border: '1px solid rgba(255,255,255,0.4)',
  borderRadius: 4,
  background: 'rgba(0,0,0,0.4)',
  color: '#ffffff',
  fontSize: 14,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

/**
 * 画像を画面いっぱいに拡大表示するオーバーレイ
 * 背景タップ・閉じるボタン・Esc キーで閉じ、複数枚のときは前へ／次へボタンと左右キーで切り替える。
 * 表示中は後ろのページがスクロールしないよう body のスクロールを止める
 * @param urls - 表示する画像 URL の一覧
 * @param index - 表示中の画像の位置（0始まり）
 * @param onChange - 表示する画像を切り替えるときに呼ぶ（新しい位置を渡す）
 * @param onClose - 閉じるときに呼ぶ
 * @returns body 直下に出す拡大表示のオーバーレイ
 */
export function ImageViewer({ urls, index, onChange, onClose }: {
  urls: string[]
  index: number
  onChange: (index: number) => void
  onClose: () => void
}) {
  /** 前の画像があるかどうか（先頭では前へを押せない） */
  const hasPrev = index > 0
  /** 次の画像があるかどうか（末尾では次へを押せない） */
  const hasNext = index < urls.length - 1

  // 表示中は body のスクロールを止め、閉じたら元の値に戻す（共通のフック。ほかの部品と同時に止めても途中で解除されない）
  useBodyScrollLock(true)

  // Esc で閉じる・左右キーで前後の画像に切り替える
  useEffect(() => {
    /**
     * 押されたキーに応じて閉じる・前後の画像に切り替える
     * @param e - キーボードのイベント
     * @returns 戻り値なし。
     */
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && hasPrev) onChange(index - 1)
      else if (e.key === 'ArrowRight' && hasNext) onChange(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, hasPrev, hasNext, onChange, onClose])

  // 管理画面のレイアウト（親要素の transform など）の影響を受けないよう body 直下に出す
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="出店要項の画像の拡大表示"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex',
        flexDirection: 'column',
        padding: 'max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))',
        boxSizing: 'border-box',
      }}
    >
      {/* 上部: 何枚目かの表示と閉じるボタン */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <span style={{ color: '#ffffff', fontSize: 14 }}>
          {urls.length > 1 ? `${index + 1} / ${urls.length}` : ''}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose() }}
          style={viewerButtonStyle}
        >
          閉じる
        </button>
      </div>

      {/* 中央: 画像。残りの高さに収まるよう contain で縮小する。画像以外の余白をタップすると閉じる */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 0' }}>
        <img
          src={urls[index]}
          alt={`出店要項の画像 ${index + 1}`}
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
        />
      </div>

      {/* 下部: 複数枚のときだけ前へ／次へボタンを出す。端のボタンを disabled にすると、押したクリックが背景に届いて閉じてしまうブラウザがあるため aria-disabled で表す */}
      {urls.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexShrink: 0 }}>
          <button
            type="button"
            aria-disabled={!hasPrev}
            onClick={(e) => { e.stopPropagation(); if (hasPrev) onChange(index - 1) }}
            style={{ ...viewerButtonStyle, minWidth: 96, opacity: hasPrev ? 1 : 0.35, cursor: hasPrev ? 'pointer' : 'default' }}
          >
            &larr; 前へ
          </button>
          <button
            type="button"
            aria-disabled={!hasNext}
            onClick={(e) => { e.stopPropagation(); if (hasNext) onChange(index + 1) }}
            style={{ ...viewerButtonStyle, minWidth: 96, opacity: hasNext ? 1 : 0.35, cursor: hasNext ? 'pointer' : 'default' }}
          >
            次へ &rarr;
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}
