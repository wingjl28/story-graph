from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime


class StoryGraph(BaseModel):
    id: int
    title: str
    description: Optional[str]
    created_at: datetime

class StoryGraphCreate(BaseModel):
    title: str
    description: Optional[str] = None

class StoryGraphUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None


class NodeTag(BaseModel):
    id: int
    name: str
    color: str

class TagCreate(BaseModel):
    name: str
    color: str = '#a78bfa'

class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None

class Tag(BaseModel):
    id: int
    name: str
    color: str
    count: int


class NodeTypeCreate(BaseModel):
    name: str
    color: str = "#6366f1"
    description: Optional[str] = None
    is_date_type: bool = False


class NodeTypeUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    is_date_type: Optional[bool] = None


class NodeType(BaseModel):
    id: int
    name: str
    color: str
    description: Optional[str]
    is_date_type: bool
    created_at: datetime


class NodeCreate(BaseModel):
    name: str
    type_id: int
    graph_id: int = 1
    description: Optional[str] = None
    metadata: Dict[str, Any] = {}
    date: Optional[str] = None
    tag_ids: List[int] = []


class NodeUpdate(BaseModel):
    name: Optional[str] = None
    type_id: Optional[int] = None
    description: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    date: Optional[str] = None
    tag_ids: Optional[List[int]] = None


class Node(BaseModel):
    id: int
    name: str
    type_id: int
    graph_id: int = 1
    type_name: str
    type_color: str
    type_is_date_type: bool
    description: Optional[str]
    metadata: Dict[str, Any]
    date: Optional[str]
    created_at: datetime
    tags: List[NodeTag] = []


class RelType(BaseModel):
    label: str
    color: str
    count: int


class RelTypeUpdate(BaseModel):
    color: str


class RelationshipCreate(BaseModel):
    source_id: int
    target_id: int
    label: str
    notes: Optional[str] = None
    metadata: Dict[str, Any] = {}


class RelationshipUpdate(BaseModel):
    label: Optional[str] = None
    notes: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class Relationship(BaseModel):
    id: int
    source_id: int
    source_name: str
    source_type_color: str
    target_id: int
    target_name: str
    target_type_color: str
    label: str
    rel_color: str
    notes: Optional[str]
    metadata: Dict[str, Any]
    created_at: datetime
