from fastapi import APIRouter, HTTPException
from typing import List
from ..database import get_db
from ..models import StoryGraph, StoryGraphCreate, StoryGraphUpdate

router = APIRouter(prefix="/story-graphs", tags=["story-graphs"])


@router.get("", response_model=List[StoryGraph])
def list_story_graphs():
    conn = get_db()
    rows = conn.execute("SELECT * FROM story_graphs ORDER BY created_at").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("", response_model=StoryGraph)
def create_story_graph(data: StoryGraphCreate):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO story_graphs (title, description) VALUES (?, ?)",
        (data.title.strip(), data.description),
    )
    graph_id = cur.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM story_graphs WHERE id = ?", (graph_id,)).fetchone()
    conn.close()
    return dict(row)


@router.put("/{graph_id}", response_model=StoryGraph)
def update_story_graph(graph_id: int, data: StoryGraphUpdate):
    raw = data.model_dump(exclude_unset=True)
    if not raw:
        raise HTTPException(status_code=400, detail="No fields to update")
    conn = get_db()
    set_clause = ", ".join(f"{k} = ?" for k in raw)
    conn.execute(f"UPDATE story_graphs SET {set_clause} WHERE id = ?", [*raw.values(), graph_id])
    conn.commit()
    row = conn.execute("SELECT * FROM story_graphs WHERE id = ?", (graph_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Story graph not found")
    return dict(row)


@router.delete("/{graph_id}")
def delete_story_graph(graph_id: int):
    if graph_id == 1:
        raise HTTPException(status_code=400, detail="Cannot delete the default story graph")
    conn = get_db()
    conn.execute("DELETE FROM story_graphs WHERE id = ?", (graph_id,))
    conn.commit()
    conn.close()
    return {"ok": True}
