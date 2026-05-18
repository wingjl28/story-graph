from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from ..database import get_session
from ..db_models import (
    StoryGraph as StoryGraphORM,
    StoryCollaborator,
    User,
    PendingInvite,
)
from ..models import (
    StoryGraph,
    StoryGraphCreate,
    StoryGraphUpdate,
    CollaboratorOut,
    CollaboratorsResponse,
    InviteIn,
    OwnerOut,
    PendingInviteOut,
    RolePatch,
)
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


# ── Collaboration endpoints (Phase 2) ─────────────────────────────────────

_VALID_COLLAB_ROLES = {"editor", "viewer"}


@router.get("/{gid}/collaborators", response_model=CollaboratorsResponse)
def list_collaborators(
    gid: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    """Return owner, current collaborators, and pending invites.
    Requires viewer access or above.
    """
    story = assert_story_access(session, gid, uid, "viewer")

    owner_user = session.get(User, story.owner_id)
    owner_out = OwnerOut(
        user_id=owner_user.id,
        email=owner_user.email,
        display_name=owner_user.display_name,
    )

    collabs = session.execute(
        select(StoryCollaborator).where(StoryCollaborator.story_graph_id == gid)
    ).scalars().all()

    collab_out: List[CollaboratorOut] = []
    for c in collabs:
        u = session.get(User, c.user_id)
        if u is not None:
            collab_out.append(
                CollaboratorOut(
                    user_id=u.id,
                    email=u.email,
                    display_name=u.display_name,
                    role=c.role,
                )
            )

    pending_rows = session.execute(
        select(PendingInvite).where(PendingInvite.story_graph_id == gid)
    ).scalars().all()
    pending_out = [PendingInviteOut(email=p.email, role=p.role) for p in pending_rows]

    return CollaboratorsResponse(
        owner=owner_out,
        collaborators=collab_out,
        pending=pending_out,
    )


@router.post("/{gid}/collaborators")
def invite_collaborator(
    gid: int,
    body: InviteIn,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    """Invite a user by email.  Owner only.

    If the email belongs to an existing user who isn't already a collaborator
    or the owner, creates a StoryCollaborator directly.  Otherwise upserts a
    PendingInvite.  Always returns 200 to avoid account enumeration.
    """
    assert_story_access(session, gid, uid, "owner")

    if body.role not in _VALID_COLLAB_ROLES:
        raise HTTPException(status_code=400, detail="role must be 'editor' or 'viewer'")

    story = session.get(StoryGraphORM, gid)
    # assert_story_access already confirmed story exists; story will not be None here

    # Look up existing user by lower(email)
    existing_user = session.execute(
        select(User).where(func.lower(User.email) == func.lower(body.email))
    ).scalar_one_or_none()

    if existing_user is not None:
        # Don't re-add the owner or an existing collaborator
        is_owner = (existing_user.id == story.owner_id)
        already_collab = session.execute(
            select(StoryCollaborator).where(
                StoryCollaborator.story_graph_id == gid,
                StoryCollaborator.user_id == existing_user.id,
            )
        ).scalar_one_or_none() is not None

        if not is_owner and not already_collab:
            session.add(
                StoryCollaborator(
                    story_graph_id=gid,
                    user_id=existing_user.id,
                    role=body.role,
                )
            )
            session.commit()
    else:
        # Upsert a pending invite (idempotent on (gid, lower(email)))
        existing_invite = session.execute(
            select(PendingInvite).where(
                PendingInvite.story_graph_id == gid,
                func.lower(PendingInvite.email) == func.lower(body.email),
            )
        ).scalar_one_or_none()

        if existing_invite is None:
            session.add(
                PendingInvite(
                    story_graph_id=gid,
                    email=body.email,
                    role=body.role,
                )
            )
        else:
            existing_invite.role = body.role
        session.commit()

    # Always 200 — no account enumeration
    return {"ok": True}


@router.patch("/{gid}/collaborators/{user_id}")
def update_collaborator_role(
    gid: int,
    user_id: int,
    body: RolePatch,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    """Change a collaborator's role.  Owner only; cannot target the owner."""
    story = assert_story_access(session, gid, uid, "owner")

    if body.role not in _VALID_COLLAB_ROLES:
        raise HTTPException(status_code=400, detail="role must be 'editor' or 'viewer'")

    if user_id == story.owner_id:
        raise HTTPException(status_code=400, detail="Cannot change the owner's role")

    collab = session.execute(
        select(StoryCollaborator).where(
            StoryCollaborator.story_graph_id == gid,
            StoryCollaborator.user_id == user_id,
        )
    ).scalar_one_or_none()

    if collab is None:
        raise HTTPException(status_code=404, detail="Collaborator not found")

    collab.role = body.role
    session.commit()
    return {"ok": True}


@router.delete("/{gid}/collaborators/{user_id}")
def remove_collaborator(
    gid: int,
    user_id: int,
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    """Remove a collaborator.  Owner may remove anyone; a collaborator may remove themselves.
    Cannot remove the story owner.
    """
    story = assert_story_access(session, gid, uid, "viewer")

    # Only owner or the collaborator themselves may remove
    if uid != story.owner_id and uid != user_id:
        raise HTTPException(status_code=404, detail="Not found")

    if user_id == story.owner_id:
        raise HTTPException(status_code=400, detail="Cannot remove the story owner")

    collab = session.execute(
        select(StoryCollaborator).where(
            StoryCollaborator.story_graph_id == gid,
            StoryCollaborator.user_id == user_id,
        )
    ).scalar_one_or_none()

    if collab is None:
        raise HTTPException(status_code=404, detail="Collaborator not found")

    session.delete(collab)
    session.commit()
    return {"ok": True}


@router.delete("/{gid}/invites")
def revoke_invite(
    gid: int,
    email: str = Query(...),
    session: Session = Depends(get_session),
    uid: int = Depends(get_current_uid),
):
    """Revoke a pending invite by email.  Owner only.  Idempotent."""
    assert_story_access(session, gid, uid, "owner")

    invite = session.execute(
        select(PendingInvite).where(
            PendingInvite.story_graph_id == gid,
            func.lower(PendingInvite.email) == func.lower(email),
        )
    ).scalar_one_or_none()

    if invite is not None:
        session.delete(invite)
        session.commit()

    return {"ok": True}
