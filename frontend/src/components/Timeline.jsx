function parseDateOrder(dateStr) {
  if (!dateStr) return Infinity
  const real = new Date(dateStr)
  if (!isNaN(real)) return real.getTime()
  const num = dateStr.match(/\b(\d+)\b/)
  if (num) return parseInt(num[1])
  return Infinity
}

export default function Timeline({ graphData, onClose }) {
  const nodes = graphData.nodes.map((n) => n.data)
  const edges = graphData.edges.map((e) => e.data)

  const nodeById = Object.fromEntries(nodes.map((n) => [String(n.id), n]))

  // Build edge index keyed by node id (string)
  const edgesByNode = {}
  edges.forEach((e) => {
    const s = String(e.source), t = String(e.target)
    if (!edgesByNode[s]) edgesByNode[s] = []
    if (!edgesByNode[t]) edgesByNode[t] = []
    edgesByNode[s].push(e)
    edgesByNode[t].push(e)
  })

  const dateNodes = nodes
    .filter((n) => n.is_date_type && n.date)
    .sort((a, b) => parseDateOrder(a.date) - parseDateOrder(b.date))

  const undatedDateNodes = nodes.filter((n) => n.is_date_type && !n.date)

  return (
    <div className="timeline-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="timeline-panel">
        <div className="timeline-header">
          <span className="timeline-title">Timeline</span>
          <span style={{ fontSize: 12, color: '#4a5568' }}>{dateNodes.length} dated event{dateNodes.length !== 1 ? 's' : ''}</span>
          <button className="panel-close" onClick={onClose}>×</button>
        </div>

        {dateNodes.length === 0 ? (
          <div className="timeline-empty">
            <div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
            <div>No dated events yet.</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>
              Mark a node type as a <strong>Date Type</strong> in Manage Types,
              then set dates on nodes of that type.
            </div>
          </div>
        ) : (
          <div className="timeline-scroll">
            <div className="tl-events">
              {dateNodes.map((node) => {
                const nodeEdges = edgesByNode[String(node.id)] || []
                const connections = nodeEdges
                  .map((e) => {
                    const isSource = String(e.source) === String(node.id)
                    const otherId = isSource ? String(e.target) : String(e.source)
                    const other = nodeById[otherId]
                    if (!other) return null
                    return { relId: e.rel_id, label: e.label, dir: isSource ? '→' : '←', other }
                  })
                  .filter(Boolean)

                return (
                  <div key={node.id} className="tl-event">
                    <div className="tl-card">
                      <div className="tl-card-date">{node.date}</div>
                      <div className="tl-card-name" style={{ color: node.color }}>{node.label}</div>
                      {node.description && (
                        <div className="tl-card-desc">{node.description}</div>
                      )}
                      {connections.length > 0 && (
                        <div className="tl-card-connections">
                          {connections.slice(0, 6).map((c) => (
                            <div key={c.relId} className="tl-conn">
                              <span className="tl-conn-label">{c.label}</span>
                              <span className="tl-conn-dir">{c.dir}</span>
                              <span className="tl-conn-node" style={{ color: c.other.color }}>
                                {c.other.label}
                              </span>
                            </div>
                          ))}
                          {connections.length > 6 && (
                            <div className="tl-conn-more">+{connections.length - 6} more</div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="tl-stem" />
                    <div className="tl-dot" style={{ background: node.color }} />
                  </div>
                )
              })}
            </div>
            <div className="tl-axis" />
          </div>
        )}

        {undatedDateNodes.length > 0 && (
          <div className="timeline-undated">
            <span style={{ color: '#4a5568', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              No date set:
            </span>
            {undatedDateNodes.map((n) => (
              <span key={n.id} className="tl-undated-chip" style={{ borderColor: n.color }}>
                <span className="type-dot" style={{ background: n.color }} />
                {n.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
