export default function MultiSelectPanel({
  selectedIds,
  graphData,
  onClose,
  onAddRelationship,
  onHideAll,
  onDeleteAll,
}) {
  const nodeById = Object.fromEntries(graphData.nodes.map((n) => [String(n.data.id), n.data]))
  const selectedNodes = selectedIds.map((id) => nodeById[String(id)]).filter(Boolean)

  return (
    <aside className="right-panel">
      <div className="panel-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="panel-type-badge">{selectedIds.length} nodes selected</div>
          <div className="panel-title" style={{ fontSize: 14, color: '#718096' }}>Multi-selection</div>
        </div>
        <button className="panel-close" onClick={onClose} title="Clear selection">×</button>
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
