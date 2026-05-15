import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import cytoscape from 'cytoscape'

const LAYOUT_OPTS = {
  name: 'cose',
  animate: false,
  padding: 60,
  nodeOverlap: 20,
  idealEdgeLength: 100,
  nodeRepulsion: 4500,
}

const buildNodeData = (data) => ({
  ...data,
  fontColor: data.font_color || '#ffffff',
  cyLabel: data.tags?.length
    ? `${data.label}\n${data.tags.map(t => `#${t.name}`).join(' ')}`
    : data.label,
})

const CY_STYLE = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      'label': 'data(cyLabel)',
      'color': 'data(fontColor)',
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': '12px',
      'font-weight': '500',
      'text-wrap': 'wrap',
      'text-max-width': '100px',
      'width': 'label',
      'height': 'label',
      'padding': '16px',
      'shape': 'round-rectangle',
      'z-index': 10,
    },
  },
  {
    selector: 'edge',
    style: {
      'width': 1.5,
      'line-color': 'data(color)',
      'target-arrow-color': 'data(color)',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'label': 'data(label)',
      'font-size': '10px',
      'color': '#718096',
      'text-rotation': 'autorotate',
      'text-background-color': '#0f1117',
      'text-background-opacity': 1,
      'text-background-padding': '3px',
      'text-border-opacity': 0,
      'z-index': 1,
    },
  },
  {
    selector: 'edge.bidir',
    style: {
      'source-arrow-shape': 'triangle',
      'source-arrow-color': 'data(color)',
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#a78bfa',
      'border-width': 3,
      'border-opacity': 1,
      'z-index': 20,
    },
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': '#a78bfa',
      'target-arrow-color': '#a78bfa',
      'source-arrow-color': '#a78bfa',
      'width': 2.5,
    },
  },
  {
    selector: '.sg-hidden',
    style: { display: 'none' },
  },
]

// Collapse A→B + B→A pairs (same label) into one bidirectional edge
function buildEdges(edges) {
  const seenKeys = new Map()
  const result = []
  for (const edge of edges) {
    const { source, target, label } = edge.data
    const revKey = `${target}→${source}→${label}`
    if (seenKeys.has(revKey)) {
      const idx = seenKeys.get(revKey)
      result[idx] = {
        ...result[idx],
        data: { ...result[idx].data, bidirectional: true, bidir_rel_id: edge.data.rel_id },
        classes: 'bidir',
      }
    } else {
      seenKeys.set(`${source}→${target}→${label}`, result.length)
      result.push(edge)
    }
  }
  return result
}

const POSITIONS_KEY = (graphId) => `sg-positions-${graphId}`

const loadSavedPositions = (graphId) => {
  try { return JSON.parse(localStorage.getItem(POSITIONS_KEY(graphId)) || '{}') } catch { return {} }
}
const savePositions = (graphId, positions) => {
  try { localStorage.setItem(POSITIONS_KEY(graphId), JSON.stringify(positions)) } catch {}
}

const GraphView = forwardRef(function GraphView(
  {
    graphData, onNodeClick, onEdgeClick, onBgClick,
    onNodeRightClick, onEdgeRightClick, onBgRightClick,
    selectedId, focusNodeId, onFocusConsumed,
    hiddenNodeIds, hiddenEdgeIds,
    onSelectionChange, selectionMode, multiSelectActive,
    onBoxSelectDone, graphId,
  },
  ref,
) {
  const containerRef = useRef(null)
  const cy = useRef(null)
  const graphIdRef = useRef(graphId)

  // Stable refs for callbacks so the init effect never re-runs
  const onNodeClickRef = useRef(onNodeClick)
  const onEdgeClickRef = useRef(onEdgeClick)
  const onBgClickRef = useRef(onBgClick)
  const onNodeRightClickRef = useRef(onNodeRightClick)
  const onEdgeRightClickRef = useRef(onEdgeRightClick)
  const onBgRightClickRef = useRef(onBgRightClick)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const selectionModeRef = useRef(selectionMode)
  const onBoxSelectDoneRef = useRef(onBoxSelectDone)
  const boxSelectTimerRef = useRef(null)
  const pendingPositionsRef = useRef(new Map())

  useEffect(() => { graphIdRef.current = graphId }, [graphId])
  useEffect(() => { onNodeClickRef.current = onNodeClick }, [onNodeClick])
  useEffect(() => { onEdgeClickRef.current = onEdgeClick }, [onEdgeClick])
  useEffect(() => { onBgClickRef.current = onBgClick }, [onBgClick])
  useEffect(() => { onNodeRightClickRef.current = onNodeRightClick }, [onNodeRightClick])
  useEffect(() => { onEdgeRightClickRef.current = onEdgeRightClick }, [onEdgeRightClick])
  useEffect(() => { onBgRightClickRef.current = onBgRightClick }, [onBgRightClick])
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange }, [onSelectionChange])
  useEffect(() => { selectionModeRef.current = selectionMode }, [selectionMode])
  useEffect(() => { onBoxSelectDoneRef.current = onBoxSelectDone }, [onBoxSelectDone])

  useImperativeHandle(ref, () => ({
    resetGraph: () => cy.current?.elements().remove(),
    fitGraph: () => cy.current?.fit(undefined, 50),
    relayout: () => {
      if (!cy.current) return
      cy.current.layout({ ...LAYOUT_OPTS, animate: true, animationDuration: 600 }).run()
    },
    clearSelection: () => cy.current?.elements().unselect(),
    setPendingPosition: (nodeId, pos) => pendingPositionsRef.current.set(String(nodeId), pos),
    alignNodes: (nodeIds, alignment) => {
      if (!cy.current || nodeIds.length < 2) return
      const cyNodes = nodeIds.map(id => cy.current.getElementById(String(id))).filter(n => n.length > 0)
      if (cyNodes.length < 2) return
      if (alignment === 'center-v') {
        const avgX = cyNodes.reduce((s, n) => s + n.position().x, 0) / cyNodes.length
        cyNodes.forEach(n => n.position({ x: avgX, y: n.position().y }))
      } else if (alignment === 'center-h') {
        const avgY = cyNodes.reduce((s, n) => s + n.position().y, 0) / cyNodes.length
        cyNodes.forEach(n => n.position({ x: n.position().x, y: avgY }))
      } else if (alignment === 'dist-v') {
        const sorted = [...cyNodes].sort((a, b) => a.position().y - b.position().y)
        const minY = sorted[0].position().y
        const maxY = sorted[sorted.length - 1].position().y
        const step = (maxY - minY) / (sorted.length - 1)
        sorted.forEach((n, i) => n.position({ x: n.position().x, y: minY + i * step }))
      } else if (alignment === 'dist-h') {
        const sorted = [...cyNodes].sort((a, b) => a.position().x - b.position().x)
        const minX = sorted[0].position().x
        const maxX = sorted[sorted.length - 1].position().x
        const step = (maxX - minX) / (sorted.length - 1)
        sorted.forEach((n, i) => n.position({ x: minX + i * step, y: n.position().y }))
      }
      const positions = {}
      cy.current.nodes().forEach(n => { const p = n.position(); positions[n.id()] = { x: p.x, y: p.y } })
      savePositions(graphIdRef.current, positions)
    },
  }))

  // Keep Cytoscape aware of container size changes (fixes edges not rendering on init)
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(() => cy.current?.resize())
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Initialise Cytoscape once
  useEffect(() => {
    cy.current = cytoscape({
      container: containerRef.current,
      style: CY_STYLE,
      layout: { name: 'preset' },
      wheelSensitivity: 0.25,
      minZoom: 0.1,
      maxZoom: 4,
      boxSelectionEnabled: false,
    })

    cy.current.on('tap', 'node', (evt) => {
      const data = evt.target.data()
      const oe = evt.originalEvent
      if (oe?.ctrlKey || oe?.metaKey || oe?.shiftKey) {
        // Let Cytoscape toggle selection, then notify parent
        setTimeout(() => {
          const ids = cy.current.$('node:selected').map((n) => n.id())
          onSelectionChangeRef.current?.(ids)
        }, 0)
      } else {
        onNodeClickRef.current(data)
      }
    })

    cy.current.on('tap', 'edge', (evt) => onEdgeClickRef.current(evt.target.data()))
    cy.current.on('tap', (evt) => {
      if (evt.target === cy.current) onBgClickRef.current()
    })

    cy.current.on('cxttap', 'node', (evt) => {
      evt.originalEvent.preventDefault()
      const { clientX, clientY } = evt.originalEvent
      onNodeRightClickRef.current(evt.target.data(), clientX, clientY)
    })
    cy.current.on('cxttap', 'edge', (evt) => {
      evt.originalEvent.preventDefault()
      const { clientX, clientY } = evt.originalEvent
      onEdgeRightClickRef.current(evt.target.data(), clientX, clientY)
    })
    cy.current.on('cxttap', (evt) => {
      if (evt.target !== cy.current) return
      evt.originalEvent.preventDefault()
      const { clientX, clientY } = evt.originalEvent
      const zoom = cy.current.zoom()
      const pan = cy.current.pan()
      const container = cy.current.container().getBoundingClientRect()
      const graphX = (clientX - container.left - pan.x) / zoom
      const graphY = (clientY - container.top - pan.y) / zoom
      onBgRightClickRef.current?.(clientX, clientY, graphX, graphY)
    })

    // Save positions on drag end
    cy.current.on('dragfree', 'node', () => {
      const positions = {}
      cy.current.nodes().forEach((n) => {
        const p = n.position()
        positions[n.id()] = { x: p.x, y: p.y }
      })
      savePositions(graphIdRef.current, positions)
    })

    // Box-select: debounce select events to read final selection
    cy.current.on('select unselect', 'node', () => {
      if (selectionModeRef.current !== 'box') return
      clearTimeout(boxSelectTimerRef.current)
      boxSelectTimerRef.current = setTimeout(() => {
        const ids = cy.current.$('node:selected').map((n) => n.id())
        onSelectionChangeRef.current?.(ids)
        onBoxSelectDoneRef.current?.()
      }, 50)
    })

    return () => {
      clearTimeout(boxSelectTimerRef.current)
      cy.current?.destroy()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle box-selection / panning mode
  useEffect(() => {
    if (!cy.current) return
    const isBox = selectionMode === 'box'
    cy.current.boxSelectionEnabled(isBox)
    cy.current.userPanningEnabled(!isBox)
  }, [selectionMode])

  // Incremental graph update — never removes or repositions existing nodes.
  useEffect(() => {
    if (!cy.current) return

    const existingIds = new Set(cy.current.nodes().map((n) => n.id()))
    const incomingIds = new Set(graphData.nodes.map((n) => String(n.data.id)))
    const isInitialLoad = existingIds.size === 0

    graphData.nodes.forEach((n) => {
      const id = String(n.data.id)
      if (existingIds.has(id)) cy.current.getElementById(id).data(buildNodeData(n.data))
    })

    const toAdd = graphData.nodes.filter((n) => !existingIds.has(String(n.data.id)))
    if (toAdd.length > 0) {
      cy.current.add(toAdd.map(n => ({ ...n, data: buildNodeData(n.data) })))
      if (!isInitialLoad) {
        const pan = cy.current.pan()
        const zoom = cy.current.zoom()
        const w = cy.current.container().clientWidth
        const h = cy.current.container().clientHeight
        const cx = (w / 2 - pan.x) / zoom
        const cy_ = (h / 2 - pan.y) / zoom
        toAdd.forEach((n) => {
          const id = String(n.data.id)
          const pending = pendingPositionsRef.current.get(id)
          if (pending) {
            cy.current.getElementById(id).position(pending)
            pendingPositionsRef.current.delete(id)
          } else {
            cy.current.getElementById(id).position({
              x: cx + (Math.random() - 0.5) * 220,
              y: cy_ + (Math.random() - 0.5) * 220,
            })
          }
        })
      }
    }

    cy.current.nodes().filter((n) => !incomingIds.has(n.id())).remove()

    cy.current.edges().remove()
    cy.current.add(buildEdges(graphData.edges))
    cy.current.forceRender()

    if (isInitialLoad && cy.current.nodes().length > 0) {
      const saved = loadSavedPositions(graphIdRef.current)
      const hasSaved = Object.keys(saved).length > 0
      if (hasSaved) {
        cy.current.nodes().forEach((n) => {
          if (saved[n.id()]) n.position(saved[n.id()])
        })
        cy.current.fit(undefined, 50)
      } else {
        cy.current.layout(LAYOUT_OPTS).run()
        cy.current.fit(undefined, 50)
      }
    }
  }, [graphData])

  // Sync hidden node classes
  useEffect(() => {
    if (!cy.current) return
    cy.current.nodes().forEach((n) => {
      if (hiddenNodeIds?.has(n.id())) n.addClass('sg-hidden')
      else n.removeClass('sg-hidden')
    })
  }, [hiddenNodeIds, graphData])

  // Sync hidden edge classes
  useEffect(() => {
    if (!cy.current) return
    cy.current.edges().forEach((e) => {
      if (hiddenEdgeIds?.has(e.id())) e.addClass('sg-hidden')
      else e.removeClass('sg-hidden')
    })
  }, [hiddenEdgeIds, graphData])

  // Sync selection highlight (suppressed when multi-select is active)
  useEffect(() => {
    if (!cy.current || multiSelectActive) return
    cy.current.elements().unselect()
    if (selectedId) cy.current.getElementById(String(selectedId)).select()
  }, [selectedId, multiSelectActive])

  // Pan & centre on focused node
  useEffect(() => {
    if (!focusNodeId || !cy.current) return
    const node = cy.current.getElementById(String(focusNodeId))
    if (node.length) {
      cy.current.animate({ center: { eles: node }, zoom: Math.max(cy.current.zoom(), 1) }, { duration: 300 })
      node.select()
    }
    onFocusConsumed?.()
  }, [focusNodeId]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#0f1117' }} />
})

export default GraphView
