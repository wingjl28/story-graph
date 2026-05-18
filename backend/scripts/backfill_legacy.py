"""One-time idempotent backfill: legacy SQLite → multi-tenant PostgreSQL.

Implements PHASE1_SCHEMA.md §6 exactly.

Purpose
-------
Migrates all data from a single-tenant SQLite ``story_graph.db`` file into the
multi-tenant PostgreSQL schema (Phase 1A).  Every legacy row is assigned to a
single "bootstrap owner" whose Cognito identity you supply via environment
variables.

Environment variables
---------------------
BOOTSTRAP_OWNER_SUB    Cognito ``sub`` of the bootstrap owner (required to run).
                       If unset or empty the script exits 0 with no-op message —
                       this is acceptable for fresh-DB deployments.
BOOTSTRAP_OWNER_EMAIL  Email address for the bootstrap user row (required when
                       BOOTSTRAP_OWNER_SUB is set).
LEGACY_SQLITE_PATH     Path to the legacy SQLite file.
                       Default: ``story_graph.db`` in the repo root (two
                       directories above this file).

How to run
----------
From the repo root::

    BOOTSTRAP_OWNER_SUB=abc123 \\
    BOOTSTRAP_OWNER_EMAIL=you@example.com \\
    python -m backend.scripts.backfill_legacy

Idempotency
-----------
Before doing any work the script checks whether the bootstrap user already owns
any ``story_graphs`` rows in Postgres.  If so it prints "already backfilled,
skipping" and exits 0.  This heuristic is intentionally simple: it prevents
duplicate data from a second run without needing per-row UPSERT logic across all
tables.  The trade-off is that a partial first run (e.g. killed mid-way) would
leave orphaned rows; in that edge case drop the partial data and re-run.

Node positions (story_node_positions) are NOT migrated — they were stored in
browser localStorage and are not available server-side.  Users will re-layout
their graphs on first visit, or use a future localStorage-export importer.
"""

import json
import os
import sqlite3
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _sqlite_connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def _parse_json_text(text) -> dict:
    """Parse a legacy TEXT metadata column; return {} for NULL or blank."""
    if not text:
        return {}
    try:
        result = json.loads(text)
        if isinstance(result, dict):
            return result
        return {}
    except (json.JSONDecodeError, TypeError):
        return {}


# ---------------------------------------------------------------------------
# Main migration logic
# ---------------------------------------------------------------------------

def run() -> None:
    # ── 1. Check env vars ────────────────────────────────────────────────────
    owner_sub = _env("BOOTSTRAP_OWNER_SUB")
    if not owner_sub:
        print(
            "BOOTSTRAP_OWNER_SUB is unset or empty — no-op (fresh-DB path). "
            "Set it to a real Cognito sub to migrate legacy data."
        )
        sys.exit(0)

    owner_email = _env("BOOTSTRAP_OWNER_EMAIL")
    if not owner_email:
        print(
            "ERROR: BOOTSTRAP_OWNER_SUB is set but BOOTSTRAP_OWNER_EMAIL is missing. "
            "Please set BOOTSTRAP_OWNER_EMAIL and retry."
        )
        sys.exit(1)

    # ── 2. Locate legacy SQLite file ─────────────────────────────────────────
    default_sqlite = str(
        Path(__file__).resolve().parent.parent.parent / "story_graph.db"
    )
    sqlite_path = _env("LEGACY_SQLITE_PATH", default_sqlite)

    if not Path(sqlite_path).exists():
        print(
            f"Legacy SQLite file not found at '{sqlite_path}' — no-op. "
            "Set LEGACY_SQLITE_PATH if the file is elsewhere."
        )
        sys.exit(0)

    # ── 3. Open Postgres session ─────────────────────────────────────────────
    from backend.database import SessionLocal
    from backend.db_models import (
        Node,
        NodeTag,
        NodeType,
        Relationship,
        RelType,
        StoryGraph,
        Tag,
        User,
    )

    pg = SessionLocal()

    try:
        # ── 4. Idempotency guard ─────────────────────────────────────────────
        # Check if the bootstrap user already owns any story_graphs.  If yes,
        # a previous run completed (or partially ran) — skip to avoid duplicates.
        existing_user = (
            pg.query(User).filter(User.cognito_sub == owner_sub).first()
        )
        if existing_user is not None:
            owned_count = (
                pg.query(StoryGraph)
                .filter(StoryGraph.owner_id == existing_user.id)
                .count()
            )
            if owned_count > 0:
                print(
                    f"Bootstrap user '{owner_sub}' already owns {owned_count} "
                    "story graph(s) in Postgres — already backfilled, skipping."
                )
                return

        # ── 5. Read all legacy data from SQLite ──────────────────────────────
        lite = _sqlite_connect(sqlite_path)
        try:
            legacy_stories = lite.execute(
                "SELECT id, title, description FROM story_graphs ORDER BY id"
            ).fetchall()

            legacy_node_types = lite.execute(
                "SELECT id, name, color, font_color, description, "
                "is_date_type, scope, graph_id FROM node_types ORDER BY id"
            ).fetchall()

            legacy_tags = lite.execute(
                "SELECT id, name, color, scope, graph_id FROM tags ORDER BY id"
            ).fetchall()

            legacy_nodes = lite.execute(
                "SELECT id, name, type_id, graph_id, description, "
                "metadata, date FROM nodes ORDER BY id"
            ).fetchall()

            legacy_node_tags = lite.execute(
                "SELECT node_id, tag_id FROM node_tags"
            ).fetchall()

            legacy_relationships = lite.execute(
                "SELECT id, source_id, target_id, label, notes, metadata "
                "FROM relationships ORDER BY id"
            ).fetchall()

            legacy_rel_types = lite.execute(
                "SELECT label, color FROM rel_types ORDER BY label"
            ).fetchall()
        finally:
            lite.close()

        print(
            f"Legacy data read: {len(legacy_stories)} stories, "
            f"{len(legacy_node_types)} node types, {len(legacy_tags)} tags, "
            f"{len(legacy_nodes)} nodes, {len(legacy_node_tags)} node-tag links, "
            f"{len(legacy_relationships)} relationships, "
            f"{len(legacy_rel_types)} rel types."
        )

        # ── 6. Migration — all inside one transaction ─────────────────────────

        # Step 6a: Upsert bootstrap user
        if existing_user is None:
            bootstrap_user = User(
                cognito_sub=owner_sub,
                email=owner_email,
            )
            pg.add(bootstrap_user)
            pg.flush()  # populate bootstrap_user.id
        else:
            bootstrap_user = existing_user
        owner_id: int = bootstrap_user.id
        print(f"Bootstrap user id={owner_id} (sub={owner_sub}).")

        # Step 6b: Migrate story_graphs; build legacy_story_id → new_story_id map
        story_id_map: dict[int, int] = {}  # legacy id → new Postgres id
        for row in legacy_stories:
            story = StoryGraph(
                owner_id=owner_id,
                title=row["title"],
                description=row["description"],
            )
            pg.add(story)
            pg.flush()
            story_id_map[row["id"]] = story.id
            print(f"  Story '{row['title']}': legacy id={row['id']} → new id={story.id}")

        # Step 6c: Migrate node_types; build legacy id → new id map
        # Legacy scope semantics:
        #   NULL or 'shared' → scope='shared', story_graph_id=NULL
        #   'story'          → scope='story',  story_graph_id=mapped new id
        node_type_id_map: dict[int, int] = {}
        for row in legacy_node_types:
            legacy_scope = row["scope"]  # may be None, 'shared', or 'story'
            legacy_graph_id = row["graph_id"]  # may be None

            if legacy_scope == "story" and legacy_graph_id is not None:
                new_story_graph_id = story_id_map.get(legacy_graph_id)
                if new_story_graph_id is None:
                    print(
                        f"  WARNING: node_type id={row['id']} references unknown "
                        f"legacy story id={legacy_graph_id}; treating as shared."
                    )
                    scope = "shared"
                    new_story_graph_id = None
                else:
                    scope = "story"
            else:
                scope = "shared"
                new_story_graph_id = None

            nt = NodeType(
                owner_id=owner_id,
                story_graph_id=new_story_graph_id,
                name=row["name"],
                color=row["color"] or "#6366f1",
                font_color=row["font_color"],
                description=row["description"],
                is_date_type=bool(row["is_date_type"]),
                scope=scope,
            )
            pg.add(nt)
            pg.flush()
            node_type_id_map[row["id"]] = nt.id

        print(f"  Migrated {len(node_type_id_map)} node types.")

        # Step 6d: Migrate tags; build legacy id → new id map
        # Same scope logic as node_types.
        tag_id_map: dict[int, int] = {}
        for row in legacy_tags:
            legacy_scope = row["scope"]
            legacy_graph_id = row["graph_id"]

            if legacy_scope == "story" and legacy_graph_id is not None:
                new_story_graph_id = story_id_map.get(legacy_graph_id)
                if new_story_graph_id is None:
                    print(
                        f"  WARNING: tag id={row['id']} references unknown "
                        f"legacy story id={legacy_graph_id}; treating as shared."
                    )
                    scope = "shared"
                    new_story_graph_id = None
                else:
                    scope = "story"
            else:
                scope = "shared"
                new_story_graph_id = None

            tag = Tag(
                owner_id=owner_id,
                story_graph_id=new_story_graph_id,
                name=row["name"],
                color=row["color"] or "#a78bfa",
                scope=scope,
            )
            pg.add(tag)
            pg.flush()
            tag_id_map[row["id"]] = tag.id

        print(f"  Migrated {len(tag_id_map)} tags.")

        # Step 6e: Migrate nodes; build legacy id → new id map
        node_id_map: dict[int, int] = {}
        skipped_nodes = 0
        for row in legacy_nodes:
            new_story_graph_id = story_id_map.get(row["graph_id"])
            if new_story_graph_id is None:
                print(
                    f"  WARNING: node id={row['id']} references unknown "
                    f"legacy story id={row['graph_id']}; skipping."
                )
                skipped_nodes += 1
                continue

            new_type_id = node_type_id_map.get(row["type_id"])
            if new_type_id is None:
                print(
                    f"  WARNING: node id={row['id']} references unknown "
                    f"legacy node_type id={row['type_id']}; skipping."
                )
                skipped_nodes += 1
                continue

            node = Node(
                story_graph_id=new_story_graph_id,
                type_id=new_type_id,
                name=row["name"],
                description=row["description"],
                meta=_parse_json_text(row["metadata"]),  # JSONB — native dict
                date=row["date"],
            )
            pg.add(node)
            pg.flush()
            node_id_map[row["id"]] = node.id

        print(
            f"  Migrated {len(node_id_map)} nodes"
            + (f" ({skipped_nodes} skipped)." if skipped_nodes else ".")
        )

        # Step 6f: Migrate node_tags (skip if either id not mapped)
        node_tag_count = 0
        for row in legacy_node_tags:
            new_node_id = node_id_map.get(row["node_id"])
            new_tag_id = tag_id_map.get(row["tag_id"])
            if new_node_id is None or new_tag_id is None:
                continue
            nt_link = NodeTag(node_id=new_node_id, tag_id=new_tag_id)
            pg.add(nt_link)
            node_tag_count += 1

        print(f"  Migrated {node_tag_count} node-tag links.")

        # Step 6g: Migrate relationships
        rel_count = 0
        skipped_rels = 0
        for row in legacy_relationships:
            new_source_id = node_id_map.get(row["source_id"])
            new_target_id = node_id_map.get(row["target_id"])
            if new_source_id is None or new_target_id is None:
                skipped_rels += 1
                continue

            rel = Relationship(
                source_id=new_source_id,
                target_id=new_target_id,
                label=row["label"],
                notes=row["notes"],
                meta=_parse_json_text(row["metadata"]),  # JSONB — native dict
            )
            pg.add(rel)
            rel_count += 1

        print(
            f"  Migrated {rel_count} relationships"
            + (f" ({skipped_rels} skipped)." if skipped_rels else ".")
        )

        # Step 6h: Fan out global rel_types to every migrated story.
        # The legacy rel_types table had no story FK; the new schema's PK is
        # (story_graph_id, label).  Insert one row per (story, label) pair.
        rel_type_count = 0
        for legacy_rt in legacy_rel_types:
            for _legacy_sid, new_sid in story_id_map.items():
                rt = RelType(
                    story_graph_id=new_sid,
                    label=legacy_rt["label"],
                    color=legacy_rt["color"],
                )
                pg.add(rt)
                rel_type_count += 1

        print(
            f"  Inserted {rel_type_count} rel_type rows "
            f"({len(legacy_rel_types)} labels × {len(story_id_map)} stories)."
        )

        # Node positions: NOT migrated — they were stored in browser localStorage
        # and are not available server-side.  Users will re-layout their graphs,
        # or a future optional importer can read exported localStorage JSON.

        # ── 7. Commit ────────────────────────────────────────────────────────
        pg.commit()
        print("Migration committed successfully.")

    except Exception as exc:
        pg.rollback()
        print(f"ERROR during migration — rolled back. Reason: {exc}", file=sys.stderr)
        raise
    finally:
        pg.close()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    run()
