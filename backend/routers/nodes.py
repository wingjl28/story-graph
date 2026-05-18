from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
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
)
from ..models import NodeCreate, NodeUpdate, Node
from ..auth import get_current_uid, assert_story_access

router = APIRouter(prefix="/nodes", tags=["nodes"])

REL_PALETTE = [
    '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6',
    '#1abc9c', '#e67e22', '#e91e63', '#00bcd4', '#ff5722',
    '#8bc34a', '#607d8b',
]


def _get_node_tags(session: Session, node_id: int) -> list:
    rows = session.execute(
        select(TagORM).join(NodeTagORM, TagORM.id == NodeTagORM.tag_id).where(
            NodeTagORM.node_id == node_id
        )
    ).scalars().all()
    return [{"id": t.id, "name": t.name, "color": t.color} for t in rows]


def _orm_to_node(session: Session, node: NodeORM, nt: NodeTypeORM) -> dict:
    return {
        "id": node.id,
        "name": node.name,
        "type_id": node.type_id,
        "graph_id": node.story_graph_id,  # HTTP key stays graph_id
        "type_name": nt.name,
        "type_color": nt.color,
        "type_is_date_type": nt.is_date_type,
        "description": node.description,
        "metadata": node.meta,  # ORM attr is meta; JSON key is metadata
        "date": node.date,
        "created_at": node.created_at,
        "tags": _get_node_tags(session, node.id),
    }


def _get_node_with_type(session: Session, node_id: int):
    """Return (NodeORM, NodeTypeORM) or (None, None)."""
    node = session.get(NodeORM, node_id)
    if node is None:
        return None, None
    nt = session.get(NodeTypeORM, node.type_id)
    return node, nt


def _get_rel_color(session: Session, story_graph_id: int, label: str) -> str:
    rt = session.execute(
        select(RelTypeORM).where(
            RelTypeORM.story_graph_id == story_graph_id,
            RelTypeORM.label == label,
        )
    ).scalar_one_or_none()
    return rt.color if rt else '#4a5568'


def _orm_to_rel(session: Session, rel: RelationshipORM) -> dict:
    src = session.get(NodeORM, rel.source_id)
    tgt = session.get(NodeORM, rel.target_id)
    src_nt = session.get(NodeTypeORM, src.type_id) if src else None
    tgt_nt = session.get(NodeTypeORM, tgt.type_id) if tgt else None
    story_graph_id = src.story_graph_id if src else None
    rel_color = _get_rel_color(session, story_graph_id, rel.label) if story_graph_id else '#4a5568'
    return {
        "id": rel.id,
        "source_id": rel.source_id,
        "source_name": src.name if src else "",
        "source_type_color": src_nt.color if src_nt else "#000",
        "target_id": rel.target_id,
        "target_name": tgt.name if tgt else "",
        "target_type_color": tgt_nt.color if tgt_nt else "#000",
        "label": rel.label,
        "rel_color": rel_color,
        "notes": rel.notes,
        "metadata": rel.meta,
        "created_at": rel.created_at,
    }


@router.get("", response_model=List[Node])
def list_nodes(
    type_id: Optional[int] = None,
    graph_id: Optional[int] = None,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    # graph_id is REQUIRED: nodes always belong to a story, and without it
    # this would return every tenant's nodes.
    if graph_id is None:
        raise HTTPException(status_code=400, detail="graph_id is required")
    assert_story_access(session, graph_id, uid, "viewer")
    stmt = select(NodeORM).where(NodeORM.story_graph_id == graph_id)
    if type_id is not None:
        stmt = stmt.where(NodeORM.type_id == type_id)
    stmt = stmt.order_by(NodeORM.name)
    nodes = session.execute(stmt).scalars().all()
    result = []
    for node in nodes:
        nt = session.get(NodeTypeORM, node.type_id)
        result.append(_orm_to_node(session, node, nt))
    return result


@router.post("", response_model=Node)
def create_node(
    data: NodeCreate,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    sid = data.graph_id  # HTTP graph_id → story_graph_id
    story = assert_story_access(session, sid, uid, "editor")
    owner_id = story.owner_id

    # §5(4): verify type is visible for this story
    nt = session.get(NodeTypeORM, data.type_id)
    if nt is None:
        raise HTTPException(status_code=400, detail="Node type not found")
    type_visible = (
        nt.story_graph_id == sid
        or (nt.scope == "shared" and nt.owner_id == owner_id)
    )
    if not type_visible:
        raise HTTPException(status_code=400, detail="Node type not visible in this story")

    # §5(4): verify all tags are visible for this story
    for tag_id in (data.tag_ids or []):
        tag = session.get(TagORM, tag_id)
        if tag is None:
            raise HTTPException(status_code=400, detail=f"Tag {tag_id} not found")
        tag_visible = (
            tag.story_graph_id == sid
            or (tag.scope == "shared" and tag.owner_id == owner_id)
        )
        if not tag_visible:
            raise HTTPException(status_code=400, detail=f"Tag {tag_id} not visible in this story")

    try:
        node = NodeORM(
            story_graph_id=sid,
            type_id=data.type_id,
            name=data.name,
            description=data.description,
            meta=data.metadata,
            date=data.date,
        )
        session.add(node)
        session.flush()  # get node.id

        for tag_id in (data.tag_ids or []):
            existing = session.execute(
                select(NodeTagORM).where(
                    NodeTagORM.node_id == node.id,
                    NodeTagORM.tag_id == tag_id,
                )
            ).scalar_one_or_none()
            if not existing:
                session.add(NodeTagORM(node_id=node.id, tag_id=tag_id))

        session.commit()
        session.refresh(node)
        node_nt = session.get(NodeTypeORM, node.type_id)
        return _orm_to_node(session, node, node_nt)
    except HTTPException:
        raise
    except Exception as exc:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{node_id}", response_model=Node)
def get_node(
    node_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    node, nt = _get_node_with_type(session, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    assert_story_access(session, node.story_graph_id, uid, "viewer")
    return _orm_to_node(session, node, nt)


@router.put("/{node_id}", response_model=Node)
def update_node(
    node_id: int,
    data: NodeUpdate,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    node, nt = _get_node_with_type(session, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    story = assert_story_access(session, node.story_graph_id, uid, "editor")
    owner_id = story.owner_id
    sid = node.story_graph_id

    raw = data.model_dump(exclude_unset=True)
    tag_ids = raw.pop("tag_ids", None)
    if not raw and tag_ids is None:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        for k, v in raw.items():
            if k == "metadata":
                node.meta = v or {}
            else:
                setattr(node, k, v)

        if tag_ids is not None:
            # Validate tag visibility
            for tag_id in tag_ids:
                tag = session.get(TagORM, tag_id)
                if tag is None:
                    raise HTTPException(status_code=400, detail=f"Tag {tag_id} not found")
                tag_visible = (
                    tag.story_graph_id == sid
                    or (tag.scope == "shared" and tag.owner_id == owner_id)
                )
                if not tag_visible:
                    raise HTTPException(status_code=400, detail=f"Tag {tag_id} not visible in this story")

            # Replace tags
            existing_tags = session.execute(
                select(NodeTagORM).where(NodeTagORM.node_id == node_id)
            ).scalars().all()
            for et in existing_tags:
                session.delete(et)
            session.flush()
            for tid in tag_ids:
                session.add(NodeTagORM(node_id=node_id, tag_id=tid))

        session.commit()
        session.refresh(node)
        node_nt = session.get(NodeTypeORM, node.type_id)
        return _orm_to_node(session, node, node_nt)
    except HTTPException:
        raise
    except Exception as exc:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{node_id}")
def delete_node(
    node_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    node = session.get(NodeORM, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    assert_story_access(session, node.story_graph_id, uid, "editor")
    session.delete(node)
    session.commit()
    return {"ok": True}


@router.get("/{node_id}/relationships")
def get_node_relationships(
    node_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    node = session.get(NodeORM, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    assert_story_access(session, node.story_graph_id, uid, "viewer")

    rels = session.execute(
        select(RelationshipORM).where(
            (RelationshipORM.source_id == node_id)
            | (RelationshipORM.target_id == node_id)
        ).order_by(RelationshipORM.created_at.desc())
    ).scalars().all()
    return [_orm_to_rel(session, r) for r in rels]
