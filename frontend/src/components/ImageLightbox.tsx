import { useEffect, useRef } from 'react'

interface Props {
  images: string[]
  index: number
  onClose: () => void
  onChange: (i: number) => void
}

export default function ImageLightbox({ images, index, onClose, onChange }: Props) {
  const touchX = useRef<number | null>(null)
  const n = images.length
  const prev = () => onChange((index - 1 + n) % n)
  const next = () => onChange((index + 1) % n)

  useEffect(() => {
    const saved = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', handle)
    return () => {
      document.body.style.overflow = saved
      window.removeEventListener('keydown', handle)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  const btn: React.CSSProperties = {
    background: 'rgba(255,255,255,0.14)', border: 'none', color: '#fff',
    width: 48, height: 48, borderRadius: '50%', cursor: 'pointer',
    fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.93)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {n > 1 && (
        <div style={{ position: 'absolute', top: 20, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 11, letterSpacing: '2px', pointerEvents: 'none' }}>
          {index + 1} / {n}
        </div>
      )}

      <button
        onClick={onClose}
        style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', padding: '6px 10px', lineHeight: 1, opacity: 0.7 }}
      >✕</button>

      <img
        src={images[index]}
        alt=""
        onClick={e => e.stopPropagation()}
        onTouchStart={e => { touchX.current = e.touches[0].clientX }}
        onTouchEnd={e => {
          if (touchX.current === null) return
          const d = touchX.current - e.changedTouches[0].clientX
          if (d > 40) next()
          else if (d < -40) prev()
          touchX.current = null
        }}
        draggable={false}
        style={{ maxWidth: '92vw', maxHeight: '88vh', objectFit: 'contain', display: 'block', userSelect: 'none' }}
      />

      {n > 1 && (
        <>
          <button onClick={e => { e.stopPropagation(); prev() }} style={{ ...btn, position: 'absolute', top: '50%', left: 12, transform: 'translateY(-50%)' }}>&#10094;</button>
          <button onClick={e => { e.stopPropagation(); next() }} style={{ ...btn, position: 'absolute', top: '50%', right: 12, transform: 'translateY(-50%)' }}>&#10095;</button>
        </>
      )}

      {n > 1 && (
        <div style={{ position: 'absolute', bottom: 20, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}>
          {images.map((_, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); onChange(i) }}
              style={{ width: 7, height: 7, borderRadius: '50%', padding: 0, border: 'none', cursor: 'pointer', background: i === index ? '#fff' : 'rgba(255,255,255,0.3)' }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
