import json
from fastapi import APIRouter, HTTPException
from typing import List
from ..database import get_db
from ..models import RelationshipCreate, RelationshipUpdate, Relationship

router = APIRouter(prefix="/relationships", tags=["relationships"])

REL_PALETTE = [
    '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6',
    '#1abc9c', '#e67e22', '#e91e63', '#00bcd4', '#ff5722',
    '#8bc34a', '#607d8b',
]

REL_SELECT = """
    SELECT r.*,
        sn.name AS source_name, st.color AS source_type_color,
        tn.name AS target_name, tt.color AS target_type_color,
        COALESCE(rt.color, '#4a5568') AS rel_color
    FROM relationships r
    JOIN nodes sn ON r.source_id = sn.id
    JOIN node_types st ON sn.type_id = st.id
    JOIN nodes tn ON r.target_id = tn.id
    JOIN node_types tt ON tn.type_id = tt.id
    LEFT JOIN rel_types rt ON r.label = rt.label
"""


def _normalize(label: str) -> str:
    return label.strip().title()


def _ensure_rel_type(conn, label: str) -> str:
    row = conn.execute("SELECT color FROM rel_types WHERE label = ?", (label,)).fetchone()
    if row:
        return row["color"]
    count = conn.execute("SELECT COUNT(*) FROM rel_types").fetchone()[0]
    color = REL_PALETTE[count % len(REL_PALETTE)]
    conn.execute("INSERT INTO rel_types (label, color) VALUES (?, ?)", (label, color))
    return color


def _row_to_rel(row) -> dict:
    d = dict(row)
    d["metadata"] = json.loads(d.get("metadata") or "{}")
    return d


def _check_duplicate(conn, source_id: int, target_id: int, label: str, exclude_id: int = None):
    q = "SELECT id FROM relationships WHERE source_id=? AND target_id=? AND label=?"
    params = [source_id, target_id, label]
    if exclude_id is not None:
        q += " AND id != ?"
        params.append(exclude_id)
    return conn.execute(q, params).fetchone()


@router.get("", response_model=List[Relationship])
def list_relationships():
    conn = get_db()
    rows = conn.execute(REL_SELECT + " ORDER BY r.created_at DESC").fetchall()
    conn.close()
    return [_row_to_rel(r) for r in rows]


@router.post("", response_model=Relationship)
def create_relationship(data: RelationshipCreate):
    label = _normalize(data.label)
    if not label:
        raise HTTPException(status_code=400, detail="Label cannot be empty")

    conn = get_db()
    try:
        if _check_duplicate(conn, data.source_id, data.target_id, label):
            raise HTTPException(
                status_code=400,
                detail=f'"{label}" already exists between these two nodes',
            )
        _ensure_rel_type(conn, label)
        cur = conn.execute(
            "INSERT INTO relationships (source_id, target_id, label, notes, metadata) VALUES (?, ?, ?, ?, ?)",
            (data.source_id, data.target_id, label, data.notes, json.dumps(data.metadata)),
        )
        rel_id = cur.lastrowid
        conn.commit()
        row = conn.execute(REL_SELECT + " WHERE r.id = ?", (rel_id,)).fetchone()
        return _row_to_rel(row)
    except HTTPException:
        raise
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


@router.get("/{rel_id}", response_model=Relationship)
def get_relationship(rel_id: int):
    conn = get_db()
    row = conn.execute(REL_SELECT + " WHERE r.id = ?", (rel_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Relationship not found")
    return _row_to_rel(row)


@router.put("/{rel_id}", response_model=Relationship)
def update_relationship(rel_id: int, data: RelationshipUpdate):
    raw = data.model_dump(exclude_unset=True)
    if not raw:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "label" in raw:
        raw["label"] = _normalize(raw["label"])
        if not raw["label"]:
            raise HTTPException(status_code=400, detail="Label cannot be empty")

    if "metadata" in raw:
        raw["metadata"] = json.dumps(raw["metadata"] or {})

    conn = get_db()
    try:
        if "label" in raw:
            existing = conn.execute(REL_SELECT + " WHERE r.id = ?", (rel_id,)).fetchone()
            if existing and _check_duplicate(conn, existing["source_id"], existing["target_id"], raw["label"], exclude_id=rel_id):
                raise HTTPException(
                    status_code=400,
                    detail=f'"{raw["label"]}" already exists between these two nodes',
                )
            _ensure_rel_type(conn, raw["label"])

        set_clause = ", ".join(f"{k} = ?" for k in raw)
        conn.execute(f"UPDATE relationships SET {set_clause} WHERE id = ?", [*raw.values(), rel_id])
        conn.commit()
        row = conn.execute(REL_SELECT + " WHERE r.id = ?", (rel_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Relationship not found")
        return _row_to_rel(row)
    except HTTPException:
        raise
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


@router.post("/{rel_id}/toggle-bidirectional")
def toggle_bidirectional(rel_id: int):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM relationships WHERE id = ?", (rel_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Relationship not found")
        reverse = conn.execute(
            "SELECT id FROM relationships WHERE source_id=? AND target_id=? AND label=?",
            (row["target_id"], row["source_id"], row["label"]),
        ).fetchone()
        if reverse:
            conn.execute("DELETE FROM relationships WHERE id=?", (reverse["id"],))
            conn.commit()
            return {"bidirectional": False}
        else:
            _ensure_rel_type(conn, row["label"])
            conn.execute(
                "INSERT INTO relationships (source_id, target_id, label, notes, metadata) VALUES (?, ?, ?, ?, ?)",
                (row["target_id"], row["source_id"], row["label"], row["notes"], row["metadata"]),
            )
            conn.commit()
            return {"bidirectional": True}
    except HTTPException:
        raise
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


@router.post("/{rel_id}/swap", response_model=Relationship)
def swap_relationship_direction(rel_id: int):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM relationships WHERE id = ?", (rel_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Relationship not found")
        if _check_duplicate(conn, row["target_id"], row["source_id"], row["label"], exclude_id=rel_id):
            raise HTTPException(
                status_code=400,
                detail=f'"{row["label"]}" already exists in the reverse direction',
            )
        conn.execute(
            "UPDATE relationships SET source_id=?, target_id=? WHERE id=?",
            (row["target_id"], row["source_id"], rel_id),
        )
        conn.commit()
        updated = conn.execute(REL_SELECT + " WHERE r.id = ?", (rel_id,)).fetchone()
        return _row_to_rel(updated)
    except HTTPException:
        raise
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


@router.delete("/{rel_id}")
def delete_relationship(rel_id: int):
    conn = get_db()
    conn.execute("DELETE FROM relationships WHERE id = ?", (rel_id,))
    conn.commit()
    conn.close()
    return {"ok": True}
