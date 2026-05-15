import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { api } from '../api'

const randomColor = () => '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')

export default function AddNodeModal({
  nodeTypes: propNodeTypes,
  allTags,
  initialData,
  existingMetaKeys,
  existingRelLabels,
  nodes,
  onSave,
  onClose,
  onTagCreated,
  onTypeCreated,
  graphId = 1,
}) {
  const isEditing = !!initialData?.id
  const [name, setName] = useState(initialData?.label || '')
  const [typeId, setTypeId] = useState(
    initialData?.type_id ? String(initialData.type_id) : (propNodeTypes[0]?.id ? String(propNodeTypes[0].id) : ''),
  )
  const [description, setDescription] = useState(initialData?.description || '')
  const [date, setDate] = useState(initialData?.date || '')
  const [tagIds, setTagIds] = useState(initialData?.tags?.map(t => t.id) || [])
  const [kvPairs, setKvPairs] = useState(
    Object.entries(initialData?.metadata || {}).map(([k, v]) => ({ k, v: String(v) })),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Local node types (augmented by inline creations)
  const [extraTypes, setExtraTypes] = useState([])
  const nodeTypes = [...propNodeTypes, ...extraTypes]

  // Inline new tag
  const [showNewTag, setShowNewTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#a78bfa')
  const [creatingTag, setCreatingTag] = useState(false)

  // Inline new type
  const [showNewType, setShowNewType] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeColor, setNewTypeColor] = useState('#6366f1')
  const [creatingType, setCreatingType] = useState(false)

  // Pending relationships (only used when creating, not editing)
  const [pendingRels, setPendingRels] = useState([])

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
  }, [propNodeTypes]) // eslint-disable-line react-hooks/exhaustive-deps

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
      setShowNewTag(false)
      onTagCreated?.(newTag)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreatingTag(false)
    }
  }

  const handleCreateType = async () => {
    if (!newTypeName.trim()) return
    setCreatingType(true)
    try {
      const newType = await api.createNodeType({ name: newTypeName.trim(), color: newTypeColor })
      setExtraTypes(prev => [...prev, newType])
      setTypeId(String(newType.id))
      setNewTypeName('')
      setShowNewType(false)
      onTypeCreated?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setCreatingType(false)
    }
  }

  const addPendingRel = () =>
    setPendingRels(p => [...p, { id: Date.now(), label: '', direction: 'TO', targetId: '' }])
  const removePendingRel = (id) => setPendingRels(p => p.filter(r => r.id !== id))
  const updatePendingRel = (id, field, value) =>
    setPendingRels(p => p.map(r => r.id === id ? { ...r, [field]: value } : r))

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
        // Create any pending relationships
        for (const rel of pendingRels) {
          if (!rel.label.trim() || !rel.targetId) continue
          const srcId = rel.direction === 'TO' ? createdNode.id : parseInt(rel.targetId)
          const tgtId = rel.direction === 'TO' ? parseInt(rel.targetId) : createdNode.id
          try {
            await api.createRelationship({ source_id: srcId, target_id: tgtId, label: rel.label.trim() })
          } catch { /* skip duplicate */ }
        }
      }
      await onSave(keepOpen, createdNode)
      if (keepOpen) {
        setName('')
        setDescription('')
        setDate('')
        setTagIds([])
        setKvPairs([])
        setPendingRels([])
        setError(null)
        document.getElementById('add-node-name')?.focus()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const otherNodes = (nodes || []).filter(n => !isEditing || String(n.id) !== String(initialData?.id))
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

          {/* Type with inline creation */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <label className="form-label" style={{ margin: 0 }}>Type *</label>
              <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => setShowNewType(v => !v)}>
                {showNewType ? 'Cancel' : '+ New Type'}
              </button>
            </div>
            {showNewType ? (
              <div style={{ background: '#0f1117', border: '1px solid #2d3748', borderRadius: 6, padding: 10, marginBottom: 6 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    className="form-input"
                    placeholder="Type name…"
                    value={newTypeName}
                    onChange={e => setNewTypeName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateType() } }}
                    autoFocus
                    style={{ flex: 1 }}
                  />
                  <input type="color" value={newTypeColor} onChange={e => setNewTypeColor(e.target.value)}
                    style={{ width: 32, height: 32, padding: 2, border: '1px solid #4a5568', borderRadius: 4, cursor: 'pointer', background: 'none' }} />
                  <button type="button" className="btn-icon" onClick={() => setNewTypeColor(randomColor())} title="Random color">
                    <Icon icon="carbon:shuffle" width={14} />
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleCreateType}
                    disabled={creatingType || !newTypeName.trim()}>
                    {creatingType ? '…' : 'Create'}
                  </button>
                </div>
              </div>
            ) : (
              <select className="form-select" value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
                {nodeTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Tags with collapsible new-tag form */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <label className="form-label" style={{ margin: 0 }}>Tags</label>
              <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => setShowNewTag(v => !v)}>
                {showNewTag ? 'Cancel' : '+ New Tag'}
              </button>
            </div>
            {allTags && allTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: showNewTag ? 8 : 0 }}>
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
            {showNewTag && (
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 4 }}>
                <input
                  className="form-input"
                  placeholder="New tag name…"
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateTag() } }}
                  autoFocus
                  style={{ flex: 1 }}
                />
                <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)}
                  style={{ width: 32, height: 32, padding: 2, border: '1px solid #4a5568', borderRadius: 4, cursor: 'pointer', background: 'none' }} />
                <button type="button" className="btn-icon" onClick={() => setNewTagColor(randomColor())} title="Random color">
                  <Icon icon="carbon:shuffle" width={14} />
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleCreateTag}
                  disabled={creatingTag || !newTagName.trim()}>
                  {creatingTag ? '…' : <Icon icon="carbon:add" width={14} />}
                </button>
              </div>
            )}
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

          {/* Relationships (create-only) */}
          {!isEditing && (
            <div className="form-group">
              <label className="form-label">Relationships</label>
              {pendingRels.length > 0 && (
                <div className="kv-list" style={{ marginBottom: 8 }}>
                  {pendingRels.map(rel => (
                    <div key={rel.id} className="kv-row" style={{ alignItems: 'center', gap: 4 }}>
                      <input
                        className="form-input"
                        placeholder="Label…"
                        list="node-rel-label-suggestions"
                        value={rel.label}
                        onChange={e => updatePendingRel(rel.id, 'label', e.target.value)}
                        style={{ flex: 2 }}
                      />
                      <select
                        className="form-select"
                        value={rel.direction}
                        onChange={e => updatePendingRel(rel.id, 'direction', e.target.value)}
                        style={{ flex: '0 0 70px', padding: '8px 4px' }}
                      >
                        <option value="TO">→ TO</option>
                        <option value="FROM">← FROM</option>
                      </select>
                      <select
                        className="form-select"
                        value={rel.targetId}
                        onChange={e => updatePendingRel(rel.id, 'targetId', e.target.value)}
                        style={{ flex: 3 }}
                      >
                        <option value="">Select node…</option>
                        {otherNodes.map(n => (
                          <option key={n.id} value={n.id}>{n.label} ({n.type})</option>
                        ))}
                      </select>
                      <button type="button" className="kv-remove" onClick={() => removePendingRel(rel.id)}>
                        <Icon icon="carbon:close" width={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <datalist id="node-rel-label-suggestions">
                {(existingRelLabels || []).map(l => <option key={l} value={l} />)}
              </datalist>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addPendingRel}>+ Add Relationship</button>
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
