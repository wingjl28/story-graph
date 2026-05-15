import { useState, useEffect } from 'react'
import { api } from '../api'

export default function RelTypeManager({ onClose, embedded = false, onUpdate }) {
  const [relTypes, setRelTypes] = useState([])

  useEffect(() => {
    api.getRelTypes().then(setRelTypes).catch(() => {})
  }, [])

  const handleColorChange = async (label, color) => {
    try {
      const updated = await api.updateRelType(label, { color })
      setRelTypes((prev) => prev.map((rt) => rt.label === label ? updated : rt))
      onUpdate?.()
    } catch (e) {
      console.error(e)
    }
  }

  const innerContent = (
    <>
      {relTypes.length === 0 ? (
        <div className="empty-state">No relationship types yet. Create some relationships first.</div>
      ) : (
        <div className="rel-type-list">
          {relTypes.map((rt) => (
            <div key={rt.label} className="rel-type-item">
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  type="color"
                  value={rt.color}
                  onChange={(e) => handleColorChange(rt.label, e.target.value)}
                  className="rel-type-color-input"
                  title="Pick color"
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 6px', fontSize: 12 }}
                  onClick={() => handleColorChange(rt.label, '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0'))}
                >🎲</button>
              </div>
              <span className="rel-type-label">{rt.label}</span>
              <span className="rel-type-count">{rt.count} rel{rt.count !== 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )

  if (embedded) {
    return innerContent
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Relationship Colors</span>
          <button className="panel-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {innerContent}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
