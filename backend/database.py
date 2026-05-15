import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "story_graph.db"

DEFAULT_TYPES = [
    ("Character", "#e74c3c", "A person or being in a story"),
    ("Location", "#27ae60", "A place in a story"),
    ("Event", "#f39c12", "A significant occurrence"),
    ("Item", "#8e44ad", "An object of significance"),
    ("Faction", "#1abc9c", "A group or organization"),
    ("Concept", "#7f8c8d", "An idea, theme, or abstract element"),
    ("Book", "#2980b9", "A written work"),
    ("Movie", "#c0392b", "A film"),
    ("TV Show", "#16a085", "A television series"),
    ("Game", "#d35400", "A video or tabletop game"),
]

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS node_types (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL UNIQUE,
    color        TEXT    NOT NULL DEFAULT '#6366f1',
    description  TEXT,
    is_date_type INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS nodes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    type_id     INTEGER NOT NULL REFERENCES node_types(id),
    description TEXT,
    metadata    TEXT    NOT NULL DEFAULT '{}',
    date        TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS relationships (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id   INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_id   INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    label       TEXT    NOT NULL,
    notes       TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rel_types (
    label TEXT PRIMARY KEY,
    color TEXT NOT NULL DEFAULT '#4a5568'
);

CREATE TABLE IF NOT EXISTS tags (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#a78bfa'
);

CREATE TABLE IF NOT EXISTS node_tags (
    node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (node_id, tag_id)
);
"""


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = get_db()
    conn.executescript(SCHEMA)

    # Migrations for existing databases
    for migration in [
        "ALTER TABLE relationships ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'",
        "ALTER TABLE node_types ADD COLUMN is_date_type INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE nodes ADD COLUMN date TEXT",
        "CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL DEFAULT '#a78bfa')",
        "CREATE TABLE IF NOT EXISTS node_tags (node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE, tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY (node_id, tag_id))",
    ]:
        try:
            conn.execute(migration)
            conn.commit()
        except Exception:
            pass  # column already exists

    count = conn.execute("SELECT COUNT(*) FROM node_types").fetchone()[0]
    if count == 0:
        conn.executemany(
            "INSERT INTO node_types (name, color, description) VALUES (?, ?, ?)",
            DEFAULT_TYPES,
        )
    conn.commit()
    conn.close()
