"""Authentication and authorization utilities for the Story Graph API.

Phase 1 stubs — Phase 2 replaces get_current_uid with real Cognito JWT
validation + JIT user provisioning.
"""

import os

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from .db_models import StoryGraph, StoryCollaborator

ROLE_ORDER = {"viewer": 0, "editor": 1, "owner": 2}


def get_current_uid() -> int:
    """STUB — Phase 2 replaces this with real Cognito JWT validation + JIT user provisioning.
    Routers depend on this; keep the signature `() -> int` so Phase 2 can swap the body only.
    """
    return int(os.environ.get("DEV_UID", "1"))


def assert_story_access(
    session: Session, story_id: int, uid: int, min_role: str
) -> StoryGraph:
    """Guard every story-scoped endpoint.

    Resolves the caller's effective role for the given story and raises
    HTTP 404 (never 403 — do not disclose existence) if:
      - the story does not exist, OR
      - the user has no access to it, OR
      - the user's effective role rank is below min_role.

    Effective role resolution (per PHASE1_SCHEMA.md §1 and §5):
      - owner  if story.owner_id == uid
      - else   the role from story_collaborators for (story_id, uid) if a row exists
      - else   no access → 404

    On success returns the StoryGraph ORM object (callers need .owner_id for
    §4 visibility queries).
    """
    story = session.get(StoryGraph, story_id)
    if story is None:
        raise HTTPException(status_code=404, detail="Not found")

    if story.owner_id == uid:
        effective_role = "owner"
    else:
        collab = session.execute(
            select(StoryCollaborator).where(
                StoryCollaborator.story_graph_id == story_id,
                StoryCollaborator.user_id == uid,
            )
        ).scalar_one_or_none()
        if collab is None:
            raise HTTPException(status_code=404, detail="Not found")
        effective_role = collab.role

    if ROLE_ORDER[effective_role] < ROLE_ORDER[min_role]:
        raise HTTPException(status_code=404, detail="Not found")

    return story
