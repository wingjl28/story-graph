from fastapi import APIRouter, HTTPException
from typing import List
from ..database import get_db
from ..models import RelType, RelTypeUpdate

router = APIRouter(prefix="/rel-types", tags=["rel_types"])

_COUNT_Q = """
    SELECT rt.label, rt.color, COUNT(r.id) AS count
    FROM rel_types rt
    LEFT JOIN relationships r ON r.label = rt.label
"""


@router.get("", response_model=List[RelType])
def list_rel_types():
    conn = get_db()
    rows = conn.execute(_COUNT_Q + " GROUP BY rt.label ORDER BY rt.label").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.put("/{label}", response_model=RelType)
def update_rel_type(label: str, data: RelTypeUpdate):
    conn = get_db()
    conn.execute("UPDATE rel_types SET color = ? WHERE label = ?", (data.color, label))
    conn.commit()
    row = conn.execute(_COUNT_Q + " WHERE rt.label = ? GROUP BY rt.label", (label,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Relationship type not found")
    return dict(row)
