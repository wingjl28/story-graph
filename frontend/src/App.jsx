import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import GraphView from './components/GraphView'
import Sidebar from './components/Sidebar'
import NodePanel from './components/NodePanel'
import EdgePanel from './components/EdgePanel'
import AddNodeModal from './components/AddNodeModal'
import AddRelationshipModal from './components/AddRelationshipModal'
import SettingsModal from './components/SettingsModal'
import MultiSelectPanel from './components/MultiSelectPanel'
import ContextMenu from './components/ContextMenu'
import Timeline from './components/Timeline'
import { api } from './api'
import { wildcardMatch } from './utils'
import './App.css'

export default function App() {
  const [nodeTypes, setNodeTypes] = useState([])
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] })
  const [selected, setSelected] = useState(null)
  const [nodeRelationships, setNodeRelationships] = useState([])
  const [focusNodeId, setFocusNodeId] = useState(null)
  const [hiddenNodeIds, setHiddenNodeIds] = useState(new Set())

  const [filters, setFilters] = useState([])
  const [hiddenTypes, setHiddenTypes] = useState(new Set())
  const [hiddenRelLabels, setHiddenRelLabels] = useState(new Set())
  const [hiddenTagNames, setHiddenTagNames] = useState(new Set())
  const [allTags, setAllTags] = useState([])
  const [pendingNodePosition, setPendingNodePosition] = useState(null)
  const [bgContextMenu, setBgContextMenu] = useState(null)
  const [showSettings, setShowSettings] = useState(false)

  const [showTimeline, setShowTimeline] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showAddNode, setShowAddNode] = useState(false)
  const [showAddRel, setShowAddRel] = useState(false)
  const [editingNode, setEditingNode] = useState(null)
  const [multiSelectedNodeIds, setMultiSelectedNodeIds] = useState([])
  const [selectionMode, setSelectionMode] = useState('normal')

  const [contextMenu, setContextMenu] = useState(null) // { type: 'node'|'edge', data, x, y }
  const [error, setError] = useState(null)
  const graphRef = useRef(null)

  // Autocomplete pools derived from live graph data
  const existingRelLabels = useMemo(
    () => [...new Set(graphData.edges.map((e) => e.data.label))].sort(),
    [graphData.edges],
  )
  const existingNodeMetaKeys = useMemo(() => {
    const keys = new Set()
    graphData.nodes.forEach((n) => Object.keys(n.data.metadata || {}).forEach((k) => keys.add(k)))
    return [...keys].sort()
  }, [graphData.nodes])
  const existingRelMetaKeys = useMemo(() => {
    const keys = new Set()
    graphData.edges.forEach((e) => Object.keys(e.data.metadata || {}).forEach((k) => keys.add(k)))
    return [...keys].sort()
  }, [graphData.edges])

  // Nodes hidden by the active filters (type filter + text/scope + tag filter)
  const filterHiddenNodeIds = useMemo(() => {
    const ids = new Set()
    const activeNodeFilters = filters.filter(f => f.text && f.searchNodes)
    if (activeNodeFilters.length === 0 && hiddenTypes.size === 0 && hiddenTagNames.size === 0) return ids
    graphData.nodes.forEach(({ data: n }) => {
      if (hiddenTypes.has(n.type)) { ids.add(String(n.id)); return }
      if (hiddenTagNames.size > 0 && n.tags?.some(t => hiddenTagNames.has(t.name))) {
        ids.add(String(n.id)); return
      }
      for (const f of activeNodeFilters) {
        if (!wildcardMatch(f.text, n.label)) { ids.add(String(n.id)); break }
      }
    })
    return ids
  }, [graphData.nodes, filters, hiddenTypes, hiddenTagNames])

  // Edges hidden by the active filters (rel text filter)
  const filterHiddenEdgeIds = useMemo(() => {
    const activeRelFilters = filters.filter(f => f.text && f.searchRels)
    if (activeRelFilters.length === 0) return new Set()
    return new Set(
      graphData.edges
        .filter(({ data: e }) => activeRelFilters.some(f => !wildcardMatch(f.text, e.label)))
        .map(({ data: e }) => e.id),
    )
  }, [graphData.edges, filters])

  // Combined: manual hides + filter hides
  const allHiddenNodeIds = useMemo(
    () => (filterHiddenNodeIds.size === 0 ? hiddenNodeIds : new Set([...hiddenNodeIds, ...filterHiddenNodeIds])),
    [hiddenNodeIds, filterHiddenNodeIds],
  )

  const allHiddenEdgeIds = useMemo(() => {
    const byLabel = new Set(
      graphData.edges.filter(e => hiddenRelLabels.has(e.data.label)).map(e => String(e.data.id))
    )
    if (byLabel.size === 0 && filterHiddenEdgeIds.size === 0) return new Set()
    return new Set([...byLabel, ...filterHiddenEdgeIds])
  }, [graphData.edges, hiddenRelLabels, filterHiddenEdgeIds])

  const loadGraph = useCallback(async () => {
    try {
      setGraphData(await api.getGraph())
    } catch (e) {
      setError(e.message)
    }
  }, [])

  const loadNodeTypes = useCallback(async () => {
    try {
      setNodeTypes(await api.getNodeTypes())
    } catch (e) {
      setError(e.message)
    }
  }, [])

  const loadTags = useCallback(async () => {
    try {
      setAllTags(await api.getTags())
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    loadGraph()
    loadNodeTypes()
    loadTags()
  }, [loadGraph, loadNodeTypes, loadTags])

  const refreshNodeRels = useCallback(async (nodeId) => {
    try {
      setNodeRelationships(await api.getNodeRelationships(nodeId))
    } catch (e) {
      setError(e.message)
    }
  }, [])

  // ── Selection ──────────────────────────────────────────────
  const handleNodeClick = useCallback(async (nodeData) => {
    setContextMenu(null)
    setMultiSelectedNodeIds([])
    setSelected({ type: 'node', id: nodeData.id, data: nodeData })
    await refreshNodeRels(nodeData.id)
  }, [refreshNodeRels])

  const handleEdgeClick = useCallback((edgeData) => {
    setContextMenu(null)
    setMultiSelectedNodeIds([])
    setSelected({ type: 'edge', id: edgeData.id, data: edgeData })
    setNodeRelationships([])
  }, [])

  const handleBgClick = useCallback(() => {
    setContextMenu(null)
    setBgContextMenu(null)
    setSelected(null)
    setMultiSelectedNodeIds([])
    setNodeRelationships([])
  }, [])

  const handleSelectionChange = useCallback((ids) => {
    setMultiSelectedNodeIds(ids)
    if (ids.length > 0) {
      setSelected(null)
      setNodeRelationships([])
    }
  }, [])

  const handleNodeFocus = useCallback((nodeId) => {
    setFocusNodeId(nodeId)
    const nodeEl = graphData.nodes.find((n) => n.data.id === nodeId)
    if (nodeEl) handleNodeClick(nodeEl.data)
  }, [graphData.nodes, handleNodeClick])

  const handleNodeRightClick = useCallback((nodeData, x, y) => {
    setBgContextMenu(null)
    setContextMenu({ type: 'node', data: nodeData, x, y })
    setSelected({ type: 'node', id: nodeData.id, data: nodeData })
    refreshNodeRels(nodeData.id)
  }, [refreshNodeRels])

  const handleEdgeRightClick = useCallback((edgeData, x, y) => {
    setBgContextMenu(null)
    setContextMenu({ type: 'edge', data: edgeData, x, y })
    setSelected({ type: 'edge', id: edgeData.id, data: edgeData })
    setNodeRelationships([])
  }, [])

  const handleBgRightClick = useCallback((screenX, screenY, graphX, graphY) => {
    setBgContextMenu({ x: screenX, y: screenY, graphX, graphY })
  }, [])

  // ── Filter / Hide ─────────────────────────────────────────
  const unhideAll = useCallback(() => {
    setHiddenNodeIds(new Set())
    setHiddenRelLabels(new Set())
    setFilters([])
    setHiddenTypes(new Set())
    setHiddenTagNames(new Set())
  }, [])

  const addFilter = useCallback(() => {
    setFilters(prev => [...prev, { id: Date.now(), text: '', searchNodes: true, searchRels: false }])
  }, [])
  const updateFilter = useCallback((id, updates) => {
    setFilters(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))
  }, [])
  const removeFilter = useCallback((id) => {
    setFilters(prev => prev.filter(f => f.id !== id))
  }, [])
  const toggleHideType = useCallback((typeName) => {
    setHiddenTypes(prev => {
      const next = new Set(prev)
      if (next.has(typeName)) { next.delete(typeName) } else { next.add(typeName) }
      return next
    })
  }, [])
  const toggleHideRelLabel = useCallback((label) => {
    setHiddenRelLabels(prev => { const n = new Set(prev); n.has(label) ? n.delete(label) : n.add(label); return n })
  }, [])
  const hideAllNodes = useCallback(() => {
    setHiddenNodeIds(new Set(graphData.nodes.map(n => String(n.data.id))))
  }, [graphData.nodes])
  const unhideAllNodes = useCallback(() => setHiddenNodeIds(new Set()), [])
  const hideAllRelLabels = useCallback(() => {
    const labels = [...new Set(graphData.edges.map(e => e.data.label))]
    setHiddenRelLabels(new Set(labels))
  }, [graphData.edges])
  const unhideAllRelLabels = useCallback(() => setHiddenRelLabels(new Set()), [])
  const hideAllTypes = useCallback(() => {
    setHiddenTypes(new Set(nodeTypes.map(t => t.name)))
  }, [nodeTypes])
  const unhideAllTypes = useCallback(() => setHiddenTypes(new Set()), [])
  const toggleHideTagName = useCallback((name) => {
    setHiddenTagNames(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })
  }, [])
  const hideAllTagNames = useCallback(() => setHiddenTagNames(new Set(allTags.map(t => t.name))), [allTags])
  const unhideAllTagNames = useCallback(() => setHiddenTagNames(new Set()), [])

  const handleBulkHide = useCallback(() => {
    setHiddenNodeIds((prev) => {
      const next = new Set(prev)
      multiSelectedNodeIds.forEach((id) => next.add(String(id)))
      return next
    })
    setMultiSelectedNodeIds([])
    graphRef.current?.clearSelection()
  }, [multiSelectedNodeIds])

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${multiSelectedNodeIds.length} nodes and all their relationships?`)) return
    try {
      for (const id of multiSelectedNodeIds) {
        await api.deleteNode(parseInt(id))
      }
      setMultiSelectedNodeIds([])
      setSelected(null)
      setNodeRelationships([])
      await loadGraph()
    } catch (e) {
      setError(e.message)
    }
  }

  // ── Hide/unhide individual node ───────────────────────────
  const toggleHideNode = useCallback((nodeId) => {
    const id = String(nodeId)
    setHiddenNodeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setSelected((prev) => (prev?.type === 'node' && String(prev.id) === id ? null : prev))
    setNodeRelationships([])
  }, [])

  // ── Mutations ─────────────────────────────────────────────
  const afterNodeSaved = async (keepOpen = false, createdNode = null) => {
    if (createdNode && pendingNodePosition) {
      graphRef.current?.setPendingPosition(createdNode.id, pendingNodePosition)
      setPendingNodePosition(null)
    }
    await loadGraph()
    if (!keepOpen) {
      setShowAddNode(false)
      setEditingNode(null)
      setBgContextMenu(null)
    }
  }

  const afterRelSaved = async (keepOpen = false) => {
    await loadGraph()
    if (selected?.type === 'node') await refreshNodeRels(selected.id)
    if (!keepOpen) setShowAddRel(false)
  }

  const handleDeleteNode = async () => {
    if (!window.confirm('Delete this node and all its relationships?')) return
    try {
      await api.deleteNode(parseInt(selected.id))
      setSelected(null)
      setNodeRelationships([])
      await loadGraph()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleDeleteEdge = async () => {
    if (!window.confirm('Delete this relationship?')) return
    try {
      await api.deleteRelationship(selected.data.rel_id)
      setSelected(null)
      await loadGraph()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleRelationshipDelete = async (relId) => {
    try {
      await api.deleteRelationship(relId)
      await loadGraph()
      if (selected?.type === 'node') await refreshNodeRels(selected.id)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleEdgeSaved = async () => {
    await loadGraph()
    if (selected?.type === 'node') await refreshNodeRels(selected.id)
  }

  const handleSwapRelationship = async (relId) => {
    try {
      await api.swapRelationship(relId)
      await loadGraph()
      if (selected?.type === 'node') await refreshNodeRels(selected.id)
    } catch (e) {
      setError(e.message)
    }
  }

  // Build context menu items based on type
  const ctxData = contextMenu?.data
  const ctxIsNode = contextMenu?.type === 'node'
  const ctxIsHidden = ctxIsNode && hiddenNodeIds.has(String(ctxData?.id))

  return (
    <div className="app">
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar
        nodeTypes={nodeTypes}
        graphData={graphData}
        selectedNodeId={selected?.type === 'node' ? selected.id : null}
        onAddNode={() => setShowAddNode(true)}
        onAddRelationship={() => setShowAddRel(true)}
        onShowTimeline={() => setShowTimeline(true)}
        onOpenSettings={() => setShowSettings(true)}
        hiddenNodeIds={hiddenNodeIds}
        allHiddenNodeIds={allHiddenNodeIds}
        onToggleHideNode={toggleHideNode}
        onHideAllNodes={hideAllNodes}
        onUnhideAllNodes={unhideAllNodes}
        hiddenRelLabels={hiddenRelLabels}
        onToggleHideRelLabel={toggleHideRelLabel}
        onHideAllRelLabels={hideAllRelLabels}
        onUnhideAllRelLabels={unhideAllRelLabels}
        hiddenTypes={hiddenTypes}
        onToggleHideType={toggleHideType}
        onHideAllTypes={hideAllTypes}
        onUnhideAllTypes={unhideAllTypes}
        allTags={allTags}
        hiddenTagNames={hiddenTagNames}
        onToggleHideTagName={toggleHideTagName}
        onHideAllTagNames={hideAllTagNames}
        onUnhideAllTagNames={unhideAllTagNames}
        filters={filters}
        onAddFilter={addFilter}
        onUpdateFilter={updateFilter}
        onRemoveFilter={removeFilter}
        open={sidebarOpen}
        onCollapse={() => setSidebarOpen(false)}
        onNodeFocus={handleNodeFocus}
      />

      <main className="graph-area">
        <button
          className={`sidebar-toggle-btn${sidebarOpen ? ' hidden-desktop' : ''}`}
          onClick={() => setSidebarOpen((v) => !v)}
          title="Open sidebar"
        >
          ☰
        </button>

        {error && (
          <div className="error-banner">
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <GraphView
          ref={graphRef}
          graphData={graphData}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onBgClick={handleBgClick}
          onNodeRightClick={handleNodeRightClick}
          onEdgeRightClick={handleEdgeRightClick}
          onBgRightClick={handleBgRightClick}
          selectedId={selected?.id}
          focusNodeId={focusNodeId}
          onFocusConsumed={() => setFocusNodeId(null)}
          hiddenNodeIds={allHiddenNodeIds}
          hiddenEdgeIds={allHiddenEdgeIds}
          onSelectionChange={handleSelectionChange}
          selectionMode={selectionMode}
          multiSelectActive={multiSelectedNodeIds.length > 1}
          onBoxSelectDone={() => setSelectionMode('normal')}
        />

        <div className="graph-toolbar">
          <button className="toolbar-btn" onClick={() => graphRef.current?.fitGraph()}>Fit All</button>
          <button className="toolbar-btn" onClick={() => graphRef.current?.relayout()}>Relayout</button>
          <button
            className={`toolbar-btn${selectionMode === 'box' ? ' active' : ''}`}
            onClick={() => setSelectionMode((m) => m === 'box' ? 'normal' : 'box')}
            title={selectionMode === 'box' ? 'Exit box-select mode' : 'Box-select nodes'}
          >
            ⬚ Select
          </button>
        </div>
      </main>

      {multiSelectedNodeIds.length > 1 && (
        <MultiSelectPanel
          selectedIds={multiSelectedNodeIds}
          graphData={graphData}
          onClose={() => {
            setMultiSelectedNodeIds([])
            graphRef.current?.clearSelection()
          }}
          onAddRelationship={() => setShowAddRel(true)}
          onHideAll={handleBulkHide}
          onDeleteAll={handleBulkDelete}
        />
      )}

      {selected?.type === 'node' && multiSelectedNodeIds.length <= 1 && (
        <NodePanel
          nodeData={selected.data}
          relationships={nodeRelationships}
          onEdit={() => { setContextMenu(null); setEditingNode(selected.data) }}
          onAddRelationship={() => { setContextMenu(null); setShowAddRel(true) }}
          onDelete={handleDeleteNode}
          onRelationshipDelete={handleRelationshipDelete}
          onRelationshipSwap={handleSwapRelationship}
          onClose={() => { setSelected(null); setNodeRelationships([]) }}
          isHidden={allHiddenNodeIds.has(String(selected.id))}
          onToggleHide={() => toggleHideNode(selected.id)}
        />
      )}

      {selected?.type === 'edge' && (
        <EdgePanel
          edgeData={selected.data}
          onDelete={handleDeleteEdge}
          onClose={() => setSelected(null)}
          onSaved={handleEdgeSaved}
          existingLabels={existingRelLabels}
          existingMetaKeys={existingRelMetaKeys}
        />
      )}

      {(showAddNode || editingNode) && (
        <AddNodeModal
          nodeTypes={nodeTypes}
          allTags={allTags}
          initialData={editingNode}
          existingMetaKeys={existingNodeMetaKeys}
          onSave={afterNodeSaved}
          onClose={() => { setShowAddNode(false); setEditingNode(null) }}
        />
      )}

      {showAddRel && (
        <AddRelationshipModal
          nodes={graphData.nodes.map((n) => n.data)}
          sourceId={selected?.type === 'node' ? selected.id : null}
          sourceIds={multiSelectedNodeIds.length > 1 ? multiSelectedNodeIds : undefined}
          existingLabels={existingRelLabels}
          existingMetaKeys={existingRelMetaKeys}
          onSave={afterRelSaved}
          onClose={() => setShowAddRel(false)}
        />
      )}

      {showSettings && (
        <SettingsModal nodeTypes={nodeTypes} onUpdateTypes={loadNodeTypes} onClose={() => setShowSettings(false)} onUpdateGraph={loadGraph} />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          title={ctxIsNode ? ctxData.label : ctxData.label}
          subtitle={ctxIsNode ? ctxData.type : `${ctxData.source_name} → ${ctxData.target_name}`}
          items={ctxIsNode ? [
            { label: '+ Add Relationship', onClick: () => setShowAddRel(true) },
            { label: 'Edit', onClick: () => setEditingNode(ctxData) },
            { label: ctxIsHidden ? 'Unhide from graph' : 'Hide from graph', onClick: () => toggleHideNode(ctxData.id) },
            'divider',
            { label: 'Delete', onClick: handleDeleteNode, danger: true },
          ] : [
            { label: '↕ Swap Direction', onClick: () => handleSwapRelationship(ctxData.rel_id) },
            'divider',
            { label: 'Delete', onClick: handleDeleteEdge, danger: true },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}

      {bgContextMenu && (
        <ContextMenu
          x={bgContextMenu.x}
          y={bgContextMenu.y}
          title="Canvas"
          items={[
            { label: '+ Add Node Here', onClick: () => { setPendingNodePosition({ x: bgContextMenu.graphX, y: bgContextMenu.graphY }); setShowAddNode(true); setBgContextMenu(null) }},
            { label: '⊞ Fit All', onClick: () => { graphRef.current?.fitGraph(); setBgContextMenu(null) }},
            { label: '⟲ Relayout', onClick: () => { graphRef.current?.relayout(); setBgContextMenu(null) }},
            { label: selectionMode === 'box' ? '✓ Box Select (on)' : '⬚ Box Select', onClick: () => { setSelectionMode(m => m === 'box' ? 'normal' : 'box'); setBgContextMenu(null) }},
          ]}
          onClose={() => setBgContextMenu(null)}
        />
      )}

      {showTimeline && (
        <Timeline
          graphData={graphData}
          onClose={() => setShowTimeline(false)}
        />
      )}
    </div>
  )
}
