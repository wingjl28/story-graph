import { useState } from 'react'
import TypeManager from './TypeManager'
import RelTypeManager from './RelTypeManager'
import TagManager from './TagManager'

export default function SettingsModal({ nodeTypes, onUpdateTypes, onClose, onUpdateGraph, activeGraphId }) {
  const [tab, setTab] = useState('types')
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg settings-modal">
        <div className="modal-header">
          <div className="settings-tabs">
            <button className={`settings-tab${tab === 'types' ? ' active' : ''}`} onClick={() => setTab('types')}>Node Types</button>
            <button className={`settings-tab${tab === 'rels' ? ' active' : ''}`} onClick={() => setTab('rels')}>Rel Colors</button>
            <button className={`settings-tab${tab === 'tags' ? ' active' : ''}`} onClick={() => setTab('tags')}>Tags</button>
          </div>
          <button className="panel-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body settings-modal-body">
          {tab === 'types' && <TypeManager nodeTypes={nodeTypes} onUpdate={onUpdateTypes} onClose={onClose} embedded activeGraphId={activeGraphId} />}
          {tab === 'rels' && <RelTypeManager onClose={onClose} embedded onUpdate={onUpdateGraph} />}
          {tab === 'tags' && <TagManager embedded onUpdate={onUpdateGraph} activeGraphId={activeGraphId} />}
        </div>
      </div>
    </div>
  )
}
