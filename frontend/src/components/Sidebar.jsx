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
  onSoloNode,
  onHideNode,
  onShowNode,
  onHideAllNodes,
  onUnhideAllNodes,
  hiddenRelLabels,
  soloRelLabels,
  onSoloRelLabel,
  onHideRelLabel,
  onShowRelLabel,
  onHideAllRelLabels,
  onUnhideAllRelLabels,
  hiddenTypes,
  soloTypes,
  onSoloType,
  onHideType,
  onShowType,
  onHideAllTypes,
  onUnhideAllTypes,
  allTags,
  hiddenTagNames,
  soloTagNames,
  onSoloTagName,
  onHideTagName,
  onShowTagName,
  onHideAllTagNames,
  onUnhideAllTagNames,
  soloNodeIds,
  filters,
  onAddFilter,
  onUpdateFilter,
  onRemoveFilter,
  filterTypes,
  filterTagNames,
  onToggleFilterType,
  onToggleFilterTagName,
  onClearTypeTagFilters,
  filterIncludeConnected,
  onToggleFilterIncludeConnected,
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
  onQuickRel,
}) {
  const [collapsed, setCollapsed] = useState({ filter: false, nodes: false, rels: false, types: false, tags: false })
  const [sort, setSort] = useState({ nodes: 'alpha', rels: 'alpha', types: 'alpha', tags: 'alpha' })
  const [graphActionsOpen, setGraphActionsOpen] = useState(false)
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
        <div className={`graph-selector graph-selector-stacked${graphActionsOpen ? ' open' : ''}`}>
          <div className="graph-selector-row">
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
            <button
              className={`sidebar-icon-btn graph-actions-toggle${graphActionsOpen ? ' active' : ''}`}
              onClick={() => setGraphActionsOpen(v => !v)}
              title={graphActionsOpen ? 'Hide actions' : 'Show actions'}
            >
              <Icon icon={graphActionsOpen ? 'carbon:chevron-up' : 'carbon:overflow-menu-horizontal'} width={14} />
            </button>
          </div>
          {graphActionsOpen && (
            <div className="graph-actions-row">
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
        <div className="sidebar-action-row">
          <button className="btn btn-ghost btn-sm sidebar-action-btn" onClick={onQuickRel} disabled={!selectedNodeId} title={selectedNodeId ? 'Quick Relationship: click-to-connect workflow' : 'Select a node first'}>
            <Icon icon="carbon:flash" width={14} style={{ marginRight: 4 }} />
            Quick Rel
          </button>
          <button className="btn btn-ghost btn-sm sidebar-action-btn" onClick={onShowTimeline} title="Timeline">
            <Icon icon="carbon:calendar" width={14} style={{ marginRight: 4 }} />
            Timeline
          </button>
        </div>
      </div>

      <div className="sidebar-sections">
        {/* Filter section */}
        <Section
          title="Filter"
          badge={(() => { const n = filters.length + (filterTypes?.size ?? 0) + (filterTagNames?.size ?? 0); return n > 0 ? n : null })()}
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
          <div className="sb-filter-type-section">
            <div className="sb-filter-type-label">
              Type
              {filterTypes?.size > 0 && (
                <button className="sb-filter-type-clear" onClick={() => { onToggleFilterType && [...filterTypes].forEach(n => onToggleFilterType(n)) }} title="Clear type filters">
                  <Icon icon="carbon:close" width={10} />
                </button>
              )}
            </div>
            <div className="sb-filter-pills">
              {sortedTypes.map((t) => (
                <button
                  key={t.id}
                  className={`sb-filter-pill${filterTypes?.has(t.name) ? ' active' : ''}`}
                  onClick={() => onToggleFilterType?.(t.name)}
                  title={filterTypes?.has(t.name) ? `Remove type filter: ${t.name}` : `Filter by type: ${t.name}`}
                >
                  <span className="type-dot" style={{ background: t.color }} />
                  {t.name}
                </button>
              ))}
              {sortedTypes.length === 0 && <span className="sb-filter-empty">No types</span>}
            </div>
          </div>
          <div className="sb-filter-type-section">
            <div className="sb-filter-type-label">
              Tag
              {filterTagNames?.size > 0 && (
                <button className="sb-filter-type-clear" onClick={() => { onToggleFilterTagName && [...filterTagNames].forEach(n => onToggleFilterTagName(n)) }} title="Clear tag filters">
                  <Icon icon="carbon:close" width={10} />
                </button>
              )}
            </div>
            <div className="sb-filter-pills">
              {allTags.map((t) => (
                <button
                  key={t.id}
                  className={`sb-filter-pill${filterTagNames?.has(t.name) ? ' active' : ''}`}
                  onClick={() => onToggleFilterTagName?.(t.name)}
                  title={filterTagNames?.has(t.name) ? `Remove tag filter: ${t.name}` : `Filter by tag: ${t.name}`}
                >
                  <span className="type-dot" style={{ background: t.color }} />
                  {t.name}
                </button>
              ))}
              {allTags.length === 0 && <span className="sb-filter-empty">No tags</span>}
            </div>
          </div>
          <label className="sb-filter-incl-row" title="Also show nodes directly connected to filter matches">
            <input
              type="checkbox"
              checked={!!filterIncludeConnected}
              onChange={onToggleFilterIncludeConnected}
            />
            <span>Include directly connected nodes</span>
          </label>
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
                <div
                  key={n.id}
                  className={`sb-chip${isHidden ? ' hidden' : ''}${isSolo ? ' solo' : ''}${isSelected ? ' selected' : ''}`}
                  onClick={() => onNodeFocus(n.id)}
                >
                  <span className="type-dot" style={{ background: n.color, flexShrink: 0 }} />
                  <span className="sb-chip-label">{n.label}</span>
                  <span className="sb-chip-icons">
                    <button className={`sb-icon-btn${isSolo ? ' active' : ''}`} title="Solo" onClick={(e) => { e.stopPropagation(); onSoloNode(n.id) }}>
                      <Icon icon="carbon:star-filled" width={10} />
                    </button>
                    <button className={`sb-icon-btn${isHidden ? ' active' : ''}`} title="Hide" onClick={(e) => { e.stopPropagation(); onHideNode(n.id) }}>
                      <Icon icon="carbon:view-off" width={10} />
                    </button>
                    <button className="sb-icon-btn" title="Show" onClick={(e) => { e.stopPropagation(); onShowNode(n.id) }}>
                      <Icon icon="carbon:view" width={10} />
                    </button>
                  </span>
                </div>
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
                <div
                  key={rel.label}
                  className={`sb-chip${isHidden ? ' hidden' : ''}${isSolo ? ' solo' : ''}`}
                >
                  <span className="type-dot" style={{ background: isHidden ? '#4a5568' : rel.color, flexShrink: 0 }} />
                  <span className="sb-chip-label">{rel.label}</span>
                  <span style={{ fontSize: 10, color: '#4a5568', marginRight: 4, flexShrink: 0 }}>{rel.count}</span>
                  <span className="sb-chip-icons">
                    <button className={`sb-icon-btn${isSolo ? ' active' : ''}`} title="Solo" onClick={(e) => { e.stopPropagation(); onSoloRelLabel(rel.label) }}>
                      <Icon icon="carbon:star-filled" width={10} />
                    </button>
                    <button className={`sb-icon-btn${isHidden ? ' active' : ''}`} title="Hide" onClick={(e) => { e.stopPropagation(); onHideRelLabel(rel.label) }}>
                      <Icon icon="carbon:view-off" width={10} />
                    </button>
                    <button className="sb-icon-btn" title="Show" onClick={(e) => { e.stopPropagation(); onShowRelLabel(rel.label) }}>
                      <Icon icon="carbon:view" width={10} />
                    </button>
                  </span>
                </div>
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
              const isFilterMatch = filterTypes?.has(t.name)
              return (
                <div
                  key={t.id}
                  className={`sb-chip sb-type-chip${isHidden ? ' hidden' : ''}${isSolo ? ' solo' : ''}${isFilterMatch ? ' filter-match' : ''}`}
                >
                  <span className="type-dot" style={{ background: isHidden ? '#4a5568' : t.color, flexShrink: 0 }} />
                  <span className="sb-chip-label">{t.name}</span>
                  <span className="sb-chip-icons">
                    <button className={`sb-icon-btn${isSolo ? ' active' : ''}`} title="Solo" onClick={(e) => { e.stopPropagation(); onSoloType(t.name) }}>
                      <Icon icon="carbon:star-filled" width={10} />
                    </button>
                    <button className={`sb-icon-btn${isHidden ? ' active' : ''}`} title="Hide" onClick={(e) => { e.stopPropagation(); onHideType(t.name) }}>
                      <Icon icon="carbon:view-off" width={10} />
                    </button>
                    <button className="sb-icon-btn" title="Show" onClick={(e) => { e.stopPropagation(); onShowType(t.name) }}>
                      <Icon icon="carbon:view" width={10} />
                    </button>
                  </span>
                </div>
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
              const isFilterMatch = filterTagNames?.has(t.name)
              return (
                <div
                  key={t.id}
                  className={`sb-chip sb-type-chip${isHidden ? ' hidden' : ''}${isSolo ? ' solo' : ''}${isFilterMatch ? ' filter-match' : ''}`}
                >
                  <span className="type-dot" style={{ background: isHidden ? '#4a5568' : t.color, flexShrink: 0 }} />
                  <span className="sb-chip-label">{t.name}</span>
                  <span style={{ fontSize: 10, color: '#4a5568', marginRight: 2, flexShrink: 0 }}>{t.count}</span>
                  <span className="sb-chip-icons">
                    <button className={`sb-icon-btn${isSolo ? ' active' : ''}`} title="Solo" onClick={(e) => { e.stopPropagation(); onSoloTagName(t.name) }}>
                      <Icon icon="carbon:star-filled" width={10} />
                    </button>
                    <button className={`sb-icon-btn${isHidden ? ' active' : ''}`} title="Hide" onClick={(e) => { e.stopPropagation(); onHideTagName(t.name) }}>
                      <Icon icon="carbon:view-off" width={10} />
                    </button>
                    <button className="sb-icon-btn" title="Show" onClick={(e) => { e.stopPropagation(); onShowTagName(t.name) }}>
                      <Icon icon="carbon:view" width={10} />
                    </button>
                  </span>
                </div>
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
