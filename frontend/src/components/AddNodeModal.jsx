import { useState, useEffect } from 'react'
import { api } from '../api'

export default function AddNodeModal({ nodeTypes, allTags, initialData, existingMetaKeys, onSave, onClose }) {
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

  useEffect(() => {
    if (!typeId && nodeTypes.length > 0) setTypeId(String(nodeTypes[0].id))
  }, [nodeTypes]) // eslint-disable-line react-hooks/exhaustive-deps

  const addKv = () => setKvPairs((p) => [...p, { k: '', v: '' }])
  const removeKv = (i) => setKvPairs((p) => p.filter((_, idx) => idx !== i))
  const updateKv = (i, field, value) =>
    setKvPairs((p) => p.map((pair, idx) => (idx === i ? { ...pair, [field]: value } : pair)))

  const selectedType = nodeTypes.find((t) => String(t.id) === typeId)
  const isDateType = selectedType?.is_date_type ?? false

  const buildPayload = () => {
    const metadata = {}
    for (const { k, v } of kvPairs) {
      if (k.trim()) metadata[k.trim()] = v
    }
    return {
      name: name.trim(),
      type_id: parseInt(typeId),
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

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{isEditing ? 'Edit Node' : 'Add Node'}</span>
          <button className="panel-close" onClick={onClose}>×</button>
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

            {allTags && allTags.length > 0 && (
              <div className="form-group">
                <label className="form-label">Tags</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
              </div>
            )}

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
                      <button type="button" className="kv-remove" onClick={() => removeKv(i)}>×</button>
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
    </div>
  )
}
