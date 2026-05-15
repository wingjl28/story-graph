import { useState, useMemo, useRef } from 'react'
import { Icon } from '@iconify/react'
import { api } from '../api'

export default function AddRelationshipModal({ nodes, sourceId, sourceIds, existingLabels, existingMetaKeys, onSave, onClose }) {
  const [sources, setSources] = useState(() => {
    if (sourceIds && sourceIds.length > 0) return sourceIds
    if (sourceId) return [sourceId]
    return []
  })
  const [targets, setTargets] = useState([])
  const [label, setLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [kvPairs, setKvPairs] = useState([])
  const [bidirectional, setBidirectional] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [sourceSearch, setSourceSearch] = useState('')
  const [targetSearch, setTargetSearch] = useState('')
  const [pos, setPos] = useState(null)
  const modalRef = useRef(null)

  const onHeaderMouseDown = (e) => {
    if (e.target.closest('button, input, select, textarea, label')) return
    e.preventDefault()
    const rect = modalRef.current.getBoundingClientRect()
    const offX = e.clientX - rect.left
    const offY = e.clientY - rect.top
    const onMove = (e) => setPos({ x: e.clientX - offX, y: e.clientY - offY })
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const addKv = () => setKvPairs((p) => [...p, { k: '', v: '' }])
  const removeKv = (i) => setKvPairs((p) => p.filter((_, idx) => idx !== i))
  const updateKv = (i, field, value) =>
    setKvPairs((p) => p.map((pair, idx) => (idx === i ? { ...pair, [field]: value } : pair)))

  const nodeMap = useMemo(() => Object.fromEntries(nodes.map((n) => [String(n.id), n])), [nodes])

  const filteredSources = useMemo(() => {
    const set = new Set(sources.map(String))
    return nodes.filter((n) => !set.has(String(n.id)) && (!sourceSearch || n.label.toLowerCase().includes(sourceSearch.toLowerCase())))
  }, [nodes, sources, sourceSearch])

  const filteredTargets = useMemo(() => {
    const set = new Set(targets.map(String))
    return nodes.filter((n) => !set.has(String(n.id)) && (!targetSearch || n.label.toLowerCase().includes(targetSearch.toLowerCase())))
  }, [nodes, targets, targetSearch])

  const addSource = (id) => { setSources((p) => [...p, id]) }
  const removeSource = (id) => setSources((p) => p.filter((s) => String(s) !== String(id)))
  const addTarget = (id) => { setTargets((p) => [...p, id]) }
  const removeTarget = (id) => setTargets((p) => p.filter((t) => String(t) !== String(id)))

  const swap = () => {
    setSources(targets)
    setTargets(sources)
    setSourceSearch('')
    setTargetSearch('')
  }

  const resetForm = () => {
    setLabel('')
    setNotes('')
    setKvPairs([])
    setTargets([])
    setTargetSearch('')
    setError(null)
  }

  const doSave = async (keepOpen) => {
    if (!sources.length || !targets.length || !label.trim()) return
    setSaving(true)
    setError(null)
    const metadata = {}
    for (const { k, v } of kvPairs) {
      if (k.trim()) metadata[k.trim()] = v
    }

    // Build unique (source, target) pairs
    const seen = new Set()
    const pairs = []
    for (const s of sources) {
      for (const t of targets) {
        const sid = parseInt(s), tid = parseInt(t)
        if (sid === tid) continue
        const fwd = `${sid}-${tid}`
        if (!seen.has(fwd)) { seen.add(fwd); pairs.push([sid, tid]) }
        if (bidirectional) {
          const rev = `${tid}-${sid}`
          if (!seen.has(rev)) { seen.add(rev); pairs.push([tid, sid]) }
        }
      }
    }

    try {
      let created = 0, skipped = 0
      for (const [sid, tid] of pairs) {
        try {
          await api.createRelationship({
            source_id: sid,
            target_id: tid,
            label: label.trim(),
            notes: notes.trim() || null,
            metadata,
          })
          created++
        } catch (err) {
          if (err.message.includes('already exists')) skipped++
          else throw err
        }
      }
      await onSave(keepOpen)
      if (keepOpen) {
        resetForm()
        if (skipped > 0) setError(`Created ${created}, skipped ${skipped} duplicate(s).`)
        document.getElementById('rel-label-input')?.focus()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const canSave = sources.length > 0 && targets.length > 0 && label.trim()

  const modalStyle = pos
    ? { position: 'fixed', top: pos.y, left: pos.x, transform: 'none' }
    : {}

  return (
    <div ref={modalRef} className="modal modal-lg floating-modal" style={modalStyle}>
      <div className="modal-header panel-drag-handle" onMouseDown={onHeaderMouseDown} style={{ cursor: 'grab' }}>
        <span className="modal-title">Add Relationship</span>
        <button className="panel-close" onClick={onClose} title="Close">
          <Icon icon="carbon:close" width={18} />
        </button>
      </div>

        <form onSubmit={(e) => { e.preventDefault(); doSave(false) }}>
          <div className="modal-body">

            {/* Source */}
            <div className="form-group">
              <label className="form-label">From (source) *</label>
              <ChipList items={sources.map((id) => nodeMap[String(id)]).filter(Boolean)} onRemove={removeSource} />
              <NodePicker nodes={filteredSources} search={sourceSearch} onSearch={setSourceSearch} onSelect={addSource} placeholder="Search and add source nodes…" />
            </div>

            {/* Swap */}
            <div style={{ display: 'flex', justifyContent: 'center', margin: '-4px 0' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={swap} title="Swap sources and targets" style={{ fontSize: 16, padding: '2px 10px' }}>
                ↕ Swap
              </button>
            </div>

            {/* Label + bidirectional */}
            <div className="form-group">
              <label className="form-label">Relationship label *</label>
              <input
                id="rel-label-input"
                className="form-input"
                list="rel-label-suggestions"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Is Father Of, Wields, Appears In…"
                autoFocus={!!sourceId}
              />
              <datalist id="rel-label-suggestions">
                {(existingLabels || []).map((l) => <option key={l} value={l} />)}
              </datalist>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -8, marginBottom: 10 }}>
              <input
                type="checkbox"
                id="rel-bidirectional"
                checked={bidirectional}
                onChange={(e) => setBidirectional(e.target.checked)}
                style={{ accentColor: '#6366f1', width: 14, height: 14, cursor: 'pointer' }}
              />
              <label htmlFor="rel-bidirectional" style={{ fontSize: 13, color: '#718096', cursor: 'pointer', userSelect: 'none' }}>
                Bidirectional (also create reverse relationships)
              </label>
            </div>

            <div style={{ textAlign: 'center', margin: '-4px 0 6px', color: '#4a5568', fontSize: 20 }}>↓</div>

            {/* Target */}
            <div className="form-group">
              <label className="form-label">To (target) *</label>
              <ChipList items={targets.map((id) => nodeMap[String(id)]).filter(Boolean)} onRemove={removeTarget} />
              <NodePicker nodes={filteredTargets} search={targetSearch} onSearch={setTargetSearch} onSelect={addTarget} placeholder="Search and add target nodes…" />
            </div>

            {/* Notes */}
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional context…"
                rows={2}
              />
            </div>

            {/* Extra Details */}
            <div className="form-group">
              <label className="form-label">Extra Details</label>
              {kvPairs.length > 0 && (
                <div className="kv-list">
                  {kvPairs.map((pair, i) => (
                    <div key={i} className="kv-row">
                      <input
                        className="form-input"
                        placeholder="Key"
                        list="rel-meta-key-suggestions"
                        value={pair.k}
                        onChange={(e) => updateKv(i, 'k', e.target.value)}
                      />
                      <input
                        className="form-input"
                        placeholder="Value"
                        value={pair.v}
                        onChange={(e) => updateKv(i, 'v', e.target.value)}
                      />
                      <button type="button" className="kv-remove" onClick={() => removeKv(i)}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <datalist id="rel-meta-key-suggestions">
                {(existingMetaKeys || []).map((k) => <option key={k} value={k} />)}
              </datalist>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addKv}>+ Add field</button>
            </div>

            {error && (
              <div style={{ color: error.startsWith('Created') ? '#68d391' : '#fc8181', fontSize: 13 }}>
                {error}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={saving || !canSave}
              onClick={() => doSave(true)}
            >
              {saving ? 'Saving…' : 'Save & Add Another'}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !canSave}>
              {saving ? 'Saving…' : 'Add Relationship'}
            </button>
          </div>
        </form>
    </div>
  )
}

function ChipList({ items, onRemove }) {
  if (!items.length) return null
  return (
    <div className="node-chips">
      {items.map((n) => (
        <div key={n.id} className="node-chip">
          <span className="type-dot" style={{ background: n.color }} />
          <span>{n.label}</span>
          <button type="button" className="node-chip-remove" onClick={() => onRemove(n.id)}>×</button>
        </div>
      ))}
    </div>
  )
}

function NodePicker({ nodes, search, onSearch, onSelect, placeholder }) {
  return (
    <div>
      <input
        className="form-input"
        placeholder={placeholder}
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        style={{ marginBottom: 6 }}
      />
      <div style={{ background: '#0f1117', border: '1px solid #2d3748', borderRadius: 6, maxHeight: 120, overflowY: 'auto' }}>
        {nodes.length === 0 && (
          <div style={{ padding: '8px 12px', color: '#4a5568', fontSize: 13 }}>No nodes found</div>
        )}
        {nodes.map((n) => (
          <div
            key={n.id}
            onClick={() => onSelect(n.id)}
            style={{ padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#2d3748')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '')}
          >
            <span className="type-dot" style={{ background: n.color }} />
            <span style={{ flex: 1 }}>{n.label}</span>
            <span style={{ fontSize: 11, color: '#4a5568' }}>{n.type}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
