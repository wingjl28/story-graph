"""Authentication and authorization utilities for the Story Graph API.

Phase 2 — real Cognito JWT validation + JIT user provisioning.

Auth is ENABLED iff COGNITO_USER_POOL_ID env var is set and non-empty.

PROD CONTRACT: COGNITO_USER_POOL_ID must always be set in production.
  When it is set, the dev escape-hatch is completely unreachable — real
  RS256 JWT validation always runs.

DEV ESCAPE-HATCH (COGNITO_USER_POOL_ID unset):
  Uses DEV_UID (default "1") to look up or create a stable dev user row
  identified by cognito_sub="dev-<uid-from-env>".  Returns that row's real
  database id (not necessarily the int from the env var).
"""

import os
from typing import Optional

import jwt  # pyjwt[crypto]
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .database import get_session
from .db_models import PendingInvite, StoryCollaborator, StoryGraph, User

# ── Role ordering (Phase 1 contract — do not change) ──────────────────────
ROLE_ORDER = {"viewer": 0, "editor": 1, "owner": 2}

# ── Bearer scheme — auto_error=False so we can branch on None in dev mode ─
_bearer = HTTPBearer(auto_error=False)

# ── Lazy JWKS singleton — built on first call, NOT at import time ─────────
_jwk_client: Optional["jwt.PyJWKClient"] = None  # type: ignore[name-defined]


def _get_jwk_client() -> "jwt.PyJWKClient":  # type: ignore[name-defined]
    """Return (and lazily construct) the module-level PyJWKClient singleton.

    Deferred so no network I/O occurs at import time or during tests that
    never hit the auth-enabled path.
    """
    global _jwk_client
    if _jwk_client is None:
        region = os.environ["COGNITO_REGION"]
        pool_id = os.environ["COGNITO_USER_POOL_ID"]
        issuer = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}"
        jwks_url = issuer + "/.well-known/jwks.json"
        _jwk_client = jwt.PyJWKClient(jwks_url, cache_keys=True, lifespan=3600)
    return _jwk_client


# ── consume_pending_invites ────────────────────────────────────────────────

def consume_pending_invites(session: Session, user: User) -> None:
    """Convert any pending invites matching user.email into real collaborators.

    Idempotent: skips rows where the user is already the story owner or an
    existing collaborator.  Deletes each processed invite regardless.
    Commits once at the end if any changes were made.
    """
    invites = session.execute(
        select(PendingInvite).where(
            func.lower(PendingInvite.email) == func.lower(user.email)
        )
    ).scalars().all()

    if not invites:
        return

    for invite in invites:
        story = session.get(StoryGraph, invite.story_graph_id)
        if story is None:
            # Story was deleted; cascade should have removed invite, but be safe
            session.delete(invite)
            continue

        # Skip if user is the story owner
        if story.owner_id == user.id:
            session.delete(invite)
            continue

        # Skip if already a collaborator
        existing = session.execute(
            select(StoryCollaborator).where(
                StoryCollaborator.story_graph_id == invite.story_graph_id,
                StoryCollaborator.user_id == user.id,
            )
        ).scalar_one_or_none()

        if existing is None:
            session.add(
                StoryCollaborator(
                    story_graph_id=invite.story_graph_id,
                    user_id=user.id,
                    role=invite.role,
                )
            )

        session.delete(invite)

    session.commit()


# ── get_current_uid ────────────────────────────────────────────────────────

def get_current_uid(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    session: Session = Depends(get_session),
) -> int:
    """Resolve the authenticated caller to a users.id integer.

    Auth ENABLED (COGNITO_USER_POOL_ID is set):
      - Requires a valid Cognito ID token as Bearer credential.
      - Validates RS256 signature via JWKS, checks aud/iss/exp/iat/sub,
        asserts token_use=="id" and email_verified==True.
      - JIT-provisions a users row on first login (race-safe via unique
        constraint + rollback/reselect).
      - Calls consume_pending_invites after provision/update.
      - Returns users.id.

    Auth DISABLED (COGNITO_USER_POOL_ID unset — local dev only):
      - Ignores any bearer token present.
      - Looks up a user by cognito_sub="dev-<DEV_UID>" (default DEV_UID=1).
      - Creates the dev user if missing.
      - Returns that row's real database id.

    NEVER logs token or claims.
    """
    pool_id = os.environ.get("COGNITO_USER_POOL_ID")

    # ── DEV PATH ────────────────────────────────────────────────────────────
    if not pool_id:
        dev_uid_str = os.environ.get("DEV_UID", "1")
        dev_sub = f"dev-{dev_uid_str}"

        user = session.execute(
            select(User).where(User.cognito_sub == dev_sub)
        ).scalar_one_or_none()

        if user is None:
            user = User(
                cognito_sub=dev_sub,
                email=f"dev{dev_uid_str}@local",
                display_name="Dev User",
            )
            session.add(user)
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
                user = session.execute(
                    select(User).where(User.cognito_sub == dev_sub)
                ).scalar_one()
            else:
                session.refresh(user)

        return user.id

    # ── PROD PATH ───────────────────────────────────────────────────────────
    # Auth is enabled — require a valid bearer token.
    if creds is None:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = creds.credentials
    region = os.environ.get("COGNITO_REGION", "")
    app_client_id = os.environ.get("COGNITO_APP_CLIENT_ID", "")
    issuer = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}"

    try:
        jwk_client = _get_jwk_client()
        signing_key = jwk_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=app_client_id,
            issuer=issuer,
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
            leeway=60,
        )
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Hard checks on token type and email verification
    if claims.get("token_use") != "id":
        raise HTTPException(
            status_code=401,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if claims.get("email_verified") is not True:
        raise HTTPException(
            status_code=401,
            detail="Email not verified",
            headers={"WWW-Authenticate": "Bearer"},
        )

    sub = claims["sub"]
    email = claims["email"]
    name = claims.get("name") or claims.get("cognito:username") or email

    # JIT provisioning (race-safe)
    user = session.execute(
        select(User).where(User.cognito_sub == sub)
    ).scalar_one_or_none()

    if user is None:
        user = User(cognito_sub=sub, email=email, display_name=name)
        session.add(user)
        try:
            session.commit()
        except IntegrityError:  # concurrent first request — unique(cognito_sub)
            session.rollback()
            user = session.execute(
                select(User).where(User.cognito_sub == sub)
            ).scalar_one()
        else:
            session.refresh(user)
    else:
        if user.email != email or user.display_name != name:
            user.email = email
            user.display_name = name
            session.commit()

    consume_pending_invites(session, user)
    return user.id


# ── assert_story_access ────────────────────────────────────────────────────

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
