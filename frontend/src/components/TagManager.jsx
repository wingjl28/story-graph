import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { api } from '../api'

const randomColor = () => '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')

export default function TagManager({ embedded = false, onClose, onUpdate }) {
  const [tags, setTags] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState(null)

  const load = () => api.getTags().then(setTags).catch(e => setError(e.message))
  useEffect(() => { load() }, [])

  const handleDelete = async (tag) => {
    if (!window.confirm(`Delete tag "${tag.name}"?`)) return
    try { await api.deleteTag(tag.id); await load(); onUpdate?.() }
    catch (e) { setError(e.message) }
  }

  const inner = (
    <>
      {error && <div style={{ color: '#fc8181', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <div className="type-list">
        {tags.map(t => editingId === t.id ? (
          <TagForm key={t.id} initial={t} onSave={async (data) => { await api.updateTag(t.id, data); await load(); setEditingId(null); onUpdate?.() }} onCancel={() => setEditingId(null)} />
        ) : (
          <div key={t.id} className="type-item">
            <span className="type-color-swatch" style={{ background: t.color }} />
            <div style={{ flex: 1 }}>
              <span className="type-item-name">{t.name}</span>
              <span style={{ fontSize: 11, color: '#4a5568', marginLeft: 8 }}>{t.count} node{t.count !== 1 ? 's' : ''}</span>
            </div>
            <div className="type-item-actions">
              <button className="btn-icon" onClick={() => setEditingId(t.id)} title="Edit"><Icon icon="carbon:edit" width={14} /></button>
              <button className="btn-icon danger" onClick={() => handleDelete(t)} title="Delete"><Icon icon="carbon:trash-can" width={14} /></button>
            </div>
          </div>
        ))}
      </div>
      {showNew ? (
        <TagForm onSave={async (data) => { await api.createTag(data); await load(); setShowNew(false); onUpdate?.() }} onCancel={() => setShowNew(false)} />
      ) : (
        <button className="btn btn-secondary btn-sm" onClick={() => setShowNew(true)}>+ New Tag</button>
      )}
    </>
  )

  if (embedded) return inner
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <span className="modal-title">Manage Tags</span>
          <button className="panel-close" onClick={onClose}><Icon icon="carbon:close" width={18} /></button>
        </div>
        <div className="modal-body">{inner}</div>
        <div className="modal-footer"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  )
}

function TagForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '')
  const [color, setColor] = useState(initial?.color || '#a78bfa')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setError(null)
    try { await onSave({ name: name.trim(), color }) }
    catch (err) { setError(err.message); setSaving(false) }
  }
  return (
    <div className="type-form">
      <div className="type-form-title">{initial ? `Editing: ${initial.name}` : 'New Tag'}</div>
      <form onSubmit={handleSubmit}>
        <div className="form-row" style={{ marginBottom: 10 }}>
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Hero" autoFocus required />
          </div>
          <div className="form-group" style={{ flex: '0 0 auto' }}>
            <label className="form-label">Color</label>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} />
              <button type="button" className="btn-icon" onClick={() => setColor(randomColor())} title="Random color"><Icon icon="carbon:shuffle" width={14} /></button>
            </div>
          </div>
        </div>
        {error && <div style={{ color: '#fc8181', fontSize: 12, marginBottom: 8 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !name.trim()}>{saving ? 'Saving…' : initial ? 'Save' : 'Create'}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
