import json
from fastapi import APIRouter
from ..database import get_db

router = APIRouter(prefix="/graph", tags=["graph"])


def _parse_tags(tags_raw):
    if not tags_raw:
        return []
    result = []
    for part in tags_raw.split('|'):
        pieces = part.split(':', 2)
        if len(pieces) == 3:
            result.append({'id': int(pieces[0]), 'name': pieces[1], 'color': pieces[2]})
    return result


@router.get("")
def get_graph(graph_id: int = 1):
    conn = get_db()
    nodes = conn.execute("""
        SELECT n.id, n.name, n.description, n.metadata, n.date, n.graph_id,
               nt.name AS type_name, nt.color AS type_color, nt.id AS type_id,
               nt.is_date_type, nt.font_color,
               GROUP_CONCAT(t.id || ':' || t.name || ':' || t.color, '|') AS tags_raw
        FROM nodes n
        JOIN node_types nt ON n.type_id = nt.id
        LEFT JOIN node_tags ntj ON n.id = ntj.node_id
        LEFT JOIN tags t ON ntj.tag_id = t.id
        WHERE n.graph_id = ?
        GROUP BY n.id
    """, (graph_id,)).fetchall()
    edges = conn.execute("""
        SELECT r.id, r.source_id, r.target_id, r.label, r.notes, r.metadata,
               sn.name AS source_name, tn.name AS target_name,
               COALESCE(rt.color, '#4a5568') AS rel_color
        FROM relationships r
        JOIN nodes sn ON r.source_id = sn.id
        JOIN nodes tn ON r.target_id = tn.id
        LEFT JOIN rel_types rt ON r.label = rt.label
        WHERE sn.graph_id = ?
    """, (graph_id,)).fetchall()
    conn.close()

    cy_nodes = [
        {
            "data": {
                "id": str(n["id"]),
                "label": n["name"],
                "type": n["type_name"],
                "type_id": n["type_id"],
                "color": n["type_color"],
                "font_color": n["font_color"],
                "description": n["description"],
                "metadata": json.loads(n["metadata"] or "{}"),
                "date": n["date"],
                "graph_id": n["graph_id"],
                "is_date_type": bool(n["is_date_type"]),
                "tags": _parse_tags(n["tags_raw"]),
            }
        }
        for n in nodes
    ]

    cy_edges = [
        {
            "data": {
                "id": f"e{e['id']}",
                "source": str(e["source_id"]),
                "target": str(e["target_id"]),
                "source_name": e["source_name"],
                "target_name": e["target_name"],
                "label": e["label"],
                "color": e["rel_color"],
                "notes": e["notes"],
                "rel_id": e["id"],
                "metadata": json.loads(e["metadata"] or "{}"),
            }
        }
        for e in edges
    ]

    return {"nodes": cy_nodes, "edges": cy_edges}
