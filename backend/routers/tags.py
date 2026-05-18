from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from ..database import get_session
from ..db_models import Tag as TagORM, NodeTag as NodeTagORM, Node as NodeORM
from ..models import Tag, TagCreate, TagUpdate
from ..auth import get_current_uid, assert_story_access

router = APIRouter(prefix="/tags", tags=["tags"])


def _orm_to_schema(t: TagORM, count: int) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "color": t.color,
        "scope": t.scope,
        "graph_id": t.story_graph_id,  # HTTP key stays graph_id
        "count": count,
    }


def _get_count(session: Session, tag_id: int) -> int:
    return session.execute(
        select(func.count()).select_from(NodeTagORM).where(NodeTagORM.tag_id == tag_id)
    ).scalar_one()


@router.get("", response_model=List[Tag])
def list_tags(
    graph_id: Optional[int] = None,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    if graph_id is not None:
        # §4 visibility: story tags OR shared tags owned by story owner
        story = assert_story_access(session, graph_id, uid, "viewer")
        owner_id = story.owner_id
        rows = session.execute(
            select(TagORM).where(
                (TagORM.story_graph_id == graph_id)
                | (
                    (TagORM.scope == "shared")
                    & (TagORM.owner_id == owner_id)
                )
            ).order_by(TagORM.name)
        ).scalars().all()
    else:
        # No story context: only the caller's own tags (never all tenants').
        rows = session.execute(
            select(TagORM)
            .where(TagORM.owner_id == uid)
            .order_by(TagORM.name)
        ).scalars().all()
    return [_orm_to_schema(t, _get_count(session, t.id)) for t in rows]


@router.post("", response_model=Tag)
def create_tag(
    data: TagCreate,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    story_graph_id = data.graph_id
    if story_graph_id is not None:
        assert_story_access(session, story_graph_id, uid, "editor")

    tag = TagORM(
        owner_id=uid,
        story_graph_id=story_graph_id,
        name=data.name.strip(),
        color=data.color,
        scope=data.scope,
    )
    try:
        session.add(tag)
        session.commit()
        session.refresh(tag)
        return _orm_to_schema(tag, 0)
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{tag_id}", response_model=Tag)
def update_tag(
    tag_id: int,
    data: TagUpdate,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    raw = data.model_dump(exclude_unset=True)
    if not raw:
        raise HTTPException(status_code=400, detail="No fields to update")

    tag = session.get(TagORM, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    if tag.story_graph_id is not None:
        assert_story_access(session, tag.story_graph_id, uid, "editor")
    elif tag.owner_id != uid:
        raise HTTPException(status_code=404, detail="Not found")

    try:
        for k, v in raw.items():
            if k == "name":
                tag.name = v.strip()
            elif k == "graph_id":
                tag.story_graph_id = v
            else:
                setattr(tag, k, v)
        session.commit()
        session.refresh(tag)
        return _orm_to_schema(tag, _get_count(session, tag.id))
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{tag_id}")
def delete_tag(
    tag_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    tag = session.get(TagORM, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    if tag.story_graph_id is not None:
        assert_story_access(session, tag.story_graph_id, uid, "editor")
    elif tag.owner_id != uid:
        raise HTTPException(status_code=404, detail="Not found")

    session.delete(tag)
    session.commit()
    return {"ok": True}


@router.post("/nodes/{node_id}/{tag_id}")
def add_node_tag(
    node_id: int,
    tag_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    # Authorize on the node's real story; reject cross-tenant tagging.
    node = session.get(NodeORM, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    story = assert_story_access(session, node.story_graph_id, uid, "editor")

    tag = session.get(TagORM, tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail="Tag not found")
    # §5(4): tag must be visible in this story (story-scoped here, or a
    # shared tag owned by the story owner). Prevents attaching another
    # tenant's tag to this node.
    tag_visible = (
        tag.story_graph_id == node.story_graph_id
        or (tag.scope == "shared" and tag.owner_id == story.owner_id)
    )
    if not tag_visible:
        raise HTTPException(status_code=404, detail="Tag not found")

    existing = session.execute(
        select(NodeTagORM).where(
            NodeTagORM.node_id == node_id,
            NodeTagORM.tag_id == tag_id,
        )
    ).scalar_one_or_none()
    if not existing:
        session.add(NodeTagORM(node_id=node_id, tag_id=tag_id))
        session.commit()
    return {"ok": True}


@router.delete("/nodes/{node_id}/{tag_id}")
def remove_node_tag(
    node_id: int,
    tag_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    node = session.get(NodeORM, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    assert_story_access(session, node.story_graph_id, uid, "editor")

    existing = session.execute(
        select(NodeTagORM).where(
            NodeTagORM.node_id == node_id,
            NodeTagORM.tag_id == tag_id,
        )
    ).scalar_one_or_none()
    if existing:
        session.delete(existing)
        session.commit()
    return {"ok": True}
