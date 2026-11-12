import { useState, useMemo } from 'react'

function parseDateOrder(dateStr) {
  if (!dateStr) return Infinity
  const real = new Date(dateStr)
  if (!isNaN(real)) return real.getTime()
  const num = dateStr.match(/\b(\d+)\b/)
  if (num) return parseInt(num[1])
  return Infinity
}

export default function Timeline({ graphData, onClose, focusNodeIds }) {
  const [scope, setScope] = useState(
    focusNodeIds && focusNodeIds.length > 0 ? 'selected' : 'all',
  )

  const nodes = graphData.nodes.map((n) => n.data)
  const edges = graphData.edges.map((e) => e.data)

  const nodeById = Object.fromEntries(nodes.map((n) => [String(n.id), n]))

  const edgesByNode = useMemo(() => {
    const map = {}
    edges.forEach((e) => {
      const s = String(e.source), t = String(e.target)
      if (!map[s]) map[s] = []
      if (!map[t]) map[t] = []
      map[s].push(e)
      map[t].push(e)
    })
    return map
  }, [edges])

  const focusSet = useMemo(
    () => new Set((focusNodeIds || []).map(String)),
    [focusNodeIds],
  )

  // When scope==='selected', restrict to focus nodes and their neighbors only.
  const visibleNodeIds = useMemo(() => {
    if (scope !== 'selected' || focusSet.size === 0) return null
    const ids = new Set(focusSet)
    edges.forEach((e) => {
      const s = String(e.source), t = String(e.target)
      if (focusSet.has(s)) ids.add(t)
      if (focusSet.has(t)) ids.add(s)
    })
    return ids
  }, [scope, focusSet, edges])

  const dateNodes = useMemo(() => {
    const arr = nodes.filter((n) => n.is_date_type && n.date)
    if (visibleNodeIds) return arr.filter((n) => visibleNodeIds.has(String(n.id)))
    return arr
  }, [nodes, visibleNodeIds])

  const sortedDateNodes = useMemo(
    () => [...dateNodes].sort((a, b) => parseDateOrder(a.date) - parseDateOrder(b.date)),
    [dateNodes],
  )

  const undatedDateNodes = useMemo(() => {
    const arr = nodes.filter((n) => n.is_date_type && !n.date)
    if (visibleNodeIds) return arr.filter((n) => visibleNodeIds.has(String(n.id)))
    return arr
  }, [nodes, visibleNodeIds])

  // Relationships with any date set.
  const datedEdges = useMemo(() => {
    const arr = edges.filter((e) => e.start_date || e.end_date)
    let filtered = arr
    if (visibleNodeIds) {
      filtered = arr.filter(
        (e) => visibleNodeIds.has(String(e.source)) || visibleNodeIds.has(String(e.target)),
      )
    }
    return [...filtered].sort(
      (a, b) =>
        parseDateOrder(a.start_date || a.end_date) -
        parseDateOrder(b.start_date || b.end_date),
    )
  }, [edges, visibleNodeIds])

  const hasSelection = focusSet.size > 0
  const noResults = sortedDateNodes.length === 0 && datedEdges.length === 0

  return (
    <div className="timeline-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="timeline-panel">
        <div className="timeline-header">
          <span className="timeline-title">Timeline</span>
          <span style={{ fontSize: 12, color: '#4a5568' }}>
            {sortedDateNodes.length} event{sortedDateNodes.length !== 1 ? 's' : ''}
            {datedEdges.length > 0 && ` · ${datedEdges.length} rel${datedEdges.length !== 1 ? 's' : ''}`}
          </span>
          {hasSelection && (
            <div className="timeline-scope">
              <button
                className={`tl-scope-btn${scope === 'all' ? ' active' : ''}`}
                onClick={() => setScope('all')}
              >
                All
              </button>
              <button
                className={`tl-scope-btn${scope === 'selected' ? ' active' : ''}`}
                onClick={() => setScope('selected')}
              >
                Selected ({focusSet.size})
              </button>
            </div>
          )}
          <button className="panel-close" onClick={onClose}>×</button>
        </div>

        {noResults ? (
          <div className="timeline-empty">
            <div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
            <div>No dated events yet.</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>
              Mark a node type as a <strong>Date Type</strong> in Manage Types,
              then set dates on nodes of that type — or add start/end dates to
              relationships.
            </div>
          </div>
        ) : (
          <div className="timeline-scroll">
            <div className="tl-events">
              {sortedDateNodes.map((node) => {
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

        {datedEdges.length > 0 && (
          <div className="timeline-rels">
            <div style={{ color: '#4a5568', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Dated Relationships
            </div>
            <div className="tl-rel-list">
              {datedEdges.map((e) => {
                const src = nodeById[String(e.source)]
                const tgt = nodeById[String(e.target)]
                const dateRange = e.start_date && e.end_date
                  ? `${e.start_date} → ${e.end_date}`
                  : (e.start_date || `→ ${e.end_date}`)
                return (
                  <div key={e.rel_id} className="tl-rel-row">
                    <span className="tl-rel-date">{dateRange}</span>
                    <span className="tl-rel-from" style={{ color: src?.color }}>
                      {src?.label || '?'}
                    </span>
                    <span className="tl-rel-label" style={{ color: e.color || '#a78bfa' }}>
                      —[{e.label}]→
                    </span>
                    <span className="tl-rel-to" style={{ color: tgt?.color }}>
                      {tgt?.label || '?'}
                    </span>
                  </div>
                )
              })}
            </div>
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
