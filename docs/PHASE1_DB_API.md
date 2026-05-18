# Phase 1 DB API — import contract for downstream agents

## Import lines

```python
from backend.database import get_session, engine, SessionLocal, Base, init_db
from backend.db_models import (
    User, StoryGraph, StoryCollaborator,
    NodeType, Tag, Node, NodeTag,
    Relationship, RelType, StoryNodePosition,
)
```

## ORM classes → tables

| Class | Table |
|---|---|
| `User` | `users` |
| `StoryGraph` | `story_graphs` |
| `StoryCollaborator` | `story_collaborators` |
| `NodeType` | `node_types` |
| `Tag` | `tags` |
| `Node` | `nodes` |
| `NodeTag` | `node_tags` |
| `Relationship` | `relationships` |
| `RelType` | `rel_types` |
| `StoryNodePosition` | `story_node_positions` |

## ⚠ `metadata` column → ORM attribute is `meta`

`Node` and `Relationship` have a JSONB column named **`metadata`** in the DB,
but the ORM attribute is **`meta`** (SQLAlchemy reserves `metadata` on
declarative classes). The JSON API key stays `"metadata"`.

```python
node = session.get(Node, nid)
node.meta              # -> dict   (DB column "metadata")
node.meta = {"k": "v"} # JSONB, assign a dict directly (no json.dumps)
# When building the API response, expose it as "metadata":
{"id": node.id, "metadata": node.meta, ...}
```
Same for `Relationship.meta`. Do **not** call `json.loads`/`json.dumps` —
JSONB returns/accepts native dicts.

## FastAPI dependency usage

```python
from fastapi import Depends
from sqlalchemy.orm import Session
from backend.database import get_session

@router.get("/nodes")
def list_nodes(session: Session = Depends(get_session)):
    return session.query(Node).all()
```

## Environment variables consumed

| Var | Default | Notes |
|---|---|---|
| `DB_HOST` | *(none)* | If unset, local-dev fallback URL is used |
| `DB_PORT` | `5432` | |
| `DB_NAME` | `storygraph` | |
| `DB_USER` | `postgres` | |
| `DB_PASSWORD` | `postgres` | |
| `DB_SSLMODE` | `require` | Set to `disable` for local Docker |

## Schema ownership

Alembic owns the schema via migration `0001_initial`. The old SQLite ALTER TABLE loop in `database.py` has been deleted. `init_db()` runs `alembic upgrade head` on app startup (called from `main.py` lifespan, no args).
