# Phase 1 — Opus Tenant-Isolation Review (gate record)

Reviewer: Opus. Scope: every router + `auth.py` after the Sonnet port,
checking for cross-tenant data access. Result: **4 defects found, all fixed
before commit.** Clean: `auth.py`, `story_graphs.py`, `nodes.py` by-id paths,
`graph.py`.

## Defects found & fixed

1. **CRITICAL — `relationships.py` IDOR (get/update/delete/swap/toggle).**
   Authorized on caller-supplied `graph_id`, fetched `rel` by id without
   verifying it belonged to that story → any authenticated user could
   read/modify/delete/swap/duplicate **any** tenant's relationship.
   *Fix:* new `_assert_rel_access()` derives the story from the
   relationship's own source node and authorizes on that; client `graph_id`
   is no longer trusted for these endpoints.

2. **CRITICAL — `tags.py` `add_node_tag`/`remove_node_tag`: no authz at all.**
   Could attach/detach tags on any node in any tenant.
   *Fix:* load node, `assert_story_access(node.story_graph_id, editor)`; add
   also enforces tag visibility (§5(4)) so a foreign tenant's tag cannot be
   attached.

3. **HIGH — list endpoints with `graph_id` omitted returned all tenants' rows**
   (`nodes.list_nodes`, `node_types.list_node_types`, `tags.list_tags`).
   *Fix:* `list_nodes` now requires `graph_id` (400 if absent); node-types
   and tags fall back to `owner_id == uid` (caller's own only) when no story
   context is given.

4. **MEDIUM — `rel_types.py` relationship `count` was global by label**
   across all tenants (info leak + wrong number).
   *Fix:* count joined to the source node and scoped to the story.

## Invariant confirmed good

- `assert_story_access` matches spec §1/§5: 404 (never 403) for
  missing / no-access / insufficient-role; owner via `owner_id`, else
  collaborator role; returns `StoryGraph` for §4 owner-scoped visibility.
- §4 visibility queries in `node_types`/`tags` correct.
- §5(3) same-story source/target enforced in relationship create.
- §5(4) type/tag visibility enforced in node create/update.

## Carried into Phase 2

The identity stub `auth.get_current_uid()` is the **only** thing Phase 2
must replace (Cognito JWT verify + JIT user provisioning). All
authorization logic (`assert_story_access`, the per-router guards) is real
and reviewed — Phase 2 swaps *who the caller is*, not *what they may do*.
