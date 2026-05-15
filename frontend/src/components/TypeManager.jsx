import { useState } from 'react'
import { Icon } from '@iconify/react'
import { api } from '../api'

export default function TypeManager({ nodeTypes, onUpdate, onClose, embedded = false, activeGraphId }) {
  const [editingId, setEditingId] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState(null)

  const handleDelete = async (type) => {
    if (!window.confirm(`Delete type "${type.name}"? This will fail if any nodes use it.`)) return
    setError(null)
    try {
      await api.deleteNodeType(type.id)
      await onUpdate()
    } catch (e) {
      setError(e.message)
    }
  }

  const innerContent = (
    <>
      {error && (
        <div style={{ color: '#fc8181', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: '#2d0a0a', borderRadius: 6 }}>
          {error}
        </div>
      )}

      <div className="type-list">
        {nodeTypes.map((t) =>
          editingId === t.id ? (
            <TypeForm
              key={t.id}
              initial={t}
              activeGraphId={activeGraphId}
              onSave={async (data) => {
                await api.updateNodeType(t.id, data)
                await onUpdate()
                setEditingId(null)
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={t.id} className="type-item">
              <span className="type-color-swatch" style={{ background: t.color }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="type-item-name">{t.name}</span>
                  {t.is_date_type && (
                    <span style={{ fontSize: 10, color: '#a78bfa', background: '#2d1f5e', border: '1px solid #6366f1', borderRadius: 10, padding: '1px 6px' }}>date</span>
                  )}
                  <span style={{
                    fontSize: 10,
                    color: (t.scope || 'shared') === 'shared' ? '#68d391' : '#f6ad55',
                    background: (t.scope || 'shared') === 'shared' ? '#1a3a2a' : '#3a2a0a',
                    border: `1px solid ${(t.scope || 'shared') === 'shared' ? '#38a169' : '#d97706'}`,
                    borderRadius: 10,
                    padding: '1px 6px',
                  }}>
                    {(t.scope || 'shared') === 'shared' ? 'Shared' : 'Story'}
                  </span>
                </div>
                {t.description && <div className="type-item-desc">{t.description}</div>}
              </div>
              <div className="type-item-actions">
                <button className="btn-icon" onClick={() => setEditingId(t.id)} title="Edit"><Icon icon="carbon:edit" width={14} /></button>
                <button className="btn-icon danger" onClick={() => handleDelete(t)} title="Delete"><Icon icon="carbon:trash-can" width={14} /></button>
              </div>
            </div>
          ),
        )}
      </div>

      {showNew ? (
        <TypeForm
          activeGraphId={activeGraphId}
          onSave={async (data) => {
            await api.createNodeType(data)
            await onUpdate()
            setShowNew(false)
          }}
          onCancel={() => setShowNew(false)}
        />
      ) : (
        <button className="btn btn-secondary btn-sm" onClick={() => setShowNew(true)}>
          + New Type
        </button>
      )}
    </>
  )

  if (embedded) {
    return innerContent
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <span className="modal-title">Manage Node Types</span>
          <button className="panel-close" onClick={onClose}><Icon icon="carbon:close" width={18} /></button>
        </div>

        <div className="modal-body">
          {innerContent}
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

function TypeForm({ initial, onSave, onCancel, activeGraphId }) {
  const [name, setName] = useState(initial?.name || '')
  const [color, setColor] = useState(initial?.color || '#6366f1')
  const [fontColor, setFontColor] = useState(initial?.font_color || '#ffffff')
  const [description, setDescription] = useState(initial?.description || '')
  const [isDateType, setIsDateType] = useState(initial?.is_date_type ?? false)
  const [scope, setScope] = useState(initial?.scope || 'shared')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave({
        name: name.trim(),
        color,
        font_color: fontColor,
        description: description.trim() || null,
        is_date_type: isDateType,
        scope,
        graph_id: scope === 'story' ? (activeGraphId ?? null) : null,
      })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="type-form">
      <div className="type-form-title">{initial ? `Editing: ${initial.name}` : 'New Type'}</div>
      <form onSubmit={handleSubmit}>
        <div className="form-row" style={{ marginBottom: 10 }}>
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Artifact"
              autoFocus
              required
            />
          </div>
          <div className="form-group" style={{ flex: '0 0 auto' }}>
            <label className="form-label">BG Color</label>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              <button type="button" className="btn-icon" onClick={() => setColor('#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0'))} title="Random color"><Icon icon="carbon:shuffle" width={14} /></button>
            </div>
          </div>
          <div className="form-group" style={{ flex: '0 0 auto' }}>
            <label className="form-label">Font Color</label>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="color" value={fontColor} onChange={(e) => setFontColor(e.target.value)} />
              <button type="button" className="btn-icon" onClick={() => setFontColor('#ffffff')} title="Reset to white"><Icon icon="carbon:reset" width={14} /></button>
            </div>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <input
            className="form-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="type-is-date"
              checked={isDateType}
              onChange={(e) => setIsDateType(e.target.checked)}
              style={{ accentColor: '#6366f1', width: 14, height: 14, cursor: 'pointer' }}
            />
            <label htmlFor="type-is-date" style={{ fontSize: 13, color: '#718096', cursor: 'pointer', userSelect: 'none' }}>
              Date type
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, color: '#718096' }}>Scope:</label>
            <select
              className="form-input"
              style={{ width: 'auto', padding: '2px 6px', fontSize: 13 }}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="shared">Shared (all stories)</option>
              <option value="story">Story (this story only)</option>
            </select>
          </div>
        </div>
        {error && <div style={{ color: '#fc8181', fontSize: 12, marginBottom: 8 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : initial ? 'Save' : 'Create'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
