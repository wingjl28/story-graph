import { useState, useRef } from 'react'
import { Icon } from '@iconify/react'

export default function NodePanel({
  nodeData,
  relationships,
  onEdit,
  onAddRelationship,
  onDelete,
  onRelationshipDelete,
  onRelationshipSwap,
  onClose,
  isHidden,
  onToggleHide,
}) {
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

  const outgoing = relationships.filter((r) => String(r.source_id) === String(nodeData.id))
  const incoming = relationships.filter((r) => String(r.target_id) === String(nodeData.id))

  const metaEntries = Object.entries(nodeData.metadata || {})

  return (
    <aside className="right-panel" style={{ transform: `translate(${offset.x}px, ${offset.y}px)`, cursor: 'default' }}>
      <div className="panel-header panel-drag-handle" ref={dragRef} onMouseDown={onMouseDown}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="panel-type-badge">
            <span className="type-dot" style={{ background: nodeData.color }} />
            {nodeData.type}
          </div>
          <div className="panel-title">{nodeData.label}</div>
        </div>
        <button className="panel-close" onClick={onClose} title="Close"><Icon icon="carbon:close" width={18} /></button>
      </div>

      <div className="panel-body">
        {nodeData.date && (
          <div>
            <div className="panel-section-label">Date</div>
            <div className="panel-section-value" style={{ color: '#a78bfa' }}>{nodeData.date}</div>
          </div>
        )}

        {nodeData.description && (
          <div>
            <div className="panel-section-label">Description</div>
            <div className="panel-section-value">{nodeData.description}</div>
          </div>
        )}

        {nodeData.tags?.length > 0 && (
          <div>
            <div className="panel-section-label">Tags</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {nodeData.tags.map(t => (
                <span key={t.id} className="node-tag-chip" style={{ background: t.color }}>
                  #{t.name}
                </span>
              ))}
            </div>
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

        {outgoing.length > 0 && (
          <div>
            <div className="panel-section-label">Outgoing ({outgoing.length})</div>
            <div className="rel-list">
              {outgoing.map((r) => (
                <RelItem
                  key={r.id}
                  rel={r}
                  direction="out"
                  currentId={nodeData.id}
                  onDelete={onRelationshipDelete}
                  onSwap={onRelationshipSwap}
                />
              ))}
            </div>
          </div>
        )}

        {incoming.length > 0 && (
          <div>
            <div className="panel-section-label">Incoming ({incoming.length})</div>
            <div className="rel-list">
              {incoming.map((r) => (
                <RelItem
                  key={r.id}
                  rel={r}
                  direction="in"
                  currentId={nodeData.id}
                  onDelete={onRelationshipDelete}
                  onSwap={onRelationshipSwap}
                />
              ))}
            </div>
          </div>
        )}

        {relationships.length === 0 && (
          <div className="empty-state">No relationships yet.</div>
        )}
      </div>

      <div className="panel-actions">
        <button className="btn btn-secondary btn-sm" onClick={onEdit}>Edit</button>
        <button className="btn btn-secondary btn-sm" onClick={onAddRelationship}>+ Rel</button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onToggleHide}
          title={isHidden ? 'Show in graph' : 'Hide from graph'}
        >
          {isHidden ? 'Unhide' : 'Hide'}
        </button>
        <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={onDelete}>Delete</button>
      </div>
    </aside>
  )
}

function RelItem({ rel, direction, currentId, onDelete, onSwap }) {
  const peer = direction === 'out'
    ? { id: rel.target_id, name: rel.target_name, color: rel.target_type_color }
    : { id: rel.source_id, name: rel.source_name, color: rel.source_type_color }

  return (
    <div className="rel-item">
      <div className="rel-content">
        <div className="rel-direction">{direction === 'out' ? '▶ to' : '◀ from'}</div>
        <div className="rel-label">{rel.label}</div>
        <div className="rel-peer">
          <span className="type-dot" style={{ background: peer.color }} />
          {peer.name}
        </div>
        {rel.notes && (
          <div style={{ marginTop: 4, color: '#4a5568', fontSize: 11 }}>{rel.notes}</div>
        )}
      </div>
      <button className="rel-swap" title="Swap direction" onClick={() => onSwap(rel.id)}><Icon icon="carbon:arrows-vertical" width={13} /></button>
      <button className="rel-delete" title="Delete relationship" onClick={() => onDelete(rel.id)}><Icon icon="carbon:close" width={14} /></button>
    </div>
  )
}
