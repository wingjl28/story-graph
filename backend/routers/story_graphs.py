from fastapi import APIRouter, HTTPException, Depends
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..database import get_session
from ..db_models import StoryGraph as StoryGraphORM, StoryCollaborator
from ..models import StoryGraph, StoryGraphCreate, StoryGraphUpdate
from ..auth import get_current_uid, assert_story_access

router = APIRouter(prefix="/story-graphs", tags=["story-graphs"])


def _orm_to_schema(sg: StoryGraphORM) -> dict:
    return {
        "id": sg.id,
        "title": sg.title,
        "description": sg.description,
        "created_at": sg.created_at,
    }


@router.get("", response_model=List[StoryGraph])
def list_story_graphs(
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    # §4 union query: stories owned by uid OR collaborated on
    owned = select(StoryGraphORM).where(StoryGraphORM.owner_id == uid)
    collab_ids = select(StoryCollaborator.story_graph_id).where(
        StoryCollaborator.user_id == uid
    )
    collab = select(StoryGraphORM).where(StoryGraphORM.id.in_(collab_ids))

    # Union via Python-level set to avoid duplicates
    owned_rows = session.execute(owned).scalars().all()
    collab_rows = session.execute(collab).scalars().all()
    seen = set()
    results = []
    for sg in list(owned_rows) + list(collab_rows):
        if sg.id not in seen:
            seen.add(sg.id)
            results.append(sg)
    results.sort(key=lambda s: s.created_at)
    return [_orm_to_schema(sg) for sg in results]


@router.post("", response_model=StoryGraph)
def create_story_graph(
    data: StoryGraphCreate,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    sg = StoryGraphORM(
        owner_id=uid,
        title=data.title.strip(),
        description=data.description,
    )
    session.add(sg)
    session.commit()
    session.refresh(sg)
    return _orm_to_schema(sg)


@router.put("/{graph_id}", response_model=StoryGraph)
def update_story_graph(
    graph_id: int,
    data: StoryGraphUpdate,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    # owner-only to rename a story
    story = assert_story_access(session, graph_id, uid, "owner")
    raw = data.model_dump(exclude_unset=True)
    if not raw:
        raise HTTPException(status_code=400, detail="No fields to update")
    for k, v in raw.items():
        setattr(story, k, v)
    session.commit()
    session.refresh(story)
    return _orm_to_schema(story)


@router.delete("/{graph_id}")
def delete_story_graph(
    graph_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    story = assert_story_access(session, graph_id, uid, "owner")
    session.delete(story)
    session.commit()
    return {"ok": True}
