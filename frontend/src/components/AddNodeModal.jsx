import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { api } from '../api'

const randomColor = () => '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')

export default function AddNodeModal({ nodeTypes, allTags, initialData, existingMetaKeys, onSave, onClose, onTagCreated, graphId = 1 }) {
  const isEditing = !!initialData?.id
  const [name, setName] = useState(initialData?.label || '')
  const [typeId, setTypeId] = useState(
    initialData?.type_id ? String(initialData.type_id) : (nodeTypes[0]?.id ? String(nodeTypes[0].id) : ''),
  )
  const [description, setDescription] = useState(initialData?.description || '')
  const [date, setDate] = useState(initialData?.date || '')
  const [tagIds, setTagIds] = useState(initialData?.tags?.map(t => t.id) || [])
  const [kvPairs, setKvPairs] = useState(
    Object.entries(initialData?.metadata || {}).map(([k, v]) => ({ k, v: String(v) })),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Inline new tag state
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#a78bfa')
  const [creatingTag, setCreatingTag] = useState(false)

  // Drag state
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

  useEffect(() => {
    if (!typeId && nodeTypes.length > 0) setTypeId(String(nodeTypes[0].id))
  }, [nodeTypes]) // eslint-disable-line react-hooks/exhaustive-deps

  const addKv = () => setKvPairs((p) => [...p, { k: '', v: '' }])
  const removeKv = (i) => setKvPairs((p) => p.filter((_, idx) => idx !== i))
  const updateKv = (i, field, value) =>
    setKvPairs((p) => p.map((pair, idx) => (idx === i ? { ...pair, [field]: value } : pair)))

  const selectedType = nodeTypes.find((t) => String(t.id) === typeId)
  const isDateType = selectedType?.is_date_type ?? false

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    setCreatingTag(true)
    try {
      const newTag = await api.createTag({ name: newTagName.trim(), color: newTagColor })
      setTagIds(prev => [...prev, newTag.id])
      setNewTagName('')
      setNewTagColor('#a78bfa')
      onTagCreated?.(newTag)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreatingTag(false)
    }
  }

  const buildPayload = () => {
    const metadata = {}
    for (const { k, v } of kvPairs) {
      if (k.trim()) metadata[k.trim()] = v
    }
    return {
      name: name.trim(),
      type_id: parseInt(typeId),
      graph_id: graphId,
      description: description.trim() || null,
      metadata,
      date: isDateType ? (date.trim() || null) : null,
      tag_ids: tagIds,
    }
  }

  const doSave = async (keepOpen) => {
    if (!name.trim() || !typeId) return
    setSaving(true)
    setError(null)
    try {
      let createdNode = null
      if (isEditing) {
        await api.updateNode(initialData.id, buildPayload())
      } else {
        createdNode = await api.createNode(buildPayload())
      }
      await onSave(keepOpen, createdNode)
      if (keepOpen) {
        setName('')
        setDescription('')
        setDate('')
        setTagIds([])
        setKvPairs([])
        setError(null)
        document.getElementById('add-node-name')?.focus()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const modalStyle = pos
    ? { position: 'fixed', top: pos.y, left: pos.x, transform: 'none' }
    : {}

  return (
    <div ref={modalRef} className="modal floating-modal" style={modalStyle}>
      <div className="modal-header panel-drag-handle" onMouseDown={onHeaderMouseDown} style={{ cursor: 'grab' }}>
        <span className="modal-title">{isEditing ? 'Edit Node' : 'Add Node'}</span>
        <button className="panel-close" onClick={onClose} title="Close">
          <Icon icon="carbon:close" width={18} />
        </button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); doSave(false) }}>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input
              id="add-node-name"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Harry Potter"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Type *</label>
            <select
              className="form-select"
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              required
            >
              {nodeTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Tags</label>
            {allTags && allTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {allTags.map(t => {
                  const active = tagIds.includes(t.id)
                  return (
                    <button key={t.id} type="button"
                      className={`filter-type-pill${active ? '' : ' hidden-type'}`}
                      style={{ borderColor: active ? t.color : undefined }}
                      onClick={() => setTagIds(prev => active ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                    >
                      <span className="type-dot" style={{ background: active ? t.color : '#4a5568' }} />
                      {t.name}
                    </button>
                  )
                })}
              </div>
            )}
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <input
                className="form-input"
                placeholder="New tag name…"
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateTag() } }}
                style={{ flex: 1 }}
              />
              <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)}
                style={{ width: 32, height: 32, padding: 2, border: '1px solid #4a5568', borderRadius: 4, cursor: 'pointer', background: 'none' }} />
              <button type="button" className="btn-icon" onClick={() => setNewTagColor(randomColor())} title="Random color">
                <Icon icon="carbon:shuffle" width={14} />
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleCreateTag} disabled={creatingTag || !newTagName.trim()}>
                {creatingTag ? '…' : <Icon icon="carbon:add" width={14} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes…"
              rows={3}
            />
          </div>

          {isDateType && (
            <div className="form-group">
              <label className="form-label">Date</label>
              <input
                className="form-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="e.g. 2024-01-15, Year 342, Age of Fire…"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Extra Details</label>
            {kvPairs.length > 0 && (
              <div className="kv-list">
                {kvPairs.map((pair, i) => (
                  <div key={i} className="kv-row">
                    <input
                      className="form-input"
                      placeholder="Key"
                      list="node-meta-key-suggestions"
                      value={pair.k}
                      onChange={(e) => updateKv(i, 'k', e.target.value)}
                    />
                    <input
                      className="form-input"
                      placeholder="Value"
                      value={pair.v}
                      onChange={(e) => updateKv(i, 'v', e.target.value)}
                    />
                    <button type="button" className="kv-remove" onClick={() => removeKv(i)}>
                      <Icon icon="carbon:close" width={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <datalist id="node-meta-key-suggestions">
              {(existingMetaKeys || []).map((k) => <option key={k} value={k} />)}
            </datalist>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addKv}>+ Add field</button>
          </div>

          {error && <div style={{ color: '#fc8181', fontSize: 13 }}>{error}</div>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          {!isEditing && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={saving || !name.trim() || !typeId}
              onClick={() => doSave(true)}
            >
              {saving ? 'Saving…' : 'Save & Add Another'}
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving || !name.trim() || !typeId}>
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Node'}
          </button>
        </div>
      </form>
    </div>
  )
}
