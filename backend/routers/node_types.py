from fastapi import APIRouter, HTTPException
from typing import List
from ..database import get_db
from ..models import NodeTypeCreate, NodeTypeUpdate, NodeType

router = APIRouter(prefix="/node-types", tags=["node-types"])


@router.get("", response_model=List[NodeType])
def list_node_types():
    conn = get_db()
    rows = conn.execute("SELECT * FROM node_types ORDER BY name").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("", response_model=NodeType)
def create_node_type(data: NodeTypeCreate):
    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO node_types (name, color, description, is_date_type) VALUES (?, ?, ?, ?)",
            (data.name, data.color, data.description, int(data.is_date_type)),
        )
        row = conn.execute(
            "SELECT * FROM node_types WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
        conn.commit()
        return dict(row)
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


@router.put("/{type_id}", response_model=NodeType)
def update_node_type(type_id: int, data: NodeTypeUpdate):
    raw = data.model_dump(exclude_unset=True)
    updates = {k: (int(v) if k == "is_date_type" else v) for k, v in raw.items() if v is not None or k == "is_date_type"}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    conn = get_db()
    try:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(
            f"UPDATE node_types SET {set_clause} WHERE id = ?",
            [*updates.values(), type_id],
        )
        conn.commit()
        row = conn.execute("SELECT * FROM node_types WHERE id = ?", (type_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Node type not found")
        return dict(row)
    except HTTPException:
        raise
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


@router.delete("/{type_id}")
def delete_node_type(type_id: int):
    conn = get_db()
    count = conn.execute(
        "SELECT COUNT(*) FROM nodes WHERE type_id = ?", (type_id,)
    ).fetchone()[0]
    if count > 0:
        conn.close()
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete: {count} node(s) still use this type",
        )
    conn.execute("DELETE FROM node_types WHERE id = ?", (type_id,))
    conn.commit()
    conn.close()
    return {"ok": True}
