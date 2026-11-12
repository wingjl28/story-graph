# Change List (Completed 2026-05-20)

## Bugs
+ ~~Deleting bi-directional relationship changes relationship to single direction~~
  - handleDeleteEdge now also deletes bidir_rel_id when present
+ ~~Browser refresh causes relationship arrows to disappear~~
  - Edges removed and re-added after node positions applied, forcing Cytoscape to recompute arrow geometry

## Enhancements
+ ~~Remove confirmation when deleting Relationship~~
  - Removed window.confirm() from handleDeleteEdge
+ ~~Quick-Rel Changes~~
  - Popup positioned at mouse location via initialPosition prop
  - Draggable via header drag handle
  - Resizable via bottom-right corner handle
  - Removed "Bi" from bidirectional checkbox label (now just ↔)
  - Only available when node(s) selected
  - Starts on step 2 (label) with from-nodes pre-populated
  - Enter key submits on step 3
  - Verbose hints replaced with tooltips on stepper steps
  - CSS updated — proper floating panel layout with better spacing
+ ~~3-phase toggle icons: separate solo, hide, show icons per chip~~
  - Replaced single cycling icon with three always-visible action buttons
  - Star (solo), eye-off (hide), eye (show) — each independent
  - Works across Nodes, Types, Relationships, and Tags sections
+ ~~Ctrl+Enter / Cmd+Enter submit for all forms~~
  - AddNodeModal, AddRelationshipModal, EdgePanel, TypeManager, TagManager
  - Ctrl+Shift+Enter for "Save & Add Another" where applicable

## New
+ ~~Type filter in sidebar~~
  - Filter pills for each node type, toggling graph visibility
+ ~~Tag filter in sidebar~~
  - Filter pills for each tag, toggling graph visibility
+ ~~Filters highlight matching sidebar sections~~
  - Active type/tag filters apply filter-match styling to corresponding chips
  - Additive with existing solo/hidden system
