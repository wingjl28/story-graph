import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { Icon } from '@iconify/react'
import { api } from '../api'

const QuickRelBar = forwardRef(function QuickRelBar({
  nodes,
  existingLabels,
  onDone,
  onCancel,
  selectedNodeId,
}, ref) {
  const [step, setStep] = useState('from') // 'from' | 'label' | 'to'
  const [fromIds, setFromIds] = useState(() =>
    selectedNodeId ? [String(selectedNodeId)] : []
  )
  const [label, setLabel] = useState('')
  const [bidirectional, setBidirectional] = useState(false)
  const [toIds, setToIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const labelRef = useRef(null)

  useEffect(() => {
    if (step === 'label') labelRef.current?.focus()
  }, [step])

  useImperativeHandle(ref, () => ({ handleNodeClick }))

  const nodeMap = Object.fromEntries(nodes.map(n => [String(n.id), n]))

  const handleNodeClick = (nodeId) => {
    const id = String(nodeId)
    if (step === 'from') {
      setFromIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    } else if (step === 'to') {
      setToIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }
  }

  const handleSave = async () => {
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
  }

  const fromNames = fromIds.map(id => nodeMap[id]?.label || id)
  const toNames = toIds.map(id => nodeMap[id]?.label || id)

  return (
    <div className="quick-rel-bar">
      <div className="quick-rel-steps">
        <span className={`quick-rel-step${step === 'from' ? ' active' : ''}`}>
          1. From
        </span>
        <span className="quick-rel-arrow">→</span>
        <span className={`quick-rel-step${step === 'label' ? ' active' : ''}`}>
          2. Label
        </span>
        <span className="quick-rel-arrow">→</span>
        <span className={`quick-rel-step${step === 'to' ? ' active' : ''}`}>
          3. To
        </span>
      </div>

      <div className="quick-rel-content">
        {step === 'from' && (
          <>
            <div className="quick-rel-hint">
              Click nodes on the graph to select source(s)
            </div>
            <div className="quick-rel-chips">
              {fromIds.map(id => (
                <span key={id} className="quick-rel-chip">
                  <span className="type-dot" style={{ background: nodeMap[id]?.color || '#6366f1' }} />
                  {nodeMap[id]?.label || id}
                  <button onClick={() => setFromIds(prev => prev.filter(x => x !== id))}>
                    <Icon icon="carbon:close" width={10} />
                  </button>
                </span>
              ))}
            </div>
            <button
              className="btn btn-primary btn-sm"
              disabled={fromIds.length === 0}
              onClick={() => setStep('label')}
            >
              Next →
            </button>
          </>
        )}

        {step === 'label' && (
          <>
            <div className="quick-rel-from-summary">
              From: {fromNames.join(', ')}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                ref={labelRef}
                className="form-input"
                placeholder="Relationship label…"
                list="quick-rel-labels"
                value={label}
                onChange={e => setLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && label.trim()) setStep('to') }}
                style={{ flex: 1, padding: '5px 8px', fontSize: 13 }}
              />
              <datalist id="quick-rel-labels">
                {existingLabels.map(l => <option key={l} value={l} />)}
              </datalist>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#718096', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={bidirectional}
                  onChange={e => setBidirectional(e.target.checked)}
                  style={{ accentColor: '#6366f1', width: 12, height: 12 }}
                />
                ↔ Bi
              </label>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
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
            <div className="quick-rel-hint">
              Click target nodes on the graph
            </div>
            <div className="quick-rel-chips">
              {toIds.map(id => (
                <span key={id} className="quick-rel-chip">
                  <span className="type-dot" style={{ background: nodeMap[id]?.color || '#6366f1' }} />
                  {nodeMap[id]?.label || id}
                  <button onClick={() => setToIds(prev => prev.filter(x => x !== id))}>
                    <Icon icon="carbon:close" width={10} />
                  </button>
                </span>
              ))}
            </div>
            {error && <div style={{ color: '#fc8181', fontSize: 12 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setStep('label')}>← Back</button>
              <button
                className="btn btn-primary btn-sm"
                disabled={saving || toIds.length === 0}
                onClick={handleSave}
              >
                {saving ? 'Creating…' : `Create ${fromIds.length * toIds.length} rel${fromIds.length * toIds.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>

      <button className="quick-rel-close" onClick={onCancel} title="Cancel">
        <Icon icon="carbon:close" width={16} />
      </button>
    </div>
  )
})

export default QuickRelBar
