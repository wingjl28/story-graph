from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .database import init_db
from .routers import node_types, nodes, relationships, graph, rel_types, tags, story_graphs


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Story Graph API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(node_types.router, prefix="/api")
app.include_router(nodes.router, prefix="/api")
app.include_router(relationships.router, prefix="/api")
app.include_router(graph.router, prefix="/api")
app.include_router(rel_types.router, prefix="/api")
app.include_router(tags.router, prefix="/api")
app.include_router(story_graphs.router, prefix="/api")

_dist = Path(__file__).parent.parent / "frontend" / "dist"
_index = _dist / "index.html"


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa(full_path: str):
    # Serve a real file if it exists (JS, CSS, assets, favicon, etc.)
    candidate = _dist / full_path
    if candidate.is_file():
        return FileResponse(str(candidate))
    # Everything else → SPA entry point
    if _index.exists():
        return FileResponse(str(_index))
    return {"detail": "Frontend not built — run: cd frontend && npm run build"}
