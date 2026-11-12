import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { api } from '../api'

const TOOLTIP = {
  from: 'Click nodes on the graph to add as source(s)',
  to: 'Click target nodes on the graph',
}

const QuickRelBar = forwardRef(function QuickRelBar({
  nodes,
  existingLabels,
  onDone,
  onCancel,
  selectedNodeId,
  initialFromIds,
  initialPosition,
  onFromToChange,
}, ref) {
  // Always start at the 'from' step so the user can refine sources by clicking
  // additional graph nodes.
  const [step, setStep] = useState('from')
  const [fromIds, setFromIds] = useState(() => {
    if (initialFromIds && initialFromIds.length > 0) return initialFromIds.map(String)
    if (selectedNodeId) return [String(selectedNodeId)]
    return []
  })
  const [label, setLabel] = useState('')
  const [bidirectional, setBidirectional] = useState(false)
  const [toIds, setToIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [tooltip, setTooltip] = useState(null)
  const labelRef = useRef(null)

  const [pos, setPos] = useState(() => initialPosition || { x: 100, y: 100 })
  const [size, setSize] = useState({ width: 320, height: 'auto' })

  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const resizing = useRef(false)
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 })
  const barRef = useRef(null)

  useEffect(() => {
    if (step === 'label') labelRef.current?.focus()
  }, [step])

  // Notify parent when from/to sets change so GraphView can highlight.
  useEffect(() => {
    onFromToChange?.({ fromIds, toIds })
  }, [fromIds, toIds, onFromToChange])

  useImperativeHandle(ref, () => ({ handleNodeClick }))

  const nodeMap = Object.fromEntries(nodes.map(n => [String(n.id), n]))

  const handleNodeClick = (nodeId) => {
    const id = String(nodeId)
    if (step === 'from') {
      setFromIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    } else if (step === 'to') {
      setToIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    } else if (step === 'label') {
      // While at the label step, clicking a node adds it as a target and
      // advances to the 'to' step.
      setToIds(prev => prev.includes(id) ? prev : [...prev, id])
      setStep('to')
    }
  }

  const handleSave = useCallback(async () => {
    if (fromIds.length === 0 || toIds.length === 0 || !label.trim()) return
    setSaving(true)
    setError(null)
    let created = 0
    try {
      for (const src of fromIds) {
        for (const tgt of toIds) {
          if (src === tgt) continue
          try {
            await api.createRelationship({
              source_id: parseInt(src),
              target_id: parseInt(tgt),
              label: label.trim(),
            })
            created++
            if (bidirectional) {
              try {
                await api.createRelationship({
                  source_id: parseInt(tgt),
                  target_id: parseInt(src),
                  label: label.trim(),
                })
                created++
              } catch { /* skip duplicate */ }
            }
          } catch { /* skip duplicate */ }
        }
      }
      onDone(created)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }, [fromIds, toIds, label, bidirectional, onDone])

  // Ctrl/Cmd + Enter advances or submits the current step.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return
      if (step === 'from' && fromIds.length > 0) {
        e.preventDefault()
        setStep('label')
      } else if (step === 'label' && label.trim()) {
        e.preventDefault()
        setStep('to')
      } else if (step === 'to' && toIds.length > 0 && !saving) {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [step, fromIds, label, toIds, saving, handleSave])

  const onDragMouseDown = (e) => {
    if (e.button !== 0) return
    if (e.target.closest('button, input, select')) return
    dragging.current = true
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    e.preventDefault()
  }

  const onResizeMouseDown = (e) => {
    if (e.button !== 0) return
    resizing.current = true
    const el = barRef.current
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      w: el ? el.offsetWidth : (typeof size.width === 'number' ? size.width : 320),
      h: el ? el.offsetHeight : 200,
    }
    e.preventDefault()
    e.stopPropagation()
  }

  useEffect(() => {
    const onMouseMove = (e) => {
      if (dragging.current) {
        setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y })
      }
      if (resizing.current) {
        const dx = e.clientX - resizeStart.current.x
        const dy = e.clientY - resizeStart.current.y
        setSize({
          width: Math.max(280, resizeStart.current.w + dx),
          height: Math.max(160, resizeStart.current.h + dy),
        })
      }
    }
    const onMouseUp = () => {
      dragging.current = false
      resizing.current = false
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const fromNames = fromIds.map(id => nodeMap[id]?.label || id)

  const stepDefs = [
    { key: 'from', label: '1. From' },
    { key: 'label', label: '2. Label' },
    { key: 'to', label: '3. To' },
  ]

  // Allow navigation backward freely. Forward navigation only if prior step
  // is satisfied.
  const canGoToStep = (key) => {
    if (key === 'from') return true
    if (key === 'label') return fromIds.length > 0
    if (key === 'to') return fromIds.length > 0 && !!label.trim()
    return false
  }

  return (
    <div
      ref={barRef}
      className="quick-rel-bar"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.width,
        ...(size.height !== 'auto' ? { height: size.height } : {}),
      }}
    >
      <div className="quick-rel-header" onMouseDown={onDragMouseDown}>
        <div className="quick-rel-steps">
          {stepDefs.map(({ key, label: sLabel }, i) => {
            const enabled = canGoToStep(key)
            return (
              <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {i > 0 && <span className="quick-rel-arrow">→</span>}
                <button
                  type="button"
                  className={`quick-rel-step${step === key ? ' active' : ''}${enabled ? '' : ' disabled'}`}
                  onClick={() => enabled && setStep(key)}
                  onMouseEnter={() => step === key && TOOLTIP[key] ? setTooltip(key) : undefined}
                  onMouseLeave={() => setTooltip(null)}
                  style={{ position: 'relative', cursor: enabled ? 'pointer' : 'not-allowed' }}
                  disabled={!enabled}
                >
                  {sLabel}
                  {tooltip === key && TOOLTIP[key] && (
                    <span className="quick-rel-tooltip">{TOOLTIP[key]}</span>
                  )}
                </button>
              </span>
            )
          })}
        </div>
        <button className="quick-rel-close" onClick={onCancel} title="Cancel">
          <Icon icon="carbon:close" width={16} />
        </button>
      </div>

      <div className="quick-rel-content">
        {step === 'from' && (
          <>
            <div className="quick-rel-chips">
              {fromIds.map(id => (
                <span key={id} className="quick-rel-chip quick-rel-chip-from">
                  <span className="type-dot" style={{ background: nodeMap[id]?.color || '#6366f1' }} />
                  {nodeMap[id]?.label || id}
                  <button onClick={() => setFromIds(prev => prev.filter(x => x !== id))}>
                    <Icon icon="carbon:close" width={10} />
                  </button>
                </span>
              ))}
              {fromIds.length === 0 && (
                <span style={{ color: '#4a5568', fontSize: 12 }}>Click nodes to add as source(s)</span>
              )}
            </div>
            <div className="quick-rel-actions">
              <button
                className="btn btn-primary btn-sm"
                disabled={fromIds.length === 0}
                onClick={() => setStep('label')}
              >
                Next →
              </button>
            </div>
          </>
        )}

        {step === 'label' && (
          <>
            <div className="quick-rel-from-summary">
              From: {fromNames.join(', ')}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                ref={labelRef}
                className="form-input"
                placeholder="Relationship label…"
                list="quick-rel-labels"
                value={label}
                onChange={e => setLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && label.trim()) { e.preventDefault(); setStep('to') } }}
                style={{ flex: 1, padding: '5px 8px', fontSize: 13 }}
              />
              <datalist id="quick-rel-labels">
                {existingLabels.map(l => <option key={l} value={l} />)}
              </datalist>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#718096', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={bidirectional}
                  onChange={e => setBidirectional(e.target.checked)}
                  style={{ accentColor: '#6366f1', width: 12, height: 12 }}
                />
                ↔
              </label>
            </div>
            <div className="quick-rel-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setStep('from')}>← Back</button>
              <button
                className="btn btn-primary btn-sm"
                disabled={!label.trim()}
                onClick={() => setStep('to')}
              >
                Next →
              </button>
            </div>
          </>
        )}

        {step === 'to' && (
          <>
            <div className="quick-rel-from-summary">
              {fromNames.join(', ')} —[{label}]→
            </div>
            <div className="quick-rel-chips">
              {toIds.map(id => (
                <span key={id} className="quick-rel-chip quick-rel-chip-to">
                  <span className="type-dot" style={{ background: nodeMap[id]?.color || '#6366f1' }} />
                  {nodeMap[id]?.label || id}
                  <button onClick={() => setToIds(prev => prev.filter(x => x !== id))}>
                    <Icon icon="carbon:close" width={10} />
                  </button>
                </span>
              ))}
              {toIds.length === 0 && (
                <span style={{ color: '#4a5568', fontSize: 12 }}>Click nodes to add as target(s)</span>
              )}
            </div>
            {error && <div style={{ color: '#fc8181', fontSize: 12 }}>{error}</div>}
            <div className="quick-rel-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setStep('label')}>← Back</button>
              <button
                className="btn btn-primary btn-sm"
                disabled={saving || toIds.length === 0}
                onClick={handleSave}
                title="Ctrl/Cmd + Enter"
              >
                {saving ? 'Creating…' : `Create ${fromIds.length * toIds.length} rel${fromIds.length * toIds.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="quick-rel-resize-handle" onMouseDown={onResizeMouseDown} />
    </div>
  )
})

export default QuickRelBar
