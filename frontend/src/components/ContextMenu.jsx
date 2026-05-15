import { useEffect, useRef } from 'react'

export default function ContextMenu({ x, y, title, subtitle, items, onClose }) {
  const menuRef = useRef(null)

  useEffect(() => {
    const onDown = (e) => { if (!menuRef.current?.contains(e.target)) onClose() }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const style = { left: x, top: y }
  if (typeof window !== 'undefined') {
    if (x + 190 > window.innerWidth) style.left = x - 190
    if (y + 220 > window.innerHeight) style.top = y - 220
  }

  return (
    <div ref={menuRef} className="ctx-menu" style={style}>
      {title && <div className="ctx-header">{title}</div>}
      {subtitle && <div className="ctx-type">{subtitle}</div>}
      {(title || subtitle) && <div className="ctx-divider" />}
      {items.map((item, i) =>
        item === 'divider' ? (
          <div key={i} className="ctx-divider" />
        ) : (
          <button
            key={i}
            className={`ctx-item${item.danger ? ' ctx-item-danger' : ''}`}
            onMouseDown={(e) => { e.stopPropagation(); item.onClick(); onClose() }}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  )
}
