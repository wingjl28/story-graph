"""SQLAlchemy engine, session factory, and FastAPI dependency for story-graph.

Environment variables (set by CDK / SSM in production):
  DB_HOST        - PostgreSQL host (required in prod)
  DB_PORT        - PostgreSQL port (default: 5432)
  DB_NAME        - Database name  (default: storygraph)
  DB_USER        - DB user        (default: postgres)
  DB_PASSWORD    - DB password    (default: postgres)
  DB_SSLMODE     - SSL mode       (default: require)

If DB_HOST is unset the module falls back to a local-dev URL so it can be
imported without crashing during development.
"""

import os
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

# ---------------------------------------------------------------------------
# Build the connection URL
# ---------------------------------------------------------------------------

_host = os.environ.get("DB_HOST")

if _host:
    _port = os.environ.get("DB_PORT", "5432")
    _name = os.environ.get("DB_NAME", "storygraph")
    _user = os.environ.get("DB_USER", "postgres")
    _password = os.environ.get("DB_PASSWORD", "postgres")
    _sslmode = os.environ.get("DB_SSLMODE", "require")
    DATABASE_URL = (
        f"postgresql+psycopg://{_user}:{_password}@{_host}:{_port}/{_name}"
        f"?sslmode={_sslmode}"
    )
else:
    # Local development fallback — no crash on import when no DB env vars set.
    DATABASE_URL = "postgresql+psycopg://postgres:postgres@localhost:5432/storygraph"

# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

engine = create_engine(
    DATABASE_URL,
    pool_size=5,
    max_overflow=5,
    pool_pre_ping=True,
    future=True,
)

# ---------------------------------------------------------------------------
# Session factory
# ---------------------------------------------------------------------------

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)

# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------


def get_session() -> Generator[Session, None, None]:
    """Yield a SQLAlchemy Session; always closed in finally."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Alembic-driven schema initialisation
# ---------------------------------------------------------------------------


def init_db() -> None:
    """Run 'alembic upgrade head' at app startup.

    Called from backend/main.py lifespan (no args, returns None).
    Raises RuntimeError with a clear message if the DB is unreachable or
    migrations fail.
    """
    try:
        from alembic import command
        from alembic.config import Config

        import pathlib
        # alembic.ini lives at the repo root (parent of the backend package)
        _ini = pathlib.Path(__file__).parent.parent / "alembic.ini"
        cfg = Config(str(_ini))
        command.upgrade(cfg, "head")
    except Exception as exc:
        raise RuntimeError(
            f"Database initialisation via Alembic failed: {exc}"
        ) from exc


# ---------------------------------------------------------------------------
# Re-export Base for convenience
# ---------------------------------------------------------------------------

from backend.db_models import Base  # noqa: E402  (circular-safe, models has no db import)

__all__ = [
    "engine",
    "SessionLocal",
    "get_session",
    "init_db",
    "Base",
    "DATABASE_URL",
]
