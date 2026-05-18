"""SQLAlchemy 2.x ORM models for the multi-tenant story-graph schema.

Matches the DDL in docs/PHASE1_SCHEMA.md §3 exactly.
Import Base.metadata in Alembic env.py for autogenerate / target_metadata.
"""

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Double,
    ForeignKey,
    Index,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TIMESTAMP


class Base(DeclarativeBase):
    pass


# ── Identity ───────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cognito_sub: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[object] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_users_email", func.lower(email)),
    )


# ── Stories ────────────────────────────────────────────────────────────────

class StoryGraph(Base):
    __tablename__ = "story_graphs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[object] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_story_graphs_owner", "owner_id"),
    )


# ── Collaboration ──────────────────────────────────────────────────────────

class StoryCollaborator(Base):
    __tablename__ = "story_collaborators"

    story_graph_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("story_graphs.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    role: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[object] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint("role IN ('editor','viewer')", name="story_collaborators_role_chk"),
        Index("ix_collab_user", "user_id"),
    )


# ── Node types ─────────────────────────────────────────────────────────────

class NodeType(Base):
    __tablename__ = "node_types"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    story_graph_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("story_graphs.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    color: Mapped[str] = mapped_column(Text, nullable=False, server_default="'#6366f1'")
    font_color: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_date_type: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    scope: Mapped[str] = mapped_column(Text, nullable=False, server_default="'shared'")
    created_at: Mapped[object] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint("scope IN ('shared','story')", name="node_types_scope_inline_chk"),
        CheckConstraint(
            "(scope = 'shared' AND story_graph_id IS NULL) OR "
            "(scope = 'story'  AND story_graph_id IS NOT NULL)",
            name="node_types_scope_chk",
        ),
        Index("ix_node_types_owner", "owner_id"),
        Index("ix_node_types_story", "story_graph_id"),
    )


# ── Tags ───────────────────────────────────────────────────────────────────

class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    story_graph_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("story_graphs.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    color: Mapped[str] = mapped_column(Text, nullable=False, server_default="'#a78bfa'")
    scope: Mapped[str] = mapped_column(Text, nullable=False, server_default="'shared'")
    created_at: Mapped[object] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint("scope IN ('shared','story')", name="tags_scope_inline_chk"),
        CheckConstraint(
            "(scope = 'shared' AND story_graph_id IS NULL) OR "
            "(scope = 'story'  AND story_graph_id IS NOT NULL)",
            name="tags_scope_chk",
        ),
        Index("ix_tags_owner", "owner_id"),
        Index("ix_tags_story", "story_graph_id"),
    )


# ── Nodes ──────────────────────────────────────────────────────────────────

class Node(Base):
    __tablename__ = "nodes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    story_graph_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("story_graphs.id", ondelete="CASCADE"), nullable=False
    )
    type_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("node_types.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # NOTE: ORM attribute is `meta` because `metadata` is reserved by
    # SQLAlchemy's declarative API. The DB column is still named "metadata"
    # and the JSON API key stays "metadata".
    meta: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, server_default="'{}'::jsonb"
    )
    date: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[object] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_nodes_story", "story_graph_id"),
        Index("ix_nodes_type", "type_id"),
    )


# ── Node ↔ Tag ─────────────────────────────────────────────────────────────

class NodeTag(Base):
    __tablename__ = "node_tags"

    node_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("nodes.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    tag_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )

    __table_args__ = (
        Index("ix_node_tags_tag", "tag_id"),
    )


# ── Relationships ──────────────────────────────────────────────────────────

class Relationship(Base):
    __tablename__ = "relationships"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False
    )
    target_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # ORM attribute `meta` (DB column "metadata"); see Node.meta note.
    meta: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, server_default="'{}'::jsonb"
    )
    created_at: Mapped[object] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_rel_source", "source_id"),
        Index("ix_rel_target", "target_id"),
    )


# ── Relationship type colors (per-story) ───────────────────────────────────

class RelType(Base):
    __tablename__ = "rel_types"

    story_graph_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("story_graphs.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    label: Mapped[str] = mapped_column(Text, primary_key=True, nullable=False)
    color: Mapped[str] = mapped_column(Text, nullable=False)


# ── Per-user node positions ────────────────────────────────────────────────

class StoryNodePosition(Base):
    __tablename__ = "story_node_positions"

    story_graph_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("story_graphs.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    node_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("nodes.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    x: Mapped[float] = mapped_column(Double, nullable=False)
    y: Mapped[float] = mapped_column(Double, nullable=False)

    __table_args__ = (
        Index("ix_positions_user_story", "user_id", "story_graph_id"),
    )
