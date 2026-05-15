# Change List
## Bugs
1) Changing Relationship color does not update color existing relationship connections

## Enhancements
### Round 1
1) When adding a relationship, do not reset the search criteria after selection
    + e.g. When searching for a family, I want to type in the last name, then select some/all of the filtered list that appears.
2) Allow node and relationship popups to be draggable/resizable 
    + Remove overlay 
3) Relationships -> Only show unique relationships in left panel. Hidding/unhiding will impact all instances
4) Sort options in left panel sections
    + Alphabetically
    + By Type
5) After box selection complete, turn off box select option

### Round 2
1. Allow new tags (with random color) to be created on Node form - similar to Relationship functionality
2. Right click to "Add Tag" functionality
    + Functionality should be "quick and convenient" to add new tags
3. Retain position of nodes after refresh
4. Implement Inconify Carbon icon library and replace all icons with the new libary equivalent.
5. Consolidate +Node and +Rel buttons in the left panel to a single row (2 column) container
    + Find suitable carbon icons and replace the text with those
        + Add tooltips to both indicating their functions
6. Change timeline button in left panel to include "Timeline" text + add carbon icon
7. Add text strikethrough when any nodes, rel,type, tags are hidden
8. Allow Node and Relationship forms to be draggable & resizeable 
    + Remove overlay 
9. Make bidirectional relationships a single connection with arrows on both ends (from being 2x 1-way arrows)


## New
### Round 1
1) Add "Tags" for Nodes
    1) New left-panel section similar to Types & relationships
    2) Tags get colors (similar to relationships)
2) Display Tag chips on Nodes
3) "Random Color" option for all color select options

### Round 2
1. Allow for creating new/multiple "Story Graphs"
    + Ability to add a "Title" and "Description" to each story graph instance.
    + Allow ability to switch between Story Graphs

## Bugs
### Round 3
1. Relationships not showing on initial load/refresh — fixed via ResizeObserver + forceRender in GraphView

## Enhancements
### Round 3
1. Allow for renaming of Stories — rename button (pencil) in sidebar graph selector
2. Allow for deletion of Stories — delete button (trash) in sidebar graph selector
3. Make bidirectional relationships a single connection with arrows on both ends — visual collapsing in GraphView
4. Update Node Form:
    + Tags section now collapsible behind "+ New Tag" button
    + Inline type creation (+ New Type) with color picker
    + Add relationships while creating a node (label + TO/FROM + target node)
5. Update Relationship Form:
    + Type chip filters for source and target node lists
    + Sort toggle (A–Z / by type) on both node pickers

## New
### Round 3
1. Align & Spacing for multi-selected nodes:
    + Align V-Centers, Align H-Centers, Distribute Vertically, Distribute Horizontally
    + Available in MultiSelectPanel and background right-click context menu

## Bugs
### Round 4
1. Node positioning resets when switching between stories — fixed by adding `resetGraph()` to GraphView imperative handle and calling it at the top of `handleSwitchGraph` before fetching new graph data; positions are now restored from localStorage on every graph load

## Enhancements
### Round 4
1. Classify Types and Tags as "Shared" or "Story":
    + Shared types/tags are available in all stories (scope = 'shared')
    + Story types/tags are local to one story (scope = 'story', graph_id set)
    + Scope badge shown on each type/tag item in Settings
    + Scope selector (dropdown) added to TypeForm and TagForm
    + API GET /node-types and /tags accept optional graph_id param; return shared + story-scoped items
    + Types and Tags are reloaded when switching graphs
2. Font color option for Node Types:
    + New "Font Color" picker added to TypeForm (next to BG Color)
    + Reset-to-white button included
    + font_color stored in node_types table and passed through graph API
    + Cytoscape node labels use data(fontColor) for rendering
3. Allow relationships to be toggled between uni- and bi-directional in EdgePanel:
    + New "Bi-dir" / "Uni-dir" toggle button in EdgePanel action row
    + POST /api/relationships/{rel_id}/toggle-bidirectional endpoint: adds reverse rel if none exists, deletes it if found
4. Move EdgePanel edit/swap/delete buttons to the top of the panel (above From/To and body content)
5. Add Align functionality to node right-click context menu when 2+ nodes are selected:
    + Align V-Centers, Align H-Centers (always shown when ≥ 2 selected)
    + Distribute Vertically, Distribute Horizontally (shown when ≥ 3 selected)