import { Icon } from '@iconify/react'

export default function MultiSelectPanel({
  selectedIds,
  graphData,
  onClose,
  onAddRelationship,
  onHideAll,
  onDeleteAll,
  onAlign,
}) {
  const nodeById = Object.fromEntries(graphData.nodes.map((n) => [String(n.data.id), n.data]))
  const selectedNodes = selectedIds.map((id) => nodeById[String(id)]).filter(Boolean)
  const canDist = selectedIds.length >= 3

  return (
    <aside className="right-panel">
      <div className="panel-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="panel-type-badge">{selectedIds.length} nodes selected</div>
          <div className="panel-title" style={{ fontSize: 14, color: '#718096' }}>Multi-selection</div>
        </div>
        <button className="panel-close" onClick={onClose} title="Clear selection">
          <Icon icon="carbon:close" width={18} />
        </button>
      </div>

      <div className="panel-body">
        <div className="multi-select-list">
          {selectedNodes.map((n) => (
            <div key={n.id} className="multi-select-item">
              <span className="type-dot" style={{ background: n.color }} />
              <span className="node-item-name">{n.label}</span>
              <span style={{ fontSize: 11, color: '#4a5568', marginLeft: 'auto' }}>{n.type}</span>
            </div>
          ))}
        </div>

        {/* Alignment */}
        <div style={{ marginTop: 12 }}>
          <div className="panel-section-label" style={{ marginBottom: 6 }}>Align</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <button className="btn btn-ghost btn-sm align-btn" onClick={() => onAlign?.('center-v')} title="Align V-Centers">
              <Icon icon="carbon:align-vertical-center" width={13} style={{ marginRight: 4 }} />
              Align V
            </button>
            <button className="btn btn-ghost btn-sm align-btn" onClick={() => onAlign?.('center-h')} title="Align H-Centers">
              <Icon icon="carbon:align-horizontal-center" width={13} style={{ marginRight: 4 }} />
              Align H
            </button>
            <button className="btn btn-ghost btn-sm align-btn" onClick={() => onAlign?.('dist-v')} disabled={!canDist} title="Distribute vertically">
              <Icon icon="carbon:distribute-vertical-center" width={13} style={{ marginRight: 4 }} />
              Dist V
            </button>
            <button className="btn btn-ghost btn-sm align-btn" onClick={() => onAlign?.('dist-h')} disabled={!canDist} title="Distribute horizontally">
              <Icon icon="carbon:distribute-horizontal-center" width={13} style={{ marginRight: 4 }} />
              Dist H
            </button>
          </div>
        </div>
      </div>

      <div className="panel-actions">
        <button className="btn btn-secondary btn-sm" onClick={onAddRelationship}>+ Rel</button>
        <button className="btn btn-ghost btn-sm" onClick={onHideAll}>Hide All</button>
        <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={onDeleteAll}>
          Delete All
        </button>
      </div>
    </aside>
  )
}
