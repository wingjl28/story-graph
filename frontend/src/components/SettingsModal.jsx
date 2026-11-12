import { useState } from 'react'
import TypeManager from './TypeManager'
import RelTypeManager from './RelTypeManager'
import TagManager from './TagManager'
import ImportExportTab from './ImportExportTab'

export default function SettingsModal({ nodeTypes, onUpdateTypes, onClose, onUpdateGraph, activeGraphId, graphData, allTags, storyTitle, onImportComplete }) {
  const [tab, setTab] = useState('types')
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg settings-modal">
        <div className="modal-header">
          <div className="settings-tabs">
            <button className={`settings-tab${tab === 'types' ? ' active' : ''}`} onClick={() => setTab('types')}>Node Types</button>
            <button className={`settings-tab${tab === 'rels' ? ' active' : ''}`} onClick={() => setTab('rels')}>Rel Colors</button>
            <button className={`settings-tab${tab === 'tags' ? ' active' : ''}`} onClick={() => setTab('tags')}>Tags</button>
            <button className={`settings-tab${tab === 'io' ? ' active' : ''}`} onClick={() => setTab('io')}>Import / Export</button>
          </div>
          <button className="panel-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body settings-modal-body">
          {tab === 'types' && <TypeManager nodeTypes={nodeTypes} onUpdate={onUpdateTypes} onClose={onClose} embedded activeGraphId={activeGraphId} />}
          {tab === 'rels' && <RelTypeManager onClose={onClose} embedded onUpdate={onUpdateGraph} activeGraphId={activeGraphId} />}
          {tab === 'tags' && <TagManager embedded onUpdate={onUpdateGraph} activeGraphId={activeGraphId} />}
          {tab === 'io' && <ImportExportTab activeGraphId={activeGraphId} graphData={graphData} nodeTypes={nodeTypes} allTags={allTags} storyTitle={storyTitle} onImportComplete={onImportComplete} />}
        </div>
      </div>
    </div>
  )
}
