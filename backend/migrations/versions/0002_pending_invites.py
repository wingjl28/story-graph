"""Add pending_invites table (Phase 2 collaboration).

Revision ID: 0002_pending_invites
Revises: 0001_initial
Create Date: 2026-05-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_pending_invites"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── pending_invites ───────────────────────────────────────────────────
    op.create_table(
        "pending_invites",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("story_graph_id", sa.BigInteger(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "role IN ('editor','viewer')", name="pending_invites_role_chk"
        ),
        sa.ForeignKeyConstraint(
            ["story_graph_id"], ["story_graphs.id"], ondelete="CASCADE"
        ),
    )
    # Functional unique index: one invite per (story, lower(email))
    op.create_index(
        "uq_pending_invites_story_email",
        "pending_invites",
        ["story_graph_id", sa.text("lower(email)")],
        unique=True,
    )
    # Fast lookup of all invites for a given email at login time
    op.create_index(
        "ix_pending_invites_email",
        "pending_invites",
        [sa.text("lower(email)")],
    )


def downgrade() -> None:
    op.drop_index("ix_pending_invites_email", table_name="pending_invites")
    op.drop_index("uq_pending_invites_story_email", table_name="pending_invites")
    op.drop_table("pending_invites")
