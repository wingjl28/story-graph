"""Initial schema — multi-tenant story-graph (Phase 1).

Creates every table/index from docs/PHASE1_SCHEMA.md §3 exactly.

Revision ID: 0001_initial
Revises: (none)
Create Date: 2026-05-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("cognito_sub", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("cognito_sub", name="users_cognito_sub_key"),
    )
    op.create_index(
        "ix_users_email",
        "users",
        [sa.text("lower(email)")],
    )

    # ── story_graphs ─────────────────────────────────────────────────────
    op.create_table(
        "story_graphs",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("owner_id", sa.BigInteger(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_story_graphs_owner", "story_graphs", ["owner_id"])

    # ── story_collaborators ───────────────────────────────────────────────
    op.create_table(
        "story_collaborators",
        sa.Column("story_graph_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "role IN ('editor','viewer')", name="story_collaborators_role_chk"
        ),
        sa.ForeignKeyConstraint(
            ["story_graph_id"], ["story_graphs.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("story_graph_id", "user_id"),
    )
    op.create_index("ix_collab_user", "story_collaborators", ["user_id"])

    # ── node_types ────────────────────────────────────────────────────────
    op.create_table(
        "node_types",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("owner_id", sa.BigInteger(), nullable=False),
        sa.Column("story_graph_id", sa.BigInteger(), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column(
            "color", sa.Text(), server_default=sa.text("'#6366f1'"), nullable=False
        ),
        sa.Column("font_color", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "is_date_type",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "scope", sa.Text(), server_default=sa.text("'shared'"), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "scope IN ('shared','story')", name="node_types_scope_inline_chk"
        ),
        sa.CheckConstraint(
            "(scope = 'shared' AND story_graph_id IS NULL) OR "
            "(scope = 'story'  AND story_graph_id IS NOT NULL)",
            name="node_types_scope_chk",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["story_graph_id"], ["story_graphs.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_node_types_owner", "node_types", ["owner_id"])
    op.create_index("ix_node_types_story", "node_types", ["story_graph_id"])

    # ── tags ──────────────────────────────────────────────────────────────
    op.create_table(
        "tags",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("owner_id", sa.BigInteger(), nullable=False),
        sa.Column("story_graph_id", sa.BigInteger(), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column(
            "color", sa.Text(), server_default=sa.text("'#a78bfa'"), nullable=False
        ),
        sa.Column(
            "scope", sa.Text(), server_default=sa.text("'shared'"), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "scope IN ('shared','story')", name="tags_scope_inline_chk"
        ),
        sa.CheckConstraint(
            "(scope = 'shared' AND story_graph_id IS NULL) OR "
            "(scope = 'story'  AND story_graph_id IS NOT NULL)",
            name="tags_scope_chk",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["story_graph_id"], ["story_graphs.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_tags_owner", "tags", ["owner_id"])
    op.create_index("ix_tags_story", "tags", ["story_graph_id"])

    # ── nodes ─────────────────────────────────────────────────────────────
    op.create_table(
        "nodes",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("story_graph_id", sa.BigInteger(), nullable=False),
        sa.Column("type_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("date", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["story_graph_id"], ["story_graphs.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["type_id"], ["node_types.id"], ondelete="RESTRICT"
        ),
    )
    op.create_index("ix_nodes_story", "nodes", ["story_graph_id"])
    op.create_index("ix_nodes_type", "nodes", ["type_id"])

    # ── node_tags ─────────────────────────────────────────────────────────
    op.create_table(
        "node_tags",
        sa.Column("node_id", sa.BigInteger(), nullable=False),
        sa.Column("tag_id", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["node_id"], ["nodes.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"], ["tags.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("node_id", "tag_id"),
    )
    op.create_index("ix_node_tags_tag", "node_tags", ["tag_id"])

    # ── relationships ─────────────────────────────────────────────────────
    op.create_table(
        "relationships",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("source_id", sa.BigInteger(), nullable=False),
        sa.Column("target_id", sa.BigInteger(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["source_id"], ["nodes.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["target_id"], ["nodes.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_rel_source", "relationships", ["source_id"])
    op.create_index("ix_rel_target", "relationships", ["target_id"])

    # ── rel_types ─────────────────────────────────────────────────────────
    op.create_table(
        "rel_types",
        sa.Column("story_graph_id", sa.BigInteger(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("color", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["story_graph_id"], ["story_graphs.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("story_graph_id", "label"),
    )

    # ── story_node_positions ──────────────────────────────────────────────
    op.create_table(
        "story_node_positions",
        sa.Column("story_graph_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("node_id", sa.BigInteger(), nullable=False),
        sa.Column("x", sa.Double(), nullable=False),
        sa.Column("y", sa.Double(), nullable=False),
        sa.ForeignKeyConstraint(
            ["story_graph_id"], ["story_graphs.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["node_id"], ["nodes.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("story_graph_id", "user_id", "node_id"),
    )
    op.create_index(
        "ix_positions_user_story",
        "story_node_positions",
        ["user_id", "story_graph_id"],
    )


def downgrade() -> None:
    # Drop in reverse FK-safe order
    op.drop_index("ix_positions_user_story", table_name="story_node_positions")
    op.drop_table("story_node_positions")

    op.drop_table("rel_types")

    op.drop_index("ix_rel_target", table_name="relationships")
    op.drop_index("ix_rel_source", table_name="relationships")
    op.drop_table("relationships")

    op.drop_index("ix_node_tags_tag", table_name="node_tags")
    op.drop_table("node_tags")

    op.drop_index("ix_nodes_type", table_name="nodes")
    op.drop_index("ix_nodes_story", table_name="nodes")
    op.drop_table("nodes")

    op.drop_index("ix_tags_story", table_name="tags")
    op.drop_index("ix_tags_owner", table_name="tags")
    op.drop_table("tags")

    op.drop_index("ix_node_types_story", table_name="node_types")
    op.drop_index("ix_node_types_owner", table_name="node_types")
    op.drop_table("node_types")

    op.drop_index("ix_collab_user", table_name="story_collaborators")
    op.drop_table("story_collaborators")

    op.drop_index("ix_story_graphs_owner", table_name="story_graphs")
    op.drop_table("story_graphs")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
