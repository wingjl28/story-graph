# Phase 1 — PostgreSQL Multi-Tenant Schema (Authoritative Spec)

> Produced by the Opus design task. The DDL below is the **source of truth**.
> The Sonnet Alembic task implements migration `0001_initial` to match it
> exactly. The Sonnet SQL-port task rewrites router queries against it.
> Do not deviate from column names, constraints, or ON DELETE rules without
> escalating back to an Opus design pass.

## 1. Tenancy model (the core decisions)

- **Identity = Cognito.** A `users` row is JIT-created on first authenticated
  request, keyed by the Cognito `sub` (immutable, opaque). We store only
  `cognito_sub`, `email`, `display_name`. No credentials/PII beyond that.
- **A "story" = `story_graphs` row, owned by exactly one user** (`owner_id`).
- **Sharing** = rows in `story_collaborators` (story × user × role).
- **Effective access to a story** for a user `u`:
  - `u.id = story.owner_id` → role `owner`
  - else role from `story_collaborators` if a row exists
  - else **no access** (404, not 403 — do not leak existence).
- **`scope` semantics, redefined for multi-tenant** (this is the key change
  from the current single-tenant meaning):
  - `node_types`/`tags` with `scope='story'` belong to one story
    (`story_graph_id` set) — visible to that story's owner + collaborators.
  - `scope='shared'` belongs to the **owning user's account**
    (`owner_id` set, `story_graph_id` NULL) — visible in *every story that
    user owns*, and to collaborators **of those stories** (collaborators see
    the story owner's shared types/tags for the story they're working in).
  - "shared" therefore never means global-across-all-tenants. There is no
    cross-tenant shared data.
- **`rel_types` becomes per-story.** Today it is a global `label→color` map.
  In multi-tenant that would bleed one tenant's palette into another's, so it
  is scoped by `story_graph_id`. PK becomes `(story_graph_id, label)`.
- **Node positions move server-side**, per-user per-story
  (`story_node_positions`). Replaces browser `localStorage`
  `sg-positions-${graphId}`. Per-user (not shared) so collaborators don't
  fight over layout; a "shared layout" mode is a documented future option,
  not built now.

## 2. Column rename map (for the SQL-port task)

Standardize the story FK name to `story_graph_id` everywhere (was `graph_id`):

| Old (SQLite)              | New (Postgres)              |
|---------------------------|-----------------------------|
| `nodes.graph_id`          | `nodes.story_graph_id`      |
| `node_types.graph_id`     | `node_types.story_graph_id` |
| `tags.graph_id`           | `tags.story_graph_id`       |
| `relationships` (scoped via source node) | unchanged: still scoped via `nodes.story_graph_id` |
| JSON stored as TEXT       | `JSONB`                     |
| `created_at` TEXT/naive   | `TIMESTAMPTZ NOT NULL DEFAULT now()` |
| `INTEGER PRIMARY KEY`     | `BIGINT GENERATED ALWAYS AS IDENTITY` |

SQLite→Postgres function swaps the port task must apply:
`GROUP_CONCAT(x, '|')` → `string_agg(x, '|')`;
`?` placeholders → SQLAlchemy bound params;
`INSERT OR IGNORE` → `INSERT ... ON CONFLICT DO NOTHING`;
`json.loads/json.dumps` of a TEXT column → native `JSONB` (no manual
serialization).

## 3. DDL (authoritative)

```sql
-- ── Identity ─────────────────────────────────────────────
CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cognito_sub   TEXT        NOT NULL UNIQUE,
    email         TEXT        NOT NULL,
    display_name  TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_users_email ON users (lower(email));

-- ── Stories ──────────────────────────────────────────────
CREATE TABLE story_graphs (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_story_graphs_owner ON story_graphs (owner_id);

-- ── Collaboration ────────────────────────────────────────
CREATE TABLE story_collaborators (
    story_graph_id BIGINT NOT NULL REFERENCES story_graphs(id) ON DELETE CASCADE,
    user_id        BIGINT NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
    role           TEXT   NOT NULL CHECK (role IN ('editor','viewer')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (story_graph_id, user_id)
);
CREATE INDEX ix_collab_user ON story_collaborators (user_id);
-- Note: 'owner' is implicit via story_graphs.owner_id and is NOT stored here.

-- ── Node types ───────────────────────────────────────────
CREATE TABLE node_types (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id       BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    story_graph_id BIGINT      REFERENCES story_graphs(id)   ON DELETE CASCADE,
    name           TEXT        NOT NULL,
    color          TEXT        NOT NULL DEFAULT '#6366f1',
    font_color     TEXT,
    description    TEXT,
    is_date_type   BOOLEAN     NOT NULL DEFAULT false,
    scope          TEXT        NOT NULL DEFAULT 'shared'
                       CHECK (scope IN ('shared','story')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- shared ⇒ no story; story ⇒ has story
    CONSTRAINT node_types_scope_chk CHECK (
        (scope = 'shared' AND story_graph_id IS NULL) OR
        (scope = 'story'  AND story_graph_id IS NOT NULL)
    )
);
CREATE INDEX ix_node_types_owner ON node_types (owner_id);
CREATE INDEX ix_node_types_story ON node_types (story_graph_id);

-- ── Tags ─────────────────────────────────────────────────
CREATE TABLE tags (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id       BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    story_graph_id BIGINT      REFERENCES story_graphs(id)   ON DELETE CASCADE,
    name           TEXT        NOT NULL,
    color          TEXT        NOT NULL DEFAULT '#a78bfa',
    scope          TEXT        NOT NULL DEFAULT 'shared'
                       CHECK (scope IN ('shared','story')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tags_scope_chk CHECK (
        (scope = 'shared' AND story_graph_id IS NULL) OR
        (scope = 'story'  AND story_graph_id IS NOT NULL)
    )
);
CREATE INDEX ix_tags_owner ON tags (owner_id);
CREATE INDEX ix_tags_story ON tags (story_graph_id);

-- ── Nodes ────────────────────────────────────────────────
CREATE TABLE nodes (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    story_graph_id BIGINT      NOT NULL REFERENCES story_graphs(id) ON DELETE CASCADE,
    type_id        BIGINT      NOT NULL REFERENCES node_types(id)   ON DELETE RESTRICT,
    name           TEXT        NOT NULL,
    description    TEXT,
    metadata       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    date           TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_nodes_story ON nodes (story_graph_id);
CREATE INDEX ix_nodes_type  ON nodes (type_id);

-- ── Node ↔ Tag ───────────────────────────────────────────
CREATE TABLE node_tags (
    node_id BIGINT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    tag_id  BIGINT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (node_id, tag_id)
);
CREATE INDEX ix_node_tags_tag ON node_tags (tag_id);

-- ── Relationships ────────────────────────────────────────
CREATE TABLE relationships (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_id  BIGINT      NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_id  BIGINT      NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    label      TEXT        NOT NULL,
    notes      TEXT,
    metadata   JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_rel_source ON relationships (source_id);
CREATE INDEX ix_rel_target ON relationships (target_id);
-- Integrity rule (enforced in app layer, see §5): source_id and target_id
-- must belong to the SAME story_graph_id. A trigger is optional hardening.

-- ── Relationship type colors (now per-story) ─────────────
CREATE TABLE rel_types (
    story_graph_id BIGINT NOT NULL REFERENCES story_graphs(id) ON DELETE CASCADE,
    label          TEXT   NOT NULL,
    color          TEXT   NOT NULL,
    PRIMARY KEY (story_graph_id, label)
);

-- ── Per-user node positions (replaces localStorage) ──────
CREATE TABLE story_node_positions (
    story_graph_id BIGINT  NOT NULL REFERENCES story_graphs(id) ON DELETE CASCADE,
    user_id        BIGINT  NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
    node_id        BIGINT  NOT NULL REFERENCES nodes(id)        ON DELETE CASCADE,
    x              DOUBLE PRECISION NOT NULL,
    y              DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (story_graph_id, user_id, node_id)
);
CREATE INDEX ix_positions_user_story
    ON story_node_positions (user_id, story_graph_id);
```

## 4. Visibility queries (the port task must use these patterns)

Stories visible to user `:uid`:
```sql
SELECT g.* FROM story_graphs g
WHERE g.owner_id = :uid
UNION
SELECT g.* FROM story_graphs g
JOIN story_collaborators c
  ON c.story_graph_id = g.id AND c.user_id = :uid;
```

Node types usable in story `:sid` (owner of the story is `:owner_id`,
resolved once after the access check):
```sql
SELECT * FROM node_types
WHERE story_graph_id = :sid
   OR (scope = 'shared' AND owner_id = :owner_id)
ORDER BY name;
```
Same shape for `tags`. This replaces the current
`COALESCE(scope,'shared')='shared' OR graph_id=?` filter.

## 5. Authorization invariants (hand-off to Phase 2 Opus task)

These are schema-level facts the Phase 2 auth design depends on:

1. Every story-scoped endpoint resolves the caller → `users.id`, then calls a
   single guard: `assert_story_access(sid, uid, min_role)` where
   `min_role ∈ {viewer, editor, owner}`. Ordering: `viewer < editor < owner`.
2. The guard's effective-role resolution is exactly the §1 rule
   (owner via `story_graphs.owner_id`, else `story_collaborators.role`).
3. **Cross-story write integrity:** when creating a relationship, both
   `source_id` and `target_id` must resolve to nodes whose
   `story_graph_id = sid`. Enforce in the service layer (a SQL `CHECK` can't
   span rows; an optional `BEFORE INSERT` trigger is acceptable hardening but
   not required for Phase 1).
4. `node_types`/`tags` referenced when creating a node must satisfy the §4
   visibility query for `sid` — reject otherwise (prevents attaching another
   tenant's type to your node).
5. Non-existent **or** inaccessible story → respond `404` (never `403`) so
   story existence is not disclosed across tenants.

## 6. Legacy data migration (existing `story_graph.db`)

The current `story_graph.db` is single-tenant dev data. Strategy
(idempotent backfill script, Sonnet-tier, runs once post-cutover):

1. Require env `BOOTSTRAP_OWNER_SUB` (a real Cognito sub created by signing in
   once after deploy) and `BOOTSTRAP_OWNER_EMAIL`.
2. Upsert that `users` row.
3. For every legacy `story_graphs` row → set `owner_id` = bootstrap user.
4. Legacy `node_types`/`tags` with old `scope='shared'` (or NULL) →
   `owner_id` = bootstrap user, `story_graph_id` = NULL, `scope='shared'`.
   With old `scope='story'` → keep `story_graph_id`, set `owner_id` = bootstrap.
5. Legacy global `rel_types` → duplicate the `(label,color)` pair into
   `rel_types` for **each** legacy story (`story_graph_id` fan-out).
6. Node positions: not migrated (were browser-local); users re-layout, or a
   later optional importer reads exported `localStorage` JSON.
7. If `BOOTSTRAP_OWNER_SUB` is unset, the script is a no-op (fresh empty DB
   path — acceptable, the legacy data is non-critical).

## 7. Connectivity / config (constrains the Alembic + app tasks)

- Driver: SQLAlchemy 2.x Core + `psycopg` (v3). Add to `requirements.txt`:
  `sqlalchemy==2.0.*`, `psycopg[binary]==3.2.*`, `alembic==1.13.*`.
- DB URL assembled from env (set by CDK from SSM SecureString in Phase 4):
  `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`,
  `DB_SSLMODE=require`.
- Pool: `pool_size=5, max_overflow=5, pool_pre_ping=True` (App Runner
  0.25 vCPU, RDS t4g.micro — keep connections modest).
- `backend/database.py` `init_db()`'s ad-hoc `ALTER TABLE` try/except loop is
  **deleted**; schema is owned by Alembic. App startup runs
  `alembic upgrade head` (or fails fast if migrations pending — decide in the
  Alembic task; default: run `upgrade head` on container start).

## 8. Definition of done for Phase 1

- [ ] `0001_initial` Alembic migration creates §3 exactly (Sonnet).
- [ ] `backend/database.py` rewritten to SQLAlchemy engine/session per §7
      (Sonnet).
- [ ] All router queries ported to §3 schema + §4 visibility patterns
      (Sonnet); auth guard is stubbed (`uid` injected) until Phase 2.
- [ ] Pydantic models updated for `story_graph_id` rename + JSONB-native
      metadata (Sonnet).
- [ ] Idempotent legacy backfill script per §6 (Sonnet).
- [ ] Opus review of the migration + visibility queries before Phase 2
      (tenant-isolation correctness gate).
