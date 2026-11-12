# Change List (Completed 2026-05-19)

## Bugs
+ ~~Relationship arrows do not display on initial load~~
  - Fixed: Added `requestAnimationFrame` → `style().update()` → `forceRender()` after initial layout in GraphView

## Enhancements
+ ~~New types default to "story" scope~~
  - Changed default scope from 'shared' to 'story' in TypeManager and AddNodeModal inline type creation
+ ~~Remove Fit all, relayout, and box select buttons (bottom right)~~
  - Removed graph-toolbar div from App.jsx (still accessible via canvas right-click menu)
+ ~~'+' icon to add new types and relationships in left panel~~
  - Added '+' buttons to Types and Relationships section headers in Sidebar
+ ~~Add font color to new type creation (in node modal)~~
  - Added font color picker to inline type creation in AddNodeModal
+ ~~Tag section doesnt exist until 1st tag added~~
  - Tags section now always renders with empty state message when no tags exist
+ ~~Update node positions to be persistent~~
  - Dual storage: localStorage for instant load + API persistence via debounced saves
  - Added GET/PUT /graph/positions endpoints using StoryNodePosition table
+ ~~Update Nodes, Types, Relationships to hide/unhide on clicking the Name~~
  - Implemented 3-phase toggle: normal → solo (highlighted) → hidden → normal
  - Solo state shows only that item; hidden removes it from view
  - Works uniformly across nodes, types, relationships, and tags
+ ~~When filtering relationships, hide nodes that do not have that relationship~~
  - Nodes with only hidden relationships (no visible ones) are automatically hidden
  - Nodes with no relationships are unaffected

## New
+ ~~"quick relationship" functionality~~
  - New QuickRelBar component with 3-step workflow: From → Label → To
  - Accessible via sidebar button, node right-click context menu
  - Supports multi-select sources/targets, bidirectional option, label autocomplete
  - Creates cartesian product of from×to relationships
