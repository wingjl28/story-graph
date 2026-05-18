"""Pure-logic unit tests for multi-tenant authorization.

NO real database, NO SQLAlchemy engine, NO network calls.

A minimal FakeSession drives assert_story_access directly with canned
stand-in objects for StoryGraph and StoryCollaborator.
"""
import pytest
from fastapi import HTTPException

# ── Import only the pure-logic symbols we test ────────────────────────────────
# auth.py imports db_models and sqlalchemy at module level but only touches the
# DB at *call* time through the session argument we supply.  We import ROLE_ORDER
# and assert_story_access after patching the module-level db_models names so the
# import itself does not attempt any DB connection.
import sys
import types

# ---------------------------------------------------------------------------
# Stub out heavy dependencies that auth.py imports at module-level so the
# import completes without psycopg / real SQLAlchemy engine.
# ---------------------------------------------------------------------------

def _make_stub_module(name):
    mod = types.ModuleType(name)
    sys.modules[name] = mod
    return mod


# backend package shims
_backend_pkg = types.ModuleType("backend")
sys.modules.setdefault("backend", _backend_pkg)

# backend.database — only get_session is referenced (as a Depends default)
_db_mod = _make_stub_module("backend.database")
_db_mod.get_session = lambda: None  # type: ignore[attr-defined]

# backend.db_models — we only need importable names; real objects replaced below
_dbm = _make_stub_module("backend.db_models")


class _FakeStoryGraph:
    """Minimal stand-in for the StoryGraph ORM model."""
    def __init__(self, id, owner_id):
        self.id = id
        self.owner_id = owner_id


class _FakeStoryCollaborator:
    """Minimal stand-in for the StoryCollaborator ORM model."""
    def __init__(self, story_graph_id, user_id, role):
        self.story_graph_id = story_graph_id
        self.user_id = user_id
        self.role = role


# Attach to the stub db_models module so auth.py's `from .db_models import …`
# resolves to our fakes.
_dbm.StoryGraph = _FakeStoryGraph          # type: ignore[attr-defined]
_dbm.StoryCollaborator = _FakeStoryCollaborator  # type: ignore[attr-defined]
_dbm.PendingInvite = object                # type: ignore[attr-defined]
_dbm.User = object                         # type: ignore[attr-defined]

# Now import auth — it will resolve .database and .db_models from sys.modules
import importlib
import backend.auth as _auth_raw  # noqa: E402  (may already be cached)

# Re-import fresh so our stubs are active
if "backend.auth" in sys.modules:
    # Reload to pick up the stubbed db_models
    auth_module = importlib.reload(sys.modules["backend.auth"])
else:
    auth_module = importlib.import_module("backend.auth")

ROLE_ORDER = auth_module.ROLE_ORDER
assert_story_access = auth_module.assert_story_access


# ---------------------------------------------------------------------------
# FakeSession
# ---------------------------------------------------------------------------

class _ScalarResult:
    """Mimics sqlalchemy's ScalarResult for scalar_one_or_none()."""
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class FakeSession:
    """Minimal fake session.

    Supports:
      session.get(Model, pk)           -> returns object from _store or None
      session.execute(stmt)            -> returns _ScalarResult wrapping a
                                         canned collaborator row (set via
                                         set_collab_result before the call)

    Usage pattern:
        s = FakeSession()
        s.add_story(_FakeStoryGraph(id=1, owner_id=10))
        s.set_collab_result(_FakeStoryCollaborator(1, 20, "viewer"))
        assert_story_access(s, 1, 20, "viewer")
    """

    def __init__(self):
        self._stories = {}       # story_id -> _FakeStoryGraph | None
        self._collab_result = None   # returned by execute().scalar_one_or_none()

    def add_story(self, story: _FakeStoryGraph):
        self._stories[story.id] = story

    def set_collab_result(self, collab):
        """Set the object that execute(...).scalar_one_or_none() will return."""
        self._collab_result = collab

    # SQLAlchemy-compatible surface
    def get(self, model, pk):
        if model is _FakeStoryGraph:
            return self._stories.get(pk)
        return None

    def execute(self, stmt):
        # Called for the StoryCollaborator lookup in assert_story_access
        return _ScalarResult(self._collab_result)


# ===========================================================================
# Tests: ROLE_ORDER ordering
# ===========================================================================

class TestRoleOrder:
    def test_viewer_less_than_editor(self):
        assert ROLE_ORDER["viewer"] < ROLE_ORDER["editor"]

    def test_editor_less_than_owner(self):
        assert ROLE_ORDER["editor"] < ROLE_ORDER["owner"]

    def test_viewer_less_than_owner(self):
        assert ROLE_ORDER["viewer"] < ROLE_ORDER["owner"]

    def test_all_three_roles_present(self):
        assert set(ROLE_ORDER.keys()) >= {"viewer", "editor", "owner"}

    def test_owner_is_highest(self):
        assert ROLE_ORDER["owner"] == max(ROLE_ORDER.values())

    def test_viewer_is_lowest(self):
        assert ROLE_ORDER["viewer"] == min(ROLE_ORDER.values())


# ===========================================================================
# Tests: assert_story_access
# ===========================================================================

OWNER_UID = 1
EDITOR_UID = 2
VIEWER_UID = 3
STRANGER_UID = 99
STORY_ID = 42


def _make_session_with_story(owner_id=OWNER_UID, collab=None):
    """Helper: build a FakeSession that has story 42 owned by owner_id."""
    s = FakeSession()
    s.add_story(_FakeStoryGraph(id=STORY_ID, owner_id=owner_id))
    s.set_collab_result(collab)
    return s


class TestAssertStoryAccessMissingStory:
    """(a) Story does not exist -> 404."""

    def test_missing_story_raises_404(self):
        s = FakeSession()  # no story added
        with pytest.raises(HTTPException) as exc:
            assert_story_access(s, STORY_ID, OWNER_UID, "viewer")
        assert exc.value.status_code == 404

    def test_missing_story_never_403(self):
        s = FakeSession()
        with pytest.raises(HTTPException) as exc:
            assert_story_access(s, STORY_ID, OWNER_UID, "owner")
        assert exc.value.status_code != 403


class TestAssertStoryAccessOwner:
    """(b) Owner passes any min_role."""

    def test_owner_passes_viewer(self):
        s = _make_session_with_story()
        result = assert_story_access(s, STORY_ID, OWNER_UID, "viewer")
        assert result.id == STORY_ID

    def test_owner_passes_editor(self):
        s = _make_session_with_story()
        result = assert_story_access(s, STORY_ID, OWNER_UID, "editor")
        assert result.id == STORY_ID

    def test_owner_passes_owner(self):
        s = _make_session_with_story()
        result = assert_story_access(s, STORY_ID, OWNER_UID, "owner")
        assert result.id == STORY_ID

    def test_owner_returns_story_graph_object(self):
        s = _make_session_with_story()
        story = assert_story_access(s, STORY_ID, OWNER_UID, "viewer")
        assert story.owner_id == OWNER_UID


class TestAssertStoryAccessViewerCollaborator:
    """(c) Collaborator with role='viewer': passes min_role 'viewer', 404 for others."""

    def _session(self):
        collab = _FakeStoryCollaborator(STORY_ID, VIEWER_UID, "viewer")
        return _make_session_with_story(collab=collab)

    def test_viewer_passes_viewer(self):
        result = assert_story_access(self._session(), STORY_ID, VIEWER_UID, "viewer")
        assert result.id == STORY_ID

    def test_viewer_denied_editor_is_404(self):
        with pytest.raises(HTTPException) as exc:
            assert_story_access(self._session(), STORY_ID, VIEWER_UID, "editor")
        assert exc.value.status_code == 404

    def test_viewer_denied_owner_is_404(self):
        with pytest.raises(HTTPException) as exc:
            assert_story_access(self._session(), STORY_ID, VIEWER_UID, "owner")
        assert exc.value.status_code == 404

    def test_viewer_denied_editor_never_403(self):
        with pytest.raises(HTTPException) as exc:
            assert_story_access(self._session(), STORY_ID, VIEWER_UID, "editor")
        assert exc.value.status_code != 403

    def test_viewer_denied_owner_never_403(self):
        with pytest.raises(HTTPException) as exc:
            assert_story_access(self._session(), STORY_ID, VIEWER_UID, "owner")
        assert exc.value.status_code != 403


class TestAssertStoryAccessEditorCollaborator:
    """(d) Collaborator with role='editor': passes viewer/editor, 404 for owner."""

    def _session(self):
        collab = _FakeStoryCollaborator(STORY_ID, EDITOR_UID, "editor")
        return _make_session_with_story(collab=collab)

    def test_editor_passes_viewer(self):
        result = assert_story_access(self._session(), STORY_ID, EDITOR_UID, "viewer")
        assert result.id == STORY_ID

    def test_editor_passes_editor(self):
        result = assert_story_access(self._session(), STORY_ID, EDITOR_UID, "editor")
        assert result.id == STORY_ID

    def test_editor_denied_owner_is_404(self):
        with pytest.raises(HTTPException) as exc:
            assert_story_access(self._session(), STORY_ID, EDITOR_UID, "owner")
        assert exc.value.status_code == 404

    def test_editor_denied_owner_never_403(self):
        with pytest.raises(HTTPException) as exc:
            assert_story_access(self._session(), STORY_ID, EDITOR_UID, "owner")
        assert exc.value.status_code != 403


class TestAssertStoryAccessStranger:
    """(e) Non-collaborator, non-owner -> 404 for every min_role."""

    def _session(self):
        # collab result is None: stranger has no row in story_collaborators
        return _make_session_with_story(collab=None)

    def test_stranger_denied_viewer_is_404(self):
        with pytest.raises(HTTPException) as exc:
            assert_story_access(self._session(), STORY_ID, STRANGER_UID, "viewer")
        assert exc.value.status_code == 404

    def test_stranger_denied_editor_is_404(self):
        with pytest.raises(HTTPException) as exc:
            assert_story_access(self._session(), STORY_ID, STRANGER_UID, "editor")
        assert exc.value.status_code == 404

    def test_stranger_denied_owner_is_404(self):
        with pytest.raises(HTTPException) as exc:
            assert_story_access(self._session(), STORY_ID, STRANGER_UID, "owner")
        assert exc.value.status_code == 404

    def test_stranger_never_403(self):
        with pytest.raises(HTTPException) as exc:
            assert_story_access(self._session(), STORY_ID, STRANGER_UID, "viewer")
        assert exc.value.status_code != 403


class TestAlways404NeverLeaks:
    """(f) Every denial path produces 404, not 403 (no existence disclosure)."""

    def test_missing_story_is_404(self):
        s = FakeSession()
        with pytest.raises(HTTPException) as exc:
            assert_story_access(s, 9999, STRANGER_UID, "viewer")
        assert exc.value.status_code == 404

    def test_present_story_stranger_is_404(self):
        s = _make_session_with_story(collab=None)
        with pytest.raises(HTTPException) as exc:
            assert_story_access(s, STORY_ID, STRANGER_UID, "viewer")
        assert exc.value.status_code == 404

    def test_insufficient_role_is_404(self):
        collab = _FakeStoryCollaborator(STORY_ID, VIEWER_UID, "viewer")
        s = _make_session_with_story(collab=collab)
        with pytest.raises(HTTPException) as exc:
            assert_story_access(s, STORY_ID, VIEWER_UID, "owner")
        assert exc.value.status_code == 404

    def test_no_denial_raises_403_anywhere(self):
        """Exhaustive sweep: all denial scenarios must never yield 403."""
        scenarios = [
            # (session_factory, uid, min_role)
            (FakeSession(), 1, "viewer"),                               # missing story
            (_make_session_with_story(collab=None), STRANGER_UID, "viewer"),   # stranger
            (_make_session_with_story(                                           # viewer->editor
                collab=_FakeStoryCollaborator(STORY_ID, VIEWER_UID, "viewer")
            ), VIEWER_UID, "editor"),
            (_make_session_with_story(                                           # editor->owner
                collab=_FakeStoryCollaborator(STORY_ID, EDITOR_UID, "editor")
            ), EDITOR_UID, "owner"),
        ]
        for session, uid, min_role in scenarios:
            with pytest.raises(HTTPException) as exc:
                assert_story_access(session, STORY_ID, uid, min_role)
            assert exc.value.status_code != 403, (
                f"Expected 404 but got 403 for uid={uid} min_role={min_role}"
            )
