from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..database import get_session
from ..db_models import (
    Node as NodeORM,
    NodeType as NodeTypeORM,
    NodeTag as NodeTagORM,
    Tag as TagORM,
    Relationship as RelationshipORM,
    RelType as RelTypeORM,
    StoryNodePosition,
)
from ..auth import get_current_uid, assert_story_access

router = APIRouter(prefix="/graph", tags=["graph"])


def _parse_tags(session, node_id: int) -> list:
    rows = session.execute(
        select(TagORM).join(NodeTagORM, TagORM.id == NodeTagORM.tag_id).where(
            NodeTagORM.node_id == node_id
        )
    ).scalars().all()
    return [{"id": t.id, "name": t.name, "color": t.color} for t in rows]


@router.get("")
def get_graph(
    graph_id: int = 1,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    assert_story_access(session, graph_id, uid, "viewer")

    nodes = session.execute(
        select(NodeORM, NodeTypeORM)
        .join(NodeTypeORM, NodeORM.type_id == NodeTypeORM.id)
        .where(NodeORM.story_graph_id == graph_id)
    ).all()

    rels = session.execute(
        select(RelationshipORM)
        .join(NodeORM, RelationshipORM.source_id == NodeORM.id)
        .where(NodeORM.story_graph_id == graph_id)
    ).scalars().all()

    # Build rel_color lookup for this story
    rel_type_rows = session.execute(
        select(RelTypeORM).where(RelTypeORM.story_graph_id == graph_id)
    ).scalars().all()
    rel_color_map = {rt.label: rt.color for rt in rel_type_rows}

    cy_nodes = [
        {
            "data": {
                "id": str(n.id),
                "label": n.name,
                "type": nt.name,
                "type_id": nt.id,
                "color": nt.color,
                "font_color": nt.font_color,
                "description": n.description,
                "metadata": n.meta,  # ORM attr is meta; JSON key is metadata
                "date": n.date,
                "graph_id": n.story_graph_id,  # HTTP key stays graph_id
                "is_date_type": bool(nt.is_date_type),
                "tags": _parse_tags(session, n.id),
            }
        }
        for n, nt in nodes
    ]

    # Build target node lookup to get target story_graph_id membership
    cy_edges = []
    for r in rels:
        tgt = session.get(NodeORM, r.target_id)
        cy_edges.append(
            {
                "data": {
                    "id": f"e{r.id}",
                    "source": str(r.source_id),
                    "target": str(r.target_id),
                    "source_name": next(
                        (n.name for n, _ in nodes if n.id == r.source_id), ""
                    ),
                    "target_name": tgt.name if tgt else "",
                    "label": r.label,
                    "color": rel_color_map.get(r.label, '#4a5568'),
                    "notes": r.notes,
                    "rel_id": r.id,
                    "metadata": r.meta,  # ORM attr is meta; JSON key is metadata
                }
            }
        )

    return {"nodes": cy_nodes, "edges": cy_edges}


@router.get("/positions")
def get_positions(
    graph_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    assert_story_access(session, graph_id, uid, "viewer")
    rows = session.execute(
        select(StoryNodePosition).where(
            StoryNodePosition.story_graph_id == graph_id,
            StoryNodePosition.user_id == uid,
        )
    ).scalars().all()
    return {str(r.node_id): {"x": r.x, "y": r.y} for r in rows}


@router.put("/positions")
def save_positions(
    graph_id: int,
    positions: dict,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    assert_story_access(session, graph_id, uid, "editor")
    session.execute(
        select(StoryNodePosition).where(
            StoryNodePosition.story_graph_id == graph_id,
            StoryNodePosition.user_id == uid,
        )
    )
    existing = {
        r.node_id: r
        for r in session.execute(
            select(StoryNodePosition).where(
                StoryNodePosition.story_graph_id == graph_id,
                StoryNodePosition.user_id == uid,
            )
        ).scalars().all()
    }
    for node_id_str, pos in positions.items():
        nid = int(node_id_str)
        if nid in existing:
            existing[nid].x = pos["x"]
            existing[nid].y = pos["y"]
        else:
            session.add(StoryNodePosition(
                story_graph_id=graph_id,
                user_id=uid,
                node_id=nid,
                x=pos["x"],
                y=pos["y"],
            ))
    # Remove positions for nodes no longer in the request
    incoming_ids = {int(k) for k in positions}
    for nid, row in existing.items():
        if nid not in incoming_ids:
            session.delete(row)
    session.commit()
    return {"ok": True}
