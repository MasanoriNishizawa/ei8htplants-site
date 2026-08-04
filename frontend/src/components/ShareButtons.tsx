import { useEffect, useState } from 'react'

const SANS = "'Noto Sans JP', sans-serif"

interface Props {
  url: string
  text: string
}

const IconX = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
)

const IconThreads = () => (
  <svg width="12" height="12" viewBox="0 0 192 192" fill="currentColor">
    <path d="M141.537 88.988a66.667 66.667 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.229c8.249.053 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.243-15.224-1.626-23.68-1.14-23.82 1.371-39.134 15.264-38.105 34.568.522 9.792 5.4 18.216 13.735 23.719 7.047 4.652 16.124 6.927 25.557 6.412 12.458-.683 22.231-5.436 29.049-14.127 5.178-6.6 8.453-15.153 9.899-25.93 5.937 3.583 10.337 8.298 12.767 13.966 4.132 9.635 4.373 25.468-8.546 38.376-11.319 11.308-24.925 16.2-45.488 16.351-22.809-.169-40.06-7.484-51.275-21.742C35.236 139.966 29.808 120.682 29.605 96c.203-24.682 5.63-43.966 16.133-57.317C56.954 24.425 74.204 17.11 97.013 16.94c22.975.17 40.526 7.52 52.171 21.847 5.71 7.026 10.015 15.86 12.853 26.162l16.147-4.308c-3.44-12.68-8.853-23.606-16.219-32.668C147.036 9.607 125.202.195 97.08 0h-.198C68.771.195 47.219 9.642 32.822 28.08 19.956 44.38 13.245 67.489 13.01 96v.28c.235 28.51 6.946 51.62 19.812 67.92C47.219 182.558 68.771 192.005 96.882 192h.199c24.816-.176 42.44-6.708 56.959-21.216 18.719-18.707 18.146-42.098 11.973-56.486-4.334-10.112-12.613-18.344-25.476-25.31z" />
  </svg>
)

const btnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontFamily: SANS, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase',
  textDecoration: 'none', color: 'var(--c-muted)',
  border: '1px solid var(--c-border)', padding: '6px 12px',
  background: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
  transition: 'color 0.15s, border-color 0.15s',
}

export default function ShareButtons({ url, text }: Props) {
  const [canShare, setCanShare] = useState(false)

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  const enc = (s: string) => encodeURIComponent(s)
  const xUrl = `https://x.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`
  const threadsUrl = `https://www.threads.net/intent/post?text=${enc(text + '\n' + url)}`

  const handleWebShare = async () => {
    try { await navigator.share({ title: text, url }) } catch { /* cancelled */ }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <a
        href={xUrl} target="_blank" rel="noopener noreferrer"
        style={btnStyle}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--c-ink)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-ink)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--c-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)' }}
      >
        <IconX /> Post on X
      </a>
      <a
        href={threadsUrl} target="_blank" rel="noopener noreferrer"
        style={btnStyle}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--c-ink)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-ink)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--c-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)' }}
      >
        <IconThreads /> Share on Threads
      </a>
      {canShare && (
        <button
          onClick={handleWebShare}
          style={btnStyle}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--c-ink)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-ink)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--c-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)' }}
        >
          Share
        </button>
      )}
    </div>
  )
}
