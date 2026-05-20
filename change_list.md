# Change List
## Bugs
+ Relationship arrows do not display on initial load

## Enhancements
+ New types default to "story" scope
+ Remove Fit all, relayout, and box select buttons (bottom right) 
+ '+' icon to add new types and relationships in left panel
+ Add font color to new type creation (in node modal)
+ Tag section (left panel) doesnt exist until 1st tag added - update behavior to match other sections (node,rel,type)
+ Update node positions to be persistent - users have to reorganize every reload/login.
+ Update Nodes, Types, Relationships to hide/unhide on clicking the Name (similar to tag)
    + Update to be 3 phase toggle (highlighted - only shows that node, hidden, 'normal')
+ when filtering relationships, hide nodes that do not have that relationship
## New
+ "quick relationship" functionality
    + Click first node(s) (from) + relationship -> select relationship -> Select new nodes (to) 
        + or something that achieves the intent of a "quick add"
