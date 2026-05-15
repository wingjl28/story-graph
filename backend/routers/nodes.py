import json
from fastapi import APIRouter, HTTPException
from typing import List, Optional
from ..database import get_db
from ..models import NodeCreate, NodeUpdate, Node, Relationship

router = APIRouter(prefix="/nodes", tags=["nodes"])

NODE_SELECT_FROM = """
    FROM nodes n
    JOIN node_types nt ON n.type_id = nt.id
    LEFT JOIN node_tags ntj ON n.id = ntj.node_id
    LEFT JOIN tags t ON ntj.tag_id = t.id
"""

NODE_SELECT_COLS = """
    SELECT n.id, n.name, n.type_id, n.graph_id, n.description, n.metadata, n.date, n.created_at,
           nt.name AS type_name, nt.color AS type_color, nt.is_date_type AS type_is_date_type,
           GROUP_CONCAT(t.id || ':' || t.name || ':' || t.color, '|') AS tags_raw
"""

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


def _parse_tags(tags_raw):
    if not tags_raw:
        return []
    result = []
    for part in tags_raw.split('|'):
        pieces = part.split(':', 2)
        if len(pieces) == 3:
            result.append({'id': int(pieces[0]), 'name': pieces[1], 'color': pieces[2]})
    return result


def _row_to_node(row) -> dict:
    d = dict(row)
    d["metadata"] = json.loads(d.get("metadata") or "{}")
    d["tags"] = _parse_tags(d.pop("tags_raw", None))
    return d


def _node_query(where: str = "", params=()):
    sql = NODE_SELECT_COLS + NODE_SELECT_FROM
    if where:
        sql += " WHERE " + where
    sql += " GROUP BY n.id"
    return sql, params


@router.get("", response_model=List[Node])
def list_nodes(type_id: Optional[int] = None, graph_id: Optional[int] = None):
    conn = get_db()
    conditions, params = [], []
    if type_id is not None:
        conditions.append("n.type_id = ?"); params.append(type_id)
    if graph_id is not None:
        conditions.append("n.graph_id = ?"); params.append(graph_id)
    where = " AND ".join(conditions) if conditions else ""
    sql, p = _node_query(where, tuple(params))
    rows = conn.execute(sql + " ORDER BY n.name", p).fetchall()
    conn.close()
    return [_row_to_node(r) for r in rows]


@router.post("", response_model=Node)
def create_node(data: NodeCreate):
    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO nodes (name, type_id, graph_id, description, metadata, date) VALUES (?, ?, ?, ?, ?, ?)",
            (data.name, data.type_id, data.graph_id, data.description, json.dumps(data.metadata), data.date),
        )
        node_id = cur.lastrowid
        for tag_id in (data.tag_ids or []):
            conn.execute("INSERT OR IGNORE INTO node_tags (node_id, tag_id) VALUES (?, ?)", (node_id, tag_id))
        conn.commit()
        sql, params = _node_query("n.id = ?", (node_id,))
        row = conn.execute(sql, params).fetchone()
        return _row_to_node(row)
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


@router.get("/{node_id}", response_model=Node)
def get_node(node_id: int):
    conn = get_db()
    sql, params = _node_query("n.id = ?", (node_id,))
    row = conn.execute(sql, params).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Node not found")
    return _row_to_node(row)


@router.put("/{node_id}", response_model=Node)
def update_node(node_id: int, data: NodeUpdate):
    raw = data.model_dump(exclude_unset=True)
    tag_ids = raw.pop('tag_ids', None)
    if not raw and tag_ids is None:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "metadata" in raw:
        raw["metadata"] = json.dumps(raw["metadata"] or {})
    conn = get_db()
    try:
        if raw:
            set_clause = ", ".join(f"{k} = ?" for k in raw)
            conn.execute(
                f"UPDATE nodes SET {set_clause} WHERE id = ?",
                [*raw.values(), node_id],
            )
        if tag_ids is not None:
            conn.execute("DELETE FROM node_tags WHERE node_id = ?", (node_id,))
            for tid in tag_ids:
                conn.execute("INSERT OR IGNORE INTO node_tags (node_id, tag_id) VALUES (?, ?)", (node_id, tid))
        conn.commit()
        sql, params = _node_query("n.id = ?", (node_id,))
        row = conn.execute(sql, params).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Node not found")
        return _row_to_node(row)
    except HTTPException:
        raise
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


@router.delete("/{node_id}")
def delete_node(node_id: int):
    conn = get_db()
    conn.execute("DELETE FROM nodes WHERE id = ?", (node_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.get("/{node_id}/relationships")
def get_node_relationships(node_id: int):
    conn = get_db()
    rows = conn.execute(
        REL_SELECT + " WHERE r.source_id = ? OR r.target_id = ? ORDER BY r.created_at DESC",
        (node_id, node_id),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
