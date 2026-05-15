from fastapi import APIRouter, HTTPException
from typing import List
from ..database import get_db
from ..models import Tag, TagCreate, TagUpdate

router = APIRouter(prefix="/tags", tags=["tags"])


def _row_to_tag(row) -> dict:
    return dict(row)


@router.get("", response_model=List[Tag])
def list_tags():
    conn = get_db()
    rows = conn.execute("""
        SELECT t.id, t.name, t.color, COUNT(nt.node_id) AS count
        FROM tags t LEFT JOIN node_tags nt ON t.id = nt.tag_id
        GROUP BY t.id ORDER BY t.name
    """).fetchall()
    conn.close()
    return [_row_to_tag(r) for r in rows]


@router.post("", response_model=Tag)
def create_tag(data: TagCreate):
    conn = get_db()
    try:
        cur = conn.execute("INSERT INTO tags (name, color) VALUES (?, ?)", (data.name.strip(), data.color))
        tag_id = cur.lastrowid
        conn.commit()
        row = conn.execute(
            "SELECT t.id, t.name, t.color, COUNT(nt.node_id) AS count FROM tags t LEFT JOIN node_tags nt ON t.id = nt.tag_id WHERE t.id = ? GROUP BY t.id",
            (tag_id,)
        ).fetchone()
        return _row_to_tag(row)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


@router.put("/{tag_id}", response_model=Tag)
def update_tag(tag_id: int, data: TagUpdate):
    raw = data.model_dump(exclude_unset=True)
    if not raw:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "name" in raw:
        raw["name"] = raw["name"].strip()
    conn = get_db()
    try:
        set_clause = ", ".join(f"{k} = ?" for k in raw)
        conn.execute(f"UPDATE tags SET {set_clause} WHERE id = ?", [*raw.values(), tag_id])
        conn.commit()
        row = conn.execute(
            "SELECT t.id, t.name, t.color, COUNT(nt.node_id) AS count FROM tags t LEFT JOIN node_tags nt ON t.id = nt.tag_id WHERE t.id = ? GROUP BY t.id",
            (tag_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Tag not found")
        return _row_to_tag(row)
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


@router.delete("/{tag_id}")
def delete_tag(tag_id: int):
    conn = get_db()
    conn.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.post("/nodes/{node_id}/{tag_id}")
def add_node_tag(node_id: int, tag_id: int):
    conn = get_db()
    try:
        conn.execute("INSERT OR IGNORE INTO node_tags (node_id, tag_id) VALUES (?, ?)", (node_id, tag_id))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@router.delete("/nodes/{node_id}/{tag_id}")
def remove_node_tag(node_id: int, tag_id: int):
    conn = get_db()
    conn.execute("DELETE FROM node_tags WHERE node_id = ? AND tag_id = ?", (node_id, tag_id))
    conn.commit()
    conn.close()
    return {"ok": True}
