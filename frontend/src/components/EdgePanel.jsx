import { useState, useRef } from 'react'
import { Icon } from '@iconify/react'
import { api } from '../api'

export default function EdgePanel({ edgeData, onDelete, onClose, onSaved, existingLabels, existingMetaKeys }) {
  const [editing, setEditing] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef(null)

  const onMouseDown = (e) => {
    if (e.target.closest('button, input, select, textarea')) return
    e.preventDefault()
    const start = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y }
    const onMove = (e) => setOffset({ x: start.ox + e.clientX - start.mx, y: start.oy + e.clientY - start.my })
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  const [label, setLabel] = useState(edgeData.label)
  const [notes, setNotes] = useState(edgeData.notes || '')
  const [kvPairs, setKvPairs] = useState(
    Object.entries(edgeData.metadata || {}).map(([k, v]) => ({ k, v: String(v) })),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSwap = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.swapRelationship(edgeData.rel_id)
      onSaved?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleBidir = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.toggleBidirectional(edgeData.rel_id)
      onSaved?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const addKv = () => setKvPairs((p) => [...p, { k: '', v: '' }])
  const removeKv = (i) => setKvPairs((p) => p.filter((_, idx) => idx !== i))
  const updateKv = (i, field, value) =>
    setKvPairs((p) => p.map((pair, idx) => (idx === i ? { ...pair, [field]: value } : pair)))

  const handleSave = async () => {
    if (!label.trim()) return
    setSaving(true)
    setError(null)
    const metadata = {}
    for (const { k, v } of kvPairs) {
      if (k.trim()) metadata[k.trim()] = v
    }
    try {
      await api.updateRelationship(edgeData.rel_id, {
        label: label.trim(),
        notes: notes.trim() || null,
        metadata,
      })
      setEditing(false)
      onSaved?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const cancelEdit = () => {
    setEditing(false)
    setLabel(edgeData.label)
    setNotes(edgeData.notes || '')
    setKvPairs(Object.entries(edgeData.metadata || {}).map(([k, v]) => ({ k, v: String(v) })))
    setError(null)
  }

  const metaEntries = Object.entries(edgeData.metadata || {})

  return (
    <aside className="right-panel" style={{ transform: `translate(${offset.x}px, ${offset.y}px)`, cursor: 'default' }}>
      <div className="panel-header panel-drag-handle" ref={dragRef} onMouseDown={onMouseDown}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="panel-type-badge">Relationship</div>
          <div className="panel-title" style={{ color: '#a78bfa' }}>{edgeData.label}</div>
        </div>
        <button className="panel-close" onClick={onClose}><Icon icon="carbon:close" width={18} /></button>
      </div>

      {/* Action buttons moved to top */}
      {!editing && (
        <div className="panel-actions" style={{ borderBottom: '1px solid #2d3748', borderTop: 'none', marginBottom: 0 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
            <Icon icon="carbon:edit" width={13} style={{ marginRight: 4 }} />Edit
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleSwap} disabled={saving} title="Swap direction">
            {saving ? '…' : <><Icon icon="carbon:arrows-vertical" width={13} style={{ marginRight: 4 }} />Swap</>}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleToggleBidir}
            disabled={saving}
            title={edgeData.bidirectional ? 'Make uni-directional' : 'Make bi-directional'}
          >
            {saving ? '…' : edgeData.bidirectional
              ? <><Icon icon="carbon:arrow-right" width={13} style={{ marginRight: 4 }} />Uni-dir</>
              : <><Icon icon="carbon:arrows-horizontal" width={13} style={{ marginRight: 4 }} />Bi-dir</>
            }
          </button>
          <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={onDelete}>
            <Icon icon="carbon:trash-can" width={13} style={{ marginRight: 4 }} />Delete
          </button>
        </div>
      )}

      <div className="panel-body">
        {/* From / To */}
        <div>
          <div className="panel-section-label">From</div>
          <div className="panel-section-value">{edgeData.source_name || edgeData.source}</div>
        </div>
        <div>
          <div className="panel-section-label">To</div>
          <div className="panel-section-value">{edgeData.target_name || edgeData.target}</div>
        </div>

        {!editing ? (
          <>
            {edgeData.notes && (
              <div>
                <div className="panel-section-label">Notes</div>
                <div className="panel-section-value">{edgeData.notes}</div>
              </div>
            )}
            {metaEntries.length > 0 && (
              <div>
                <div className="panel-section-label">Details</div>
                {metaEntries.map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 4 }}>
                    <span style={{ color: '#718096', minWidth: 80, flexShrink: 0 }}>{k}</span>
                    <span style={{ color: '#cbd5e0', wordBreak: 'break-word' }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="edge-edit-row">
            <div className="form-group">
              <label className="form-label">Label</label>
              <input
                className="form-input"
                list="edge-label-suggestions"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                autoFocus
              />
              <datalist id="edge-label-suggestions">
                {(existingLabels || []).map((l) => <option key={l} value={l} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Extra Details</label>
              {kvPairs.length > 0 && (
                <div className="kv-list">
                  {kvPairs.map((pair, i) => (
                    <div key={i} className="kv-row">
                      <input
                        className="form-input"
                        placeholder="Key"
                        list="edge-meta-key-suggestions"
                        value={pair.k}
                        onChange={(e) => updateKv(i, 'k', e.target.value)}
                      />
                      <input
                        className="form-input"
                        placeholder="Value"
                        value={pair.v}
                        onChange={(e) => updateKv(i, 'v', e.target.value)}
                      />
                      <button type="button" className="kv-remove" onClick={() => removeKv(i)}><Icon icon="carbon:close" width={13} /></button>
                    </div>
                  ))}
                </div>
              )}
              <datalist id="edge-meta-key-suggestions">
                {(existingMetaKeys || []).map((k) => <option key={k} value={k} />)}
              </datalist>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addKv}>+ Add field</button>
            </div>
            {error && <div style={{ color: '#fc8181', fontSize: 12 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !label.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {error && !editing && (
        <div style={{ padding: '0 16px 10px', color: '#fc8181', fontSize: 12 }}>{error}</div>
      )}
    </aside>
  )
}
