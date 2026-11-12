import { useState, useRef, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { api } from '../api'
import {
  buildExportData,
  exportAsJson,
  exportAsXlsx,
  parseImportFile,
  validateImportData,
  executeImport,
} from '../utils/importExport'

export default function ImportExportTab({
  activeGraphId,
  graphData,
  nodeTypes,
  allTags,
  storyTitle,
  onImportComplete,
}) {
  const [phase, setPhase] = useState('idle')
  const [importData, setImportData] = useState(null)
  const [validation, setValidation] = useState(null)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const handleExport = useCallback(async (format) => {
    try {
      const relTypes = await api.getRelTypes(activeGraphId)
      const data = buildExportData(graphData, nodeTypes, allTags, relTypes, storyTitle)
      const filename = `${storyTitle || 'story'} - ${new Date().toISOString().slice(0, 10)}`
      if (format === 'json') exportAsJson(data, filename)
      else exportAsXlsx(data, filename)
    } catch (e) {
      setError(`Export failed: ${e.message}`)
    }
  }, [activeGraphId, graphData, nodeTypes, allTags, storyTitle])

  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setResult(null)
    setPhase('parsing')
    try {
      const data = await parseImportFile(file)
      const v = validateImportData(data, nodeTypes, allTags, graphData.nodes)
      setImportData(data)
      setValidation(v)
      setPhase('validated')
    } catch (err) {
      setError(err.message)
      setPhase('idle')
    }
    if (fileRef.current) fileRef.current.value = ''
  }, [nodeTypes, allTags, graphData.nodes])

  const handleImport = useCallback(async () => {
    if (!importData || !validation?.valid) return
    setPhase('importing')
    setError(null)
    try {
      const res = await executeImport(
        importData,
        activeGraphId,
        nodeTypes,
        allTags,
        graphData.nodes,
        setProgress,
      )
      setResult(res)
      setPhase('done')
      onImportComplete?.()
    } catch (e) {
      setError(`Import failed: ${e.message}`)
      setPhase('validated')
    }
  }, [importData, validation, activeGraphId, nodeTypes, allTags, graphData.nodes, onImportComplete])

  const handleCancel = () => {
    setPhase('idle')
    setImportData(null)
    setValidation(null)
    setProgress(null)
    setResult(null)
    setError(null)
  }

  const counts = importData ? {
    types: importData.nodeTypes.length,
    tags: importData.tags.length,
    nodes: importData.nodes.length,
    rels: importData.relationships.length,
  } : null

  const phaseLabel = {
    types: 'Creating types',
    tags: 'Creating tags',
    nodes: 'Creating nodes',
    relationships: 'Creating relationships',
    relColors: 'Updating colors',
  }

  return (
    <div className="io-tab">
      <div className="io-section">
        <div className="io-section-title">Export</div>
        <p className="io-hint">Download all data from this story.</p>
        <div className="io-actions">
          <button className="btn btn-primary btn-sm" onClick={() => handleExport('json')}>
            <Icon icon="carbon:document" width={14} style={{ marginRight: 4 }} />
            JSON
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => handleExport('xlsx')}>
            <Icon icon="carbon:spreadsheet" width={14} style={{ marginRight: 4 }} />
            XLSX
          </button>
        </div>
      </div>

      <div className="io-section">
        <div className="io-section-title">Import</div>
        <p className="io-hint">Import data into this story from a JSON or XLSX file.</p>

        {phase === 'idle' && (
          <label className="io-file-zone">
            <Icon icon="carbon:upload" width={20} />
            <span>Choose file</span>
            <span className="io-file-formats">.json, .xlsx</span>
            <input
              ref={fileRef}
              type="file"
              accept=".json,.xlsx,.xls"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </label>
        )}

        {phase === 'parsing' && (
          <div className="io-status">Parsing file…</div>
        )}

        {phase === 'validated' && validation && (
          <div className="io-preview">
            <div className="io-counts">
              Parsed: {counts.types} types, {counts.tags} tags, {counts.nodes} nodes, {counts.rels} relationships
            </div>

            {validation.warnings.length > 0 && (
              <div className="io-messages">
                {validation.warnings.map((w, i) => (
                  <div key={i} className="io-warning">
                    <Icon icon="carbon:warning" width={12} /> {w}
                  </div>
                ))}
              </div>
            )}

            {validation.errors.length > 0 && (
              <div className="io-messages">
                {validation.errors.map((e, i) => (
                  <div key={i} className="io-error">
                    <Icon icon="carbon:error" width={12} /> {e}
                  </div>
                ))}
              </div>
            )}

            <div className="io-actions">
              {validation.valid ? (
                <button className="btn btn-primary btn-sm" onClick={handleImport}>
                  <Icon icon="carbon:download" width={14} style={{ marginRight: 4 }} />
                  Import into Story
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" disabled>
                  Fix errors to import
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={handleCancel}>Cancel</button>
            </div>
          </div>
        )}

        {phase === 'importing' && progress && (
          <div className="io-progress">
            <div className="io-progress-label">
              {phaseLabel[progress.phase] || progress.phase}… {progress.current}/{progress.total}
            </div>
            <div className="io-progress-bar">
              <div
                className="io-progress-fill"
                style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="io-result">
            <div className="io-success">
              <Icon icon="carbon:checkmark-filled" width={14} /> Import complete
            </div>
            <div className="io-result-counts">
              {result.types > 0 && <span>{result.types} types</span>}
              {result.tags > 0 && <span>{result.tags} tags</span>}
              {result.nodes > 0 && <span>{result.nodes} nodes</span>}
              {result.relationships > 0 && <span>{result.relationships} rels</span>}
              {result.relColors > 0 && <span>{result.relColors} colors</span>}
            </div>
            {result.errors.length > 0 && (
              <div className="io-messages">
                {result.errors.map((e, i) => (
                  <div key={i} className="io-error">
                    <Icon icon="carbon:error" width={12} /> {e}
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-ghost btn-sm" onClick={handleCancel} style={{ marginTop: 8 }}>
              Done
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="io-error" style={{ marginTop: 8 }}>
          <Icon icon="carbon:error" width={12} /> {error}
        </div>
      )}
    </div>
  )
}
