"""Add optional start_date / end_date to relationships.

Revision ID: 0003_rel_dates
Revises: 0002_pending_invites
Create Date: 2026-05-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_rel_dates"
down_revision: Union[str, None] = "0002_pending_invites"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("relationships", sa.Column("start_date", sa.Text(), nullable=True))
    op.add_column("relationships", sa.Column("end_date", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("relationships", "end_date")
    op.drop_column("relationships", "start_date")
