import { Link } from 'react-router-dom'
import type { Event } from '../../lib/apiTypes'
import { formatYen } from '../../lib/format'
import { WS_FEE_YEN } from '../../lib/constants'

/** 予約ページから受け取る翻訳関数の型 */
type Translate = <T>(ja: T, en: T) => T

/**
 * 予約対象イベントの概要と、ワークショップ・問い合わせ案内を表示する。
 * イベント情報の取得や予約フォームの状態管理には関与しない。
 * @param props.event - 予約対象イベント
 * @param props.t - 表示言語に合わせて文言を選ぶ翻訳関数
 * @returns 予約ページ左カラムのイベント案内
 */
export default function EventInfoPanel({ event, t }: { event: Event; t: Translate }) {
  // 1. イベントの日程・会場とワークショップの案内を表示する
  // 2. 予約ページ内の詳細・問い合わせリンクは既存の遷移先を維持する
  return (
    <div style={{ color: 'var(--c-body)' }}>
      <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--c-muted)', margin: '0 0 10px' }}>Event</p>
      <p style={{ fontSize: 17, fontWeight: 500, color: 'var(--c-ink)', margin: '0 0 12px', lineHeight: 1.5 }}>{event.name}</p>
      <div style={{ fontSize: 14, color: 'var(--c-body)', lineHeight: 2.1, background: 'var(--c-surface)', border: '1px solid var(--c-border)', padding: '16px 20px', borderRadius: 4 }}>
        <div>{event.start_date}{event.end_date && event.end_date !== event.start_date ? ` 〜 ${event.end_date}` : ''}</div>
        {event.time && <div>{event.time}</div>}
        <div style={{ fontWeight: 500 }}>{event.location}</div>
      </div>
      <div style={{ marginTop: 24, padding: '20px 24px', background: '#f0f5ee', borderRadius: 4, border: '1px solid #c8dcc4' }}>
        <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#6a8a64', margin: '0 0 12px' }}>Workshop</p>
        <p style={{ fontSize: 15, color: 'var(--c-ink)', lineHeight: 1.8, margin: '0 0 16px' }}>
          {t(
            <>植物の自生地を鉢の中で再現するハビタットスタイルのワークショップです。<br />石・砂と植物を組み合わせて、はじめての方でも楽しめます。<br />植物・鉢はご持参いただいたものでもご参加いただけます。</>,
            <>A habitat-style workshop where you recreate a plant's natural environment in a pot.<br />Combine stone, sand, and plants — perfect for first-timers.<br />Feel free to bring your own plants or pots.</>
          )}
        </p>
        <div style={{ paddingTop: 14, borderTop: '1px solid #c8dcc4' }}>
          <span style={{ fontSize: 11, letterSpacing: 1, color: '#6a8a64' }}>{t('参加費', 'Fee')}</span>
          <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '0.02em', margin: '4px 0 2px' }}>{t(formatYen(WS_FEE_YEN, 'suffix'), formatYen(WS_FEE_YEN))}</p>
          <p style={{ fontSize: 12, color: 'var(--c-muted)', margin: 0 }}>{t('鉢・資材含む / 植物別', 'Pot & materials included / Plants extra')}</p>
        </div>
        {/* 自サイトの詳細ページを別タブで開き、入力途中の予約内容を保てるようにする */}
        <Link
          to="/habitatoides/workshop"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-block', marginTop: 14, fontSize: 13, color: '#4a6741', textDecoration: 'underline', textUnderlineOffset: 3 }}
        >
          {t('詳しくはこちら', 'Learn more')}
        </Link>
      </div>
      <div style={{ marginTop: 16, padding: '16px 20px', background: 'var(--c-bg)', borderRadius: 4, border: '1px solid var(--c-border)' }}>
        <p style={{ fontSize: 13, color: 'var(--c-muted)', lineHeight: 1.9, margin: 0 }}>
          {t(
            <>ご記入いただいた内容を確認後、メールにて予約確認をお送りします。<br />ご不明な点は <Link to="/official/contact" style={{ color: 'var(--c-green)', textDecoration: 'underline', textUnderlineOffset: 3 }}>お問い合わせ</Link> ください。</>,
            <>After reviewing your submission, we'll send a confirmation email.<br />Questions? <Link to="/official/contact" style={{ color: 'var(--c-green)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Contact us</Link>.</>
          )}
        </p>
      </div>
    </div>
  )
}
