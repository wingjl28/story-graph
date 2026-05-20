import { useState, useMemo } from 'react'
import { Icon } from '@iconify/react'

function Section({ title, badge, collapsed, onToggle, headerRight, children }) {
  return (
    <div className="sb-section">
      <div className="sb-section-head" onClick={onToggle}>
        <span className="sb-section-title">{title}</span>
        {badge != null && <span className="sb-badge">{badge}</span>}
        <span className={`sb-chevron${collapsed ? '' : ' open'}`}>›</span>
        {headerRight && <div className="sb-section-actions" onClick={e => e.stopPropagation()}>{headerRight}</div>}
      </div>
      {!collapsed && <div className="sb-section-body">{children}</div>}
    </div>
  )
}

export default function Sidebar({
  nodeTypes,
  graphData,
  open,
  onCollapse,
  onOpenSettings,
  selectedNodeId,
  onAddNode,
  onAddRelationship,
  onShowTimeline,
  hiddenNodeIds,
  allHiddenNodeIds,
  onToggleHideNode,
  onHideAllNodes,
  onUnhideAllNodes,
  hiddenRelLabels,
  soloRelLabels,
  onToggleHideRelLabel,
  onHideAllRelLabels,
  onUnhideAllRelLabels,
  hiddenTypes,
  soloTypes,
  onToggleHideType,
  onHideAllTypes,
  onUnhideAllTypes,
  allTags,
  hiddenTagNames,
  soloTagNames,
  onToggleHideTagName,
  onHideAllTagNames,
  onUnhideAllTagNames,
  soloNodeIds,
  filters,
  onAddFilter,
  onUpdateFilter,
  onRemoveFilter,
  onNodeFocus,
  storyGraphs,
  activeGraphId,
  onSwitchGraph,
  onNewGraph,
  onRenameGraph,
  onDeleteGraph,
  onShare,
  userEmail,
  onSignOut,
  onOpenTypeManager,
}) {
  const [collapsed, setCollapsed] = useState({ filter: false, nodes: false, rels: false, types: false, tags: false })
  const [sort, setSort] = useState({ nodes: 'alpha', rels: 'alpha', types: 'alpha', tags: 'alpha' })
  const toggleSection = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  const nodes = graphData.nodes.map((n) => n.data)
  const edges = graphData.edges.map((e) => e.data)

  const sortedNodes = useMemo(() => {
    const arr = [...nodes]
    if (sort.nodes === 'alpha') arr.sort((a, b) => a.label.localeCompare(b.label))
    else arr.sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label))
    return arr
  }, [nodes, sort.nodes])

  const uniqueRelLabels = useMemo(() => {
    const map = new Map()
    edges.forEach(e => {
      if (!map.has(e.label)) map.set(e.label, { label: e.label, color: e.color || '#4a5568', count: 0 })
      map.get(e.label).count++
    })
    return [...map.values()]
  }, [edges])

  const sortedRelLabels = useMemo(() => [...uniqueRelLabels].sort((a, b) => a.label.localeCompare(b.label)), [uniqueRelLabels])

  const sortedTypes = useMemo(() => [...nodeTypes].sort((a, b) => a.name.localeCompare(b.name)), [nodeTypes])

  const activeGraph = storyGraphs?.find(g => g.id === activeGraphId)

  return (
    <aside className={`sidebar${open ? '' : ' collapsed'}`}>
      <div className="sidebar-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>Story Graph</h1>
          <p>
            {nodes.length} node{nodes.length !== 1 ? 's' : ''}
            {' · '}
            {edges.length} rel{edges.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="sidebar-header-btns">
          <button className="sidebar-icon-btn" onClick={onOpenSettings} title="Settings">
            <Icon icon="carbon:settings" width={16} />
          </button>
          <button className="sidebar-collapse-btn" onClick={onCollapse} title="Collapse sidebar">
            <Icon icon="carbon:chevron-left" width={18} />
          </button>
        </div>
      </div>

      {/* Story graph selector */}
      {storyGraphs && storyGraphs.length > 0 ? (
        <div className="graph-selector">
          <select
            className="graph-select"
            value={activeGraphId}
            onChange={e => onSwitchGraph(parseInt(e.target.value))}
            title="Switch story graph"
          >
            {storyGraphs.map(g => (
              <option key={g.id} value={g.id}>{g.title}</option>
            ))}
          </select>
          <button className="sidebar-icon-btn" onClick={() => onRenameGraph?.(activeGraphId)} title="Rename story">
            <Icon icon="carbon:edit" width={14} />
          </button>
          <button
            className="sidebar-icon-btn"
            onClick={() => onDeleteGraph?.(activeGraphId)}
            title="Delete story"
            disabled={storyGraphs.length <= 1}
          >
            <Icon icon="carbon:trash-can" width={14} />
          </button>
          <button className="sidebar-icon-btn" onClick={onNewGraph} title="New story graph">
            <Icon icon="carbon:add" width={15} />
          </button>
          {onShare && (
            <button className="sidebar-icon-btn" onClick={onShare} title="Share story graph">
              <Icon icon="carbon:share" width={15} />
            </button>
          )}
        </div>
      ) : (
        /* Brand-new user empty state: no story_graphs yet. */
        <div className="graph-selector empty-state-selector">
          <button
            className="btn btn-primary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onClick={onNewGraph}
            title="Create your first story"
          >
            <Icon icon="carbon:add" width={15} />
            Create your first story
          </button>
        </div>
      )}

      <div className="sidebar-actions">
        <div className="sidebar-action-row">
          <button className="btn btn-primary sidebar-action-btn" onClick={onAddNode} title="Add Node">
            <Icon icon="carbon:network-3" width={18} />
          </button>
          <button className="btn btn-secondary sidebar-action-btn" onClick={onAddRelationship} title="Add Relationship">
            <Icon icon="carbon:connect" width={18} />
          </button>
        </div>
        <button className="btn btn-ghost btn-sm sidebar-timeline-btn" onClick={onShowTimeline} title="Timeline">
          <Icon icon="carbon:calendar" width={14} style={{ marginRight: 4 }} />
          Timeline
        </button>
      </div>

      <div className="sidebar-sections">
        {/* Filter section */}
        <Section
          title="Filter"
          badge={filters.length > 0 ? filters.length : null}
          collapsed={collapsed.filter}
          onToggle={() => toggleSection('filter')}
        >
          <div className="sb-filter-rows">
            {filters.map((f) => (
              <div key={f.id} className="sb-filter-row">
                <button
                  className={`sb-scope-btn${f.searchNodes ? ' active' : ''}`}
                  onClick={() => onUpdateFilter(f.id, { searchNodes: !f.searchNodes })}
                  title="Filter nodes"
                >N</button>
                <button
                  className={`sb-scope-btn${f.searchRels ? ' active' : ''}`}
                  onClick={() => onUpdateFilter(f.id, { searchRels: !f.searchRels })}
                  title="Filter relationships"
                >R</button>
                <input
                  className="sb-filter-input"
                  value={f.text}
                  onChange={(e) => onUpdateFilter(f.id, { text: e.target.value })}
                  placeholder="Filter… (* wildcard)"
                />
                <button className="sb-filter-remove" onClick={() => onRemoveFilter(f.id)}>
                  <Icon icon="carbon:close" width={13} />
                </button>
              </div>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onAddFilter}>+ Add Filter</button>
        </Section>

        {/* Nodes section */}
        <Section
          title="Nodes"
          badge={nodes.length}
          collapsed={collapsed.nodes}
          onToggle={() => toggleSection('nodes')}
          headerRight={
            <>
              <button className="sb-action-btn" onClick={onHideAllNodes} title="Hide all nodes">
                <Icon icon="carbon:view-off" width={12} />
              </button>
              <button className="sb-action-btn" onClick={onUnhideAllNodes} title="Show all nodes">
                <Icon icon="carbon:view" width={12} />
              </button>
              <button className="sb-action-btn" onClick={() => setSort(s => ({ ...s, nodes: s.nodes === 'alpha' ? 'type' : 'alpha' }))} title={sort.nodes === 'alpha' ? 'Sort by type' : 'Sort A-Z'}>
                <Icon icon={sort.nodes === 'alpha' ? 'carbon:sort-ascending' : 'carbon:category'} width={12} />
              </button>
            </>
          }
        >
          <div className="sb-chips">
            {nodes.length === 0 && <div className="empty-state" style={{ padding: '8px 4px', fontSize: 12 }}>No nodes yet</div>}
            {sortedNodes.map((n) => {
              const nid = String(n.id)
              const isSolo = soloNodeIds?.has(nid)
              const isHidden = allHiddenNodeIds?.has(nid)
              const isSelected = selectedNodeId === n.id
              return (
                <button
                  key={n.id}
                  className={`sb-chip${isHidden ? ' hidden' : ''}${isSolo ? ' solo' : ''}${isSelected ? ' selected' : ''}`}
                  onClick={() => onNodeFocus(n.id)}
                >
                  <span className="type-dot" style={{ background: n.color, flexShrink: 0 }} />
                  <span className="sb-chip-label">{n.label}</span>
                  <span
                    className="sb-chip-eye"
                    title={isSolo ? 'Solo (click to hide)' : isHidden ? 'Hidden (click to show)' : 'Click to solo'}
                    onClick={(e) => { e.stopPropagation(); onToggleHideNode(n.id) }}
                  >
                    <Icon icon={isSolo ? 'carbon:star-filled' : isHidden ? 'carbon:view-off' : 'carbon:view'} width={10} />
                  </span>
                </button>
              )
            })}
          </div>
        </Section>

        {/* Relationships section */}
        <Section
          title="Relationships"
          badge={edges.length}
          collapsed={collapsed.rels}
          onToggle={() => toggleSection('rels')}
          headerRight={
            <>
              <button className="sb-action-btn" onClick={onAddRelationship} title="Add relationship">
                <Icon icon="carbon:add" width={12} />
              </button>
              <button className="sb-action-btn" onClick={onHideAllRelLabels} title="Hide all rels">
                <Icon icon="carbon:view-off" width={12} />
              </button>
              <button className="sb-action-btn" onClick={onUnhideAllRelLabels} title="Show all rels">
                <Icon icon="carbon:view" width={12} />
              </button>
            </>
          }
        >
          <div className="sb-chips">
            {sortedRelLabels.length === 0 && <div className="empty-state" style={{ padding: '8px 4px', fontSize: 12 }}>No relationships yet</div>}
            {sortedRelLabels.map((rel) => {
              const isSolo = soloRelLabels?.has(rel.label)
              const isHidden = hiddenRelLabels?.has(rel.label)
              return (
                <button
                  key={rel.label}
                  className={`sb-chip${isHidden ? ' hidden' : ''}${isSolo ? ' solo' : ''}`}
                  title={isSolo ? `Solo: ${rel.label} (click to hide)` : isHidden ? `Hidden: ${rel.label} (click to show)` : `Click to solo ${rel.label}`}
                  onClick={() => onToggleHideRelLabel(rel.label)}
                >
                  <span className="type-dot" style={{ background: isHidden ? '#4a5568' : rel.color, flexShrink: 0 }} />
                  <span className="sb-chip-label">{rel.label}</span>
                  <span style={{ fontSize: 10, color: '#4a5568', marginRight: 4, flexShrink: 0 }}>{rel.count}</span>
                  {isSolo && <Icon icon="carbon:star-filled" width={10} style={{ color: '#f6ad55', flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>
        </Section>

        {/* Types section */}
        <Section
          title="Types"
          badge={nodeTypes.length}
          collapsed={collapsed.types}
          onToggle={() => toggleSection('types')}
          headerRight={
            <>
              {onOpenTypeManager && (
                <button className="sb-action-btn" onClick={onOpenTypeManager} title="Manage types">
                  <Icon icon="carbon:add" width={12} />
                </button>
              )}
              <button className="sb-action-btn" onClick={onHideAllTypes} title="Hide all types">
                <Icon icon="carbon:view-off" width={12} />
              </button>
              <button className="sb-action-btn" onClick={onUnhideAllTypes} title="Show all types">
                <Icon icon="carbon:view" width={12} />
              </button>
            </>
          }
        >
          <div className="sb-chips">
            {nodeTypes.length === 0 && <div className="empty-state" style={{ padding: '8px 4px', fontSize: 12 }}>No types yet</div>}
            {sortedTypes.map((t) => {
              const isSolo = soloTypes?.has(t.name)
              const isHidden = hiddenTypes?.has(t.name)
              return (
                <button
                  key={t.id}
                  className={`sb-chip sb-type-chip${isHidden ? ' hidden' : ''}${isSolo ? ' solo' : ''}`}
                  onClick={() => onToggleHideType(t.name)}
                  title={isSolo ? `Solo: ${t.name} (click to hide)` : isHidden ? `Hidden: ${t.name} (click to show)` : `Click to solo ${t.name}`}
                >
                  <span className="type-dot" style={{ background: isHidden ? '#4a5568' : t.color, flexShrink: 0 }} />
                  <span className="sb-chip-label">{t.name}</span>
                  {isSolo && <Icon icon="carbon:star-filled" width={10} style={{ color: '#f6ad55', flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>
        </Section>

        {/* Tags section */}
        <Section
          title="Tags"
          badge={allTags.length}
          collapsed={collapsed.tags}
          onToggle={() => toggleSection('tags')}
          headerRight={
            <>
              <button className="sb-action-btn" onClick={onHideAllTagNames} title="Hide all tags">
                <Icon icon="carbon:view-off" width={12} />
              </button>
              <button className="sb-action-btn" onClick={onUnhideAllTagNames} title="Show all tags">
                <Icon icon="carbon:view" width={12} />
              </button>
            </>
          }
        >
          <div className="sb-chips">
            {(!allTags || allTags.length === 0) && <div className="empty-state" style={{ padding: '8px 4px', fontSize: 12 }}>No tags yet</div>}
            {allTags.map((t) => {
              const isSolo = soloTagNames?.has(t.name)
              const isHidden = hiddenTagNames?.has(t.name)
              return (
                <button
                  key={t.id}
                  className={`sb-chip sb-type-chip${isHidden ? ' hidden' : ''}${isSolo ? ' solo' : ''}`}
                  onClick={() => onToggleHideTagName(t.name)}
                  title={isSolo ? `Solo: ${t.name} (click to hide)` : isHidden ? `Hidden: ${t.name} (click to show)` : `Click to solo ${t.name}`}
                >
                  <span className="type-dot" style={{ background: isHidden ? '#4a5568' : t.color, flexShrink: 0 }} />
                  <span className="sb-chip-label">{t.name}</span>
                  <span style={{ fontSize: 10, color: '#4a5568', marginRight: 2, flexShrink: 0 }}>{t.count}</span>
                  {isSolo && <Icon icon="carbon:star-filled" width={10} style={{ color: '#f6ad55', flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>
        </Section>
      </div>

      {(userEmail || onSignOut) && (
        <div className="sidebar-user-footer">
          {userEmail && <span className="sidebar-user-email" title={userEmail}>{userEmail}</span>}
          {onSignOut && (
            <button className="sidebar-meta-link" onClick={onSignOut} title="Sign out">
              Sign out
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
