from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from ..database import get_session
from ..db_models import NodeType as NodeTypeORM, Node as NodeORM
from ..models import NodeTypeCreate, NodeTypeUpdate, NodeType
from ..auth import get_current_uid, assert_story_access

router = APIRouter(prefix="/node-types", tags=["node-types"])

def _orm_to_schema(nt: NodeTypeORM) -> dict:
    return {
        "id": nt.id,
        "name": nt.name,
        "color": nt.color,
        "font_color": nt.font_color,
        "description": nt.description,
        "is_date_type": nt.is_date_type,
        "scope": nt.scope,
        "graph_id": nt.story_graph_id,  # HTTP key stays graph_id
        "created_at": nt.created_at,
    }


@router.get("", response_model=List[NodeType])
def list_node_types(
    graph_id: Optional[int] = None,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    if graph_id is not None:
        # §4 visibility: story-scoped types for this story OR shared types owned by the story owner
        story = assert_story_access(session, graph_id, uid, "viewer")
        owner_id = story.owner_id
        rows = session.execute(
            select(NodeTypeORM).where(
                (NodeTypeORM.story_graph_id == graph_id)
                | (
                    (NodeTypeORM.scope == "shared")
                    & (NodeTypeORM.owner_id == owner_id)
                )
            ).order_by(NodeTypeORM.name)
        ).scalars().all()
    else:
        # No story context: only the caller's own types (never all tenants').
        rows = session.execute(
            select(NodeTypeORM)
            .where(NodeTypeORM.owner_id == uid)
            .order_by(NodeTypeORM.name)
        ).scalars().all()
    return [_orm_to_schema(nt) for nt in rows]


@router.post("", response_model=NodeType)
def create_node_type(
    data: NodeTypeCreate,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    story_graph_id = data.graph_id
    if story_graph_id is not None:
        assert_story_access(session, story_graph_id, uid, "editor")

    nt = NodeTypeORM(
        owner_id=uid,
        story_graph_id=story_graph_id,
        name=data.name,
        color=data.color,
        font_color=data.font_color,
        description=data.description,
        is_date_type=data.is_date_type,
        scope=data.scope,
    )
    try:
        session.add(nt)
        session.commit()
        session.refresh(nt)
        return _orm_to_schema(nt)
    except Exception as exc:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/{type_id}", response_model=NodeType)
def update_node_type(
    type_id: int,
    data: NodeTypeUpdate,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    raw = data.model_dump(exclude_unset=True)
    if not raw:
        raise HTTPException(status_code=400, detail="No fields to update")

    nt = session.get(NodeTypeORM, type_id)
    if not nt:
        raise HTTPException(status_code=404, detail="Node type not found")

    # editor access for the story this type belongs to (if story-scoped)
    if nt.story_graph_id is not None:
        assert_story_access(session, nt.story_graph_id, uid, "editor")
    # shared types owned by uid are editable; otherwise access is checked by ownership
    elif nt.owner_id != uid:
        raise HTTPException(status_code=404, detail="Not found")

    try:
        for k, v in raw.items():
            if k == "graph_id":
                nt.story_graph_id = v
            else:
                setattr(nt, k, v)
        session.commit()
        session.refresh(nt)
        return _orm_to_schema(nt)
    except HTTPException:
        raise
    except Exception as exc:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{type_id}")
def delete_node_type(
    type_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    nt = session.get(NodeTypeORM, type_id)
    if not nt:
        raise HTTPException(status_code=404, detail="Node type not found")

    if nt.story_graph_id is not None:
        assert_story_access(session, nt.story_graph_id, uid, "editor")
    elif nt.owner_id != uid:
        raise HTTPException(status_code=404, detail="Not found")

    count = session.execute(
        select(func.count()).select_from(NodeORM).where(NodeORM.type_id == type_id)
    ).scalar_one()
    if count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete: {count} node(s) still use this type",
        )
    session.delete(nt)
    session.commit()
    return {"ok": True}
