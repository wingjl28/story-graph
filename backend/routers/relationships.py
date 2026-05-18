from fastapi import APIRouter, HTTPException, Depends
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from ..database import get_session
from ..db_models import (
    Node as NodeORM,
    NodeType as NodeTypeORM,
    Relationship as RelationshipORM,
    RelType as RelTypeORM,
)
from ..models import RelationshipCreate, RelationshipUpdate, Relationship
from ..auth import get_current_uid, assert_story_access

router = APIRouter(prefix="/relationships", tags=["relationships"])

REL_PALETTE = [
    '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6',
    '#1abc9c', '#e67e22', '#e91e63', '#00bcd4', '#ff5722',
    '#8bc34a', '#607d8b',
]


def _normalize(label: str) -> str:
    return label.strip().title()


def _get_rel_color(session: Session, story_graph_id: int, label: str) -> str:
    rt = session.execute(
        select(RelTypeORM).where(
            RelTypeORM.story_graph_id == story_graph_id,
            RelTypeORM.label == label,
        )
    ).scalar_one_or_none()
    return rt.color if rt else '#4a5568'


def _ensure_rel_type(session: Session, story_graph_id: int, label: str) -> str:
    rt = session.execute(
        select(RelTypeORM).where(
            RelTypeORM.story_graph_id == story_graph_id,
            RelTypeORM.label == label,
        )
    ).scalar_one_or_none()
    if rt:
        return rt.color
    count = session.execute(
        select(func.count()).select_from(RelTypeORM).where(
            RelTypeORM.story_graph_id == story_graph_id
        )
    ).scalar_one()
    color = REL_PALETTE[count % len(REL_PALETTE)]
    session.add(RelTypeORM(story_graph_id=story_graph_id, label=label, color=color))
    return color


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
        "metadata": rel.meta,  # ORM attr is meta; JSON key is metadata
        "created_at": rel.created_at,
    }


def _assert_rel_access(session: Session, rel: RelationshipORM, uid: int, min_role: str) -> int:
    """Authorize on the relationship's TRUE story (derived from its source
    node), never on a caller-supplied graph_id. Returns the story id.

    Prevents cross-tenant IDOR: a caller cannot pass their own graph_id with
    another tenant's rel_id. 404 (not 403) to avoid disclosing existence.
    """
    src = session.get(NodeORM, rel.source_id)
    if src is None:
        raise HTTPException(status_code=404, detail="Relationship not found")
    sid = src.story_graph_id
    assert_story_access(session, sid, uid, min_role)
    return sid


def _check_duplicate(
    session: Session, source_id: int, target_id: int, label: str, exclude_id: int = None
):
    stmt = select(RelationshipORM).where(
        RelationshipORM.source_id == source_id,
        RelationshipORM.target_id == target_id,
        RelationshipORM.label == label,
    )
    if exclude_id is not None:
        stmt = stmt.where(RelationshipORM.id != exclude_id)
    return session.execute(stmt).scalar_one_or_none()


@router.get("", response_model=List[Relationship])
def list_relationships(
    graph_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    assert_story_access(session, graph_id, uid, "viewer")
    # Relationships scoped via source node's story_graph_id
    rels = session.execute(
        select(RelationshipORM)
        .join(NodeORM, RelationshipORM.source_id == NodeORM.id)
        .where(NodeORM.story_graph_id == graph_id)
        .order_by(RelationshipORM.created_at.desc())
    ).scalars().all()
    return [_orm_to_rel(session, r) for r in rels]


@router.post("", response_model=Relationship)
def create_relationship(
    data: RelationshipCreate,
    graph_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    label = _normalize(data.label)
    if not label:
        raise HTTPException(status_code=400, detail="Label cannot be empty")

    assert_story_access(session, graph_id, uid, "editor")

    # §5(3): source and target must belong to the same story
    src = session.get(NodeORM, data.source_id)
    tgt = session.get(NodeORM, data.target_id)
    if not src or not tgt:
        raise HTTPException(status_code=400, detail="Source or target node not found")
    if src.story_graph_id != graph_id or tgt.story_graph_id != graph_id:
        raise HTTPException(
            status_code=400,
            detail="Source and target nodes must belong to this story",
        )

    try:
        if _check_duplicate(session, data.source_id, data.target_id, label):
            raise HTTPException(
                status_code=400,
                detail=f'"{label}" already exists between these two nodes',
            )
        _ensure_rel_type(session, graph_id, label)
        rel = RelationshipORM(
            source_id=data.source_id,
            target_id=data.target_id,
            label=label,
            notes=data.notes,
            meta=data.metadata,
        )
        session.add(rel)
        session.commit()
        session.refresh(rel)
        return _orm_to_rel(session, rel)
    except HTTPException:
        raise
    except Exception as exc:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{rel_id}", response_model=Relationship)
def get_relationship(
    rel_id: int,
    graph_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    rel = session.get(RelationshipORM, rel_id)
    if not rel:
        raise HTTPException(status_code=404, detail="Relationship not found")
    _assert_rel_access(session, rel, uid, "viewer")
    return _orm_to_rel(session, rel)


@router.put("/{rel_id}", response_model=Relationship)
def update_relationship(
    rel_id: int,
    data: RelationshipUpdate,
    graph_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    raw = data.model_dump(exclude_unset=True)
    if not raw:
        raise HTTPException(status_code=400, detail="No fields to update")

    rel = session.get(RelationshipORM, rel_id)
    if not rel:
        raise HTTPException(status_code=404, detail="Relationship not found")
    sid = _assert_rel_access(session, rel, uid, "editor")

    if "label" in raw:
        raw["label"] = _normalize(raw["label"])
        if not raw["label"]:
            raise HTTPException(status_code=400, detail="Label cannot be empty")

    try:
        if "label" in raw:
            if _check_duplicate(session, rel.source_id, rel.target_id, raw["label"], exclude_id=rel_id):
                raise HTTPException(
                    status_code=400,
                    detail=f'"{raw["label"]}" already exists between these two nodes',
                )
            _ensure_rel_type(session, sid, raw["label"])

        for k, v in raw.items():
            if k == "metadata":
                rel.meta = v or {}
            else:
                setattr(rel, k, v)

        session.commit()
        session.refresh(rel)
        return _orm_to_rel(session, rel)
    except HTTPException:
        raise
    except Exception as exc:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{rel_id}/toggle-bidirectional")
def toggle_bidirectional(
    rel_id: int,
    graph_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    rel = session.get(RelationshipORM, rel_id)
    if not rel:
        raise HTTPException(status_code=404, detail="Relationship not found")
    sid = _assert_rel_access(session, rel, uid, "editor")

    try:
        reverse = session.execute(
            select(RelationshipORM).where(
                RelationshipORM.source_id == rel.target_id,
                RelationshipORM.target_id == rel.source_id,
                RelationshipORM.label == rel.label,
            )
        ).scalar_one_or_none()
        if reverse:
            session.delete(reverse)
            session.commit()
            return {"bidirectional": False}
        else:
            _ensure_rel_type(session, sid, rel.label)
            rev_rel = RelationshipORM(
                source_id=rel.target_id,
                target_id=rel.source_id,
                label=rel.label,
                notes=rel.notes,
                meta=rel.meta,
            )
            session.add(rev_rel)
            session.commit()
            return {"bidirectional": True}
    except HTTPException:
        raise
    except Exception as exc:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{rel_id}/swap", response_model=Relationship)
def swap_relationship_direction(
    rel_id: int,
    graph_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    rel = session.get(RelationshipORM, rel_id)
    if not rel:
        raise HTTPException(status_code=404, detail="Relationship not found")
    _assert_rel_access(session, rel, uid, "editor")

    try:
        if _check_duplicate(session, rel.target_id, rel.source_id, rel.label, exclude_id=rel_id):
            raise HTTPException(
                status_code=400,
                detail=f'"{rel.label}" already exists in the reverse direction',
            )
        rel.source_id, rel.target_id = rel.target_id, rel.source_id
        session.commit()
        session.refresh(rel)
        return _orm_to_rel(session, rel)
    except HTTPException:
        raise
    except Exception as exc:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{rel_id}")
def delete_relationship(
    rel_id: int,
    graph_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    rel = session.get(RelationshipORM, rel_id)
    if not rel:
        raise HTTPException(status_code=404, detail="Relationship not found")
    _assert_rel_access(session, rel, uid, "editor")
    session.delete(rel)
    session.commit()
    return {"ok": True}
