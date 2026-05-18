from fastapi import APIRouter, HTTPException, Depends
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from ..database import get_session
from ..db_models import (
    RelType as RelTypeORM,
    Relationship as RelationshipORM,
    Node as NodeORM,
)
from ..models import RelType, RelTypeUpdate
from ..auth import get_current_uid, assert_story_access

router = APIRouter(prefix="/rel-types", tags=["rel_types"])


@router.get("", response_model=List[RelType])
def list_rel_types(
    graph_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    assert_story_access(session, graph_id, uid, "viewer")
    rows = session.execute(
        select(RelTypeORM).where(RelTypeORM.story_graph_id == graph_id).order_by(RelTypeORM.label)
    ).scalars().all()

    result = []
    for rt in rows:
        # Count only relationships in THIS story (scoped via source node).
        count = session.execute(
            select(func.count())
            .select_from(RelationshipORM)
            .join(NodeORM, RelationshipORM.source_id == NodeORM.id)
            .where(
                RelationshipORM.label == rt.label,
                NodeORM.story_graph_id == graph_id,
            )
        ).scalar_one()
        result.append({"label": rt.label, "color": rt.color, "count": count})
    return result


@router.put("/{label}", response_model=RelType)
def update_rel_type(
    label: str,
    data: RelTypeUpdate,
    graph_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    assert_story_access(session, graph_id, uid, "editor")
    rt = session.execute(
        select(RelTypeORM).where(
            RelTypeORM.story_graph_id == graph_id,
            RelTypeORM.label == label,
        )
    ).scalar_one_or_none()
    if not rt:
        raise HTTPException(status_code=404, detail="Relationship type not found")
    rt.color = data.color
    session.commit()
    count = session.execute(
        select(func.count())
        .select_from(RelationshipORM)
        .join(NodeORM, RelationshipORM.source_id == NodeORM.id)
        .where(
            RelationshipORM.label == label,
            NodeORM.story_graph_id == graph_id,
        )
    ).scalar_one()
    return {"label": rt.label, "color": rt.color, "count": count}
