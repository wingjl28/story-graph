import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { api } from '../api'

const randomColor = () => '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')

export default function QuickTagMenu({ node, allTags, x, y, onClose, onChanged }) {
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#a78bfa')
  const [busy, setBusy] = useState(false)
  const menuRef = useRef(null)

  // Clamp to viewport
  const [pos, setPos] = useState({ x, y })
  useEffect(() => {
    if (!menuRef.current) return
    const { offsetWidth: w, offsetHeight: h } = menuRef.current
    setPos({
      x: Math.min(x, window.innerWidth - w - 8),
      y: Math.min(y, window.innerHeight - h - 8),
    })
  }, [x, y])

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose()
    }
    setTimeout(() => window.addEventListener('mousedown', handler), 0)
    return () => window.removeEventListener('mousedown', handler)
  }, [onClose])

  const nodeTagIds = new Set((node.tags || []).map(t => t.id))

  const toggle = async (tagId) => {
    setBusy(true)
    try {
      if (nodeTagIds.has(tagId)) {
        await api.removeNodeTag(node.id, tagId)
      } else {
        await api.addNodeTag(node.id, tagId)
      }
      await onChanged()
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setBusy(true)
    try {
      const tag = await api.createTag({ name: newName.trim(), color: newColor })
      await api.addNodeTag(node.id, tag.id)
      await onChanged()
      setNewName('')
      setNewColor('#a78bfa')
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      ref={menuRef}
      className="quick-tag-menu"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="ctx-header" style={{ borderBottom: '1px solid #2d3748', paddingBottom: 6, marginBottom: 4 }}>
        Tags — {node.label}
      </div>

      {allTags.length === 0 && (
        <div style={{ padding: '4px 10px 8px', fontSize: 12, color: '#4a5568' }}>No tags yet</div>
      )}
      {allTags.map(t => {
        const active = nodeTagIds.has(t.id)
        return (
          <button
            key={t.id}
            className={`ctx-item quick-tag-item${active ? ' active' : ''}`}
            onClick={() => toggle(t.id)}
            disabled={busy}
          >
            <span className="type-dot" style={{ background: t.color }} />
            <span style={{ flex: 1 }}>{t.name}</span>
            {active && <Icon icon="carbon:checkmark" width={13} style={{ color: '#68d391', flexShrink: 0 }} />}
          </button>
        )
      })}

      <div style={{ borderTop: '1px solid #2d3748', marginTop: 4, paddingTop: 6, padding: '6px 8px 6px' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            className="sb-filter-input"
            placeholder="New tag…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreate() } }}
            style={{ flex: 1 }}
          />
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
            style={{ width: 26, height: 26, padding: 1, border: '1px solid #4a5568', borderRadius: 4, cursor: 'pointer', background: 'none', flexShrink: 0 }} />
          <button className="btn-icon" type="button" onClick={() => setNewColor(randomColor())} title="Random color">
            <Icon icon="carbon:shuffle" width={13} />
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={handleCreate} disabled={busy || !newName.trim()} style={{ padding: '2px 7px' }}>
            <Icon icon="carbon:add" width={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
